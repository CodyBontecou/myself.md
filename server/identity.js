import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { oauthProvider, verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { reviewerEmail, reviewerUserId } from './reviewer.js';
import { z } from 'zod';
import { authDiagnosticLogger, recordAuthCallback } from './auth-diagnostics.js';

const signInTimeoutSeconds = 15 * 60;
const providerStateSchema = z.object({ expiresAt: z.number() }).passthrough();
const nativeReturnSchema = z.object({
  provider: z.enum(['apple', 'github', 'google']),
  providerState: z.string().min(16).max(256),
  state: z.string().min(1).max(2048),
  expires: z.number(),
});

/**
 * @typedef {{issuer:string,secret:string,resource:string,resources?:string[],githubId:string,githubSecret:string,appleId:string,appleSecret:string,googleId?:string,googleSecret?:string,reviewerEnabled?:boolean}} IdentityConfig
 */
/** @param {import('better-auth').BetterAuthOptions['database']} database @param {IdentityConfig} config @returns {import('better-auth').BetterAuthOptions} */
export function identityOptions(database, config) {
  return {
    database,
    baseURL: config.issuer,
    basePath: new URL(config.issuer).pathname,
    secret: config.secret,
    appName: 'myself.md',
    logger: { disabled: false, level: 'error', log: authDiagnosticLogger },
    trustedOrigins: [
      new URL(config.issuer).origin,
      'https://appleid.apple.com',
      'myselfmd://oauth',
    ],
    account: {
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true },
      encryptOAuthTokens: true,
    },
    emailAndPassword: {
      enabled: config.reviewerEnabled === true,
      disableSignUp: true,
      minPasswordLength: 16,
      maxPasswordLength: 128,
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const cookie = ctx.context.createAuthCookie('native_oauth_return', {
          maxAge: signInTimeoutSeconds,
          sameSite: 'none',
          secure: true,
          httpOnly: true,
          path: new URL(config.issuer).pathname,
        });
        if (ctx.path === '/sign-in/social' && typeof ctx.body?.oauth_query === 'string') {
          const query = new URLSearchParams(ctx.body.oauth_query);
          const result = z.object({ url: z.url() }).safeParse(ctx.context.returned);
          if (
            result.success &&
            query.get('client_id') === 'myselfmd-phone' &&
            query.get('redirect_uri') === 'myselfmd://oauth' &&
            (await verifyOAuthQueryParams(ctx.body.oauth_query, config.secret))
          ) {
            const value = nativeReturnSchema.safeParse({
              provider: ctx.body.provider,
              providerState: new URL(result.data.url).searchParams.get('state'),
              state: query.get('state'),
              expires: Date.now() + signInTimeoutSeconds * 1000,
            });
            if (value.success)
              await ctx.setSignedCookie(
                cookie.name,
                JSON.stringify(value.data),
                config.secret,
                cookie.attributes,
              );
          }
        }
        if (!ctx.path?.startsWith('/callback/')) return;
        const location = ctx.context.responseHeaders?.get('location');
        if (!location) return;
        const destination = new URL(location, config.issuer);
        if (
          destination.origin !== new URL(config.issuer).origin ||
          destination.pathname !== `${new URL(config.issuer).pathname}/error` ||
          !['state_mismatch', 'state_not_found', 'state_invalid'].includes(
            destination.searchParams.get('error') ?? '',
          )
        )
          return;
        const saved = await ctx.getSignedCookie(cookie.name, config.secret);
        if (!saved) return;
        let value;
        try {
          value = nativeReturnSchema.safeParse(JSON.parse(saved));
        } catch {
          return;
        }
        if (
          !value.success ||
          value.data.expires <= Date.now() ||
          ctx.params?.id !== value.data.provider ||
          value.data.providerState !== (ctx.query?.state ?? ctx.body?.state)
        )
          return;
        // Recover only the error destination. This cookie cannot create a session,
        // restore consumed provider state, issue a code or bypass PKCE.
        const callback = new URL('myselfmd://oauth');
        callback.searchParams.set('state', value.data.state);
        callback.searchParams.set('error', 'state_mismatch');
        throw ctx.redirect(callback.href);
      }),
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-in/social' && typeof ctx.body?.oauth_query === 'string') {
          const query = new URLSearchParams(ctx.body.oauth_query);
          if (query.get('client_id') === 'myselfmd-phone') {
            if (!(await verifyOAuthQueryParams(ctx.body.oauth_query, config.secret)))
              throw new APIError('BAD_REQUEST', { error: 'invalid_signature' });
            if (query.get('redirect_uri') !== 'myselfmd://oauth')
              throw new APIError('BAD_REQUEST', { error: 'invalid_redirect' });
            const callback = new URL('myselfmd://oauth');
            const state = query.get('state');
            if (state) callback.searchParams.set('state', state);
            // The provider plugin supplies the authorization code on success.
            // Errors and fallback redirects must also finish this phone request,
            // rather than starting a separate dashboard login in its browser.
            ctx.body.callbackURL = callback.href;
            ctx.body.newUserCallbackURL = callback.href;
            ctx.body.errorCallbackURL = callback.href;
          }
        }
        if (ctx.path === '/sign-in/email') {
          if (!config.reviewerEnabled || ctx.body?.email !== reviewerEmail)
            throw new APIError('UNAUTHORIZED', { message: 'Reviewer sign-in failed.' });
          const user = await ctx.context.internalAdapter.findUserByEmail(reviewerEmail);
          if (user?.user.id !== reviewerUserId)
            throw new APIError('UNAUTHORIZED', { message: 'Reviewer sign-in failed.' });
        }
      }),
    },
    databaseHooks: {
      verification: {
        create: {
          before: async (verification) => {
            if (!verification.identifier.startsWith('auth-state:')) return;
            // Better Auth hardcodes social state to ten minutes; keep its stored
            // payload and database deadline aligned with the browser cookie.
            const state = providerStateSchema.parse(JSON.parse(verification.value));
            const expiresAt = Date.now() + signInTimeoutSeconds * 1000;
            return {
              data: {
                ...verification,
                expiresAt: new Date(expiresAt),
                value: JSON.stringify({ ...state, expiresAt }),
              },
            };
          },
        },
      },
      user: {
        create: {
          before: async (user) => {
            if (user.email === reviewerEmail)
              throw new APIError('FORBIDDEN', {
                message: 'Reviewer identities are provisioned by the operator.',
              });
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            if (
              account.userId === reviewerUserId &&
              (account.providerId !== 'credential' || account.accountId !== reviewerUserId)
            )
              throw new APIError('FORBIDDEN', {
                message: 'Reviewer accounts cannot connect social logins.',
              });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            if (session.userId === reviewerUserId && !config.reviewerEnabled)
              throw new APIError('FORBIDDEN', { message: 'Reviewer access is disabled.' });
          },
        },
      },
    },
    session: { expiresIn: 365 * 86400, updateAge: 60 },
    rateLimit: { enabled: true, storage: /** @type {const} */ ('database'), window: 60, max: 60 },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      cookies: {
        state: {
          attributes: {
            sameSite: /** @type {const} */ ('none'),
            secure: true,
            maxAge: signInTimeoutSeconds,
          },
        },
      },
    },
    socialProviders: {
      ...(config.googleId && config.googleSecret
        ? {
            google: {
              clientId: config.googleId,
              clientSecret: config.googleSecret,
              redirectURI: `${config.issuer}/broker/google/endpoint`,
              disableIdTokenSignIn: true,
              includeGrantedScopes: false,
              prompt: 'select_account',
            },
          }
        : {}),
      github: {
        clientId: config.githubId,
        clientSecret: config.githubSecret,
        redirectURI: `${config.issuer}/broker/github/endpoint`,
        disableIdTokenSignIn: true,
      },
      apple: {
        clientId: config.appleId,
        clientSecret: config.appleSecret,
        redirectURI: `${config.issuer}/broker/apple/endpoint`,
        disableIdTokenSignIn: true,
      },
    },
    plugins: [
      jwt({ jwt: { issuer: config.issuer } }),
      preserveAuthorizationPrompt(
        /** @type {import('better-auth').BetterAuthPlugin} */ (
          /** @type {unknown} */ (
            oauthProvider({
              loginPage: `${new URL(config.issuer).origin}/login`,
              consentPage: `${config.issuer}/consent`,
              selectAccount: {
                page: `${new URL(config.issuer).origin}/login`,
                shouldRedirect: () => false,
              },
              scopes: ['openid', 'profile', 'email', 'offline_access', 'myselfmd'],
              resources: config.resources ?? [config.resource],
              clientRegistrationDefaultResources: config.resources ?? [config.resource],
              grantTypes: ['authorization_code', 'refresh_token'],
              accessTokenExpiresIn: 300,
              refreshTokenExpiresIn: 365 * 86400,
              refreshTokenReuseInterval: 10,
              // The provider also uses this TTL for the signed login query.
              codeExpiresIn: signInTimeoutSeconds,
              allowDynamicClientRegistration: true,
              allowUnauthenticatedClientRegistration: true,
              cachedTrustedClients: new Set(['myselfmd-phone', 'myselfmd-dashboard']),
              clientPrivileges: () => false,
              resourcePrivileges: () => false,
            })
          )
        ),
      ),
      {
        id: 'safe-auth-diagnostics',
        hooks: {
          after: [
            {
              matcher: (ctx) => ctx.path?.startsWith('/callback/') === true,
              handler: createAuthMiddleware(async (ctx) => {
                recordAuthCallback(
                  ctx.path,
                  ctx.params?.id,
                  ctx.method,
                  ctx.context.responseHeaders?.get('location'),
                  config.issuer,
                );
              }),
            },
          ],
        },
      },
    ],
  };
}
/** @param {import('better-auth').BetterAuthPlugin} plugin @returns {import('better-auth').BetterAuthPlugin} */
function preserveAuthorizationPrompt(plugin) {
  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      after: (plugin.hooks?.after ?? []).map((hook) => ({
        handler: hook.handler,
        // A rolling browser-session cookie is not a completed provider sign-in.
        // Let the initial authorization response retain its login/account prompt.
        matcher: (ctx) => ctx.path !== '/oauth2/authorize' && hook.matcher(ctx),
      })),
    },
  };
}
/** @param {import('better-auth').BetterAuthOptions['database']} database @param {IdentityConfig} config */
export function createIdentity(database, config) {
  return betterAuth(identityOptions(database, config));
}
