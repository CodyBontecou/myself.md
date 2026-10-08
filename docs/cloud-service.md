# Cloud service

Profiles choose one destination: local JSON/JSONL files, an HTTPS POST endpoint, or the paired cloud service. Manual and scheduled exports use the same daily writer. Local files remain in Documents; remote files stage in cache and are removed after successful delivery. Editing an existing cloud profile revokes its stored-data MCP grant before accepting the edit and therefore requires a reachable server. Stored files remain until deletion or retention expiry. Re-enable cloud MCP access after reviewing the revised selection.

## Cloud upload and access

Authorize cloud uploads on the profile card while signed in. This creates a random, hashed, upload-only credential bound to the account, connected device and profile, valid for 30 days. It is stored in device secure storage with after-first-unlock accessibility so background work does not need the OAuth Keychain. Reauthorization rotates the credential and turns cloud MCP sharing off. Disconnecting the device rejects further uploads. Cloud sharing of completed stored exports is independent of live phone chat access and remains until explicitly revoked or deleted.

Uploading uses `POST /api/cloud/uploads` for profile/manifest metadata followed by `PUT /api/cloud/uploads/:id` for raw JSON or JSONL bytes, using `Authorization: Upload <credential>`. Only valid complete uploads become readable. Daily replacements keep the previous completed file until the new upload validates and commits. Older competing uploads cannot replace newer completed files. Failed schedules retain their original profile/date snapshots and retry; an interrupted HTTP delivery can have reached the recipient even when its acknowledgment was lost, so HTTP recipients should reconcile repeated daily exports.

Cloud limits are 16 MiB and 50,000 records per file, 128 stored/staged exports and 256 MiB per account. Completed files expire after 30 days; unfinished uploads expire after one hour. Expiry is enforced when cloud operations run. Upload replacement and deletion release logical quota. JSON/JSONL content and manifests are encrypted using AES-256-GCM with account/export identity as authenticated data. Index metadata (account, device, profile ID, date, format, size, creation time) remains in SQLite. The service decrypts records for authorized requests; its encryption key must be backed up separately from data volumes.

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

The service is a single Node instance with a persistent SQLite volume; live phone requests remain transient and must return to that instance. Cloud content and pairing metadata survive restarts. This configuration supports one replica; horizontal replication requires migrating persistence and transient phone queues to shared services.

1. Run `npm run cloud:setup -- exports.your-domain.example` on the deployment host. This creates ignored `.env.cloud` secrets and a production realm without development users; it does not overwrite existing configuration. Back up the encryption key, realm and volumes. Existing local accounts are separate from this new production realm.
2. Point that domain at the host and make ports 80/443 reachable. Install Docker Engine and the Compose plugin.
3. Run `npm run cloud:start`. `compose.cloud.yaml` starts the service, production Keycloak with PostgreSQL, and Caddy with automatic HTTPS. Only Caddy exposes host ports. Keycloak self-registration is enabled; configure registration policy, email and abuse controls for your audience before opening enrollment.
4. Check `https://<domain>/health`, `/config`, the protected-resource metadata URL, and OAuth discovery at `/auth/realms/qr-connect/.well-known/openid-configuration`.
5. Pair the phone with the hosted account, review a cloud profile, authorize uploads, export, then enable cloud MCP access.

Keycloak administrative paths are not exposed through the app proxy. Administer it through the private container network/CLI. Realm imports initialize a new identity database; changes to a running realm require administration rather than editing the import file. Changing PUBLIC_URL requires matching OAuth audience/issuer configuration. In production do not set ALLOW_HTTP_DEV or EXPO_PUBLIC_ALLOW_HTTP. DATA_DIR defaults to `.local` in development and `/data` in the container. CLOUD_ENCRYPTION_KEY is required outside HTTP development mode and must be 32 bytes represented as 64 hex characters. Losing/changing it makes existing encrypted data unreadable.

## Camera pairing links

The existing `/pair#ticket` QR is an iOS Universal Link on the hosted Fly domain. The app handles initial-launch and running-app links using the same parser as its in-app scanner. If the phone is already connected, it offers an explicit connection switch. Sign-in and confirmation are still required; a QR never enables access itself. Safari has an **Open in QR Connect** custom-scheme fallback. MCP pairing results also include a `deepLink`.

The public `/.well-known/apple-app-site-association` endpoint maps only `/pair` to `IOS_APP_ID` (Apple team ID plus bundle ID). `app.json` declares the hosted associated domain; changing domains requires matching that configuration and rebuilding the app. Compose reads `IOS_APP_ID` from `.env.cloud`; Fly sets it in `deploy/fly/service.toml`. Apple caches associations, so direct opening may be delayed after deployment or affected by the user’s preference to open links in Safari. The fallback remains available. [Expo Universal Links documentation](https://docs.expo.dev/linking/ios-universal-links/).

## Current Fly.io deployment

The hosted endpoint is **https://qr-connect-cloud-cody.fly.dev/mcp**, with health at `/health`. The service, private Keycloak and private PostgreSQL run in Paris (`cdg`) under `qr-connect-cloud-cody`, `qr-connect-cloud-cody-auth` and `qr-connect-cloud-cody-db`. Only the service exposes HTTPS. Separate encrypted Fly volumes hold cloud data and identity data. Each app runs one machine; this is a persistent single-instance deployment, without automatic failover.

Install and authenticate the global Fly CLI before using these commands. The checked-in `deploy/fly/*.toml` files describe these existing apps. Generated realm and secret files stay ignored under `.local/` and `.env.cloud`.

```sh
npm run cloud:fly:prepare
npm run cloud:fly:deploy
# Identity image rebuild; realm imports initialize only new databases.
fly deploy .local/fly-identity --config "$PWD/deploy/fly/identity.toml" --remote-only --ha=false --yes
```

`cloud:fly:prepare` creates restricted secret-import files from `.env.cloud`; it does not rotate or import deployed secrets. Keep `.env.cloud` backed up securely, especially its encryption key. Secret changes require explicit `fly secrets import --app <app> < <matching-file>` and coordinated identity/database updates. The public proxy blocks the admin console. For administration, use a temporary local tunnel (`fly proxy 18080:8080 --app qr-connect-cloud-cody-auth`) to its private admin API; set `X-Forwarded-Proto: https`, `X-Forwarded-Host: qr-connect-cloud-cody.fly.dev` and `X-Forwarded-Port: 443` consistently on authentication and admin requests. Close the tunnel after use. Use Fly volume snapshots and separately retained backups for recovery.

Pair the phone to this hosted service using the same account used by connectors. Existing development accounts are separate. Review each cloud profile, authorize its uploads and explicitly enable stored-cloud MCP sharing.

## Connectors

### Shared phone and connector sign-in

The phone discovers the OAuth issuer from the paired server's `/config`. Hosted phone sessions and MCP connectors therefore use the same cloud realm and GitHub sign-in. Development accounts belong to a separate realm; provider email addresses do not automatically merge accounts or transfer data ownership.

Configure GitHub on the running cloud identity service, rather than only in the development realm. Add the hosted callback to the existing QR Connect GitHub OAuth app (or register a separate production OAuth app): `https://qr-connect-cloud-cody.fly.dev/auth/realms/qr-connect/broker/github/endpoint` Put its `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` in ignored `.env.cloud`. Keep the existing development callback registered; do not enable wildcard matching. GitHub validates callback hosts against the OAuth app registration. [GitHub callback rules](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

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

Open `https://qr-connect-cloud-cody.fly.dev/dashboard` and sign in with the same cloud account used in QR Connect. The dashboard uses a dedicated public Keycloak client, `qr-dashboard`, in the existing `qr-connect` realm. Account ownership remains the issuer plus user subject, exactly as on the phone; no email-based account matching or second data store is involved.

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

The dashboard frontend is based on shadcn’s `dashboard-01` block, with the neutral inset sidebar, four summary cards, an interactive area chart and a sortable, searchable, paginated data table. All figures come from the signed-in account’s stored exports and permissions. The chart counts files still in storage by export date, rather than claiming to be a historical activity log. To rebuild local assets, run `npm run dashboard:build`; Docker runs the same build during deployment. `dashboard/components/ui/` contains the retained generated shadcn primitives with JSDoc contracts; unused demo components, sample data, drag reordering, and pretend editing controls are omitted.

The owner dashboard now includes an account-wide data explorer (`/dashboard?explore=1`); export links use the same explorer with an export scope. Queries select exports, profiles, devices, domain, metric, source and a UTC start-time range, with up to 12 typed scalar-field conditions. Conditions, sorting, pagination, timezone, chart choice, visible columns and record details persist in the URL and survive the existing sign-in flow. Named views save query settings in the current browser, partitioned by account; they do not store records or sync between browsers.

`POST /api/dashboard/explore` requires the dashboard OAuth client and applies the authenticated owner's scope before any filtering or aggregation. It decrypts existing files in memory and computes full-result facets and charts before pagination; no derived plaintext index is written. A query that would scan more than 100,000 records fails explicitly, rather than returning partial totals. Select fewer exports or profiles for larger accounts. Exact overlapping records across exports collapse by canonical content and occurrence number, preserving every origin and repeated observations within an export. Changed samples remain distinct. Original archive containers are excluded by default. Numeric aggregation requires one metric and unit; mixed results use counts. Automatic totals are restricted to known additive types; other numeric types use sample means. Sleep intervals remain individual observations. Location charts use a local coordinate plot without external tiles; point plots show a labelled deterministic sample of at most 1,000 points, rankings the top 20 groups, and interval views the first 200 intervals.

Records show normalized values, units, durations, applications and coordinates where supported, plus selectable original scalar fields. Field discovery caps at 256 paths and five nested levels, with table text previews limited to 256 characters. `GET /api/dashboard/record?export=<id>&index=<index>` returns the complete unchanged source record for Summary, Metadata and Raw JSON inspection; the same owner/client checks apply. `npm run verify:explorer` covers full-result query rules, chart semantics, provenance, URL round trips, missing values and raw fidelity; `npm run verify:cloud` covers the HTTP authentication and tenant boundaries.
