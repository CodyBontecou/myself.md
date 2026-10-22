# myself.md in the AI app ecosystem

Research date: October 21, 2026. Official documentation was read for this note; publisher portals and deployed tool inventories were not refreshed. Status statements below distinguish repository evidence from proposals.

## Recommendation

Position myself.md as **the permissioned bridge between your phone data and the AI tools you already use**. Lead with a weekly Screen Time reflection: “Where did my attention go this week?” Deliver an answer from an explicitly shared export before requiring a live phone query. Then add a compact comparison view and expand to other clients through the existing MCP foundation. This is a product recommendation, not an assertion of current marketplace approval.

OpenAI recommends narrowly scoped capabilities that supply useful data, perform actions, or show information clearly inside an ongoing conversation. That favors a few recognizable personal-data jobs over reproducing the mobile dashboard. [OpenAI app design guidance](https://developers.openai.com/blog/what-makes-a-great-chatgpt-app)

## Existing foundation

- The repository records OpenAI version 1.0.0 submitted October 13; its latest recorded portal check, October 16, says **In review / Not published**. Three data tools require further review without an actionable correction. This is historical evidence, not today's live status. [OpenAI submission ledger](../distribution/openai/README.md)
- The official MCP Registry listing was published October 13. The directory ledger records Claude in review on October 17. Registry publication and directory approval are separate outcomes. [Registry ledger](../distribution/mcp/README.md), [directory readiness](mcp-listing-readiness.md)
- Current source restricts ChatGPT to a separate `/mcp/chatgpt` OAuth resource and contains **14 allowlisted names**, including `export_phone_data`; the submitted production snapshot recorded 13. Source inspection does not prove a deployed inventory change. Reads already cover approved datasets, phones, profiles, live queries, request status and shared exports. [ChatGPT boundary](../server/chatgpt-tools.js)
- The submitted package already has listing copy, starter prompts and reviewer scenarios. Its current positioning is “Your approved phone data.” [Manifest](../distribution/openai/myself-md/.codex-plugin/plugin.json)

## Prioritized experiences

These are proposals, with existing primitives identified rather than new capabilities implied.

| Priority | Experience and example prompt                                                          | Implementation direction                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Weekly attention reflection:** “Compare my Screen Time this week with last week.”    | Discover permitted sources; list and read shared exports, paginate fully, compare matching periods and units. Explain missing coverage. Return observations and one user-chosen experiment, without claiming causation.                       |
| 2        | **Personal-data availability check:** “What can you actually see about me?”            | Turn catalog, phone and profile discovery into a clear inventory of readable data, dates and missing permissions. Make an offline shared export the first useful path when available.                                                         |
| 3        | **Bring my data to another AI:** “Prepare my approved records for my other assistant.” | Use schemas and owner-reviewed exports. Distinguish file delivery from permission to read it; retain request IDs and completion receipts. A format-aware viewer or reusable client examples could support portability.                        |
| 4        | **Activity and sleep reflection:** “Show my recent activity pattern.”                  | Consider descriptive, nonclinical summaries only after establishing data eligibility, consent and platform review requirements. Nonclinical wording alone does not resolve eligibility.                                                       |
| 5        | **Builder integrations:** “Use my approved data in my personal planning agent.”        | Publish a small integration guide using the existing MCP endpoint, OAuth, bounded queries, pagination and structured outputs. Pilot with independent productivity or journaling builders; each new recipient needs appropriate authorization. |

The underlying discovery, pagination, aggregation, offline-read and export workflows are documented in the current [ChatGPT source guide](../server/chatgpt-tools.js). Client-specific visual experiences and partner distribution remain proposed work.

## ChatGPT presentation and distribution

A proposed inline comparison card should show period, timezone, source, freshness and completeness alongside a simple chart. Allow period changes through the same authorized application logic. The inspected server/package currently provides tools rather than a registered embedded widget.

OpenAI now documents extensions for sidebar apps, conversation panels, settings and file viewers. Availability varies: its guide says web extensions are coming soon for Free/Go and composer mentions are desktop-only. Treat these as optional experiments, not launch dependencies. [Extensions guide](https://developers.openai.com/plugins/build/extensions)

Preserve the active review while preparing a focused demo and clearer prompt examples. Submission permits one active review; approval and publication are separate steps. Change a submission only for a concrete correction or deliberate release decision. [Submission workflow](https://developers.openai.com/plugins/deploy/submission)

## Constraints and next evidence

OAuth connects an existing account; phone ownership, selected grants and OS permissions still govern access. Offline exports improve availability but cannot manufacture missing data. Native requests must expose accepted, awaiting-user, running and terminal outcomes; completion needs the effect's receipt. [Current implementation](../server/chatgpt-tools.js)

The directory-readiness note identifies mobile store distribution as coming soon. Verify a reliable installation path and complete real-phone capture before promising effortless consumer onboarding. Existing fictional offline reviewer scenarios prove a narrower workflow. [Readiness evidence](mcp-listing-readiness.md)

OpenAI prohibits processing PHI and imposes consent/minimization conditions on other sensitive data. Existing paid-account access is allowed; selling subscriptions or promoting upgrades inside the plugin is not. Trial/demo-only plugins are ineligible. Health eligibility remains unresolved by this research. [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)

Next, run a small owner-authorized pilot around the first two experiences. Define activation as the first complete, evidence-backed answer. Measure setup drop-off, account-link completion, time to that answer, complete-period comparisons, offline success and repeat usage using consented, minimized analytics. Test missing grants, partial records, offline phones and revoked sharing. Use those results to choose whether a chart improves decisions before expanding the tool surface.
