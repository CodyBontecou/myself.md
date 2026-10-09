---
name: argent-myself-qa
description: Use the myself.md app's isolated QA fixtures, stable selectors, and recorded Argent flows when navigating its iOS/Android UI, running regression QA, or recording and repairing app flows in shared-js-app.
---

# Argent myself.md QA

Apply this skill to the myself.md app. Use the repository checkout containing this skill and `docs/argent-qa.md`.

## Load the app contract

Before device interaction, read `<repo>/docs/argent-qa.md`. It is the maintained source for fixture setup, selector IDs, platform differences, flow acceptance contracts, diagnostics and integration limits. Read `<repo>/AGENTS.md` for change validation. Use the installed Argent setup, device interaction or flow-authoring skill appropriate to the task; this skill adds the app-specific contract.

## Choose the environment

For navigation and regression QA, use `npm run start:qa` and a dedicated development simulator/emulator connected to its Metro server. Confirm the visible `qa-open` control and QA scenario label before any fixture action. Preserve physical phones, shared simulators and their existing server/data settings. Pass the intended device ID explicitly to Argent.

For real permissions, authentication, purchases, pairing, exports, background recording or screenshot feedback, use a normal build and an authorized test account/device. Report the observed native or server effect. A synthetic permission or a displayed handoff does not prove integration success. Consult `docs/mcp-parity.md` when changing application capabilities.

## Reuse the recorded flows

Read the relevant `.argent/flows/qa-*.yaml` and the guide's contract table before replaying. Select the smallest existing flow covering the request:

- `qa-onboarding-completion`: onboarding and restart persistence.
- `qa-profile-edit-persistence`: save an edit, leave and reopen.
- `qa-profile-create-cancel`: create/count, cancel an edit and reopen.
- `qa-source-selection`: selection persistence and synthetic permission review.
- `qa-history`: filters, saved details and failed details.
- `qa-settings-navigation`: Connections, pairing UI and camera handoff.
- `qa-fixture-states`: empty, loading, History error, denied permission and failed save.

`qa-reset-populated` is the recorded reset helper. Flows establish their own state; keep setup and acceptance checks inside the flow. Use `flow-execute` with the checkout's `project_root`, flow name and explicit device, or the guide's CLI commands.

When verifying a changed flow, recycle only that device's Argent services before pass 1, then replay the unchanged final YAML twice consecutively through the same runner. Report failures and runner warnings. A historical pass in the guide is context, not evidence for the current checkout. Claim both-platform coverage only after both iOS and Android pass.

## Navigate and repair with evidence

Prefer the guide's stable IDs. Read the current native/accessibility tree when a selector is missing; use its observed frames for live taps. Preserve the documented English native-tab labels, platform-specific back controls and History filter scopes. Dynamic fixture rows have stable IDs; newly created profiles need a controlled unique name rather than a timestamp ID.

Require destination identity and readiness after navigation, and verify the resulting state after mutations. Keep full input-value checks, saved counts, leave/reopen persistence and cancellation checks. An idle warning requires inspecting what is moving and gating on the actual ready state. Intentional loading scenarios are identified by their explicit loading copy.

Record added actions and checks live through Argent before polishing YAML. On failure, diagnose the first divergence, repair the app or selector, then rerun the final flow. Preserve the acceptance contract; optional branches, guessed coordinates and longer fixed delays cannot establish a missing effect. Absence checks need a valid collection scope and evidence that the same selector was present before the action.

For one-off fixture diagnostics, use Argent debugger MCP with `globalThis.__myselfQa.capabilities()`, `.getState()` and `.reset(scenario, onboarding)`. Read the supported contract from the guide. Fixture resets must stay in the isolated QA partitions; preserve normal phone data and grants.

## Finish

For repository edits, run `npm run format` then `npm run check` and resolve all failures. Follow the guide and AGENTS.md for additional runtime, bundle or native-build verification appropriate to the change. Update the maintained guide when a selector or flow contract changes.

Stop Argent services scoped to this session's device IDs and any logical debugger IDs. Stop only Metro processes started for this work, and restore temporary device settings. Report what passed, any warnings, and unverified integration boundaries.
