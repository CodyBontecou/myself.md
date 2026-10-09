# myself.md

The app name and primary domain are **myself.md**. The domain is registered through 14 August 2027 and uses Cloudflare nameservers (`bill.ns.cloudflare.com`, `naya.ns.cloudflare.com`), verified in the registrar account on 9 October 2026. The app is live at [myself.md](https://myself.md), with DNS, TLS and OAuth cutover completed on 9 October 2026. Authentication, including sign-out, uses myself.md. The existing Fly origin remains available for older service links; see the [deployment configuration](docs/cloud-service.md#myselfmd-domain-cutover).

Branding uses a lowercase `myself.md` wordmark and an `m.` app mark on the existing warm neutral palette. Native icons are configured in `app.json`; run `npm run prebuild` after changing them. The generated iOS project and build scheme are `myselfmd`.

Compatibility identifiers remain stable: `qrconnect://` links, `qr-connect` OAuth realm/scope, profile/export schemas, storage keys, native package identifiers, and Fly app names. Renaming these independently would break installed apps, saved data, or existing authentication.

Plain JavaScript Expo/React Native app for iOS and Android, dependency-free shared QR and data protocols in `core/`, and an OAuth-protected Streamable HTTP MCP server.

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

Profiles follow health-md's named configurations and active-profile editing model: create, rename, duplicate with a fresh ID, activate, and delete (except the final profile). Each profile stores its own explicit selection of native and imported data types across health, screen time and location. These are data-type controls; selecting a type includes its native metadata, not field-level redaction. Search the editor to find individual metrics. New profiles start empty; newly discovered types stay disabled. The initial Default profile snapshots the readable types in domains already enabled before migration. Existing domain grants and OS authorization remain separate. Local file export uses the profile selection without requiring chat grants.

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

Discover `catalog.domains[].availableTypes` first; `types` lists only the active profile's selected readable types. Use Android's published identifiers on Android. Unavailable selections remain visible in the editor and grant no access. Every query must supply `catalog.activeProfileId`; unknown/inactive IDs fail closed. Switching profiles or disabling a type clears affected queued and retained responses on the next heartbeat; in-flight phone responses are discarded when local settings change.

The tool returns `deepLink` (`qrconnect://profile?payload=<percent-encoded JSON>`) and, when sent, a five-minute delivery ID. Open myself.md to receive queued profiles; delivery uses authenticated foreground polling, with no push wake-up. One generated profile is presented at a time. `get_phone_profile_delivery` reports the phone acknowledged receipt, not that the user saved it. Delivery is retried until acknowledged. Queues clear on expiry, server restart or disconnection.

Tapping a link handles cold and warm starts. If unpaired, the draft waits for pairing. The phone presents a review, lets the user edit every selection, and saves it with a fresh local ID and unique name. Saving a generated profile does not activate it or enable domain permissions. Users explicitly activate it when ready. Profiles can also be pasted as JSON or links and shared through the system share sheet. Links contain the profile configuration in plain text and no health records. Profile payloads allow at most 300 explicit keys per domain, 80-character names, and 64,000-character links; the phone keeps up to 50 profiles.

**Original archives are a separate broad selection.** `imported:archive` exposes the complete original file, including indexed types disabled elsewhere. Leave it off for selective sharing; the editor warns on the archive row. Selected native records similarly retain their full metadata and nested payloads.

## MCP clients

Endpoint: `${PUBLIC_URL}/mcp` (see `.env`). Configure this URL as a remote Streamable HTTP MCP connector. The server publishes OAuth protected-resource metadata pointing to Keycloak OIDC discovery. Dynamic client registration supports approved callback hosts (`chatgpt.com`, `claude.ai`, `grok.com`, and localhost); add the exact callback host provided by your client if it differs. PKCE S256 and user consent are required for dynamically registered clients; registration is capped at 200 clients. A manually registered client with the client's exact callback URL is also supported.

Tools:

- `create_phone_pairing`: returns an actual PNG image, a browser viewing link, pairing ID, and expiry.
- `get_pairing_status`: tells the generating account whether the phone confirmed.
- `list_connected_phones`: shows your account's confirmed devices.
- `disconnect_phone`: removes a device from your account and cancels retained requests.
- `get_phone_data_catalog`: discovers readable types, grants, warnings, and online status.
- `query_phone_data`: queues a read/export using the active profile ID and a type enabled by both the profile and domain grant.
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
  "profileId": "<catalog.activeProfileId>",
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

| Domain      | Native capture                                                                                                                                                                                                                                            | Original-app imports and limits                                                                                                                                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health      | Runtime-supported HealthKit quantity/category types, workouts with statistics/routes, correlations, ECG voltage data, heartbeat series and state of mind. Android reads the 40 record types supported by Health Connect 4.1 when permissions are granted. | JSON from health.md, including indexed v8 `healthkit_record_archive.records` and `external_records`. Clinical FHIR, attachments, audiograms, medications, vision prescriptions, and some specialized sample details require the original archive; this is not yet full native parity with health.md. |
| Screen time | Android daily foreground usage aggregates through Usage Access. iOS hourly application and website aggregates through `DeviceActivityData`.                                                                                                               | time.md JSON indexes rawScreenTime, applications, websites, daily trends and hourly activity. Aggregates are not sessions; undated aggregates remain accessible in the original archive. Native Android browser history is unavailable through Usage Access.                                         |
| Location    | One-point capture plus optional background recording to local SQLite. Points retain native coordinates, accuracy, altitude, heading, speed and timestamps.                                                                                                | iso.me JSON indexes points, visits and outings. myself.md cannot reconstruct location history from before recording started. It does not yet implement iso.me visit inference or place enrichment.                                                                                                   |

The iOS usage bridge requires iOS 26.4+, the Family Controls and app-and-website-usage entitlements, eligible EU account/device conditions, and system passcode approval. Only one app/service can hold data access at a time. A normal Screen Time approval without data access is reported as limited. Entitlement configuration here does not mean Apple has approved distribution provisioning. See [Apple’s authorization requirements](https://developer.apple.com/documentation/familycontrols/authorizationstatus/approvedwithdataaccess) and [the usage entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.developer.family-controls.app-and-website-usage). HealthKit deliberately hides read denial: empty results may mean no records or denied access. Android Health Connect historical reads can be restricted to 30 days; older exports currently use imported archives. Android’s build minimum is API 26; native Health Connect additionally requires a supported provider/device.

Import original JSON files up to 30 MB through the system file picker. Exact original text is retained as ordered 4 KiB chunks under type `archive`, including fields the app does not index. Query `source: imported, type: archive` and join each `archiveId`’s `text` chunks by `index` to reconstruct the original. This archive query intentionally ignores event dates. Indexed records use start-time membership in the UTC interval; native payload fields retain the original precision, units, source, metadata and relationships. Imports do not imply complete capture, native access, or verified provenance.

The phone’s **Export data** buttons write a streaming JSON file with all pages for each readable type selected by the active profile in the recent date window. Original imported archives are included only when `imported:archive` is explicitly selected. The manifest lists warnings and per-type failures. Local export does not require enabling chat access. MCP supports only `format: json` or `jsonl`; native payloads retain their structure. Repeated overlapping imports/exports can include duplicates: this simple prototype does not reconcile source UUIDs.

Location recording is independent of sharing. Start it explicitly; stop it from the app. The CHAT ACCESS switch controls queries; the separate RECORDING switch reflects native background tracking. Turning chat access off keeps local recording running. Background collection depends on OS scheduling, permissions and battery policy; it is not guaranteed after force quit. Disconnecting in the app stops tracking. Disconnecting from MCP cancels chat access; local tracking must be stopped on the phone. Delete local data removes myself.md imports and points, leaving the system Health/Usage stores untouched. New local records are partitioned by the verified OAuth issuer and subject on each phone, so future re-pairings of the same account retain that history. Chat grants remain specific to the new pairing and start off. Earlier app sessions retain their original device partition without migrating or reassigning records; export those records before disconnecting the old session. Other accounts cannot query those local records.

Pairing metadata persists on the server, but personal query payloads do not. Jobs/results remain in memory for at most five minutes and are rejected after expiry; a ten-second sweep frees expired entries. Grant revocation and disconnect immediately remove matching retained requests. Restarting the server drops requests and requires a fresh phone heartbeat. Data already returned to a chat client remains subject to that client’s history/retention; server deletion cannot erase it there. Explicit cloud exports persist encrypted content and manifests separately from transient live queries; their cloud MCP grant, deletion and retention rules are documented below.

## Authentication and pairing

Authorization code with PKCE runs in the system browser. The API verifies the Keycloak signature/JWKS, issuer, audience, expiry, subject, and `qr-connect` scope. The mobile app stores access/refresh tokens in Expo SecureStore and refreshes expired access tokens. QR codes contain a random pairing ticket, never OAuth tokens or passwords. Tickets expire after five minutes, are stored hashed, and can be claimed once by the generating account. Confirmed devices persist in SQLite under the verified issuer and subject. A device disconnect removes the pairing record; it does not log that account out of Keycloak or revoke every session for that account.

Disconnect clears the phone’s saved session and stops scheduled exports before attempting native location shutdown and remote device revocation. The scanner remains available when the old server is offline, its token has expired, or a connection check is pending. Remote revocation times out after ten seconds; a cleanup failure is reported without restoring the old session. Local records and files remain in their original account partition. Stored-cloud sharing is a separate permission. Run `npm run verify:disconnect` for the failure and delayed-refresh regressions.

This connection establishes an account/device association. It does not implement remote phone control or push delivery. Static checks cannot prove OAuth interoperability, camera recognition, token refresh, or account isolation; verify those at the runtime boundary when changing them.

## Structure and builds

- `App.js`: scanner, permissions, confirmation, connected status.
- `client/`: OAuth, data permissions, foreground request worker, health/usage adapters, local SQLite imports and exports.
- `modules/phone-usage/`: small Swift/Kotlin bridges required for OS usage APIs.
- `plugins/with-phone-data.cjs`: generated Android SDK minimum and Health Connect permission delegate.
- `core/`: pure QR parsing, data envelopes, import indexing, and export formatting shared by phone and server.
- `server/index.js`: HTTP API, OAuth token validation, MCP tools, PNG generation.
- `server/store.js`: SQLite pairing tickets and devices.
- `server/data.js`: owner/grant checks, transient live requests, and MCP data tools.
- `scripts/`: local OAuth setup/launcher, browser MCP client, static-check runner.
- `ios/`, `android/`: generated native projects.

```sh
npm run check
npm run bundle
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

Type checking uses `allowJs`, `checkJs`, strict null/implicit-any checks, unused locals/parameters, explicit return checks, unchecked-index checks, and exact optional properties. Application source stays JavaScript. JSDoc describes exported function boundaries. JSON from the network remains a runtime trust boundary: a type annotation cannot validate a remote response.

Prettier and ESLint cache unchanged files. The type checkers cache their graphs under `node_modules/.cache/`. These are local optimizations; a fresh CI run checks everything. Generated native projects, dependency code, and bundles are excluded. Prettier skips generated assets and the npm lockfile. Knip ignores the globally installed `fly` deployment CLI binary. Its dependency exception is: `@types/punycode` supplies the transitive declaration imported by `@types/node`, which Knip does not count as direct application usage.

The VS Code settings enable formatting on save and use the project's TypeScript checker. Recommended extensions expose Oxlint, Prettier, and the remaining ESLint diagnostics. GitHub Actions runs `npm ci` and `npm run check` on pushes and pull requests. After checks pass on a push to `main`, it deploys the website and dashboard to the existing Fly service using `deploy/fly/service.toml`. Deployments run one at a time and use the repository's `FLY_API_TOKEN` Actions secret, scoped to `qr-connect-cloud-cody`. The token expires after one year; renew it before expiry with an app-scoped Fly deploy token. `AGENTS.md` tells agents to use this gate and reserve runtime checks for behavior outside its coverage.

Static analysis establishes the properties encoded in these configurations. It cannot establish the intended business result, server availability, UI appearance, native compilation, or performance on a device.

Tool references: [Oxlint configuration](https://oxc.rs/docs/guide/usage/linter/config), [Prettier CLI](https://prettier.io/docs/cli), [JavaScript type checking](https://www.typescriptlang.org/tsconfig/checkJs.html), [Knip configuration](https://knip.dev/reference/configuration), and [React Native lint rules](https://github.com/Intellicode/eslint-plugin-react-native).

### Background location recording

Use the RECORDING switch above CHAT ACCESS in the Location card; it starts immediately without an app confirmation. myself.md requests foreground and Always/background permission when needed; if iOS denies the upgrade (including Allow Once), use Location permissions, choose Location → Always, enable Precise Location, and return. The pending start resumes after permission is granted. The card shows permission, locally saved point count, and the last point time even while the server is unreachable.

Continuous recording uses high accuracy, a 5 m distance filter, no automatic iOS pausing, and an Android foreground service (10 s requested interval). Points are stored in account-owned local SQLite by the background task. These settings follow iso.me’s continuous location mode; visits, reverse geocoding, and Live Activities are not implemented. Background recording consumes battery. OS scheduling controls delivery; force-quitting stops Expo tracking until reopening the app. Chat queries still require the phone app in the foreground.

### Terminal UI

The mobile interface uses white backgrounds, black text, square borders, and the bundled JetBrains Mono font (SIL Open Font License in assets/fonts/JetBrainsMono-OFL.txt). Commands retain 44-point touch targets and screen-reader labels; the bracket switches expose switch/checked semantics. File import/export and deletion controls are under the expandable file tools. System permission and OAuth pages keep their native presentation. The terminal appearance comes from readable monospace type and prompt marks.

## Profile files and automatic exports

Each profile carries `export` settings (`formats`: JSON/JSONL or both, `lookbackDays`: 1–30, `includeToday`, `folderName`, `filenameTemplate`, `formatFolders`) and `schedule` settings (`frequency`: daily/weekly/custom, `interval`: 1–365, `unit`: day/week/month, `anchorDate`: null or YYYY-MM-DD, `hour`, `minute`, ISO `weekday`: 1–7, `todayRefresh`, `refreshHours`: 3/6/12). These optional objects receive defaults when absent. The profile editor exposes formats, date windows, folders, filenames and cadence through individual controls. AI-generated links and queued proposals carry the same settings. Saving a draft never opts in to automatic exports.

**Export profile now** writes one file per local calendar day in the app's Documents folder, partitioned by pairing and profile ID. Choose a safe folder name and filename template containing `{date}` or all of `{year}`, `{month}`, `{day}`. JSON contains records and capture/warning metadata; JSONL contains one complete record per line with a separate `.jsonl.manifest.json`. Each run replaces matching daily files after reading the available selected sources. An unavailable source or a source read error no longer aborts the other sources: records already read are retained, and JSON metadata and the JSONL companion manifest include `status: "partial"` plus `failures` with the domain, type, source, error, and retained record count. Manual and scheduled export messages flag partial results. A partial scheduled day advances after delivery is acknowledged; retry it manually after permissions are repaired to replace that day. If every selected source fails before returning records, the run fails and preserves the previous daily files. Cancellation, file write errors, and delivery failures still stop the export. Empty HealthKit results do not imply read authorization. Share saved files from the profile card or browse myself.md in Files. The older domain export buttons remain one-off JSON shares.

Enable **Automatic exports** separately on each saved profile. Cadences use device-local calendar boundaries and clamp monthly dates from the original anchor (Jan 31 → Feb 28 → Mar 31). Runs cover the full trailing completed-day window relative to their scheduled occurrence, even when delayed; Today Refresh independently rewrites the current day. Opt-in excludes prior occurrences. SQLite freezes profile settings and UTC intervals for residual retries, checkpoints each day, and retries failed days after five minutes. Disabling, deleting or editing a profile cancels pending output; edits to an enabled schedule start a fresh opt-in boundary. File publication is per-format, not a cross-file transaction; an interrupted publication is rebuilt before completion advances.

Expo BackgroundTask uses one coalesced, best-effort OS worker; minimum wake interval is 15 minutes, and foreground catch-up also checks every 30 seconds. iOS force quit stops background wakes until reopening. No exact-time delivery is promised. Files stay local; the worker does not upload them or change chat permissions. A non-secret SQLite export context identifies the current local data partition; background work does not read OAuth tokens from the locked Keychain. OS data protection may still defer native health reads or file access until unlock. Re-pairing starts with scheduling off; disconnect leaves saved files in Documents and prevents further runs without a current session. See [source research](docs/profile-export-port.md) for source behavior and scope differences.

Run `npm run verify:exports` for calendar, opt-in, DST and JSON/JSONL business rules. After `npm run prebuild`, `npm run build:android` compiles without installing (`ANDROID_HOME` must point to the SDK); `npm run build:ios -- DEVELOPMENT_TEAM=<team>` compiles a signed generic iOS Release app.

## Hosted cloud exports

Profiles can now export to local files, an HTTPS endpoint or the paired cloud service. Cloud uploads are encrypted and persist independently of the phone. A separate cloud MCP switch controls stored-data access. See [cloud-service setup, API, limits and connector guide](docs/cloud-service.md). Run `npm run verify:cloud` for storage and HTTP/MCP isolation checks; `npm run cloud:setup -- <domain>` and `npm run cloud:start` prepare and start the container deployment.

The redesigned Expo Router routes and UI in `src/` remain plain JavaScript and are included in all source checks. Native text lint recognizes `Copy`, the shared wrapper that renders React Native `Text`, and `NativeTabs.Trigger.Label`, which accepts a string to configure a native tab item. The entry file has one documented side-effect import for Expo Router registration. Router peer dependencies (`expo-constants`, `expo-linking`, `react-native-screens`, `react-native-reanimated`, `react-native-worklets`) are required by the navigator even where application source does not import them directly.

Profiles, History, and Settings are peer tabs with independent native stacks. Expo Router's native tab bar uses system Liquid Glass on iOS 26 and the platform tab appearance on earlier iOS versions and Android. Profiles opens by default; `/manage` redirects to Profiles for existing links. Profile-specific history stays in the Profiles stack without changing the global History filter. Connections and data-source controls are available from Settings.

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
