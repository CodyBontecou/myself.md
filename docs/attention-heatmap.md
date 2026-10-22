# Attention heatmap in ChatGPT

The production embedded resource is `ui://myself-md/weekly-screen-time-review-v8.html` (Worker version `3b2d60c4-8f05-4b23-bda4-9e92f47eea47`); older resource URIs remain readable. Known app identifiers receive offline display-name fallbacks when the OS export has no usable name, while genuine OS names and stable matching identifiers are preserved. Unknown identifiers and website domains are not guessed. When no previous-week days exist, the daily table shows the review week alone and states the exact missing comparison dates. The heatmap still distinguishes missing observations from explicit zero values.

Run `node scripts/verify-review-presentation.js` for the focused name/identifier, empty-comparison and day/app/hour interaction regression at phone width. This complements the broader review suite and exact-package workerd checks.

The weekly review's **Attention heatmap** view shows observed app usage by local date and clock hour. Choose this week or the previous week, then select an hour to inspect its observed duration, record count and leading apps. The hour detail links to the whole day's existing breakdown. The color scale stays fixed across both weeks and sources remain separate.

Only records whose full interval fits inside one local clock hour are mapped. Daily aggregates and records crossing an hour remain in weekly/daily totals and appear as unallocated usage. The service never spreads an aggregate across hours or assumes activity happened at its start. A mapped interval still describes observed usage within that hour, not an exact session timeline or complete coverage. Missing cells are unknown; an explicit zero record has its own zero state. App durations can overlap.

Timezone conversion happens at the server boundary. Missing clock hours during daylight-saving changes appear as unavailable. Repeated clock hours combine their occurrences and disclose the actual elapsed duration. Half-hour changes are also represented. All original invalid-record, cross-midnight, conflict, deduplication and partial-file rules apply before heatmap aggregation.

## Agent parity and access

`review_weekly_screen_time` returns each source series' `heatmap`: sparse `cells` with date, hour, observed duration, record count, top ten apps and remainder; `days` with mapped/unallocated duration and unallocated record counts; and `clockChanges` for nonstandard local hours. Agents can select a week or inspect a cell from these fields without another tool call. Null and absent observations must not be reported as zero.

The card uses exactly that loaded result. Week switching, hour inspection and returning to daily/weekly views do not read more exports, charge the read allowance, persist data or change grants. Existing ownership, entitlement and synchronized Screen time Agent permission checks remain in the shared review operation. Mobile/dashboard actions are unchanged. No reminder or phone setting is created.

## Verification

Run `npm run verify:screen-time-review` for bounded billed MCP reads and Chromium card interactions. Fixtures cover known hourly totals, explicit zero, coarse and hour-crossing aggregates, missing observations, conflict exclusion, New York DST gaps/repeats, Lord Howe half-hour changes, Kathmandu's offset, phone-width layout, week selection, hourly app details and unchanged billing during card interactions. The scoped production package also runs the existing workerd HTTP/MCP regression suite.

The UI resource is `ui://myself-md/weekly-screen-time-review-v3.html`. Both earlier resource URIs remain readable. A new URI ensures ChatGPT retrieves the changed renderer.

## Production and ChatGPT evidence — 21 October 2026

Worker version `ec827634-c99c-4b07-8604-ae526015d074` is active at 100% traffic. The scoped release replaced the existing weekly review/experiment module while retaining production authentication diagnostics, bindings, runtime and settings. Sixty-two public static assets remain byte-identical; the dashboard template was preserved with its dynamic nonce/content placeholders. Health and restricted OAuth discovery returned 200; unauthenticated restricted MCP returned 401.

The existing **myself.md reviewer test** connection was refreshed, then a new review ran inside ChatGPT after checking the isolated reviewer identity. Four existing fictional JSON/JSONL exports produced 24 cells on October 11–12, totaling twelve hours, with zero unallocated records. October 11 at 00:00 showed thirty minutes from six records: Fictional Browser, Music and Reader at ten minutes each. Live clicks verified that breakdown, whole-day navigation, an unknown October 13 cell, previous-week missing observations, and returning to this week. ChatGPT independently summarized `heatmap.cells` and `heatmap.days` in its response. No experiments or phone settings were changed. This verifies the personal development connection, without establishing directory approval.

Ignored local evidence lives in `.local/heatmap-release/`: tested production package, regression log, scope hashes, upload/deployment receipts, public checks, unchanged asset hashes, accessibility captures and `chatgpt-attention-heatmap.png`. The [verification conversation](https://chatgpt.com/c/6ad8e794-4010-83ed-a58e-1a1f68e689c8) remains open on the app card.

## Paired heatmap comparison (v12, local source)

The embedded ChatGPT review shows comparison and review heatmaps together, with aligned local-hour rows, actual date/weekday headers and one numeric scale computed over both full periods. Paired days selects the same window of up to seven day positions in both ranges. Wider cards put comparison left/review right; cards at 560px and below stack the labelled panels. Shorter ranges have noninteractive outside-range positions, distinct from unknown observations, explicit zero, and nonexistent DST clock hours. Each panel retains mapped/unallocated usage, experiment markers and clock-change notes. Focus/hover identifies the period/date/hour in the shared readout; hour clicks use the existing drilldown and back navigation preserves the paired window.

This is presentation over the existing `review_weekly_screen_time` structured `daily`, `heatmap.cells`, `heatmap.days` and `heatmap.clockChanges` fields, also inspectable through `inspect_screen_time_chart`. Navigation uses loaded observations without reads, charges, persistence or grant changes. Native mobile and dashboard actions are unchanged. Existing ownership, selection and shared-read authorization remain enforced. The v12 resource retains v11 and earlier aliases.

## Paired heatmap release — 21 October 2026

Worker `1de8c83d-a94b-42c0-8e43-50116f8bd001` activates UI resource v12 at 100%, replacing `ee4b78f6-6829-4acd-8c8e-69b09a3d177c`. Only renderer JavaScript/HTML, the resource URI and retained v11 alias changed in a fresh production capture. Date presets and other application logic, authentication diagnostics, bindings, runtime, settings, dashboard template and 62 public assets are preserved. The exact frozen renderer matches the browser-tested preview. Formatting and aggregate static checks pass, along with focused light/dark browser tests at 375/820px, aligned rows, comparison/review hour navigation, unknown/zero cells, unequal and fully outside-range windows, 31-day paging, and no additional reads for paging. The exact-package workerd HTTP/MCP suite passes, including the restricted OAuth/R2 review and resource v12. Private receipts, scope hashes, tests and module/asset proofs are in ignored `.local/review-heatmap-pair-release/`.

The live ChatGPT reviewer connection verified both panels, aligned rows, common thresholds, hour navigation from either period, unknown cells and paired paging. [Detailed verification](weekly-screen-time-review.md#paired-heatmap-release--21-october-2026).
