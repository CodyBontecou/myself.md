# Working in this app

Keep application and tooling source in plain JavaScript. Use JSDoc where a function boundary needs a type; strict `checkJs` checks the existing `.js` files without emitting code.

## Finish each change

1. Make the smallest change that solves the request.
2. Run `npm run format` for formatting, then `npm run check`.
3. Fix every reported error. Completion requires exit code 0 from the aggregate check. It runs independent tools concurrently and returns nonzero if any tool fails.

Use the static check result as evidence for formatting, type compatibility, lint rules, imports, native text/style rules, and unused code. Add runtime verification only for behavior these tools cannot prove, such as business rules, network responses, gestures, and native integration. Avoid tests that duplicate a static rule. Preserve checker scope when adding source directories.

Keep `core/` dependency-free and independent of React Native, Node, browser APIs, and side effects. The core has its own environment-free type check and lint restrictions. Keep I/O at the client and server boundaries.

## UI and MCP parity

Every user-facing capability must be available to agents over MCP. When adding or changing UI actions, settings, queries, diagnostics, or workflows, read `docs/mcp-parity.md` and update its coverage inventory. Include mobile and dashboard surfaces.

Expose semantic operations with validated inputs and structured results. Route UI and MCP through the same application logic so validation, side effects, billing, and history stay consistent. Discoverable reads must include the state an agent needs to choose and verify an action.

Apply account/device ownership, existing data grants, and equivalent authorization and confirmation to both entry points. An agent cannot grant itself access. OS prompts, authentication, purchases, secure credential entry, and system sharing may require the user on the device; MCP must initiate or link to that step and report what remains. A deep link alone is not parity for an ordinary app action.

For queued phone actions, distinguish accepted, awaiting user, running, completed, failed, cancelled, and expired outcomes. Report completion only after the effect succeeds, support safe retries, and expose actionable diagnostics without secrets or data outside the agent's grants.

Before finishing, account for every affected UI capability with its MCP operation or a documented platform handoff. Verify changed authorization and end-to-end effects at runtime; an existing tool name or a queued request does not prove parity.

## Native work

For Argent navigation, regression QA, or flow recording/repair in this app, read `.agents/skills/argent-myself-qa/SKILL.md` and `docs/argent-qa.md` before device interaction. Use `$argent-myself-qa` when available. Reuse its isolated fixtures, stable selectors, and recorded flows; follow its normal-build integration boundaries.

Read the installed Expo major in `package.json` and consult matching docs at `https://docs.expo.dev/versions/v<major>.0.0/` before changing Expo APIs or config. Use `npx expo install` for SDK-compatible dependencies. Native directories are generated from `app.json`; configure them through Expo rather than editing generated files.

For JS-only work, the static checks are the default validation. Run `npm run bundle` when Metro/module resolution changes. Compile the affected platform after native dependencies or configuration change. Run scripts from `package.json`; native builds are deliberately outside the fast static gate.

## Checker maintenance

Keep rules focused on mistakes and useful contracts. Prettier owns formatting; Oxlint owns the overlapping ESLint rules; ESLint retains Expo and React Native checks. Explain any narrow exception in README. Fix the source instead of weakening checks or adding blanket disables. `README.md` documents commands, coverage, caches, and limits.
