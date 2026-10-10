# myself.md

The reusable [Support Chat client](packages/support-chat/README.md) has been extracted from the mobile and dashboard apps. Its entry points are removed from myself.md for now; email and GitHub support links remain. The server still supports account-scoped conversations and Cody replies in a private Discord thread using the existing isobot identity. No additional bot process or isobot source change is needed. `npm run verify:support` checks authenticated HTTP/MCP ownership, support grants, privacy, encrypted storage, retries and reply recovery against a simulated Discord API. It sends no live messages.

To connect isobot, place its existing `DISCORD_BOT_TOKEN` in an ignored environment file and run `npm run support:setup` (or `node --env-file=/path/to/ignored-env scripts/setup-support.js`). If the bot belongs to multiple servers, set `SUPPORT_DISCORD_GUILD_ID`. Staff defaults to `ISOBOT_ALLOWED_USERS` or the bot application owner/team; override with `SUPPORT_DISCORD_STAFF_IDS`. Setup creates/reuses **myself-md-support**, denies everyone access, permits only the bot and designated staff, verifies its privacy, and writes the three support settings to ignored `.env.support` with mode 0600. Existing channels with incompatible privacy are rejected rather than modified. The bot needs Manage Channels for setup and View Channel, Read Message History, Send Messages, Create Public Threads, Send Messages in Threads and Manage Threads for operation. Discord administrators retain platform access.

For the hosted Worker, run `npx wrangler secret bulk .env.support`, build the dashboard and deploy with the existing Worker scripts. For Node, load `.env.support` alongside the existing server environment and restart. Keep the token server-only; never put it in Expo public variables or dashboard bundles. The new settings are `SUPPORT_DISCORD_BOT_TOKEN`, `SUPPORT_DISCORD_CHANNEL_ID`, and `SUPPORT_DISCORD_STAFF_IDS`. Chat stays unavailable until configured. Plain text replies from the designated staff sync on refresh (every 15 seconds while the chat is open); attachments, edits and push notifications are not part of this version. Failed delivery remains saved and retries on refresh. Messages are limited to 1,800 characters and 30 new messages per account per hour. Support history remains until account deletion, which also removes its Discord thread; external backups/copies remain outside that cleanup. Owner opt-in separately authorizes connected agents to read/send support messages, and revocation cancels queued agent sends.

Privacy disclosures live in `core/privacy.js` and are shared by the offline mobile policy, the public `/privacy` and `/support` pages, and `get_privacy_policy` over MCP. Support uses `cody@iolated.tech` and the repository’s public GitHub issues; users should omit sensitive data from reports. Build and deploy the dashboard/Worker to publish the pages, then set `https://myself.md/privacy` in App Store Connect. `npm run verify:cloud` checks unauthenticated browser rendering and MCP disclosure parity alongside cloud integration.

iOS Debug builds include [Gripe screenshot feedback](modules/gripe/README.md). Set `GRIPE_API_KEY` in the ignored `.env` (optional `GRIPE_REPOSITORY=owner/repo`), run `npm run prebuild -- --platform ios`, and rebuild with `npm run ios -- --device <id>`. Triple-tap with two fingers or open **Settings → Report a bug** to crop, annotate and file a GitHub issue. Release builds contain no Gripe credential and compile out SDK behavior. Android, web and Expo Go do not support this iOS SDK. Use `GRIPE_DRY_RUN=1` during prebuild for local flow verification without creating an issue; remove it before live reporting. `npm run verify:feedback` exercises the actual MCP tools and phone heartbeat/approval contract, including ownership, revocation, expiry, safe dispatch retries and confirmed issue completion.

To route reviewed reports into local Codex sessions instead of GitHub issues, use the [Gripe Mac bridge](docs/gripe-mac.md). It polls the private Gripe inbox and starts each task in a managed Git worktree using the Mac’s Codex sign-in. `npm run gripe:mac` starts the runner; `npm run verify:gripe-mac` verifies delivery and recovery with a fixture process. `npm run build:ios:debug` compiles the native Debug feedback UI for the simulator.

The app name and primary domain are **myself.md**. The domain is registered through 14 August 2027 and uses Cloudflare nameservers (`bill.ns.cloudflare.com`, `naya.ns.cloudflare.com`), verified in the registrar account on 9 October 2026. The app is live at [myself.md](https://myself.md), with DNS, TLS and OAuth cutover completed on 9 October 2026. Authentication, including sign-out, uses myself.md. The hosted API and identity provider run on Cloudflare; older Fly service links are retired after cutover; see the [deployment configuration](docs/cloud-service.md#myselfmd-domain-cutover).

Branding uses a lowercase `myself.md` wordmark and an `m.` app mark on the existing warm neutral palette. Native icons are configured in `app.json`; run `npm run prebuild` after changing them. The generated iOS project and build scheme are `myselfmd`.

Compatibility identifiers remain stable: `qrconnect://` links, `qr-connect` OAuth realm/scope, profile schemas, storage keys, native package identifiers, and Fly app names. Renaming these independently would break installed apps, saved data, or existing authentication. New data exports use `myself.md.export.v1`.

Plain JavaScript Expo/React Native app for iOS and Android, dependency-free shared QR and data protocols in `core/`, and an OAuth-protected Streamable HTTP MCP server.

## License

Project code is licensed under [AGPL-3.0-only](LICENSE). Existing third-party licenses and store artwork notices are preserved in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Self hosting

myself.md is open source so you can run your own instance and control where your data is stored. Follow the [self-hosting guide](docs/self-hosting.md) to deploy on your own infrastructure, configure sign-in, connect your phone and MCP clients, and maintain backups and upgrades. The guide uses the portable deployment files in this repository and does not require a particular hosting provider.

Self-hosting currently retains the app's usage allowance and purchase verification. See the guide's [billing and mobile build requirements](docs/self-hosting.md#billing-and-mobile-builds) before deploying.

The landing page links to [the GitHub repository](https://github.com/CodyBontecou/agent-bridge). App Store and Google Play use compact icon buttons, disabled until the myself.md listings are available; accessible labels and tooltips identify each store and its “Coming soon” status. GitHub uses a matching icon link. Markup lives in `dashboard/download-badges.js`.

## Remote phone updates

See [remote mobile updates](docs/mobile-updates.md) for EAS account linking, iPhone enrollment, preview builds, over-the-air updates and unattended GitHub releases. Native changes require another installed build.

## Run locally

Requires Node 22.13+, Java 21+, and the native platform toolchain. In this directory:

```sh
npm install
npm run auth:setup  # Once; creates private .env and development realm
npm run auth:start  # Terminal 1: downloads/runs local Keycloak
npm run server      # Terminal 2: authenticated API and MCP
npm run ios         # Terminal 3: build and launch iOS
# Or: npm run android
npm run pair        # Terminal 4: browser OAuth, MCP-generated QR
npm run pair -- list # Browser OAuth, list your connected phones
```

`auth:setup` creates the local realm and development admin credentials in `.env`. User sign-in requires Apple or GitHub; no development passwords are generated. Environment files, SQLite data, and downloaded Keycloak are ignored by Git. Configure a public HTTPS issuer and the social providers below before signing in.

On the hosted domain, the iPhone Camera opens pairing QRs in myself.md through Universal Links. If Safari opens, tap **Open in myself.md**. Custom `qrconnect://pair?url=…` links use the same pairing parser; incoming links during an existing session offer **Switch to this connection**, without signing out automatically.

The phone scans the QR, shows the server address, opens a system browser for OAuth sign-in, and asks you to confirm. Sign in with the **same account** used by the MCP client. The paste-link fallback supports simulators and accessibility; the camera remains the primary entry point. Generate a separate QR for each phone. Keycloak account identity connects iOS, Android, and MCP clients; each client has its own tokens.

Docker is optional: `npm run auth:docker` runs the same pinned Keycloak image using `compose.yaml`. Start a Docker engine first. Use either the standalone runtime or Docker, not both on port 8080. Their databases are separate. Local realm import runs only when the realm does not already exist; change an existing realm through the Keycloak admin console.

## Public HTTPS with Tailscale Funnel

This checkout is now exposed at `https://macbook-pro.tail5cf333.ts.net`. MCP is at `/mcp`; Keycloak's OAuth issuer is `/auth/realms/qr-connect`. The current `.env` uses `DEV_HOST=127.0.0.1`, `AUTH_PROXY=1`, and `ALLOW_HTTP_DEV=0`. The existing realm's audience mapper was updated to the HTTPS MCP URL, preserving accounts and credentials. Older LAN tokens and QR codes need a fresh sign-in/pairing; existing record ownership is not rewritten.

Keep `npm run auth:start` and `npm run server` running. This configuration uses the standalone Keycloak launcher. Funnel persists in the background:

```sh
/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg --https=443 http://127.0.0.1:3000
# Inspect:
/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel status
# Stop this endpoint:
/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --https=443 off
```

The server forwards only this realm's OAuth/account routes and login assets under `/auth`; administration and other realms return 404. Both backends listen on loopback. The proxy replaces forwarded host/protocol headers with the configured public origin. Public MCP and phone data APIs still require OAuth. The Mac must remain awake and connected; the phone does not need Tailscale installed or the same Wi-Fi. The installed mobile app discovers its issuer from the QR server, so it needs a new HTTPS QR rather than another native build.

This is public access to the local development Keycloak runtime, with the same generated demo accounts. It is suitable for this prototype, and remains dependent on the Mac's uptime. See [Tailscale Funnel](https://tailscale.com/docs/reference/tailscale-cli/funnel) and [Keycloak reverse proxy configuration](https://www.keycloak.org/server/reverseproxy).

## GitHub and Apple sign-in

iOS uses bundle ID `com.myself.md`; Universal Links use `67KC823C9A.com.myself.md`. This installs separately from the previous iOS identity, so existing app data does not migrate automatically. The new Apple App ID needs the app’s capabilities and signing profiles configured before a signed device build.

The web dashboard and the iOS/Android pairing screen offer **Sign in with Apple** and **Continue with GitHub** buttons that open the existing Keycloak browser flow with the matching `kc_idp_hint`. The phone still requires a pairing link and the same account as the agent. Configure the Apple provider below before using these buttons.

Provider provisioning is ready; a provider appears on Keycloak's login page only after its real credentials have been configured. Both mobile and MCP clients keep using the same Keycloak OAuth flow. No mobile rebuild is needed.

```sh
npm run auth:social:install  # Pinned Apple adapter; verify SHA-256, then restart auth:start
npm run auth:social          # Apply credentials from ignored .env to the existing realm
```

GitHub: register a new OAuth app named **myself.md**, with homepage `${PUBLIC_URL}/pair` and callback `${OAUTH_ISSUER}/broker/github/endpoint`. Keep wildcard redirects and device flow off. Set `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` in `.env`. Keycloak requests `read:user user:email`, and does not request repository access or retain upstream tokens.

Apple: enable Sign in with Apple on the primary App ID `com.myself.md`. Register a web Services ID `com.myself.md.login`, associate it with that primary App ID, and configure the Funnel hostname and exact return URL `${OAUTH_ISSUER}/broker/apple/endpoint`. Create a dedicated Sign in with Apple key, download its `.p8` file into `.local/apple/`, and record its Key ID. Set `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY_PATH` in `.env`. The provisioning script validates a P-256 private key and sends it only to the loopback Keycloak admin API; it is stored in the ignored local Keycloak database and realm import. Keep the original key and credentials private.

For this checkout, the callbacks are:

- GitHub: `https://macbook-pro.tail5cf333.ts.net/auth/realms/qr-connect/broker/github/endpoint`
- Apple: `https://macbook-pro.tail5cf333.ts.net/auth/realms/qr-connect/broker/apple/endpoint`

The scripts update provider configurations and authentication policy. Missing credentials leave existing providers unchanged. The scripts also enforce Apple/GitHub-only browser authentication, disable password grants, password reset and local registration, and disable other identity providers. Requests without a provider hint (including MCP connectors) go to GitHub. Run `npm run auth:social` or `npm run cloud:auth:social` to apply this policy to an existing realm. Existing users and data ownership are preserved, but password-only accounts must have a social identity linked before applying the policy. First-time social sign-in creates a Keycloak account; accounts are not automatically merged by matching email addresses. To use both GitHub and Apple for one account, link the second identity while authenticated through Keycloak's account console. The Apple adapter's separate token-exchange account-linking feature stays off.

A QR belongs to the Keycloak account that requested it. Generate it after signing into the MCP client with the same social account you will use on the phone. An `alice` demo QR cannot be claimed by a newly created GitHub/Apple account. The Apple provider uses browser Sign in with Apple, including its POST callback and dynamically signed client-secret JWT; this is not a native Apple token exchange.

The standalone Keycloak launcher is the supported setup here. Apple support uses the [Apple adapter 1.17.0](https://github.com/klausbetz/apple-identity-provider-keycloak/releases/tag/1.17.0), pinned and checked against its published SHA-256, and verified to load into the local Keycloak 26.8 runtime. See [GitHub OAuth app registration](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) and [Apple web Sign in configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web).

## Export profiles and AI generation

The first launch introduces myself.md in three steps: phone context, sharing controls, and a choice of data-source setup or agent pairing. Skip and Explore the app first open Profiles. Completion is stored locally with Expo SQLite; finishing removes onboarding from the navigation history and future launches open Profiles. Introduction never enables permissions or sharing. Pairing links remain available during onboarding.

Profiles are named configurations: create, rename, duplicate with a fresh ID, and delete (except the final profile). Each saved profile has a separate **Allow agent access** toggle, confirmed on the phone when enabling it. Agents choose an approved profile for each request; there is no active profile. The previously active profile retains approval during migration; other legacy profiles and all new/imported/duplicated profiles start private. Approval is device-local and is excluded from shared configuration links. Each profile stores its own explicit selection of native data types across health, screen time and location. These are data-type controls; selecting a type includes its native metadata, not field-level redaction. Search the editor to find individual metrics. New profiles start empty; newly discovered types stay disabled. The initial Default profile snapshots the readable types in domains already enabled before migration. Existing domain grants and OS authorization remain separate. Local file export uses the profile selection without requiring chat grants.

Open a profile from Profiles & exports for a compact configuration overview: data-type counts, destination, formats, export window, filename/folders, cadence, export status, history, and identity. Customize profile opens a single draft form for name, destination, output, and scheduling, with a searchable data picker. Section Edit links open that part of the same draft. Save commits the changes; Cancel confirms discarding unsaved edits. Duplicate creates a new identity and does not copy automatic-export opt-in or credentials. The layout follows health-md's profile detail/editor; Markdown, rollups, Daily Notes injection, and individual-entry output remain outside this app's JSON/JSONL export scope.

Open Profiles & exports, then select a profile to inspect its data selection, destination, output, schedule and stable ID. Customize profile opens a draft editor with focused data, destination, output and schedule sections; Save applies the draft, while Cancel confirms before discarding changed settings. New, duplicated and imported profiles open their own detail after saving. Automatic-export opt-in, HTTP credentials and cloud access remain on the saved profile detail. This view adapts health-md’s profile management to the supported JSON/JSONL export engine; it does not add Daily Notes, rollups or unsupported output formats.

The portable wire format is `myself.md.profile.v1` (legacy `qr-connect.profile.v1` profiles are accepted and normalized), specific to this app; it follows health-md's profile behavior but does not decode health-md's Swift/Kotlin settings, destination bindings or schedules. Profile selection never changes the data export schema. Profiles are saved locally per pairing; server catalogs and delivery queues are ephemeral. Export and cadence settings travel with the profile; destination credentials, system grants, tracking switches and automatic-export opt-in do not.

Example MCP call to `create_phone_export_profile` (omit `deviceId` for a link only):

```json
{
  "deviceId": "<from list_connected_phones>",
  "profile": {
    "schema": "myself.md.profile.v1",
    "name": "Sleep and recovery",
    "selection": {
      "health": [
        "native:HKCategoryTypeIdentifierSleepAnalysis",
        "native:HKQuantityTypeIdentifierRestingHeartRate"
      ],
      "time": [],
      "location": []
    }
  }
}
```

Discover `catalog.domains[].availableTypes` first; `types` lists the union of readable types selected by approved profiles. Intersect these types with the selected profile’s own selections. Use Android's published identifiers on Android. Unavailable selections remain visible in the editor and grant no access. Every query must supply a `profileId` from `catalog.profiles` with `agentAccess: true`; unknown/unapproved IDs fail closed. Revoking profile approval, deleting the profile or disabling a type clears affected queued and retained responses on the next heartbeat; in-flight phone responses are discarded when local settings change.

The tool returns `deepLink` (`qrconnect://profile?payload=<percent-encoded JSON>`) and, when sent, a five-minute delivery ID. Open myself.md to receive queued profiles; delivery uses authenticated foreground polling, with no push wake-up. One generated profile is presented at a time. `get_phone_profile_delivery` reports the phone acknowledged receipt, not that the user saved it. Delivery is retried until acknowledged. Queues clear on expiry, server restart or disconnection.

Tapping a link handles cold and warm starts. If unpaired, the draft waits for pairing. The phone presents a review, lets the user edit every selection, and saves it with a fresh local ID and unique name. Saving a generated profile does not approve agent access or enable domain permissions. Users explicitly enable Allow agent access on its saved detail when ready. Profiles can also be pasted as JSON or links and shared through the system share sheet. Links contain the profile configuration in plain text and no health records. Profile payloads allow at most 300 explicit keys per domain, 80-character names, and 64,000-character links; the phone keeps up to 50 profiles.

Selected native records retain their full metadata and nested payloads. Data archive import is not supported. Profile JSON and deep links configure native data selections; they do not import records.

## MCP clients

Endpoint: `${PUBLIC_URL}/mcp` (see `.env`). Configure this URL as a remote Streamable HTTP MCP connector. The server publishes OAuth protected-resource metadata pointing to Keycloak OIDC discovery. Dynamic client registration supports approved callback hosts (`chatgpt.com`, `claude.ai`, `grok.com`, and localhost); add the exact callback host provided by your client if it differs. PKCE S256 and user consent are required for dynamically registered clients; registration is capped at 200 clients. A manually registered client with the client's exact callback URL is also supported.

Tools:

- `create_phone_pairing`: returns an actual PNG image, a browser viewing link, pairing ID, and expiry.
- `get_pairing_status`: tells the generating account whether the phone confirmed.
- `list_connected_phones`: shows your account's confirmed devices.
- `disconnect_phone`: removes a device from your account and cancels retained requests.
- `get_phone_data_catalog`: discovers readable types, grants, warnings, and online status.
- `list_phone_export_history`: lists saved export and access metadata for an owned phone, including failures and partial exports, with pages of 50.
- `diagnose_phone_export`: returns a saved export's outcome, error, warnings, current profile comparison, and deep links to the existing profile, activity details, and source permissions.
- `request_phone_profile_agent_access`: returns the owned profile’s phone link and requested approval/revocation step; reports awaiting_user until the phone catalog confirms the setting. Agents cannot approve themselves.
- `query_phone_data`: queues a read/export using any approved profile ID and a type enabled by both the profile and domain grant.
- `get_phone_request`: retrieves the queued, running, complete, or failed response.
- `create_phone_export_profile`: validates a generated profile, returns a deep link, and optionally queues delivery to an owned phone for review.
- `get_phone_profile_delivery`: reports queued/delivered status; delivery never means consent.
- `forget_phone_request`: immediately removes a response from server memory.

Ask the client to call `create_phone_pairing` and display its image. The returned browser link provides a fallback when a client does not render MCP image content. This does not depend on an MCP Apps widget.

Cloud clients such as ChatGPT, Claude, and Grok need **public HTTPS URLs for both MCP and Keycloak**. Local LAN HTTP is for development. Public client connections have not been verified in this local setup. Connector availability and image presentation depend on each client. See [ChatGPT connectors](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt), [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), and [Grok custom MCP](https://docs.x.ai/grok/connectors/custom-mcp-tunneling).

For hosting, set `PUBLIC_URL` and `OAUTH_ISSUER` to stable HTTPS origins; set `ALLOW_HTTP_DEV=0` and `EXPO_PUBLIC_ALLOW_HTTP=0`. Configure the Keycloak audience mapper to `${PUBLIC_URL}/mcp`, HTTPS hostname/proxy settings, and real accounts. Run Keycloak in production mode rather than `start-dev`. Set `DEV_HOST` to the server's intended listening interface. The phone's public OAuth client is `qr-phone`, with exact redirect `qrconnect://oauth`; no client secret belongs in the app. Configure native builds through `app.json`, then regenerate them with `npm run prebuild`.

## Phone data and live chat queries

After pairing, enable Health, Screen time, or Location in the app and select data types in an export profile. Those switches grant this MCP account access; OS permissions are requested separately and can restrict the actual returned data. New pairings start with all domains off. Chat OAuth clients cannot publish phone capabilities or grant themselves access. The app polls every two seconds **while in the foreground**. There is no push wake-up or unattended background health/usage querying in this prototype.

Ask your chat client: “Show my phone data sources, then compare my steps and screen time yesterday. Tell me what is missing.” The agent should list connected phones, discover the catalog, choose an exact published type, call `query_phone_data`, and poll `get_phone_request`. It must retain the source warnings. Example query after catalog discovery:

```json
{
  "deviceId": "<id from list_connected_phones>",
  "profileId": "<id of a catalog.profiles entry with agentAccess: true>",
  "domain": "health",
  "source": "native",
  "type": "HKQuantityTypeIdentifierStepCount",
  "start": "2026-10-01T00:00:00.000Z",
  "end": "2026-10-02T00:00:00.000Z",
  "limit": 50,
  "format": "json"
}
```

Use the published Android type `Steps` on Android; never assume identifiers or units are interchangeable. A complete request means that the phone answered, not that every possible record was accessible. Pages have `records`, `nextCursor`, `capture`, and `warnings`. Continue with the same query and its `nextCursor` until null. Split exports longer than 31 days into date windows. Use historical completed intervals for usage pagination, since system data can change between reads.

| Domain      | Platform sources and limits                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Health      | HealthKit on iOS and Health Connect on Android. The installed adapters read supported sample types with OS authorization. Clinical FHIR, attachments, audiograms, medications and vision prescriptions are not captured by the iOS adapter.                              |
| Screen time | Android daily application aggregates and opt-in foreground `sessions` reconstructed from Usage Access events; iOS hourly application and website aggregates through DeviceActivityData. iOS aggregates have no individual session boundaries.                            |
| Location    | Explicit one-point capture and optional background recording through Expo Location, stored locally in SQLite. Coordinates, accuracy, altitude, heading, speed and timestamps are preserved. Earlier phone history, visit inference and place enrichment are unavailable. |

The iOS usage bridge requires iOS 26.4+, the Family Controls and app-and-website-usage entitlements, eligible EU account/device conditions, and system passcode approval. Only one app/service can hold data access at a time. A normal Screen Time approval without data access is reported as limited. Entitlement configuration here does not mean Apple has approved distribution provisioning. See [Apple’s authorization requirements](https://developer.apple.com/documentation/familycontrols/authorizationstatus/approvedwithdataaccess) and [the usage entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.developer.family-controls.app-and-website-usage). HealthKit deliberately hides read denial: empty results may mean no records or denied access. Android Health Connect historical reads can be restricted to 30 days. Android’s build minimum is API 26; native Health Connect additionally requires a supported provider/device.

Data flows through the native platform adapters. JSON archive import, imported-type queries and imported selections in new profiles are not supported. Existing saved phone profiles retain their native selections when loaded; their old imported selections are removed. Historical activity snapshots retain their original selections for audit purposes. Previously imported local rows remain stored but are not exposed by the catalog, reads or exports. Previously saved files are not deleted. Local location queries use start-time membership in the UTC interval.

The viewed profile’s **Export profile now** action uses its selection and export settings. Its **Share health/screen time/location JSON** actions write a streaming JSON file with all pages for that domain’s readable selected types in the chosen recent date window. Data-source screens link to Profiles so the user chooses the configuration before exporting. The manifest lists warnings and per-type failures. Local export does not require enabling chat access. MCP supports only `format: json` or `jsonl`; native payloads retain their structure. Repeated overlapping exports can include duplicates: this simple prototype does not reconcile source UUIDs.

Export profiles pin `export.schema` (currently `myself.md.export.v1`) separately from JSON/JSONL. Mobile settings and the public dashboard preview show released versions, definitions, examples and change notes; MCP agents discover the same registry with `list_export_schemas` and propose a version using `create_phone_export_profile`. Missing legacy settings stay on v1 even after future releases. New profiles save the recommended version explicitly. Local filenames include `.v1` before the extension; cloud replacement identity includes schema, and history/listings/reads expose it. Stored downloads keep their original bytes. Unreleased schemas fail explicitly. Add future versions in `core/export-schemas.js` with a separate serializer and preservation fixtures; do not change a released contract or silently upgrade saved profiles.

iOS v1 capture enriches readable samples with precise UTC timestamps and `typedMetadata` before the JavaScript boundary. Original Foundation reference seconds (since 2001-01-01 UTC) remain authoritative alongside precise UTC strings. Typed signed/unsigned integers use decimal strings to avoid loss above JavaScript’s safe integer range; binary data uses base64. Original SDK metadata remains present. Unsupported metadata is marked incomplete. Workout activities retain configurations, events and statistics; route capture includes native identities, provenance and all available location fields. Available WorkoutKit plans retain their full base64 data representation. Detailed child failures retain operation, identifier and native error domain/code without error userInfo.

Six HealthKit characteristics are independently selectable current snapshots. They export `characteristicValue`, `captureKind: "current-snapshot"`, and precise `capturedAt`, with null start/end and no invented time series. A daily export describes their value at capture time, not their value on that historical day. Newly discovered types remain unselected in saved profiles. Review Health permissions to authorize characteristics and workout route reads; agents cannot grant this access. Clinical/FHIR, attachments, audiograms, medications, vision prescriptions, activity summaries and scored assessments remain outside this stage’s adapter coverage.

The default v1 export is source records with explicit `timeSeries`, following health-md's lossless capture approach without daily summaries. Each observation has a `timestamp` and `value`, with units/metadata when supplied. Original `native` fields, source identity and nested arrays remain present. No resampling, deduplication, derived daily statistics or unit conversion is applied. Android heart rate, cadence, speed, power, skin-temperature deltas and interval arrays retain every returned entry. ECG voltages and heartbeat events retain their exact relative offsets; ISO timestamps are a readable projection, and original offsets and native timestamps remain authoritative. Location and usage records also expose their original observations; system-provided usage aggregates cannot be expanded into unavailable events.

The local `HealthSeries` module reads HealthKit quantity-series children by parent UUID, checks their count and preserves their value/unit, full date interval, fractional epoch milliseconds and owning sample ID. It also retains HealthKit's original parent count, aggregation style and discrete/cumulative quantity properties. Correlated quantities are enriched without breaking the original correlation. Workout selection includes all readable quantity types actually associated with that workout, plus routes and the available workout-plan reference. `heartRate`, activity-relevant `speed`, `power`, `cadence`, form metrics and route `altitude` use health-md's series names; other associated metrics keep their native identifiers. Original associated samples are retained separately. Queries use native workout associations, never time-overlap inference. Android exercise and independent metric records remain separate because this adapter has no equivalent association query.

This is lossless for the selected records and child points exposed by these adapters, not a complete Apple Health archive: the unsupported HealthKit families listed above, denied/historical OS data and unavailable screen-time events cannot be recovered. Nested read errors retain parent records with `native.captureFailures` and mark file/history results partial; live MCP pages expose `complete: false`. Oversized MCP records fail explicitly rather than truncating; local files retain full records, and authorized cloud reads retain their explicit series. Install a rebuilt iOS app for the new native reader; older binaries produce a partial-capture diagnostic. Run `npm run verify:time-series` for capture/projection/serialization fixtures, `npm run verify:exports` for delivery/partial-file handling, and `npm run verify:cloud` for authenticated phone/MCP/cloud round-trips. Native compilation does not prove access to a real person's HealthKit data.

Android profiles can select `native:sessions` separately from `native:applications`. Session exports carry package identifier, start/end, duration, observed start, `startClipped`, `endReason`, and `foreground-session` granularity. One day of earlier events supplies context for sessions crossing the query start; unknown starts are omitted. Ends are clipped to observation time, and `query-boundary` means no closing event was observed. Screen-off and shutdown close active intervals; startup discards intervals with unknown endings. Public activity class names cannot distinguish multiple instances of the same class. Multi-window apps can overlap. Reads remain subject to OS retention and live pagination changes; missing sessions do not prove zero usage. No browser visits or iOS sessions are inferred. The dashboard explorer shows a timeline of session records on the current results page and opens each original record. Run `npm run verify:usage-sessions` for reconstruction, paging, access and export checks. An updated Android binary is required for native event reads.

Location recording is independent of sharing. Start it explicitly; stop it from the app. The CHAT ACCESS switch controls queries; the separate RECORDING switch reflects native background tracking. Turning chat access off keeps local recording running. Background collection depends on OS scheduling, permissions and battery policy; it is not guaranteed after force quit. Disconnecting in the app stops tracking. Disconnecting from MCP cancels chat access; local tracking must be stopped on the phone. Delete local data removes myself.md local points, leaving the system Health/Usage stores untouched. New local records are partitioned by the verified OAuth issuer and subject on each phone, so future re-pairings of the same account retain that history. Chat grants remain specific to the new pairing and start off. Earlier app sessions retain their original device partition without migrating or reassigning records; export those records before disconnecting the old session. Other accounts cannot query those local records.

Pairing metadata persists on the server, but personal query payloads do not. Jobs/results remain in memory for at most five minutes and are rejected after expiry; a ten-second sweep frees expired entries. Grant revocation and disconnect immediately remove matching retained requests. Restarting the server drops requests and requires a fresh phone heartbeat. Data already returned to a chat client remains subject to that client’s history/retention; server deletion cannot erase it there. Explicit cloud exports persist encrypted content and manifests separately from transient live queries; their cloud MCP grant, deletion and retention rules are documented below.

## Authentication and pairing

Authorization code with PKCE runs in the system browser. The API verifies the Keycloak signature/JWKS, issuer, audience, expiry, subject, and `qr-connect` scope. The mobile app stores access/refresh tokens in Expo SecureStore and refreshes expired access tokens. QR codes contain a random pairing ticket, never OAuth tokens or passwords. Tickets expire after five minutes, are stored hashed, and can be claimed once by the generating account. Confirmed devices persist in SQLite under the verified issuer and subject. A device disconnect removes the pairing record; it does not log that account out of Keycloak or revoke every session for that account.

Disconnect clears the phone’s saved session and stops scheduled exports before attempting native location shutdown and remote device revocation. The scanner remains available when the old server is offline, its token has expired, or a connection check is pending. Remote revocation times out after ten seconds; a cleanup failure is reported without restoring the old session. Local records and files remain in their original account partition. Stored-cloud sharing is a separate permission. Run `npm run verify:disconnect` for cleanup, delayed/concurrent refresh, rolling inactivity and upload-error regressions.

Phone sign-in requests `offline_access` and stores rotating refresh tokens securely. Foreground use renews the local login window; 30 days without foreground use clears the saved session on reopening. Background exports/API calls do not count as app use. Existing installs start this window on upgrade. The Cloudflare provider issues rolling 30-day refresh tokens; newly generated legacy Keycloak realms enable 30-day offline idle sessions without a fixed maximum. Existing Keycloak realms must apply the same offline policy and allow `offline_access` for `qr-phone`; already expired tokens require a new sign-in. Cloud uploads require initial profile approval, then renew automatically with the phone login’s inactivity deadline. Foreground activity and delivery renew the existing upload-only credential without changing MCP sharing; background delivery uses the saved foreground deadline and does not extend it. Expired approvals can resume after login without another profile approval unless explicitly rotated/revoked. Upload failures now display the server error, and only a 401 suggests reauthorization.

This connection establishes an account/device association. It does not implement remote phone control or push delivery. Static checks cannot prove OAuth interoperability, camera recognition, token refresh, or account isolation; verify those at the runtime boundary when changing them.

For agent-assisted export debugging, pair the phone with the same MCP account and keep myself.md open. Export history syncs immediately and every 30 seconds while the app is in the foreground, without opening Logs. Ask the agent to list connected phones, call `list_phone_export_history`, then call `diagnose_phone_export` with the selected `deviceId` and `eventId`. Saved metadata remains available when the phone is offline; the returned online status and configuration timestamp indicate whether the current profile evidence is fresh. History keeps its existing 90-day retention. A cable alone does not pair a phone or provide USB transport to this HTTP MCP server.

The diagnostic links use the installed `qrconnect` scheme and open the existing profile editor entry point, activity detail, or data-source permission screen. Review and save configuration changes on that phone, then retry from the profile. Links navigate; they do not change settings or grant OS permissions. `create_phone_export_profile` can deliver a proposed replacement for review. Current profile selections and unavailable types can explain what to check, but are not proof of an earlier failure; local exports do not require agent-access grants. Known destination errors (including HTTP status, cloud authorization and file-size limits) are retained in new failure history. Unknown native/network errors remain generic to avoid publishing credentials or private URLs. Older generic failure entries cannot recover details that were never saved.

App-wide UI/MCP parity is the development rule in `AGENTS.md`. The [parity contract and coverage inventory](docs/mcp-parity.md) tracks current operations, platform handoffs, and missing capabilities across the phone and dashboard. Existing MCP tools cover part of the app; full parity is the target.

## Structure and builds

- `App.js`: scanner, permissions, confirmation, connected status.
- `client/`: OAuth, data permissions, foreground request worker, health/usage adapters, local SQLite location records and exports.
- `modules/phone-usage/`: small Swift/Kotlin bridges required for OS usage APIs.
- `plugins/with-phone-data.cjs`: generated Android SDK minimum and Health Connect permission delegate.
- `core/`: pure QR parsing, data envelopes and export formatting shared by phone and server.
- `server/index.js`: HTTP API, OAuth token validation, MCP tools, PNG generation.
- `server/store.js`: SQLite pairing tickets and devices.
- `server/data.js`: owner/grant checks, transient live requests, and MCP data tools.
- `scripts/`: local OAuth setup/launcher, browser MCP client, static-check runner.
- `ios/`, `android/`: generated native projects.

```sh
npm run check
npm run bundle
npm run verify:native-sources
npm run ios -- --configuration Release
npm run android -- --variant release
```

Native builds require Xcode/CocoaPods or Android SDK/JDK. Store distribution requires your signing credentials. `bundle` validates Metro resolution, not native compilation. Metro includes the SQLite WebAssembly asset extension; web hosting still needs the isolation headers required by Expo SQLite. App and server source remain plain JavaScript with JSDoc. The OS usage bridge is necessarily Swift/Kotlin; native compilation validates it outside the fast JavaScript gate.

## Fast static checking

Run `npm run check` before finishing a change. It runs seven checks concurrently, prints each duration, and fails if any checker fails. No native build, emulator, API server, or test suite is required.

| Check            | What it catches                                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oxlint           | Correctness, suspicious code, performance mistakes, unused variables, equality, unsafe dynamic execution, React hooks/dependencies, import cycles/duplicates, promise mistakes, and platform boundaries. Warnings fail the check. |
| Prettier         | Inconsistent formatting in source, configs, Markdown, and CI files.                                                                                                                                                               |
| Mobile `checkJs` | Strict JavaScript types and React Native prop compatibility.                                                                                                                                                                      |
| Core `checkJs`   | Strict function contracts with ES globals only; browser/Node APIs fail.                                                                                                                                                           |
| Server `checkJs` | Strict Node server and checker-runner types.                                                                                                                                                                                      |
| Knip             | Unused files, exports, dependencies, and missing dependency declarations.                                                                                                                                                         |
| Native ESLint    | Expo-specific rules plus raw text outside `<Text>`, unused StyleSheet entries, and literal inline styles. Rules already run by Oxlint are disabled here.                                                                          |

```sh
npm run check         # All checks in parallel
npm run format        # Apply Prettier formatting
npm run lint:fix      # Apply safe Oxlint fixes; rerun check afterwards
npm run lint          # Oxlint only
npm run lint:expo     # Expo / React Native ESLint only
npm run typecheck     # All three JavaScript type checks
npm run unused        # Knip only
```

Sequential native pagination and page-size retries have narrow `no-await-in-loop` exceptions: each request needs the previous cursor or reduced page size.

The public YouTube iframe has a narrow `react/iframe-missing-sandbox` exception for combining `allow-scripts` and `allow-same-origin`: playback needs scripts and YouTube's own origin. The fixed cross-origin `youtube-nocookie.com` URL cannot access the host document; the remaining sandbox restrictions and CSP frame allowlist still apply.

Type checking uses `allowJs`, `checkJs`, strict null/implicit-any checks, unused locals/parameters, explicit return checks, unchecked-index checks, and exact optional properties. Application source stays JavaScript. JSDoc describes exported function boundaries. JSON from the network remains a runtime trust boundary: a type annotation cannot validate a remote response.

Prettier and ESLint cache unchanged files. The type checkers cache their graphs under `node_modules/.cache/`. These are local optimizations; a fresh CI run checks everything. Generated native projects, dependency code, and bundles are excluded. Prettier skips generated assets and the npm lockfile. Knip ignores the globally installed `fly` deployment CLI binary. Its dependency exception is: `@types/punycode` supplies the transitive declaration imported by `@types/node`, which Knip does not count as direct application usage.

The VS Code settings enable formatting on save and use the project's TypeScript checker. Recommended extensions expose Oxlint, Prettier, and the remaining ESLint diagnostics. GitHub Actions runs `npm ci` and `npm run check` on pushes and pull requests. After checks pass on a push to `main`, it deploys the website and dashboard to the existing Fly service using `deploy/fly/service.toml`. Deployments run one at a time and use the repository's `FLY_API_TOKEN` Actions secret, scoped to `qr-connect-cloud-cody`. The token expires after one year; renew it before expiry with an app-scoped Fly deploy token. `AGENTS.md` tells agents to use this gate and reserve runtime checks for behavior outside its coverage.

Static analysis establishes the properties encoded in these configurations. It cannot establish the intended business result, server availability, UI appearance, native compilation, or performance on a device.

Tool references: [Oxlint configuration](https://oxc.rs/docs/guide/usage/linter/config), [Prettier CLI](https://prettier.io/docs/cli), [JavaScript type checking](https://www.typescriptlang.org/tsconfig/checkJs.html), [Knip configuration](https://knip.dev/reference/configuration), and [React Native lint rules](https://github.com/Intellicode/eslint-plugin-react-native).

### Background location recording

Use the RECORDING switch above CHAT ACCESS in the Location card; it starts immediately without an app confirmation. myself.md requests foreground and Always/background permission when needed; if iOS denies the upgrade (including Allow Once), use Location permissions, choose Location → Always, enable Precise Location, and return. The pending start resumes after permission is granted. The card shows permission, locally saved point count, and the last point time even while the server is unreachable.

Continuous recording uses high accuracy, a 5 m distance filter, no automatic iOS pausing, and an Android foreground service (10 s requested interval). Points are stored in account-owned local SQLite by the background task. These settings follow iso.me’s continuous location mode; visits, reverse geocoding, and Live Activities are not implemented. Background recording consumes battery. OS scheduling controls delivery; force-quitting stops Expo tracking until reopening the app. Chat queries still require the phone app in the foreground.

### Terminal UI

The mobile interface uses white backgrounds, black text, square borders, and the bundled JetBrains Mono font (SIL Open Font License in assets/fonts/JetBrainsMono-OFL.txt). Commands retain 44-point touch targets and screen-reader labels; the bracket switches expose switch/checked semantics. File export and deletion controls are under the expandable file tools. System permission and OAuth pages keep their native presentation. The terminal appearance comes from readable monospace type and prompt marks.

## Profile files and automatic exports

Each profile carries `export` settings (`formats`: JSON/JSONL or both, `lookbackDays`: 1–30, `includeToday`, `folderName`, `filenameTemplate`, `formatFolders`) and `schedule` settings (`frequency`: daily/weekly/custom, `interval`: 1–365, `unit`: day/week/month, `anchorDate`: null or YYYY-MM-DD, `hour`, `minute`, ISO `weekday`: 1–7, `todayRefresh`, `refreshHours`: 3/6/12). These optional objects receive defaults when absent. The profile editor exposes formats, date windows, folders, filenames and cadence through individual controls. AI-generated links and queued proposals carry the same settings. Saving a draft never opts in to automatic exports.

**Export profile now** writes one file per local calendar day in the app's Documents folder, partitioned by pairing and profile ID. Choose a safe folder name and filename template containing `{date}` or all of `{year}`, `{month}`, `{day}`. JSON contains records and capture/warning metadata; JSONL contains one complete record per line with a separate `.jsonl.manifest.json`. Each run replaces matching daily files after reading the available selected sources. An unavailable source or a source read error no longer aborts the other sources: records already read are retained, and JSON metadata and the JSONL companion manifest include `status: "partial"` plus `failures` with the domain, type, source, error, and retained record count. Manual and scheduled export messages flag partial results. A partial scheduled day advances after delivery is acknowledged; retry it manually after permissions are repaired to replace that day. If every selected source fails before returning records, the run fails and preserves the previous daily files. Cancellation, file write errors, and delivery failures still stop the export. Empty HealthKit results do not imply read authorization. Share saved files from the profile card or browse myself.md in Files. The older domain export buttons remain one-off JSON shares.

Enable **Automatic exports** separately on each saved profile. Cadences use device-local calendar boundaries and clamp monthly dates from the original anchor (Jan 31 → Feb 28 → Mar 31). Runs cover the full trailing completed-day window relative to their scheduled occurrence, even when delayed; Today Refresh independently rewrites the current day. Opt-in excludes prior occurrences. SQLite freezes profile settings and UTC intervals for residual retries, checkpoints each day, and retries failed days after five minutes. Disabling, deleting or editing a profile cancels pending output; edits to an enabled schedule start a fresh opt-in boundary. File publication is per-format, not a cross-file transaction; an interrupted publication is rebuilt before completion advances.

Expo BackgroundTask uses one coalesced, best-effort OS worker; minimum wake interval is 15 minutes, and foreground catch-up also checks every 30 seconds. iOS force quit stops background wakes until reopening. No exact-time delivery is promised. Files stay local; the worker does not upload them or change chat permissions. A non-secret SQLite export context identifies the current local data partition; background work does not read OAuth tokens from the locked Keychain. OS data protection may still defer native health reads or file access until unlock. Re-pairing starts with scheduling off; disconnect leaves saved files in Documents and prevents further runs without a current session. See [source research](docs/profile-export-port.md) for source behavior and scope differences.

Run `npm run verify:exports` for calendar, opt-in, DST and JSON/JSONL business rules. After `npm run prebuild`, `npm run build:android` compiles without installing (`ANDROID_HOME` must point to the SDK); `npm run build:ios -- DEVELOPMENT_TEAM=<team>` compiles a signed generic iOS Release app.

## Hosted cloud exports

The hosted API, MCP and dashboard now run on Cloudflare, with private R2 files and account-scoped Durable Objects. Existing sign-in remains on Fly during the identity transition. See [deployment and recovery](docs/cloudflare-migration.md). Run `npm run verify:worker` before `npm run worker:deploy`.

Profiles can now export to local files, an HTTPS endpoint or the paired cloud service. Cloud uploads are encrypted and persist independently of the phone. A separate cloud MCP switch controls stored-data access. See [cloud-service setup, API, limits and connector guide](docs/cloud-service.md). Run `npm run verify:cloud` for storage and HTTP/MCP isolation checks, and `npm run verify:r2` for the private R2 backend, resumable migration and rollback; `npm run cloud:setup -- <domain>` and `npm run cloud:start` prepare and start the container deployment.

The redesigned Expo Router routes and UI in `src/` remain plain JavaScript and are included in all source checks. Native text lint recognizes `Copy`, the shared wrapper that renders React Native `Text`, and `NativeTabs.Trigger.Label`, which accepts a string to configure a native tab item. The entry file has one documented side-effect import for Expo Router registration. Router peer dependencies (`expo-constants`, `expo-linking`, `react-native-screens`, `react-native-reanimated`, `react-native-worklets`) are required by the navigator even where application source does not import them directly.

Profiles, Logs, and Settings are peer tabs with independent native stacks. Expo Router's native tab bar uses system Liquid Glass on iOS 26 and the platform tab appearance on earlier iOS versions and Android. Profiles opens by default; `/manage` redirects to Profiles for existing links. Profile-specific history stays in the Profiles stack without changing the global Logs filter. Connections and data-source controls are available from Settings.

History is available from Connections and each profile. It groups manual and scheduled exports with live phone queries and cloud export reads. Details preserve the profile name and selection at the time, requested interval, destination hostname, authenticated MCP client ID, confirmed record counts, files and outcome. Entries begin with this version; previous activity is not reconstructed. System sharing records that the share sheet opened, since the recipient and delivery cannot be confirmed.

Local metadata lives in the account/device partition of `phone-data.sqlite`. Server activity metadata is encrypted in `history.sqlite` using the cloud key, retained for 90 days independently of cloud files (30 days), and returned only to the owning phone or dashboard client. Cached server entries remain available offline on that phone. History excludes raw records, OAuth/upload tokens and endpoint paths/query strings. Live access becomes complete when the agent retrieves the response; disconnect/revocation deletes ephemeral responses without rewriting completed audit events. Restarted unfinished manual exports and server reads become interrupted. Scheduled exports retain their checkpoint and reuse one history entry when retried.

Local file actions verify the original checksum before opening the system share sheet, so overwritten or removed files report unavailable. Updating the phone and server together enables remote agent history; older servers leave the phone's saved export history available with a refresh notice. Run `npm run verify:history`, `npm run verify:exports` and `npm run verify:cloud` for metadata retention/isolation, confirmed artifact outcomes and authenticated HTTP/MCP activity checks.

## Cloud dashboard

Dashboard visual guidance and saved Vercel design documents live in [docs/design](docs/design/README.md).

The public root `/` opens the All datasets page with configurable example exports. The interactive demo dashboard lives at `/demo`, with 30 days of fictional health, screen time, and location data. Visitors can explore charts, filters, raw records, history, profile sharing, agent blocking, and export deletion using the real dashboard controls. Demo requests run entirely in browser memory, never reach authenticated APIs, and reset on page reload. Saved explorer views use a separate demo account key. **Join myself.md** and **Log in** lead to `/login`; provider sign-in continues to `/dashboard` using the existing `/dashboard/callback` OAuth redirect. Existing dashboard deep links remain supported. Run `npm run verify:demo` for sample data, query behavior, local mutations, history links, and transport isolation.

The dataset tabs open public documentation at `/datasets/health`, `/datasets/screen-time`, and `/datasets/location`. The first and default tab, All (`/datasets` or `/datasets/all`), configures all three domains in one example export. Each page describes source availability, app controls, profile selection keys, record envelopes, and export formats. Searchable example toggles update a daily JSON export preview with selected fictional records and capture metadata, using the same serializer and allowlist as real exports. Every selectable dataset type has a fictional source payload; `npm run verify:demo` verifies complete catalog coverage and selection isolation. No account settings are changed. Health catalogs reuse the phone adapter’s installed type lists.

Open `https://myself.md/login` with the same cloud account as the phone to browse stored exports and records, delete cloud files, toggle profile sharing, and block or allow MCP agents. See [dashboard authentication, permissions and setup](docs/cloud-service.md#account-dashboard). The dashboard offers Apple and GitHub sign-in only. `npm run verify:dashboard` builds it and verifies provider redirects, PKCE, and callback validation. The browser JavaScript has its own strict DOM type check in the aggregate static gate.

The cloud dashboard uses the [shadcn `dashboard-01` block](https://ui.shadcn.com/blocks#dashboard-01), generated with `npx shadcn@latest add dashboard-01` and adapted to JavaScript with JSDoc. Its sidebar, cards, table and UI primitives live in `dashboard/`. `npm run dashboard:build` bundles React with esbuild and compiles Tailwind into ignored `dashboard/dist/`; run this before starting the server locally. Docker builds these files in a separate build stage. `npm run verify:cloud` builds the dashboard before its integration checks. Browser code and CSS are included in the aggregate checks; generated bundles are excluded. React Native text/style lint rules apply to the native source, while the web dashboard retains the other lint and type checks. The web UI uses scoped CSS variables and dynamic positioning styles: CSP allows style attributes, with a per-response nonce for Radix’s injected scroll-lock styles; inline scripts remain prohibited.

The dashboard's **Explore data** page queries across stored exports with typed conditions, structured columns, linked charts and source provenance. Query URLs restore the selected filters, columns and chart after sign-in. Named views are saved per account in the current browser. Run `npm run verify:explorer` for query and aggregation behavior; `docs/cloud-service.md` describes coverage, overlap handling, units and query bounds.

The dashboard’s **History** page shares outcome labels and related-activity matching with the phone through `core/history-display.js`. It groups entries by day, filters exports and agent access by profile, loads older activity, and preserves detail links after sign-in. Details include profile snapshots, interval/timezone, counts, files, warnings, errors and related activity. Available cloud files link to the explorer; local files can be shared from the phone. Refreshing History in the phone app publishes the last 90 days of export metadata in bounded batches, excluding local file paths; the dashboard refreshes every 30 seconds. Export history remains local until that sync succeeds. Account isolation applies across all devices, including retained history from disconnected phones.

## Lifetime unlock

The free iOS and Android apps include five exports/agent queries across manual, scheduled, and cloud activity. Native StoreKit or Google Play Billing offers a $19.99 US non-consumable lifetime unlock, with reminder paywalls after uses two and five. Store product creation, verification credentials, counting rules, offline limits, and sandbox testing are documented in [Lifetime unlock](docs/lifetime-unlock.md). Run `npm run verify:billing` to verify the quota and purchase-ownership business rules.

Existing customers can claim complimentary lifetime access from health.md or iso.me, with manual grants for verified time.md buyers. See [customer migration](docs/customer-migration.md) for eligibility, deployment configuration, and the operator grant command.

Worker source is checked by the aggregate static gate with Wrangler-generated runtime and binding types. ESLint treats `cloudflare:workers` and `cloudflare:node` as platform modules; these imports are resolved by Wrangler. Generated `worker/worker-configuration.d.ts` is excluded from source lint because Wrangler includes its own lint directives. Regenerate it with `npm run worker:types` after configuration changes.

The hosted identity service uses Better Auth and D1; self-hosted Node deployments retain Keycloak. See [Cloudflare identity migration](docs/cloudflare-migration.md#identity-cutover-and-fly-retirement). `npm run verify:identity` tests the actual Workers/D1 OAuth boundary. Run `npx playwright install chromium` once, then `npm run verify:identity -- --browser` to exercise the consent buttons in Chromium, including cancellation, the external callback, token exchange/MCP access and social-provider navigation. The browser fixture receives callbacks on a separate local HTTP origin and intercepts social-provider navigation; it never signs in to a real provider. The narrow OAuth plugin type assertion in server/identity.js adapts Better Auth OAuth Provider 1.7.7 endpoint metadata to the core plugin interface under exactOptionalPropertyTypes; its optional OpenAPI schema fields currently include explicit undefined. Runtime OAuth integration is verified independently; checker scope and strictness are unchanged.

## Account deletion

Settings → Your myself.md account → Delete account and the dashboard account menu both lead to permanent deletion. The public `/delete-account` page supports deletion after uninstalling the app; publish `https://myself.md/delete-account` in Google Play Console's account-deletion URL field after deploying this change. Sign in, review the effects, and confirm. Both first-party interfaces use `DELETE /api/account` with the authenticated subject and explicit confirmation. Agents inspect `get_account_deletion`, obtain explicit user confirmation, and call `delete_account` with the exact subject and `DELETE` confirmation. `request_account_deletion` offers an optional browser confirmation handoff. A seven-day status receipt remains usable after identity/session removal.

Hosted deletion requires the Cloudflare identity provider (`IDENTITY_ENABLED=1`). The Node forwarding deployment uses the same hosted path via `WORKER_ORIGIN`; standalone legacy Keycloak deployments report deletion unavailable until they migrate. Mobile account-deletion screens require an updated native app.

Deletion immediately denies further account actions, drains already admitted uploads/purchase verification before erasing their records, and revokes phones, upload grants and queued/retained native requests. It revokes stored Sign in with Apple tokens, deletes the identity with cascading sessions/OAuth tokens/consents, and removes exports, sharing, agent metadata, history, account billing and directory records. R2 deletion must succeed before reporting completion. Interrupted PUT candidates keep the existing one-hour safety window; alarms retry pending cleanup and provider/storage failures. The receipt's routing record expires seven days after cleanup and the account retains only its minimal deletion tombstone in the hashed account partition to reject old JWTs. Purchase objects retain store/source identifiers without the account association or receipt proof to prevent reuse of already claimed purchases. Account-linked access is lost; deletion does not cancel subscriptions or issue refunds.

On the initiating phone, deletion cancels and drains exports, stops location recording, removes current-partition profiles, grants, records, schedules, history, app-managed export files and destination credentials, clears the purchase proof, and signs out. System health/screen-time data, external destinations, copies held by agents and disconnected/other phones are user-controlled copies; cloud deletion cannot erase them. Local cleanup failures remain visible and retain a minimal pending cleanup record; the next app launch retries cleanup even after account tokens expire. Physical-device confirmation, native file-system behavior and live Apple revocation require release verification.

`npm run verify:account-deletion` combines the real workerd identity/HTTP/MCP/R2 fixture with local SQLite/file-boundary and Apple-revocation transport fixtures. It creates only synthetic accounts. Run `npm run format` then `npm run check` for the aggregate static gate.

## Argent navigation and regression QA

Use `npm run start:qa` for opt-in synthetic phone fixtures, then connect a development iOS or Android build to Metro port 8082. Normal development and release bundles cannot activate this mode. `npm run verify:qa` checks the release gate, reset validation, persistence, separate storage and startup recovery. [The phone QA guide](docs/argent-qa.md) describes selectors, fixtures, MCP diagnostics, replay commands and integration limits. The recorded `.argent/flows/qa-*.yaml` regression flows are tracked; local recordings and scratch takes remain ignored.

`npm install` applies the one-line Android header guard in `patches/react-native-screens+4.26.2.patch` using `patch-package --error-on-fail`. It backports [react-native-screens #4498](https://github.com/software-mansion/react-native-screens/pull/4498), fixing a detached-screen header crash reproduced by the create-profile QA flow. The dependency remains pinned to Expo 57-compatible 4.26.2. This is a narrowly scoped upstream dependency patch, not generated app source. Rebuild Android after installing it; a JS reload or OTA update cannot apply the fix. Remove the patch and review the pin when Expo supports a release containing the fix. iOS native code is unaffected.

The server Dockerfile intentionally uses `npm ci --ignore-scripts` and does not compile mobile code. Native developers who skip install scripts must run `npm run postinstall` before building Android.

The Logs tab combines internal app events, exports and agent activity with category and issue filtering and entry details. Timeline/Raw switches to selectable JSON: local writes appear immediately, and connected agent history is polled every two seconds while Raw is open. MCP supports `list_phone_logs` with `format: "jsonl"` for the same raw projection. Share & agent access opens debug report sharing; Settings also links there. `list_phone_logs` exposes the same categories and structured entries over MCP with a history cursor and explicit diagnostics availability. Operation/outcome events, raw error messages, API timings and HTTP status persist on the phone (300 events, seven days); consecutive repeats are suppressed for one minute. Users can review/copy/share the JSON report, and separately approve connected-agent reads via `get_phone_debug_logs`. The phone must be open and recently connected. Raw error messages are always retained (up to 16,000 characters). Records, request credentials and URLs have separate off-by-default owner controls; enabling captures future fields, disabling purges retained fields. Errors can themselves contain sensitive text. Agent reads of attached records still require current domain/type grants and profile approval. `request_phone_debug_content` exposes the trusted phone control handoff. Reports are size bounded; native crashes are outside this logger's scope. Run `npm run verify:debug-logs` for persistence, retention, consent and MCP authorization coverage. See `docs/mcp-parity.md` for sharing/revocation boundaries.

The remote-release fingerprint configuration normalizes masked-view’s Gradle-generated removal of its legacy manifest package attribute and excludes Health Connect android-expo/build output. Other native source remains fingerprinted; fingerprint.config.cjs is covered by strict checks. See [remote mobile updates](docs/mobile-updates.md).

The aggregate static gate also checks the extracted chat package’s native and web entry points with strict checkJs, Oxlint, Expo/native lint and Knip. Web markup is excluded only from native text/style lint, matching the dashboard boundary. The package has no imports into the host app.

In Logs, use Select logs to choose one or more events, or Select all loaded, then Copy to copy JSON lines for sharing. Copies resolve currently visible logs and current content settings; hidden or expired selections are omitted. At most 350 logs can be selected per copy. Expo Clipboard adds a native module, so existing preview binaries require a new build to use copying.

The support package's `web.js` and `support-web.js` render DOM elements and are excluded from React Native text/style rules; their web type check and normal lint rules still apply. The support response reader uses sequential stream reads to enforce its byte limit.

### Isobot support v1

Phone Settings → Contact support and dashboard Support use the versioned Isobot inbox. Configure server-only `SUPPORT_ISOBOT_ORIGIN` and `SUPPORT_ISOBOT_TOKEN`; no bridge credential is included in the client. The old support endpoint remains compatible. See [deployment and behavior](packages/support-chat/IMPLEMENTATION.md), [MCP coverage](docs/mcp-parity.md), and run `node scripts/verify-support-v1.js` for the new consent and MCP fixture. Notifications require the new native binary and configured EAS/APNs/FCM credentials.

Handled error displays on mobile and the dashboard show pretty-printed JSON rather than replacing caught errors with generic explanations. Available name, message, code, domain, HTTP status, stack and causes are retained. Server error payloads are projected to diagnostic fields; request headers and credential fields are excluded. Common authorization values in text are redacted. Oversized error details include `truncated: true` and remain valid JSON. Existing saved log text is formatted at display time without changing log storage or sharing consent. Native Gripe alerts follow the same JSON convention. Run `npm run verify:error-json` to check JavaScript and native serialization without a live report; the native fixture requires this Mac's Xcode Swift toolchain.

### Public agent discovery

Public HTML includes readable fallback content before the dashboard JavaScript mounts. Node and Worker handlers share Markdown content negotiation, `/llms.txt`, `/llms-full.txt`, `/robots.txt`, `/sitemap.xml`, and `/docs`, `/about`, `/contact` pages. The root OAuth metadata URLs redirect to the configured issuer; private MCP/API authentication is unchanged. Public unknown paths return a Markdown 404. The sandbox is fictional and free to browse; these pages do not promise private access or a new entitlement.

`npx --yes is-agentic myself.md` reads the latest archived audit; it does not refresh an existing report. After publishing changes, request a fresh scan from the audit service before comparing scores. Search rankings, crawler filtering at the Cloudflare edge, and verified business-address information cannot be fixed by adding unsupported claims to page metadata.

### Agent CLI and public API compatibility

`npm run myself -- help` describes the source CLI. Public `health`, `config`, `docs` and `openapi` commands need no credentials. `tools` and `call TOOL < arguments.json` use an existing owner-authorized `MYSELF_TOKEN`; `MYSELF_URL` selects an HTTPS origin (localhost HTTP is supported for development). Tokens are never persisted. The CLI exits nonzero on HTTP/MCP errors and returns structured results; queued phone requests still require result polling. The dashboard build also bundles a standalone Node.js 22+ CLI at `/cli/myself.mjs`, with the actual bundled dependency licenses at `/cli/notices.txt`. Download it and run `node myself.mjs help`; no repository installation is required. No npm registry package is published yet.

The public OpenAPI reads support `/v1` aliases. Existing paths remain v1 compatibility aliases; additive fields are compatible and breaking changes require a new major version. Deprecation is announced in `/docs` at least 90 days before removal with `Deprecation` and `Sunset` headers. No current endpoint is deprecated. The six public reads share 120 requests/minute per source IP per process/Worker isolate, with a bounded 10,000-bucket in-memory limiter and live `RateLimit-*`/`Retry-After` headers. Restarts and isolate eviction reset counters; this is local best-effort protection, not global accounting. Private authorization and limits are unchanged. Sitemap `lastmod` tracks the public content revision; update it when those pages change.

The public agent API includes the paginated adapter catalog at `/v1/dataset-catalog`, with the same definitions as the dataset explorer. Supporting browsers expose public documentation and catalog reads through WebMCP. The JavaScript SDK is served at `/sdk/myself.mjs`; its authenticated query methods use the REST adapter backed by the existing MCP tools. POST `/api/v1/queries` requires agent OAuth and an `Idempotency-Key`; poll its Location URL to verify completion. `/openapi.json` documents these contracts.

After `npm run dashboard:build`, run `node scripts/prepare-agent-releases.js` to create standalone CLI and dependency-free SDK tarballs in `.local/releases`. Packing does not publish them. Registry publication needs an authenticated npm account; do not claim a package is published until npm confirms it.

Official npm packages: `myself-md-sdk` for the JavaScript SDK and `myself-md-cli` for the CLI. Run `npx myself-md-cli health` for a public check; private tool calls require an existing owner-authorized OAuth token in `MYSELF_TOKEN`. Package installation does not initiate OAuth or change grants.
