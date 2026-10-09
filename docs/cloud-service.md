# Cloud service

Profiles choose one destination: local JSON/JSONL files, an HTTPS POST endpoint, or the paired cloud service. Manual and scheduled exports use the same daily writer. Local files remain in Documents; remote files stage in cache and are removed after successful delivery. Editing an existing cloud profile revokes its stored-data MCP grant before accepting the edit and therefore requires a reachable server. Stored files remain until deletion or retention expiry. Re-enable cloud MCP access after reviewing the revised selection.

## Cloud upload and access

Authorize cloud uploads on the profile card while signed in. This creates a random, hashed, upload-only credential bound to the account, connected device and profile, valid for 30 days. It is stored in device secure storage with after-first-unlock accessibility so background work does not need the OAuth Keychain. Reauthorization rotates the credential and turns cloud MCP sharing off. Disconnecting the device rejects further uploads. Cloud sharing of completed stored exports is independent of live phone chat access and remains until explicitly revoked or deleted.

Uploading uses `POST /api/cloud/uploads` for profile/manifest metadata followed by `PUT /api/cloud/uploads/:id` for raw JSON or JSONL bytes, using `Authorization: Upload <credential>`. Only valid complete uploads become readable. Daily replacements keep the previous completed file until the new upload validates and commits. Older competing uploads cannot replace newer completed files. Failed schedules retain their original profile/date snapshots and retry; an interrupted HTTP delivery can have reached the recipient even when its acknowledgment was lost, so HTTP recipients should reconcile repeated daily exports.

Cloud limits are 16 MiB and 50,000 records per file, 128 stored/staged exports and 256 MiB per account. Completed files expire after 30 days; unfinished uploads expire after one hour. Expiry is enforced when cloud operations run. Upload replacement and deletion release logical quota. JSON/JSONL content and manifests are encrypted using AES-256-GCM with account/export identity as authenticated data. With R2 configured, encrypted content is stored in a private R2 bucket; manifests and index metadata (account, device, profile ID, date, format, size, creation time) remain in SQLite. Without R2, self-hosted instances retain the encrypted SQLite content backend. The service decrypts records for authorized requests; its encryption key must be backed up separately from data volumes.

### Private R2 storage

The server uses Cloudflare's [S3-compatible API and official JavaScript SDK](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/). Set all four values in `.env.cloud`: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Create an **Object Read & Write** [R2 API token](https://developers.cloudflare.com/r2/api/tokens/) restricted to this bucket. Leave public access disabled; do not configure a public domain, `r2.dev`, CORS, or client credentials. Object names contain random IDs, and payloads retain application encryption. The Western Europe location hint is a placement preference, not a residency guarantee.

Uploads validate records before sending encrypted bytes to R2, then recheck the upload credential, connected device, billing reservation, daily replacement ordering, and current quota before committing the database reference. Network failures return a retryable error and do not complete the billing use. Identical retries remain idempotent. Mobile, dashboard and MCP keep their existing routes and identifiers; MCP sharing selections and blocked-agent status are checked again after asynchronous reads. Dashboard exploration loads one export at a time and retains its record limits.

On startup, a background task backfills up to 128 existing files per minute. Each file's encrypted R2 copy is downloaded, compared byte for byte, and authenticated before its SQLite bytes are removed. Mixed SQLite/R2 reads work during migration; failures preserve the SQLite source and retry. Pending object keys are recorded before network writes. Replacement and retention expiry enqueue physical deletion durably; interrupted writes become eligible for garbage collection after one hour. A failed deletion retains its queue entry. Account-owned explicit deletion waits for R2 deletion before acknowledging success; a provider failure preserves the database entry for retry.

Before enabling R2 on an existing instance, back up the encryption key separately and make a consistent database backup using the **new image** with R2 settings still absent:

```sh
# Run in the service container with its existing DATA_DIR and encryption key.
node scripts/cloud-storage.js backup /data/cloud-pre-r2.sqlite
# Then configure R2 credentials and restart with the same database and key.
node scripts/cloud-storage.js status
node scripts/cloud-storage.js migrate
```

The backup command uses SQLite's online backup API and restricts file permissions; copy the backup outside the host as part of normal backup operations. `migrate` is optional because the server resumes backfill automatically. `status` reports counts and bytes, without account identifiers or records. Run `npm run cloud:storage -- <command>` for local administration using `.env.cloud`; set `DATA_DIR` to the actual database directory. These commands are operator tools, not app/MCP capabilities.

For Fly, `npm run cloud:fly:prepare` creates `.local/fly-r2.secrets` as well as the existing secret files. Import **only the R2 file** to avoid overwriting unrelated deployed secrets, then deploy:

```sh
fly secrets import --app qr-connect-cloud-cody --stage < .local/fly-r2.secrets
npm run cloud:fly:deploy
fly ssh console --app qr-connect-cloud-cody --command 'node scripts/cloud-storage.js status'
```

Rollback requires stopping all service writers and the background migration worker. With the same database, encryption key and R2 credentials, run `node scripts/cloud-storage.js restore` in an offline maintenance container against the mounted volume. Confirm `status` reports `r2Files: 0` before removing R2 settings and restarting. Restore downloads and authenticates objects before committing SQLite bytes; it can be retried after interruption. Use the updated image for rollback because the schema includes R2 columns; deploying an older image directly is unsafe. Restoring a pre-migration backup alone would discard exports created since that backup. Do not delete the bucket while any database or backup references its objects.

SQLite retains freed disk pages after migration. After a fresh backup, stop writers and run `node scripts/cloud-storage.js compact` to reclaim database file space. This does not reduce a provisioned Fly volume or its bill: the small SQLite/identity volumes remain necessary. R2 removes growing export content from that disk; API responses still travel through Fly. Back up SQLite, the private bucket and the encryption key together; a database snapshot alone does not contain R2 files.

Run `npm run verify:r2` for signed SDK requests against a synthetic local S3 endpoint, encrypted migration/rollback, interrupted uploads, concurrent retries, quota checks, retention/deletion, and authenticated HTTP/MCP access. `R2_TEST_ENDPOINT` is accepted only for a loopback HTTP endpoint with `ALLOW_HTTP_DEV=1`; it is never a production setting. Live bucket credentials are still required to verify a production deployment.

### Proposed hosted storage plans

Lifetime app access and hosted storage are separate entitlements. The $19.99 lifetime unlock removes export/query usage limits; it does not promise unlimited hosted storage. The proposed commercial offering is:

| Plan                              | Storage capacity | Billing                                          |
| --------------------------------- | ---------------- | ------------------------------------------------ |
| Included with a lifetime purchase | 100 MB           | Included allowance, no storage subscription      |
| Larger cloud plan                 | 1 GB             | Monthly or yearly subscription; prices undecided |
| Larger cloud plan                 | 10 GB            | Monthly or yearly subscription; prices undecided |

These capacities are proposals, not implemented quotas or store products. The existing 256 MiB limit and retention still apply. Before implementation, decide prices, eligibility for complimentary migration grants and trial users, whether paid capacities replace or add to the included allowance, decimal versus binary storage units, and retention for each plan. Commercial hosted plans are distinct from an operator's self-hosted server.

Implementation must verify cloud subscriptions independently of permanent lifetime purchases, enforce account capacity for manual and scheduled uploads (including concurrent uploads), and expose used, reserved, and available storage to mobile, dashboard, and MCP through shared logic. Store checkout and subscription management require a user handoff; agents cannot grant themselves storage. Subscription renewal or expiry must never remove the lifetime app unlock. Proposed downgrade behavior: block uploads that exceed the reduced capacity while retaining access to download and delete existing files under the published retention policy; do not immediately delete data just because a subscription ends. This behavior needs confirmation before release.

Cloud MCP access starts off. The phone's **Allow stored cloud data in MCP connectors** switch sets an independent server-side grant with a data-type selection. MCP reads apply this selection to stored records on every request. A generated profile or an upload credential cannot enable this grant. Data already sent to a connector is subject to that provider's storage policies.

Phone OAuth management endpoints:

- `POST /api/cloud/credential`: `{deviceId, profile}`; return a scoped upload credential.
- `POST /api/cloud/access`: `{deviceId, profile}`; read cloud grant state.
- `PUT /api/cloud/access`: `{deviceId, profile, shared}`; replace the grant and its selection.
- `GET /api/cloud/exports`: list completed account exports.
- `DELETE /api/cloud/exports/:id`: delete an account-owned export.

The profile card can delete all exports matching its device/profile. The server checks token issuer, audience and `qr-connect` scope, and restricts management to the `qr-phone` OAuth client. Upload credentials cannot read records, create pairing tickets, change grants or invoke MCP. Tenant identity always comes from verified authentication.

## HTTP destination

Enter an HTTPS endpoint and optionally save a bearer credential on the profile card. Credentials stay in secure storage and are bound to that exact URL; profile links contain only destination configuration. Each format sends a POST with the selected raw JSON or JSONL body, Content-Type, X-Export-Profile and X-Export-Day. Redirects are rejected and requests time out after 60 seconds. JSON includes its manifest; JSONL is records only. For capture/warning manifests with JSONL, use local files or cloud storage. An HTTP 2xx acknowledges delivery. Recipient authentication, storage, permissions and repeated-upload handling belong to that endpoint.

## Deployment

For a new instance on your own infrastructure, follow the platform-neutral [self-hosting guide](self-hosting.md), including social sign-in provisioning, backups, and billing requirements. The provider-specific notes below describe the project's existing hosted deployment.

The service is a single Node instance with a persistent SQLite volume; live phone requests remain transient and must return to that instance. Cloud content and pairing metadata survive restarts. This configuration supports one replica; horizontal replication requires migrating persistence and transient phone queues to shared services.

1. Run `npm run cloud:setup -- exports.your-domain.example` on the deployment host. This creates ignored `.env.cloud` secrets and a production realm without development users; it does not overwrite existing configuration. Back up the encryption key, realm and volumes. Existing local accounts are separate from this new production realm.
2. Point that domain at the host and make ports 80/443 reachable. Install Docker Engine and the Compose plugin.
3. Run `npm run cloud:start`. `compose.cloud.yaml` starts the service, production Keycloak with PostgreSQL, and Caddy with automatic HTTPS. Only Caddy exposes host ports. Password sign-in and local registration are disabled; [configure GitHub sign-in](self-hosting.md#4-configure-github-sign-in) before users can authenticate. Apple requires an additional provider adapter and credentials.
4. Check `https://<domain>/health`, `/config`, the protected-resource metadata URL, and OAuth discovery at `/auth/realms/qr-connect/.well-known/openid-configuration`.
5. Pair the phone with the hosted account, review a cloud profile, authorize uploads, export, then enable cloud MCP access.

Keycloak administrative paths are not exposed through the app proxy. Administer it through the private container network/CLI. Realm imports initialize a new identity database; changes to a running realm require administration rather than editing the import file. Changing PUBLIC_URL requires matching OAuth audience/issuer configuration. In production do not set ALLOW_HTTP_DEV or EXPO_PUBLIC_ALLOW_HTTP. DATA_DIR defaults to `.local` in development and `/data` in the container. CLOUD_ENCRYPTION_KEY is required outside HTTP development mode and must be 32 bytes represented as 64 hex characters. Losing/changing it makes existing encrypted data unreadable.

## Camera pairing links

The existing `/pair#ticket` QR is an iOS Universal Link on the hosted Fly domain. The app handles initial-launch and running-app links using the same parser as its in-app scanner. If the phone is already connected, it offers an explicit connection switch. Sign-in and confirmation are still required; a QR never enables access itself. Safari has an **Open in myself.md** custom-scheme fallback. MCP pairing results also include a `deepLink`.

The public `/.well-known/apple-app-site-association` endpoint maps only `/pair` to `IOS_APP_ID` (Apple team ID plus bundle ID). `app.json` declares the hosted associated domain; changing domains requires matching that configuration and rebuilding the app. Compose reads `IOS_APP_ID` from `.env.cloud`; Fly sets it in `deploy/fly/service.toml`. Apple caches associations, so direct opening may be delayed after deployment or affected by the user’s preference to open links in Safari. The fallback remains available. [Expo Universal Links documentation](https://docs.expo.dev/linking/ios-universal-links/).

## Hosted Cloudflare service

The hosted endpoint is **https://myself.md/mcp**, with health at /health. Workers serve the API, dashboard, MCP and OAuth provider. D1 stores identity and credential routing; account and purchase Durable Objects preserve ownership and shared billing; the private R2 bucket stores encrypted export files. The former Fly services are retired after identity cutover. The checked-in Fly configuration remains recovery/reference material for the Node/Keycloak deployment.

All seven existing exports (9,536,054 plaintext bytes) were authenticated through the live R2 binding during the API cutover. The identity migration preserves existing user IDs, social-provider account links, the public issuer and immutable data partition namespace. Existing Keycloak refresh tokens require a new sign-in; current mobile source redirects saved hosted transport and upload URLs to myself.md without reassigning local records. Older installed builds still pointing at fly.dev require an update.

Use npm run worker:deploy for deployment and follow [Cloudflare migration and recovery](cloudflare-migration.md). Keep the data encryption key, identity signing/encryption secret and private recovery backups outside source control. Apple/GitHub callbacks retain their existing public URLs. Provider purchases still require their independent native-store configuration and testing.

Pair the phone using the same account as connectors. Review each cloud profile, authorize its uploads and explicitly enable stored-cloud MCP sharing.

## Connectors

### Shared phone and connector sign-in

The phone discovers the OAuth issuer from the paired server's `/config`. Hosted phone sessions and MCP connectors therefore use the same cloud realm and GitHub sign-in. Development accounts belong to a separate realm; provider email addresses do not automatically merge accounts or transfer data ownership.

Configure GitHub on the running cloud identity service, rather than only in the development realm. Add the hosted callback to the existing myself.md GitHub OAuth app (or register a separate production OAuth app): `https://myself.md/auth/realms/qr-connect/broker/github/endpoint` Put its `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` in ignored `.env.cloud`. Keep the existing development callback registered; do not enable wildcard matching. GitHub validates callback hosts against the OAuth app registration. [GitHub callback rules](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

```sh
# Leave the private tunnel running in one terminal.
fly proxy 18080:8080 --app qr-connect-cloud-cody-auth
# Run in another terminal, then close the tunnel.
KEYCLOAK_ADMIN_URL=http://127.0.0.1:18080/auth npm run cloud:auth:social
```

This updates the existing cloud realm through its private admin API with consistent HTTPS forwarding headers. It preserves users and clients. Production provider secrets remain in the identity database and are excluded from the realm seed copied into the Docker image. Missing provider credentials leave existing providers unchanged. The cloud script does not provision GitHub's callback registration. The production identity image includes Apple adapter 1.17.0, verified against its pinned SHA-256 during the image build. Apple sign-in uses Services ID `com.myself.md.login`, associated with primary App ID `com.myself.md`. Configure the exact hosted and development `/auth/realms/qr-connect/broker/apple/endpoint` return URLs in Apple Developer. Put `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY_PATH` in the ignored environment file and run the same social provisioning command; keep the downloaded `.p8` key in `.local/apple/` with restricted permissions.

Use `https://<domain>/mcp` as the Streamable HTTP endpoint. Authentication is OAuth with protected-resource discovery, resource audience validation, PKCE and user consent via Keycloak. Approve the exact callback hosts required by each connector in the realm registration policy, or register a dedicated OAuth client with exact redirect URIs. Refresh tokens and provider consent policy must be configured for durable connections.

- ChatGPT: add a custom MCP app using the hosted URL and OAuth where developer mode/workspace policy permits. [Official setup](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).
- Claude: add a remote custom connector with the hosted URL and authenticate to the same account as the phone. [Official setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- xAI/Grok API: remote MCP supports a server URL and an authorization token. Send an audience-correct user access token with the supported `authorization` field and restrict allowed tools as appropriate. This has been documented for xAI's API; consumer Grok connector availability has not been verified. [Official remote MCP documentation](https://docs.x.ai/developers/tools/remote-mcp).

`list_cloud_exports` lists only explicitly shared completed files. `read_cloud_export` accepts exportId, cursor and limit (1–50), returns preserved native records plus a bounded cursor, and works with the phone offline. Pages cap record payloads at 200 KB; an oversized record must be exported locally. `delete_cloud_export` deletes an account-owned export and advertises destructive behavior. Existing phone pairing, generated profile links, catalog and live-query tools remain available.

## Verification

`npm run verify:cloud` tests encrypted persistent storage and a real synthetic HTTP/OAuth/MCP exchange using the installed SDK client. It checks tenant isolation, upload-only authority, sharing, selection revocation, incomplete uploads, restart persistence, deletion and retention. The network fixture requires local loopback listening permission. `npm run verify:exports` covers schedule/calendar and encoding behavior. Run `npm run format`, `npm run check` and `npm run bundle` after edits. The current Fly deployment was also checked over public HTTPS with a temporary synthetic account: real Keycloak login with PKCE, authenticated SDK MCP discovery, pairing, upload, denial before sharing, successful shared reads and sharing revocation. The temporary export, device and account were removed. Actual ChatGPT/Claude/Grok account linking remains to be verified in each provider.

## Account dashboard

Open `https://myself.md/dashboard` and sign in with the same cloud account used in myself.md. The dashboard uses a dedicated public Keycloak client, `qr-dashboard`, in the existing `qr-connect` realm. Account ownership uses a stable realm namespace plus user subject, exactly as on the phone; no email-based account matching or second data store is involved.

The export library shows stored profile snapshots, date, format, size and current sharing status. Search the library and open an export to browse records in bounded pages of up to 50 records / 200 KB, including expandable original native fields. Delete removes the entire selected cloud export after confirmation, preserving phone files; a later scheduled upload can recreate it. Individual record deletion and editing are not supported. The existing 30-day retention and 256 MiB account quota apply.

Profiles & permissions controls the existing profile-wide cloud MCP sharing switch without changing the phone-approved selection, including for disconnected devices. The app reads the same permission on its next permission refresh. Data selection, scheduling, upload authorization and live phone permissions remain managed on the phone. Allowed agents share access to all enabled cloud profiles; there is no per-agent profile allowlist. Connected agents lists OAuth client IDs observed by this service since the dashboard upgrade, rather than claiming those IDs are verified product names. Blocking a client denies all its MCP requests for this account, even with an already issued access token, and discards its queued and retained live queries. Blocks persist across service restarts. Unblocking restores access subject to profile and phone permissions. This does not erase data already copied into an agent’s history or revoke its Keycloak login.

The signed-out dashboard offers only Apple and GitHub OAuth. Each button starts a fresh authorization request with PKCE and the matching provider hint. There is no credential form or password relay. Social provisioning also disables password authentication, direct password grants, password reset and local registration in the user realm; unhinted MCP requests go to GitHub. Apply this to existing realms with `npm run cloud:auth:social`. Link password-only accounts to Apple or GitHub before applying it to preserve access to their existing data. New social accounts are created without automatically merging matching email addresses; link a second provider through the account console while signed in.

Browser sign-in uses authorization code with PKCE S256 and a ten-minute, single-use state/verifier stored only for the redirect. Access and refresh tokens stay in page memory, so reloading the page requires signing in again (the existing Keycloak SSO session can complete it). Sign out uses Keycloak’s logout endpoint. Dashboard APIs accept only audience-validated, `qr-connect`-scoped tokens from `qr-dashboard`; phone and MCP clients cannot use these owner management endpoints. CSP prohibits inline scripts, framing and unrelated network origins; record values are rendered as React text. Style attributes support shadcn/Radix positioning and Recharts. A per-response style nonce is registered with the scroll-lock stylesheet injector.

Fresh `cloud:setup` includes the dashboard client. For an existing deployment, provision it once through the private identity tunnel, preserving users and other OAuth clients:

```sh
fly proxy 18081:8080 --app qr-connect-cloud-cody-auth
# In a separate terminal, with .env.cloud already configured:
KEYCLOAK_ADMIN_URL=http://127.0.0.1:18081/auth npm run dashboard:auth
# Close the proxy after provisioning, then deploy the service:
npm run cloud:fly:deploy
```

For local development, use `KEYCLOAK_ADMIN_URL=http://127.0.0.1:8080/auth node --env-file=.env scripts/setup-dashboard.js` (omit `/auth` when using a realm without the auth proxy). The script upserts only the dashboard client, using exact service-origin callback and web origins and mandatory PKCE. It also retains that client in the ignored realm seed. See [Keycloak’s authorization and token endpoints](https://www.keycloak.org/securing-apps/oidc-layers) for the underlying browser sign-in flow.

`npm run check` includes a separate DOM-enabled strict JavaScript check for `dashboard/`, plus formatting, lint and unused-code coverage. `npm run verify:cloud` verifies owner/client isolation, record viewing and deletion, sharing revocation and restoration, agent blocking and restart persistence, and cancellation of pending agent requests. Browser QA uses synthetic data and a mock identity provider; real account sign-in needs the deployed Keycloak client.

The dashboard frontend is based on shadcn’s `dashboard-01` block, with the neutral inset sidebar, four summary cards, an interactive area chart and a sortable, searchable, paginated data table. On `/dashboard`, all figures come from the signed-in account’s stored exports and permissions. At `/`, the same controls use a browser-local fictional workspace with a join CTA pointing to `/login`. The chart counts files still in storage by export date, rather than claiming to be a historical activity log. To rebuild local assets, run `npm run dashboard:build`; Docker runs the same build during deployment. `dashboard/components/ui/` contains the retained generated shadcn primitives with JSDoc contracts; unused demo components, sample data, drag reordering, and pretend editing controls are omitted.

The owner dashboard now includes an account-wide data explorer (`/dashboard?explore=1`); export links use the same explorer with an export scope. Queries select exports, profiles, devices, domain, metric, source and a UTC start-time range, with up to 12 typed scalar-field conditions. Conditions, sorting, pagination, timezone, chart choice, visible columns and record details persist in the URL and survive the existing sign-in flow. Named views save query settings in the current browser, partitioned by account; they do not store records or sync between browsers.

`POST /api/dashboard/explore` requires the dashboard OAuth client and applies the authenticated owner's scope before any filtering or aggregation. It decrypts existing files in memory and computes full-result facets and charts before pagination; no derived plaintext index is written. A query that would scan more than 100,000 records fails explicitly, rather than returning partial totals. Select fewer exports or profiles for larger accounts. Exact overlapping records across exports collapse by canonical content and occurrence number, preserving every origin and repeated observations within an export. Changed samples remain distinct. Original archive containers are excluded by default. Numeric aggregation requires one metric and unit; mixed results use counts. Automatic totals are restricted to known additive types; other numeric types use sample means. Sleep intervals remain individual observations. Location charts use a local coordinate plot without external tiles; point plots show a labelled deterministic sample of at most 1,000 points, rankings the top 20 groups, and interval views the first 200 intervals.

Records show normalized values, units, durations, applications and coordinates where supported, plus selectable original scalar fields. Field discovery caps at 256 paths and five nested levels, with table text previews limited to 256 characters. `GET /api/dashboard/record?export=<id>&index=<index>` returns the complete unchanged source record for Summary, Metadata and Raw JSON inspection; the same owner/client checks apply. `npm run verify:explorer` covers full-result query rules, chart semantics, provenance, URL round trips, missing values and raw fidelity; `npm run verify:cloud` covers the HTTP authentication and tenant boundaries.

## myself.md domain cutover

`myself.md` is the primary domain for the app. DNS is hosted on Cloudflare; nic.md is the registrar and cannot edit the zone while the Cloudflare nameservers are selected. Keep those nameservers. The domain is already registered and active through 14 August 2027.

The production cutover completed on 9 October 2026. The root domain serves this app, replacing the previous Worker homepage. The previous `myself-md` Worker remains intact; its root custom-domain mapping was detached. The reminder Worker domains are unchanged. Cloudflare uses Full (strict) encryption and proxies both service address records. Fly issued valid RSA and ECDSA certificates for `myself.md`.

| Type  | Name              | Value                          | Proxy    |
| ----- | ----------------- | ------------------------------ | -------- |
| A     | @                 | `66.241.124.216`               | Proxied  |
| AAAA  | @                 | `2a09:8280:1::1ac:e3fa:0`      | Proxied  |
| CNAME | `_acme-challenge` | `myself.md.6kylo2n.flydns.net` | DNS only |
| TXT   | `_fly-ownership`  | `app-6kylo2n`                  | DNS only |

The deployed service and ignored `.env.cloud` use `PUBLIC_URL=https://myself.md` and `PUBLIC_URL_ALIASES=https://qr-connect-cloud-cody.fly.dev`. Both exact MCP audiences are accepted; request metadata advertises the matching allowed origin. The homepage serves an interactive dashboard with fictional sample data; `/login` is the entry point for account sign-in. `app.json` includes both domains for Universal Links.

Authentication migrated to `OAUTH_ISSUER=https://myself.md/auth/realms/qr-connect` on 9 October 2026. Keycloak’s canonical hostname is `https://myself.md/auth`; the realm, users, signing keys, scopes, client IDs and provider credentials are retained. GitHub and Apple registrations now include the exact `https://myself.md/auth/realms/qr-connect/broker/<provider>/endpoint` callback. The GitHub application is named myself.md and its homepage is `https://myself.md`. Existing development and Fly broker registrations remain available for recovery. Browser sign-in and sign-out use the new domain.

The existing service sets `ACCOUNT_NAMESPACE=https://qr-connect-cloud-cody.fly.dev/auth/realms/qr-connect`. This is a persistent internal storage key, independent of the accepted OAuth issuer; it keeps existing exports, encrypted history, devices, sharing settings and phone-local ownership intact. It does not accept tokens issued by the previous URL. New deployments default the account namespace to their initial issuer; keep that namespace unchanged when moving the same realm to another hostname. The dashboard client retains the exact `/dashboard/callback` URL, web origin and `/dashboard` logout URL on both service origins, with PKCE unchanged. The existing `.env.cloud` now uses `SERVICE_DOMAIN=myself.md`, the new `OAUTH_ISSUER`, and the preserved `ACCOUNT_NAMESPACE`.

Existing phone and agent sessions may need to sign in again or pair using a new QR because old-issuer tokens are rejected. The verified server subject remains stable, preserving local records when the phone pairs with the same account. No stored data or identity users were wiped.

`npm run cloud:domain:setup` adds missing MCP audiences and dashboard origins to the existing realm through the private identity tunnel. It retains existing mappings and saves the original identity configuration in ignored `.local/domain-cutover/identity-before.json`. The detached Worker mapping is saved in `.local/domain-cutover/cloudflare-domain-before.json`. To inspect the configuration without applying changes:

```sh
fly proxy 18081:8080 --app qr-connect-cloud-cody-auth
# In another terminal; close the tunnel after inspection:
KEYCLOAK_ADMIN_URL=http://127.0.0.1:18081/auth npm run cloud:domain:setup -- --dry-run
```

HTTPS, `/health`, `/config`, `/dashboard`, OAuth resource discovery, the protected `/mcp` response and the Apple association file were verified through Cloudflare. A real GitHub browser sign-in returned to the new dashboard and retained access to existing account exports. Apple callback registration includes myself.md; a fresh Apple sign-in requires separate verification. `npm run verify:cloud` covers both audiences, allowed-host metadata, rejection of unrelated audiences and stable namespace-based ownership and rejection of previous-issuer tokens.

`.env.cloud.example` uses `SERVICE_DOMAIN=myself.md` for a new deployment. Keep the existing deployment’s identity and encryption settings when maintaining this service.

## Hosted Cloudflare cutover

The production API, MCP transport, dashboard and account data moved to Workers, Durable Objects, D1 and R2 on 9 October 2026. Existing OAuth remains on Fly during the identity transition. See [Cloudflare migration](cloudflare-migration.md) for deployment, shared quota/claim coordination, verification, encrypted recovery and the retained legacy URL bridge.
