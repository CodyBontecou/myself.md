# Apple Watch first milestone

The native companion app targets watchOS 11+. It reads today's steps on the watch, shows a Smart Stack widget and circular/rectangular complications, and exports the watch's available step samples directly to a saved HTTPS endpoint. The phone app provisions the profile once over an acknowledged Watch Connectivity message. Subsequent HealthKit reads, allowance reservations and HTTP uploads run on the watch without executing the phone app.

## Setup and operation

1. Build the updated phone app and install its watch companion. Deploy the updated account service before provisioning.
2. Connect the phone to your myself.md account. Open myself.md on both devices, then Settings → Apple Watch on the phone.
3. Enter a profile name, HTTPS endpoint and optional bearer token. Watch profiles are fixed to step count, original JSON and the local day up to the time of the export request. This preset is saved independently of the phone's export profiles.
4. Leave **Allow agent requests** off for private operation. Enabling it explicitly permits cached watch steps and export requests for this preset. The confirmation names the destination and the grant. Tokens are never included in MCP state.
5. Save on watch, review Steps access on the watch, then tap Export now. Keep the watch app active until Delivered appears. The widget's export button opens the watch app and queues the same operation.

The watch shows queued, uploading, delivered, failed and permission-review states. Requests and staged files survive process termination. Interrupted transfers retain their original interval, file and request ID; foreground retries use exponential backoff. A delivered receipt is persisted before account history/billing reconciliation and is retried independently. A receiver must deduplicate `Idempotency-Key`; an acknowledgment lost in transit can otherwise produce duplicate copies.

The first milestone deliberately uses an ephemeral, file-backed URL session. Apple's [background transfer restrictions](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background) state that background sessions always follow redirects and do not call the redirect delegate. An ephemeral session can reject redirects and preserve the existing endpoint/credential binding. Lowering the wrist or leaving the app may interrupt a transfer; it resumes from the durable queue when the watch app returns to the foreground. Always-on operation and unattended background delivery are outside this milestone.

## Data contract and coverage

The display uses HealthKit's cumulative step statistic rather than summing potentially overlapping source samples. Exports preserve individual quantity samples, source UUIDs/revisions, devices, precise timestamps, typed metadata, original cumulative properties and available quantity-series children. `WatchRecord` matches the quantity projection in `core/data.js` and `core/time-series.js`. The display value is not substituted for original records.

The payload uses `myself.md.export.v1`, captures/warnings, actual requested bounds, device identity and `coverage.scope: "watch-local"`. Purged history and nested detail failures mark the export partial. Empty reads cannot prove HealthKit read authorization. Watch exports do not claim the phone's complete health history, Screen Time, phone-recorded location, workouts or manual Health writes. Native resource limits are 5,000 parent samples, 10,000 series points and a 2 MiB JSON file; oversized files fail rather than silently losing records.

The widget reads a shared watch App Group snapshot. It never reads HealthKit directly or accesses credentials. Its timeline includes a next-day entry that clears yesterday's count; passive refresh timing is controlled by watchOS. Metrics use `privacySensitive()` for the user's Always On privacy choices.

## Authorization and delivery

Each watch has its own UUID, distinct from its parent phone. The phone owner provisions an upload/operation-only session. The server stores only its hash plus encrypted profile/operation metadata; the watch stores the session and destination bearer token in an after-first-unlock, device-only Keychain item. Secrets travel only via interactive `sendMessage` with an acknowledged device/revision, not Watch Connectivity's background queues or App Group files.

The watch session expires after 30 inactive days. Foreground watch activity renews it at most once per day without opening the phone app. Expired sessions need phone-assisted setup again. A credential retained after expiry may revoke its own watch only; account routing retains its hash for up to 90 additional days for this cleanup. Reconfiguration rotates the session and cancels pending work; account deletion and parent-phone disconnection revoke it. The watch can also revoke its own session through Remove setup. A transfer already sent to an external destination cannot be recalled.

Before uploading, the watch requests an account allowance reservation bound to its device, profile revision, day and format. The service validates ownership and any agent grant again after entitlement verification. An HTTP 2xx acknowledgment completes billing; failure/cancellation releases the reservation. Reports and retries are idempotent. Uploads carry `Content-Type: application/json`, `X-Export-Profile`, `X-Export-Day`, `X-Export-Device` and `Idempotency-Key`, plus the optional bearer credential. Redirects fail. HTTPS destinations need to accept POST at the configured URL directly.

Step values are sent to the account service only when watch agent access is enabled. Private watch summaries remain local. HTTPS export bytes go directly to the configured recipient, not through the account service. The account service stores delivery metadata for allowance, diagnostics and history. At most five exports can be pending and forty operations are retained in watch state; older completed history follows the existing history retention. Agent requests are picked up when the watch app is active. No exact wake or delivery schedule is promised.

## API and MCP

`POST /api/watches` requires the authenticated phone owner client. Its semantic actions are `configure`, `list`, `get`, `request`, `cancel` and `revoke`. Configuration requires an owned parent device; destination secrets are not sent to this API.

`POST /api/watch/runtime` accepts `Authorization: Watch <scoped-token>` and only `poll`, `enqueue`, `awaiting_user`, `start`, `settle`, `cancel` and `revoke`. The token cannot use phone OAuth routes, change agent permissions or access MCP. Cloudflare routes its hashed token through the account directory, then the same service rechecks it. Watch metadata is encrypted using the existing account/export codec.

MCP exposes `setup_watch`, `list_connected_watches`, `get_watch_state`, `request_watch_export`, `cancel_watch_export` and `disconnect_watch`. Setup, secure credential entry and OS permission review are owner handoffs at `myselfmd://watch`; ordinary exports and cancellation use the actual shared operation service. Requests require a UUID `requestId` that must be reused on retries. Grant-disabled clients receive capability/consent state without metrics or job history. Blocked clients cannot read watch state or request new work; execution rechecks blocking and grant state.

## Build and verification

Watch source lives under `watch/` and the iOS provisioning bridge under `modules/watch-bridge/`. `plugins/with-watch.cjs` regenerates watch app/widget targets, entitlements, embedding, source membership and a shared `MyselfWatch` scheme during Expo prebuild. The plugin declares both target identities to EAS for credential preparation. Generated `ios/` source is not edited by hand.

```sh
EXPO_NO_DOTENV=1 npm run prebuild -- --platform ios --no-install
npm run verify:watch
npm run verify:watch:swift
npm run build:watch
npm run format
npm run check
npm run bundle
```

`verify:watch` checks authenticated HTTP/MCP behavior, private metrics, account isolation, consent, frozen intervals, acknowledgment/billing retries, rotation/revocation and target generation. Swift golden fixtures cover quantity projection, source fidelity, coverage and daylight-saving day bounds. `build:watch` compiles the watch app/widget for an unsigned watchOS simulator on macOS. It does not produce a distributable phone build. For phone/device builds use the established local-main phone runner in `AGENTS.md`; native signing must include the HealthKit/App Group capabilities for the new targets.

This Linux workspace has no Xcode, Apple SDK or simulator. The portable Swift package was compiled and all five contract tests passed in the official Swift 6.1 container with networking disabled. Swift syntax parsing also covers the app, widget and phone bridge, but Apple-framework type checking, simulator interaction and physical-watch delivery remain unverified. Before release, build the phone bridge and watch targets on the authorized Mac, then verify on a physical watch:

- Grant and deny Steps reads; compare native source samples and series with the exported JSON, including an empty read and partial capture.
- Provision an authenticated HTTPS test destination. Observe its received body and headers, then the on-watch Delivered state and one account allowance/history entry.
- Close the phone app and repeat. Power the phone off and repeat over watch Wi-Fi; test cellular separately on a supported watch.
- Interrupt a transfer, reopen the watch and verify the frozen file/request ID is retried without double counting. Verify recipient-side duplicate reconciliation.
- Test destination 401/403/429/500, redirects, expired/revoked sessions, locked-watch Keychain access, profile replacement and cancellation during a request.
- Add both widget families, tap Export, cross midnight, and check Always On privacy, small/large watches and accessibility text sizes.

These are release checks, not evidence already established by the protocol fixtures. Unattended background delivery, cloud export, provider OAuth and full watch-only onboarding remain later milestones.
