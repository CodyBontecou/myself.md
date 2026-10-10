# Hosted Cloudflare deployment

Protocol naming migration was applied to production on 10 October 2026. The new issuer, scope, callback and client IDs, provider prerequisites, and verification steps are in [protocol migration](protocol-migration.md). The deployment history below records the original identifiers; its old URLs and client names are historical. Updated native binaries still require distribution.

The production cutover on 9 October 2026 moved the dashboard, HTTP API, MCP endpoint, account metadata, quota accounting and encrypted exports to Cloudflare. `https://myself.md/mcp` remains the public MCP resource. The OAuth issuer remains `https://myself.md/auth/realms/qr-connect`; account partitions retain `https://qr-connect-cloud-cody.fly.dev/auth/realms/qr-connect|<realm-user-id>`.

| Responsibility                                                                 | Service                                                    |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Dashboard, API and MCP transport                                               | Worker `myself-md`                                         |
| Account data, pairing, billing reservations, permissions and encrypted history | SQLite-backed `Account` Durable Objects, one per account   |
| Purchase and legacy-claim ownership                                            | SQLite-backed `Purchase` Durable Objects, one per purchase |
| Hashed credential routing and account directory                                | D1 `myself-md-directory`, Western Europe                   |
| Encrypted export files                                                         | Private R2 bucket `myself-md-exports`                      |
| Existing OAuth realm, social sign-in and identity database                     | Better Auth in Workers, D1 myself-md-identity              |
| Legacy service URL and OAuth forwarding                                        | Retired; mobile source canonicalizes saved hosted URLs     |

Account metadata and reservations share a transaction boundary so concurrent UI, scheduled uploads and MCP queries cannot obtain separate free allowances. Purchase ownership is coordinated across account objects. D1 routes hashed pairing/upload/claim tickets; the authoritative object still validates ownership, expiry and revocation. A directory entry alone grants no access.

The HTTP routes and authorization checks in `server/application.js`, and the billing, data, dashboard and cloud service factories, are shared between Workers and self-hosted Node. The transport adapters supply platform storage, assets and QR rendering. Native query records remain memory-only; encrypted job metadata and profile deliveries persist. A restarted request reports interruption, releases a still-reserved agent allowance, and requires a new request for lost records. Completed uses survive.

## Deployment and checks

Use `npm run format`, `npm run check`, `npm run verify:worker`, and the relevant existing integration verifications before `npm run worker:deploy`. The deploy command builds the dashboard and runs Wrangler. Existing deployed secrets are retained. First deployment can supply a private secrets file with `wrangler deploy --secrets-file PATH`.

`npm run worker:types` generates runtime and binding declarations from Wrangler; `npm run check` includes the Worker source. The production configuration disables version preview URLs and migration access. Daily cron removes expired routing entries. Account alarms expire transient work and clean up retained export objects without a continuously running server.

Static CI remains enabled. Automatic Fly deployment was removed in commit `bde81db`; Worker deployment is currently an explicit operator command. Do not deploy the old Node service from an older Git revision: it does not understand R2-backed exports. A future automatic Worker deployment should publish only a reviewed, committed migration revision, run runtime checks, and use a narrowly scoped Cloudflare deployment token.

## Secrets and native providers

Back up the unchanged `CLOUD_ENCRYPTION_KEY` independently. Neither it nor the operator's `IMPORT_SECRET` belongs in source control. R2 is accessed through the Worker binding; S3 keys are only needed for Node/operator tools. Public R2 URLs remain disabled.

Apple and Google verification still require their production store configuration. Workers accept `APPLE_IAP_ROOT_CERTIFICATES_BASE64` (a JSON array of base64 root certificates), `APPLE_IAP_PRIVATE_KEY`, and `GOOGLE_SERVICE_ACCOUNT_JSON` as secrets. Retain the existing app IDs, bundle/package IDs, key/issuer IDs and product configuration. Node deployments can continue using the documented certificate/key files. No client entitlement flag substitutes for provider verification. Real store checkout and restored-purchase verification require separate store testing.

## Consistent import and recovery

Before a cutover, deploy the current Node bridge, set `WORKER_CUTOVER_MODE=freeze`, and verify API requests receive 503 while OAuth remains available. Wait for existing requests to end. Finish R2 backfill first. Run `node scripts/worker-snapshot.js PRIVATE_DIRECTORY` on Fly with the live `DATA_DIR`; it writes SQLite backups and an encrypted-metadata JSON snapshot with private permissions. Keep the encryption key separately.

Set the staging Worker to `MIGRATION_ENABLED=1`, keeping its production route inactive. Set private `IMPORT_SECRET` in the Worker and the operator's ignored `.dev.vars`. Run `node scripts/worker-import.js SNAPSHOT_JSON HTTPS_WORKER_ORIGIN`. It imports ownership before account data and preserves hashes for existing short-lived credentials. Batches are transactional and repeatable. Import interrupted access history honestly and release unused in-memory agent reservations.

The private `POST /__migration` endpoint supports `list_accounts`, `read_account`, `read_purchase`, and `verify_account` while migration mode is enabled. Requests use `Authorization: Migration <IMPORT_SECRET>` and JSON containing `action` and `name` (account subject or purchase digest), plus `table`/`offset` for reads. Reads return bounded encrypted metadata pages, and verification returns only file/byte counts after authenticating ciphertext and checking hashes. These are operator operations, not agent access grants. Verified time.md grants use `npm run billing:grant -- --subject SUBJECT --stripe-payment PAYMENT_ID --worker HTTPS_WORKER_ORIGIN` in the same temporary operator mode; the original payment must be verified first. The endpoint returns 404 in normal operation, including for a valid operator secret.

Before reopening, compare metadata and live object integrity. Set Fly to `WORKER_CUTOVER_MODE=bridge` and `WORKER_ORIGIN=https://myself-md.costream.workers.dev`. Disable migration mode and deploy the `myself.md/*` Worker route. Verify primary and legacy URLs, OAuth discovery, authentication failures and the disabled import endpoint.

For rollback after Worker writes, first enable migration mode to stop further API writes, then export current account metadata and global purchase/claim ownership through the bounded operator reads. Preserve the same R2 keys and encryption key. Restore that current snapshot into the current R2-aware Node service before removing the Worker route. Restoring only the pre-cutover SQLite files would discard later uses, claims and permission changes. Existing archived exports must not be reintroduced after a user deletes them.

## Cutover verification and intervening deployment recovery

The final import preserved two account partitions and seven exports, totaling 9,536,054 plaintext bytes. Every retained object was read through the live Worker R2 binding, authenticated with the original account/export AAD, and matched against its content hash. Metadata retained ownership and the current access selections.

During preparation, automatic Fly releases 20–22 deployed older committed code while R2 changes were still local. Its old `content IS NULL` cleanup removed R2-backed export references; the subsequent orphan sweep removed their objects. The seven unexpired exports were recovered from the private pre-R2 SQLite backup taken at 09:47 UTC, then reimported with their original metadata and timestamps. The stale deployment path was removed before the production cutover.

The workerd integration suite covers signed OAuth fixtures, MCP discovery and calls, first-party-only claims, cross-account denials, QR pairing, actual R2 bindings, shared allowances, simultaneous reservations and process restart persistence. Existing Node HTTP/MCP and migration eligibility tests also passed. Live public checks confirm Cloudflare serves the primary URL, legacy API requests forward correctly, OAuth discovery remains available, and migration access is disabled.

The identity cutover is described below. The original Fly instructions above describe the completed API/storage stage and recovery into the archived Node deployment.

## Identity cutover and Fly retirement

Better Auth 1.7.7 and its OAuth provider run in the same Worker with a separate D1 identity database. The two original user IDs and exact Apple/GitHub provider subjects are imported; implicit email linking is disabled. qr-phone and qr-dashboard are trusted public clients, and qr-mcp requires user consent. All three require PKCE. Dynamic registration retains the existing approved callback hosts and cannot select a first-party client ID, skip consent or grant machine access. Password authentication, account linking, identity deletion and privileged client/resource administration are not exposed.

The issuer remains https://myself.md/auth/realms/qr-connect. Existing authorization, token, certs, logout and broker callback paths have compatibility adapters. Modern OAuth discovery advertises provider endpoints under that issuer. RFC 9068 client_id is normalized to the application's verified client identity alongside legacy azp. Access tokens expire after five minutes; refresh tokens have a rolling 30-day lifetime. Old public verification keys allow already-issued access tokens to finish their short lifetime; Keycloak refresh tokens and browser sessions are not copied, so existing users must sign in again.

Before cutover, export the realm through the private loopback tunnel with npm run identity:snapshot and retain a complete pg_dump -Fc backup. npm run identity:prepare writes private import SQL and a Worker secrets file under ignored .local/identity-migration. The generated worker/identity.sql contains schema only. Apply schema and import to an empty D1 database with wrangler d1 execute --remote --file PATH. Do not replay seed SQL into an active identity database or replace the identity secret; it encrypts provider/session/signing-key material.

Deploy with IDENTITY_ENABLED:freeze to pause new sign-ins while preserving old certs for existing API tokens. Stop Keycloak writes, compare the final PostgreSQL identities/provider links against the D1 import and save the final recovery backup. Then deploy with IDENTITY_ENABLED=1. Verify discovery, JWKS, both provider callback URLs, native PKCE, token refresh, MCP consent and authenticated account access before removing Fly. No existing provider-console callback change is required. The identity operator/admin paths remain private; agents must complete sign-in and consent through the user-facing login handoff.

Production identity secrets are IDENTITY_SECRET, GITHUB_AUTH_CLIENT_ID, GITHUB_AUTH_CLIENT_SECRET, APPLE_AUTH_CLIENT_ID, APPLE_AUTH_TEAM_ID, APPLE_AUTH_KEY_ID and APPLE_AUTH_PRIVATE_KEY. LEGACY_IDENTITY_JWKS contains only the old public keys. Apple client assertions rotate in warm isolates before expiry. D1 stores encrypted provider tokens and private signing keys; daily cleanup removes expired sessions, tokens, state and rate-limit entries.

The retired fly.dev transport cannot continue serving after Fly retirement. Current mobile source canonicalizes stored hosted session/upload origins to myself.md, leaving owner IDs and local data partitions unchanged. Self-hosted origins are unchanged. Older builds need the updated app; MCP connectors should use https://myself.md/mcp. The remaining fly.dev ACCOUNT_NAMESPACE value is an immutable identifier, not a network dependency.

Recovery backups stay private in .local/identity-migration and .local/worker-cutover-recovered-20261009.json. Before restoring Keycloak, export current D1 identities and provider links and preserve any newly created users; restoring only the pre-cutover PostgreSQL database would lose them. Preserve current Worker account and purchase state independently. Use npm run verify:identity, npm run verify:worker and the native/dashboard/session checks before deployment. Real social-provider completion additionally requires the account owner to sign in.

## Final production verification

Identity cutover was verified in Worker version `fcf6888e-c391-41ed-bcaa-440f41d35dee` on the `myself.md` custom domain. The final stopped-Keycloak PostgreSQL rows matched the D1 import: two users and two provider links. The complete final PostgreSQL recovery dump passed its format check. Live GitHub sign-in completed and the authenticated dashboard displayed all seven original exports. Apple credentials and callback URLs passed provider/protocol checks; a real Apple account login and physical-device sign-in remain release checks. Native iOS, Android and web bundles passed.

Workers and Account objects obtain hosted signing keys directly through the shared identity handler, avoiding a network round trip to the public hostname. JWT issuer, audience, signature, scope and account ownership checks remain enforced at both boundaries. Local workerd integration covers native PKCE, refresh retries and isolation, agent consent, MCP calls and first-party authorization.

The three legacy Fly applications (`qr-connect-cloud-cody`, `qr-connect-cloud-cody-auth`, `qr-connect-cloud-cody-db`) were retired after live sign-in verification. Fly DNS origin records were replaced with Cloudflare-managed custom-domain records. Older installed builds that still contact fly.dev require the updated app; existing users sign in again. Private recovery files remain under `.local/identity-migration`; these contain credentials and identity data and must never be committed.
