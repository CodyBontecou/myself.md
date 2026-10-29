# myself.md directory rollout — October 24, 2026

Canonical full endpoint: https://myself.md/mcp. Publisher Isotech; review contact cody@isolated.tech. OpenAI uses the separately restricted https://myself.md/mcp/chatgpt resource; do not replace it with the full endpoint.

## New distribution

| Destination          | Result                                                                                      | Reference                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| punkpeye remote list | PR opened; check-submission passed                                                          | https://github.com/punkpeye/awesome-remote-mcp-servers/pull/2842                |
| jaw9c remote list    | PR opened                                                                                   | https://github.com/jaw9c/awesome-remote-mcp-servers/pull/1641                   |
| Cline marketplace    | Issue submitted; autonomous-install checkbox explicitly unchecked                           | https://github.com/cline/mcp-marketplace/issues/3256                            |
| Gemini CLI gallery   | Public extension installed and validated; topic set for daily crawler, indexing unconfirmed | https://github.com/CodyBontecou/myself-md-gemini                                |
| Claude plugin bundle | Submitted v1.0.0; awaiting security scan, not published                                     | https://claude.ai/directory/manage/plugins/c4fb14c5-fc18-404b-b99f-5622509a5547 |
| Muse                 | Submitted; review pending                                                                   | https://platform.muse.ai/submissions/be4e99d2-3a7d-4545-ad85-bdaddb7dd641       |

Package commits: Cline 46af5e3; Gemini 4d4a65c; Claude Code 9516ba1. Each contains public configuration/documentation/assets only, no server source, tokens or reviewer credentials. MIT configuration package licensing follows the existing owner-approved Cursor package; hosted app source remains AGPL-3.0.

## Existing submissions preserved

- Official MCP Registry: md.myself/mcp 1.0.0 active, freshly verified via public Registry API. Canonical endpoint matches.
- OpenAI: existing 1.0.0 in review, not published; https://platform.openai.com/plugins/manage/plugin_asdk_app_6ace8a6187e48191bb4df566e36efc41 . No duplicate or package change.
- Claude connector: live portal confirms In review at https://claude.ai/directory/manage/myself-md . Captured tool count remains 40; no sync or pending submission change performed.
- Grok Bot: October 16 receipt recorded in docs/mcp-community-submissions.md; https://x.ai/bot/marketplace/submit-a-plugin . Bot-only original submission; ordinary Grok directory approval is not established.
- Cursor: October 16 receipt recorded in docs/mcp-community-submissions.md; https://github.com/CodyBontecou/myself-md-cursor-plugin . No duplicate.
- Smithery: existing successful release recorded in docs/mcp-smithery-glama-submission.md, https://smithery.ai/servers/cody-82px/myself-md . URL returned 200 today; current client-rendered quality/tool count not reverified.
- MCPServers.org: prior publication https://mcpservers.org/servers/myself-md-docs .
- MCP.Directory: October 16 import/ownership inquiry already sent; no new email.

## Glama restored

Existing claimed https://glama.ai/mcp/connectors/md.myself/mcp had missing OAuth credentials. Under explicit owner approval, authenticated its existing integration against the fictional reviewer. Narrow identity database metadata checks confirm the latest Glama grants belong to myselfmd-directory-reviewer-v1, scopes myselfmd offline_access, without retrieving or exposing token values. Test Connection reports Healthy, 4545ms, October 24 at 17:50:31 America/Puerto_Rico. No personal account or sharing grants modified.

## Validation limits and evidence

- Cline CLI 3.0.73 / @cline/core 0.0.95 official shared core: actual OAuth/DCR, verified reviewer subject and resource audience, 65-tool discovery, list_cloud_exports limit 1 and read_cloud_export limit 1 with fictional fixture markers. Autonomous model-driven install/execution not tested.
- Gemini CLI 0.65.0: official extension validator and public Git install pass. Official OAuth helpers complete PKCE/DCR/issuer verification and yield renewable reviewer token. Official Gemini MCP transport discovers 65 tools and performs the same bounded fictional export read. No Gemini model-driven execution.
- Claude Code 2.1.310: official plugin validation and isolated install pass; actual mcp login succeeds with reviewer OAuth and mcp get reports Connected. No model-driven tool execution claimed.
- All testing confined to existing fictional reviewer account under explicit owner authorization. Existing myselfmd scope includes modifying tools; tests were discovery and bounded reads only. No personal account reads, deletion, support messages or phone-setting changes.
- Broad OAuth scopes are disclosed; Gemini includeTools and Claude skill instructions do not reduce server-token capability.
- Claude plugin form: auto-publish off, scheduled branch checks selected. The owner explicitly authorized both final agreements; all four Claude and three Muse acknowledgements were accepted and both submissions confirmed on October 24. Claude reports security scan current, In review and Live not yet; Muse confirms it will review myself.md and get in touch. No publication approval is claimed.

Sanitized evidence and screenshots are retained alongside this document. OAuth state and token files are intentionally excluded.
