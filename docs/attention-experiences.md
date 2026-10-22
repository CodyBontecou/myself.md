# Connected attention experiences in ChatGPT

These six extensions use existing shared screen-time exports and current profile grants. They do not create reminders, capture data or change phone limits.

## Choose a small change

**Help me choose a change** offers up to three editable daily app-cap suggestions based on observed app days in the selected review source. Each explains its observed coverage and starting cap. **Customize this experiment** opens the existing app goal form with the suggested cap and plan; the user chooses the final values and start date before saving. The standalone MCP operation is `suggest_screen_time_experiments`; `save_screen_time_experiment` remains the authoritative save path. Suggestions are optional hypotheses, not claims about healthy use or likely benefit.

## Annotated heatmaps and hour comparisons

The weekly result includes accessible experiments intersecting its dates. The heatmap labels their periods and marks experiment starts with ◆. **Compare hourly patterns** in My experiments reads selected baseline and experiment files and aligns the goal app's observations by local weekday and clock hour. It exposes both durations and null-preserving differences, paired-hour counts, coverage and clock-change limits. An absent or omitted top-ten app is unknown, never zero. `compare_screen_time_experiment_hours` supplies the identical data to agents. This separate comparison does not change the saved outcome or prove causality.

## Personal reflections

**My reflections** saves short user-written context for a local week and phone/profile. Experiment cards can associate a note with their saved goal. Notes persist encrypted under the owning account and remain subject to current Screen time profile grants. `save_screen_time_reflection` creates or edits by UUID; retries with identical content are safe. Edits require the discovered `updatedAt` revision to avoid losing another edit. `list_screen_time_reflections` discovers accessible notes, IDs and revisions. Notes are limited to 1000 characters and 200 per account. They are user context, not measured explanations or instructions. Account deletion and account migration include the reflection table.

## Ask the chart

Day, app and hour detail views provide a question field and **Ask ChatGPT**. The standard MCP Apps `ui/message` bridge sends the question with selected observations, source, dates, export provenance, timezone and warnings. The local context helper compares the same weekday/hour seven days earlier where both observations exist. Without host messaging, the card explains how to ask in chat. `inspect_screen_time_chart` obtains the same context through a semantic operation using explicitly selected shared exports. A fourteen-day window cannot establish that usage is unusual or why it changed.

## Monthly attention stories

**Monthly story** reads an explicitly chosen completed calendar month from the selected shared files using the usual allowance. Files outside that month produce an honest empty view; discover other relevant files in chat rather than treating upload dates as record coverage. `review_monthly_attention` returns separate source stories with observed duration and days, consecutive seven-day blocks, leading observed hours, top apps, first/final-week app shifts when coverage permits, accessible experiments and personal reflections. The final block may be shorter. Missing days remain unknown, unequal coverage is disclosed, and partial/excluded records suppress app-shift comparisons.

## Export readiness

**Export readiness** inspects the loaded review without another read. `check_screen_time_readiness` reads explicitly selected files when no review is loaded and returns the same source-specific observed/missing dates, partial-file limits, hourly availability and owner steps. Owners may need to export the desired date range, share the profile/files and approve Screen time Agent permission on the phone. Agents cannot grant themselves access. A day with observations does not prove complete collection.

## Shared boundaries

All export reads use the weekly reader's ownership, selection, current-grant, entitlement, billing and history logic, with at most 32 selected files and 200 sequential record pages per period. Hour-pattern comparison reads two periods (up to 400 pages in total). Successful pages remain charged if a later read fails. Local navigation, coaching drafts, loaded readiness and chart questions use the current result without another raw-data read. Sources, types, granularities and native devices stay separate.

Reflection writes and reads use the same application logic for cards and MCP. New mobile and dashboard actions are not introduced. The platform's existing owner confirmation and OS/provider consent handoffs still apply.

## Verification and deployment status

All six features are implemented. `npm run format` and `npm run check` passed. `npm run verify:screen-time-review` passed the actual MCP/storage/billing and Chromium flows, including coaching drafts, chart messages, monthly observations and gaps, experiment markers/hour pairs, reflection creation/editing from a standalone card, persistence/retries and ownership/revocation. The exact scoped production package also passed the complete workerd HTTP/MCP suite with real R2/SQLite fixtures for the new operations.

Version `e95cbc47-e78e-4d54-abf6-b385c388f8a4` is active at 100% traffic after explicit user approval. The release patches the weekly-review module, restricted tool inventory, agent guides, reflection store initialization and its three account lifecycle table inventories. Other source, authentication diagnostics and existing public assets are preserved. Evidence is under ignored `.local/attention-suite-release/`. Live ChatGPT verification is recorded below.

### Live ChatGPT verification — 21 October 2026

The existing personal **myself.md reviewer test** connection refreshed its tools and loaded the v4 card with CSP enforcement unchanged. The reserved fictional reviewer identity was checked before reads. ChatGPT invoked all seven new semantic operations across the six features using the four existing shared screen-time fixtures and the saved Browser experiment. No real phone data, capture, data grant, goal or phone setting was changed.

Direct card checks verified:

- Three coaching suggestions at 102 minutes/day, with two observed app days disclosed; customization opens the existing editable Browser goal form with that cap, plan and a future start date. No goal was saved.
- Readiness shows 2/14 observed days, twelve missing dates, 24 hourly cells and zero unallocated records, with owner export/sharing steps.
- A fictional reflection was saved, edited and refreshed through the card. The stored text is explicitly labeled fictional and treated as personal context.
- The heatmap displays the existing Browser experiment period and an October 12 start marker. The hour-comparison action returns 0/168 paired hours because baseline and experiment observations fall on different weekdays; both coverage summaries and the unpaired durations remain visible.
- The monthly action reads completed September and correctly shows no observations, because the existing hosted fixtures contain only October records. Actual observed monthly totals, weekly gaps, app shifts and responsive story rendering were verified in the isolated Node/Chromium suite (14/30 observed days and 77 observed hours).
- **Ask ChatGPT** sends the selected October 11 00:00 hour through `ui/message`. ChatGPT answered with 30 minutes from six records, three apps at ten minutes each, and unknown previous-week coverage without rereading exports.

The readable original, v2 and v3 resources remain available; new tools use `ui://myself-md/weekly-screen-time-review-v4.html`. An independent `list_screen_time_reflections` call rediscovered the edited note, and a fresh weekly review returned both the note and saved experiment marker. One final review used ChatGPT’s per-call **Allow once** prompt; persistent app permissions were not changed. The final card remains open. The [verification conversation](https://chatgpt.com/c/6ad8e794-4010-83ed-a58e-1a1f68e689c8) is retained. This verifies the personal development connection; public-directory approval remains separate.

Health and restricted OAuth discovery returned HTTP 200, unauthenticated restricted MCP returned 401, the public agent guide contains the new workflows, and 62 existing public static assets remained byte-identical. The dashboard template, bindings, runtime, settings and authentication diagnostics were preserved.
