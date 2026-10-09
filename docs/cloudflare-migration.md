# Hosted Cloudflare deployment

The production cutover on 9 October 2026 moved the dashboard, HTTP API, MCP endpoint, account metadata, quota accounting and encrypted exports to Cloudflare. `https://myself.md/mcp` remains the public MCP resource. The OAuth issuer remains `https://myself.md/auth/realms/qr-connect`; account partitions retain `https://qr-connect-cloud-cody.fly.dev/auth/realms/qr-connect|<realm-user-id>`.

| Responsibility                                                                 | Service                                                          |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Dashboard, API and MCP transport                                               | Worker `myself-md`                                               |
| Account data, pairing, billing reservations, permissions and encrypted history | SQLite-backed `Account` Durable Objects, one per account         |
| Purchase and legacy-claim ownership                                            | SQLite-backed `Purchase` Durable Objects, one per purchase       |
| Hashed credential routing and account directory                                | D1 `myself-md-directory`, Western Europe                         |
| Encrypted export files                                                         | Private R2 bucket `myself-md-exports`                            |
| Existing OAuth realm, social sign-in and identity database                     | Retained Fly Keycloak and PostgreSQL services                    |
| Legacy service URL and OAuth forwarding                                        | Retained Fly service, with `WORKER_ORIGIN` set to the Worker URL |

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

Identity is deliberately still on Fly. Retiring those services requires a separate identity migration that preserves realm users, provider links, OAuth clients and the existing issuer/subject contracts; do not shut them down as part of the API cutover.
