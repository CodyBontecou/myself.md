import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { reviewerEmail, reviewerUserId } from './reviewer.js';
import { z } from 'zod';

const signInTimeoutSeconds = 15 * 60;
const providerStateSchema = z.object({ expiresAt: z.number() }).passthrough();

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
    logger: { disabled: true },
    trustedOrigins: [new URL(config.issuer).origin, 'https://appleid.apple.com'],
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
      before: createAuthMiddleware(async (ctx) => {
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
    session: { expiresIn: 30 * 86400, updateAge: 60 },
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
            refreshTokenExpiresIn: 30 * 86400,
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
    ],
  };
}
/** @param {import('better-auth').BetterAuthOptions['database']} database @param {IdentityConfig} config */
export function createIdentity(database, config) {
  return betterAuth(identityOptions(database, config));
}
