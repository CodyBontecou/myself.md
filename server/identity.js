import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';

/**
 * @typedef {{issuer:string,secret:string,resource:string,githubId:string,githubSecret:string,appleId:string,appleSecret:string,googleId?:string,googleSecret?:string}} IdentityConfig
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
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    emailAndPassword: { enabled: false },
    session: { expiresIn: 30 * 86400, updateAge: 60 },
    rateLimit: { enabled: true, storage: /** @type {const} */ ('database'), window: 60, max: 60 },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      cookies: { state: { attributes: { sameSite: /** @type {const} */ ('none'), secure: true } } },
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
            scopes: ['openid', 'profile', 'email', 'offline_access', 'qr-connect'],
            resources: [config.resource],
            clientRegistrationDefaultResources: [config.resource],
            grantTypes: ['authorization_code', 'refresh_token'],
            accessTokenExpiresIn: 300,
            refreshTokenExpiresIn: 30 * 86400,
            refreshTokenReuseInterval: 10,
            codeExpiresIn: 300,
            allowDynamicClientRegistration: true,
            allowUnauthenticatedClientRegistration: true,
            cachedTrustedClients: new Set(['qr-phone', 'qr-dashboard']),
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
