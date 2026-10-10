# Argent phone QA

## Start a fixture build

Run `npm run start:qa`, connect an installed Debug build to Metro port 8082, and use a dedicated simulator/emulator. Preview builds hide the QA banner; fixture controls remain available in Settings → QA fixtures. For recorded regression flows, run `EXPO_PUBLIC_QA_BANNER=1 npm run start:qa` to show the persistent **QA fixtures** button and scenario label required by those flows. `EXPO_PUBLIC_QA=1` and `__DEV__` are both required. Switching Metro environments requires an app restart; do not treat a development flag as a remotely enabled production feature.

On Android, reverse the device's Metro port to the QA server (`adb -s SERIAL reverse tcp:8081 tcp:8082`) and set its debug server host to `localhost:8081`. A host such as `10.0.2.2:8081` bypasses that reverse mapping. On iOS, select `localhost:8082` in the debug bundle-server settings. These are development-device settings, not app configuration. Leave physical phones and shared simulators on their existing server.

The fixtures use one private profile with no selected types, a small native-shaped catalog, and three fixed-time synthetic activity entries. No personal records, artifacts, credentials or server tokens are seeded. Reset operations replace only fixture state. SQLite callers use `argent-qa-data.sqlite`; fixture KV state uses `argent-qa-state-v1`. Normal data lives in its original partition. Startup recovery is tested against both partitions, including invalid and interrupted history. Developer notification banners are suppressed only in fixture mode; console output and fatal errors remain observable.

| Scenario            | Observable state                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `populated`         | One private QA profile; saved export, failed export and agent access metadata                |
| `empty`             | Same minimum profile; History empty state                                                    |
| `save-error`        | Failed profile save retains the original stored profile                                      |
| `history-error`     | Refresh error retains saved activity                                                         |
| `permission-denied` | Synthetic permission denial retains the saved selection, with recording and agent grants off |
| `loading`           | Explicit profile and History loading markers                                                 |

Exports, schedules, destination credentials, OS sharing, authentication, purchases, camera access and recording require normal-build integration QA. Fixtures do not perform those operations. Camera access reports that handoff as a readable error. Screenshot feedback is unavailable in fixtures.

## Agent diagnostics

Through Argent's `debugger-evaluate` MCP tool, call:

```js
globalThis.__myselfQa.capabilities();
globalThis.__myselfQa.getState();
globalThis.__myselfQa.reset('populated', true);
```

Reset validates the scenario and boolean onboarding state, persists the synthetic state, increments the revision and returns `{state: 'completed', scenario, revision}`. `reset('populated', false)` resets onboarding. UI fixture buttons call this same operation. `getState()` returns a copy of synthetic state; it does not expose normal account/device data. `capabilities()` declares `synthetic: true`, `nativeIntegration: false` and the supported operations/scenarios. This surface is absent without the opt-in development flag. Use the recorded UI reset helper in regression flows; a debugger reset outside a flow is not replay setup evidence.

## Selector contract

Prefer stable `testID`s over coordinates or list position. Root IDs include `onboarding-*-screen`, `profile-editor-screen`, `profile-detail-screen`, `profiles-screen`, `profiles-list`, `history-screen`, `history-detail-screen`, `settings-screen`, `connections-screen`, `pair-screen`, `account-screen` and `qa-screen`. Destination controls are also useful when native accessibility projections omit a root container.

Key controls include `profile-new-profile`, `profile-name-input`, `profile-save`, `profile-cancel`, `profile-setting-*`, `profile-inline-save`, `profile-inline-cancel`, `selection-domain-*`, `selection-type-*`, `selection-permissions-*`, `history-filter`, `history-event-*` and `settings-*`. The profile list has no visible heading/count; creation flows verify the seeded and newly named profile rows. Dynamic row IDs contain the real profile/activity ID; use fixture IDs for seeded rows, and a controlled unique name for newly created profiles. Do not persist timestamp-generated IDs in a flow.

Controls publish disabled, busy, selected or checked state where applicable. Loading and errors have named markers and readable copy. Labels describe the operation and source rather than icon names. Do not group interactive descendants under one accessible parent. IDs are automation contracts: update the corresponding flow when renaming one.

iOS native tabs expose `profiles-tab`, `history-tab` and `settings-tab`. Android uses native view tags for those IDs, which UIAutomator does not expose as resource IDs; the portable flows use the stable English tab labels. Native back controls differ too: `chevron.backward` on iOS and `Navigate up` on Android. Platform branches reconverge on required destination checks. The suite currently assumes English UI copy.

## Recorded regression contracts

Every flow starts its app and establishes synthetic state itself. `qa-reset-populated` is the shared recorded reset helper. The other flows restore that baseline at the end, except onboarding, which establishes the same populated completed-onboarding state. No screenshots are used as acceptance checks, and no snapshot baselines require review.

| Flow                          | Ordered actions and acceptance evidence                                                                                                                                                                                 | State effect                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `qa-reset-populated`          | Launch → QA fixtures → Reset populated → `profile-row-qa-profile`                                                                                                                                                       | Replaces fixture state only                   |
| `qa-onboarding-completion`    | Reset onboarding → Welcome Continue → Privacy Continue → Explore app → private seeded profile → restart → same profile                                                                                                  | Persists completed onboarding                 |
| `qa-profile-edit-persistence` | Open seeded profile → edit name → verify full input → Save → leave → reopen → saved name                                                                                                                                | Renames synthetic profile; next run resets it |
| `qa-profile-create-cancel`    | Assert count 1 → create named profile → assert count 2 → reopen → rename → Cancel → leave/reopen → original name → reset/count 1                                                                                        | Creates then resets synthetic profile         |
| `qa-source-selection`         | Assert 0/1 Screen time choice → select applications → synthetic permission allowed → leave/reopen → 1/1 persisted → QA diagnostics report authorized, grants/recording false                                            | Saves one synthetic choice, then resets       |
| `qa-history`                  | Establish all three seeded rows → Exports hides previously visible access → Agent access hides previously visible exports → All → Saved export details → Failed details/error → reset                                   | View/filter state only                        |
| `qa-settings-navigation`      | Settings → Data sources → private sources/recording off → Connect agent → pairing input → camera action reports normal-build handoff → back to Connections → back to Settings → reset                                   | Navigation only                               |
| `qa-fixture-states`           | Empty History → refresh error with retained export → profile/History loading → denied permission with choice retained and grants/recording false → failed rename → Cancel → leave/reopen → original stored name → reset | Changes synthetic scenarios and resets        |

History filter segments retain their native controls. iOS exposes them below `history-filter`; Android omits that container, so its recorded text selectors are scoped to `history-list`. The platform branches keep the same filtering acceptance checks.

The History absence checks use a fixed three-entry fixture whose rows were all observed before filtering; they are not claims about arbitrary off-screen collections. Input value checks remain raw `await-ui-element` steps because iOS accessibility exposes a field's value separately from the flow tree's label.

| Navigation                                | Required identity evidence                                                                                  | Readiness |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| App launch                                | `qa-open`                                                                                                   | `idle`    |
| Open/reset fixtures                       | Scenario reset button, then seeded profile or explicit loading copy                                         | `idle`    |
| Onboarding transitions                    | Destination Continue/Explore control, then seeded profile                                                   | `idle`    |
| Open profile / creation editor            | `profile-setting-name` / `profile-name-input`                                                               | `idle`    |
| Save creation / leave / reopen            | Saved name / saved count or seeded row / saved name                                                         | `idle`    |
| Expand source selection                   | `selection-type-time-native:applications`                                                                   | `idle`    |
| Open History / details / back             | Seeded event or empty/loading/error state / Export details / seeded event                                   | `idle`    |
| Open Settings / Connections / Pair / back | `settings-data-sources` / `connections-source-health` / `pair-link-input` / Connections or Settings control | `idle`    |

Filter and state-change checks also use positive replacement evidence. An idle warning alone cannot pass an acceptance contract. Minor native chrome/transition motion has appeared during replay; screenshots showed no unexpected overlay, and subsequent fixed state/control checks remained required. Intentional loading fixtures are gated on their explicit loading copy. A failed check must stop the run; do not add optional branches or extend fixed delays to hide a product failure.

## Replay

Install Argent separately and boot the target through Argent so both app and system accessibility services are available. Run from the repository root, specifying the dedicated device explicitly:

```sh
argent flow run qa-onboarding-completion --platform ios --device IOS_UDID
argent flow run qa-profile-create-cancel --platform android --device ANDROID_SERIAL
```

Substitute any flow name from the contract table. The runner exits nonzero on failure. For two-pass verification, recycle only the target's Argent services before pass 1, then run the unchanged flow twice consecutively with the same runner. Do not manually reset data or rescue the UI between passes. Scope cleanup to this session's devices; a global stop can interrupt other chats.

On fresh Android emulators, Gboard may show “Try out your stylus” after injected taps. Dismiss this system onboarding before recording, or disable stylus handwriting on the disposable QA emulator. Verify the full entered value after typing. If a reused emulator serial causes Argent 0.25.0 to cache a missing Android helper, install Argent's matching devtools APK with `adb install -t`, recycle that serial's services and retry. Neither workaround belongs in app source.

The create flow initially reproduced `ScreenStackFragment added into a non-stack container` on Android after Save. The persisted upstream header guard fixes the detached-screen lifecycle state; the original strong create/count/reopen checks remain in the flow. `npm run build:android` verifies the native change. JavaScript-only fixture/selector changes use `npm run format`, `npm run check`, `npm run verify:qa` and `npm run bundle` for validation.

## Integration limits

These flows prove fixture navigation, shared profile persistence and visible error handling. They do not prove real HealthKit/Health Connect reads, Usage Access, location prompts/background delivery, pairing, OAuth, purchases, network uploads, OS share sheets or ticket submission. Run those in a normal build against a trusted test account/device, record OS handoffs and verify the actual resulting effect. Existing production MCP coverage gaps remain listed in [UI and MCP parity](mcp-parity.md); an Argent tap flow does not replace a semantic application operation.

## Verified replay evidence

On 9 October 2026, Argent 0.25.0 MCP replay passed all eight unchanged final flows twice on an iPhone 17 Pro simulator running iOS 26.5 and a dedicated Android API 36 emulator. Each flow's first pass started with fresh scoped Argent services; its second pass ran immediately through the same runner, without manual reset or UI rescue. A frozen QA Metro served the checked JavaScript to avoid concurrent workspace edits.

| Flow                          | iOS pass 1 | iOS pass 2 | Android pass 1 | Android pass 2 |
| ----------------------------- | ---------: | ---------: | -------------: | -------------: |
| `qa-reset-populated`          |          9 |          9 |              9 |              9 |
| `qa-onboarding-completion`    |         24 |         24 |             24 |             24 |
| `qa-profile-edit-persistence` |         34 |         34 |             34 |             34 |
| `qa-profile-create-cancel`    |         68 |         68 |             68 |             68 |
| `qa-source-selection`         |         46 |         46 |             46 |             46 |
| `qa-history`                  |         62 |         62 |             62 |             62 |
| `qa-settings-navigation`      |         46 |         46 |             46 |             46 |
| `qa-fixture-states`           |         99 |         99 |             99 |             99 |

Counts are successful steps, including the recorded reset helper. All final runs had zero failed or errored steps. Skipped steps were exclusively branches for the other platform's native back control or History filter container. The initial Android History failure exposed a missing native filter-container ID; its recorded platform selector was corrected and both platforms reran that final flow twice. Minor iOS native transition motion produced idle warnings in History, Settings and fixture-state runs; explicit destination and state checks still passed. No screenshot baseline was substituted for these checks.

`npm run verify:qa` passed release gating, input validation, persistence and database startup isolation. The iOS/Android/web bundles and the patched Android native build also passed. Formatting and the aggregate static gate are required after changes.

The Logs tab retains the `history-tab`, `history-screen`, `history-list`, `history-filter` and `history-event-*` selector contracts and existing history routes. Its visible tab label is Logs; categories are All, Exports, Agents and App. Profile logs omit App. `logs-issues` toggles issue outcomes and `logs-report` opens report/consent controls. Internal rows use `log-debug:*` and open `app-log-detail`. Log sharing uses `settings-diagnostics`, `diagnostics-screen`, `diagnostics-agent-sharing`, `diagnostics-share`, `diagnostics-json` and `diagnostics-report`. Fixtures retain their isolated database; agent consent and native sharing stay disabled. The recorded history/state flows have updated visible labels; the table above records earlier replay evidence, not a replay of these changed flows.

For the unified Logs change, iOS simulator checks verified the Logs tab with all three existing fixture rows, issues-only filtering preserving the failed export, and navigation to its existing details. A normal build on the dedicated simulator showed persistent app-start events and opened an internal-event detail route with matching time, operation, outcome and selectable JSON. Existing report sharing previously opened and dismissed the system share sheet with a safe app-start event; no recipient delivery was attempted. Android, physical-device navigation and live paired-phone consent were not re-exercised for this change.

Raw logs adds `logs-format` (Timeline/Raw), `logs-live` and `raw-*` selectable JSON entries. On the dedicated iOS simulator, a controlled `query/failed` event with duration 17 ms and HTTP 503 appeared in the open Raw view immediately after persistence, without pull-to-refresh, route navigation or waiting for the two-second remote poll. This verifies local observation; the event does not represent a real failed request. It was removed from the simulator afterward. Agent history uses remote polling, and paired-device/Android latency was not measured.

Log content controls add `diagnostics-content-records`, `diagnostics-content-credentials` and `diagnostics-content-urls`. On 10 October 2026, the dedicated iOS simulator normal build verified all three switches defaulted off, each enable confirmation, and persistence of the enabled flags. A controlled synthetic failure with fake URL/credential values and one synthetic record appeared with its raw error in Timeline and with all attachments in Raw JSON. Turning all three switches off removed the attachments from both the stored report and Raw UI while preserving the error. The controlled event was deleted afterward, settings restored off, and agent sharing remained off. Android and paired-phone consent were not exercised in this native check; authenticated HTTP/MCP runtime checks cover publication, revocation and record authorization.

The observability layout was checked on the dedicated iOS fixture simulator in light and dark appearance. The compact stream retained all three fixture events, issues-only retained the failed export, its detail route and back navigation worked, and Raw displayed the same filtered event as selectable JSON. A scoped screen recording captured these transitions and was reviewed through sampled frames. Existing selectors and accessibility action labels remain. Android, XL Dynamic Type and release-build frame timing were not measured for this layout.

Log copying adds `logs-select`, `logs-select-all`, `logs-copy`, `logs-copy-status` and Raw checkboxes `logs-check-<log-id>`. Timeline event selectors become accessible checkboxes during selection; Cancel clears selection. The dedicated iOS simulator build compiled Expo Clipboard and native UI checks confirmed single-log and three-log copies by reading the actual simulator pasteboard and parsing JSONL IDs/order. Switching to Raw retained selection; issues filtering reported two hidden selections and copying wrote only the remaining failed event. No external recipient delivery was attempted. MCP runtime checks cover selected IDs, shared JSONL serialization, duplicates, missing IDs and cross-account denial. All-platform bundling passed; Android native clipboard was not exercised.

Schema settings add `profile-setting-schema`, `export-schema-v1` and `export-schema-details`. The shared registry supplies the released choices, recommended label, contract and example. On 10 October 2026, a dedicated iOS 26.5 fixture simulator exercised expanding/collapsing schema details and reopening the saved v1 profile after restart. Light, dark and extra-large Dynamic Type layouts were inspected. The saved fixture state exposed `myself.md.export.v1`; no real export, permission or cloud grant was changed. A scoped recording captured the interaction; Android and release-build frame timing were not measured. Registry/profile/file tests and authenticated cloud/MCP regressions cover version validation, pinning, schema identity and access boundaries.

The Profiles feed card redesign was checked on October 10, 2026 with the refreshed dedicated iOS fixture simulator build. App Llama project-library references informed the title/status hierarchy and outlined action footer. Light and dark appearance and extra-large Dynamic Type were inspected. Enabling synthetic profile access retained the native confirmation; the card and detail switch reflected enabled state, and disabling restored Private/Enable agents. Profile detail and back navigation were recorded and sampled frames reviewed. Fixture export remains disabled; real exports, paired-agent grants, Android and release-build frame timing were not exercised. Existing selectors remain unchanged.

The feed now adds `profiles-layout` with Compact, Standard and Large presentation choices. The dedicated iOS fixture simulator verified all three layouts, including dark appearance with extra-large Dynamic Type. Compact exposes only the profile row; Standard adds selection count/destination and quick actions; Large shows source counts and export configuration with larger action targets. Native confirmation enabled synthetic agent access in Large, and disabling restored Private. A scoped recording captured layout switching and the access confirmation. Export controls remain mounted while hidden in Compact; real export execution, Android and release-build frame timing were not exercised. Layout selection is transient and defaults to Standard.

The revised feed uses separate icon buttons `profiles-layout-compact`, `profiles-layout-standard` and `profiles-layout-large`, each with a named accessibility action and selected state. Compact retains Export and Enable/Disable agents icons on the right of the profile row, with 44-point targets and unchanged action IDs. The dedicated iOS fixture simulator verified their horizontal placement, all three layouts, and the compact agent-access confirmation/Cancel path retaining Private. Synthetic export remains disabled; real export execution and Android were not exercised.

The Profiles heading/count has been removed. The creation/cancellation flow uses the seeded `profile-row-qa-profile` and controlled Profile Argent row to verify the resulting list instead of the removed `profile-summary` selector. Earlier count-based replay evidence above is historical.

The main shell now uses custom bottom buttons with the existing `profiles-tab`, `history-tab` and `settings-tab` selectors. The Profiles list has a fixed top-right toolbar containing all three layout selectors and `profile-new-profile`; the floating creation button and native Profiles list header are removed. Layout preferences persist across restart in an isolated QA preference key. Detail/editor routes retain native back controls. Earlier native-tab, floating-button and transient-layout descriptions are historical.

The dedicated iOS populated fixture verified switching all three bottom destinations, reopening Profiles with its saved Large layout, opening New profile from the toolbar and returning without saving, and opening profile details from card metadata with back navigation. Profile-specific toolbar controls were absent from Logs, Settings and detail/editor screens. Formatting, aggregate static checks and iOS/Android/web Metro export passed. Android device interactions and real data operations were not exercised for this navigation change.

The main bottom row adds `support-tab`, an accessible Contact support icon between Logs and Settings. It opens the existing account-scoped support route; signed-out fixtures show `support-sign-in` and `support-sign-in-button`. Fixture verification must not sign in or send messages.

The main navigation is now a right-side vertical icon rail. Existing `profiles-tab`, `history-tab`, `support-tab` and `settings-tab` selectors and destinations are unchanged; recorded selector-based navigation remains applicable. Read current frames for live taps because the former bottom coordinates no longer apply.

The dock adds `navigation-dock` and adjustable `navigation-drag-handle` (Move navigation menu). Hold the handle for 250 ms before dragging. Dragging to side edges produces a vertical dock; top/bottom edges produce a horizontal dock. Accessibility actions move to named edges or along the current edge. Position persists in a separate QA preference key, so discover current frames instead of using fixed navigation coordinates.

On the dedicated iOS populated fixture, live held drags moved the dock from right to top, bottom, right at a lower offset, and left. Top/bottom placement changed to horizontal; both sides stayed vertical. Restart restored the same right-edge position and frames. The moved dock still opened Logs. Static checks passed. These checks verify synthetic native gestures and persistence; Android, physical-device release performance and production MCP preference parity were not exercised.

The `navigation-drag-handle` is removed. Hold any area of `navigation-dock`, including an icon, for 250 ms before dragging. Short icon taps navigate normally. The four navigation buttons retain their selectors and each exposes named edge/movement accessibility actions. The dock length is now 232 points; rediscover its frames. Earlier handle-based verification is historical.

The dedicated iOS fixture verified holding the Logs icon and dragging the whole dock to the bottom without leaving Profiles, then tapping Logs normally to open its view. Holding Settings and dragging back to the right retained Logs. Gesture callbacks explicitly run as UI-thread worklets. Static checks passed; earlier handle-based frames no longer apply.

The dock uses `navigation-selection`, a single animated grey circle driven by the current route. The dedicated iOS fixture verified selected endpoints when switching Profiles/Settings with a vertical dock and Settings/Logs with a horizontal dock; navigation continued to work. The transition is 180 ms and uses system reduced-motion behavior. Static checks pass; release-device frame timing and reduced-motion device settings were not exercised.

On 10 October 2026, a signed embedded iOS Debug snapshot was installed on the owner's connected iPhone. The original Metro-backed launch hit the scene-create watchdog while synchronously checking the Mac address. Embedding dev-mode JavaScript/assets and omitting `ip.txt` avoids that unavailable-host wait. Expo 57.0.27 also required the message-socket patch to skip its development WebSocket for embedded bundles. Argent verified normal Profiles startup, Settings navigation, `settings-feedback`, native Gripe crop with Next/Close, cancellation and normal restart. No report was submitted. Physical-device two-finger triple-tap remains a manual check because Argent cannot inject two-finger hardware gestures.

Support now belongs to the shared tab shell. `support-tab` is selected on `/support`; `profiles-tab`, `history-tab` and `settings-tab` remain available on the signed-out screen and authenticated inbox/conversations. Existing Settings and notification links retain `/support` and its conversation parameter. Fixture navigation checks use `support-sign-in-button` without signing in or sending messages.

For this Support navigation fix, formatting, all aggregate static checks and iOS/Android/web Metro exports passed. The existing fixture simulator reproduced the missing dock on the signed-out support route, but its Metro server belongs to another checkout. Redirecting that installed build to this checkout did not succeed; native verification of the changed route and authenticated conversations remains outstanding. The temporary checkout server was stopped and the existing Metro server was preserved.
