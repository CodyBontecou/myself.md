# Restricted reviewer authentication

Research date: 2026-10-13. Installed `better-auth` and `@better-auth/oauth-provider` are both 1.7.7. These recommendations preserve existing Apple, GitHub, and Google sign-in and use a separate provisioned reviewer identity.

## Configuration and credential creation

Better Auth supports `emailAndPassword: { enabled: true, disableSignUp: true }`. Its normal email sign-in validates the password and creates the standard session. The endpoint expects an email and password, with an optional `callbackURL`; requiring email verification is a separate option. [Official email/password documentation](https://better-auth.com/docs/authentication/email-password).

The installed implementation additionally requires the account row to have `providerId = 'credential'` **and** `accountId = user.id`. Password hashing should use `hashPassword` from `better-auth/crypto` (or `auth.$context.password.hash`) so the provisioning script uses the same implementation as sign-in. The installed default uses a random 16-byte salt and scrypt, encoded as `salt:key`. Never store the plaintext password in source, SQL files, logs, or the fixture export. Local sources: `node_modules/better-auth/dist/api/routes/sign-in.mjs`, `node_modules/better-auth/dist/crypto/password.mjs`, and `node_modules/@better-auth/utils/dist/password.mjs`. [Official password implementation](https://github.com/better-auth/better-auth/blob/main/packages/utils/src/password.ts).

Recommended implementation, inferred from these contracts: enable the authenticator only when reviewer configuration exists, keep signup disabled, and reject any credential sign-in whose normalized email is not the configured reviewer email. Provision a new stable reviewer user ID with a reserved application-owned email such as `claude-reviewer@myself.md`. Refuse to reuse a user found by email unless its ID and credential ownership match the designated reviewer identity. Explicitly refuse either personal Google email during provisioning. Do not create a social account record.

## Enforce isolation at application boundaries

Better Auth exposes before hooks through `createAuthMiddleware` from `better-auth/api`; hooks can inspect `ctx.path` and `ctx.body` and reject a request with `APIError`. Its internal adapter supports lifecycle hooks. [Official hooks documentation](https://better-auth.com/docs/concepts/hooks).

Recommended application restrictions: a credential allowlist at `/sign-in/email`, and an account-create guard that rejects social account creation for the reviewer user. The reviewer must not be able to link a Google/Apple/GitHub account through Connected logins. A database hook is preferable to a UI-only restriction because it also covers the social callback and server API paths. Keep the existing explicit account-linking behavior for every ordinary user. The installed identity schema already supports credential passwords and a unique `(providerId, accountId)` ownership index; no general password-signup surface is needed. Local sources: `server/identity.js`, `worker/identity.js`, `server/account-links.js`, `worker/identity.sql`, and `worker/migrations/account-login-ownership.sql`.

The external Worker route allowlist currently does not expose signup, reset-password, change-email, set-password, or change-password. Preserve that narrow allowlist. Use the normal sign-in handler rather than implementing independent password verification or issuing custom sessions. Keep origin checks, request size limits, existing cookies, and database-backed rate limits for the reviewer form.

## Resume MCP OAuth correctly

The OAuth provider signs the query used by login/consent pages. Custom sign-in forms must forward those signed parameters in `oauth_query`; the plugin resumes authorization when sign-in creates a session. Do not add unrelated page parameters to the signed query. [Official OAuth provider login-flow documentation](https://better-auth.com/docs/plugins/oauth-provider).

Installed 1.7.7 confirms the before hook verifies `oauth_query`, and its after hook sees the new session cookie and invokes authorization again. Therefore the reviewer form can call `/sign-in/email` with the existing nonempty `oauth_query`, fixed dashboard callback, and forwarded request headers. Preserve successful redirect responses and all `Set-Cookie` headers. A sign-in without an OAuth query should redirect to the dashboard; MCP login must continue to the registered client's consent/callback. Local source: `node_modules/@better-auth/oauth-provider/dist/authorize-K1WHCNih.mjs`.

## Revocation must include bearer access

There is no built-in banned/disabled field in this application's current user schema. Removing a password only stops new credential sign-in. Deleting browser sessions does not cascade OAuth tokens: both token tables use `sessionId ... ON DELETE SET NULL`. Operator revocation should disable the reviewer identity, delete its browser sessions, OAuth refresh/access rows and consents, and rotate/remove its credential password. This is specific to `worker/identity.sql`.

Already issued signed access JWTs remain valid at the resource server until expiry because `worker/index.js` and `server/application.js` currently verify signature, issuer, audience, expiry and scope, without checking token revocation rows. The configured access lifetime is 300 seconds. For immediate reviewer revocation, add a reviewer-only active-state check at the bearer boundary as well as session and token issuance boundaries. Do not claim immediate revocation from deleting database token rows alone.

## Runtime evidence needed

Verify a fresh reviewer password login; rejected wrong passwords and ordinary/personal-account credential attempts; disabled signup; blocked reviewer social linking; unchanged ordinary social login; full MCP OAuth authorization-code/PKCE flow with explicit consent and the reviewer subject; reviewer data isolation; and failed browser, refresh-token and already-issued bearer access after revocation. A successful dashboard login alone does not prove MCP OAuth continuation.
