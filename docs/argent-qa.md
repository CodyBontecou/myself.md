# Argent phone QA

## Start a fixture build

Run `npm run start:qa`, connect an installed Debug build to Metro port 8082, and use a dedicated simulator/emulator. The app shows a persistent **QA fixtures** button and scenario label. `EXPO_PUBLIC_QA=1` and `__DEV__` are both required. Switching Metro environments requires an app restart; do not treat a development flag as a remotely enabled production feature.

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

Key controls include `profile-new-profile`, `profile-name-input`, `profile-save`, `profile-cancel`, `profile-setting-*`, `profile-inline-save`, `profile-inline-cancel`, `selection-domain-*`, `selection-type-*`, `selection-permissions-*`, `history-filter`, `history-event-*` and `settings-*`. `profile-summary` exposes the collection-wide saved count. Dynamic row IDs contain the real profile/activity ID; use fixture IDs for seeded rows, and a controlled unique name for newly created profiles. Do not persist timestamp-generated IDs in a flow.

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
