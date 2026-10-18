# myself.md directory readiness

Updated October 17, 2026. **The official MCP Registry entry is published; OpenAI version 1.0.0 is in review; Claude is submitted and In review in the Pro publisher account.**

Latest Claude refresh (17 October): **40 full tools** are confirmed by reviewer-authenticated production discovery and Claude. Sync from server refreshed the tool/annotation capture and saved reviewer notes; the overview confirms Tools 40 and In review, without resubmission or new acknowledgments. `manage_phone_profiles` accounts for the increase after the earlier 39-tool scan.

Earlier directory rerun (16 October): **production and Smithery now confirm 39 tools**, including two newly deployed analytics-preference tools. Smithery Publish succeeded in 10 seconds; public Tools 39 and 86/100 are verified under the isolated reviewer grant. Glama remains disconnected after a non-reviewer OAuth identity was detected; its reviewer-only scan is blocked. Claude then remained In review with 37 tools; the October 17 refresh above supersedes that snapshot.

Earlier reconciliation (16 October, before the analytics deployment): authenticated production discovery confirms **37 full tools** and **13 restricted ChatGPT tools**. Full metadata matches the current Node and workerd fixtures. The 43-tool scans remain historical; Claude now stores the refreshed 37-tool snapshot while remaining In review. [Current inventory, tests and platform follow-ups](mcp-tool-reconciliation.md). No new approval, resubmission or phone-native success is claimed.

Start with Claude and the official MCP Registry, then pursue ChatGPT/Codex with the separate restricted endpoint described below. Smithery and Glama provide additional discovery. This order is our recommendation. [Other directory requirements and submission links](mcp-directory-research.md) cover each separate route.

Claude/Registry implementation progress: tool titles and explicit annotations are corrected in source, authenticated Node/support/workerd fixtures passed, Claude listing copy/icon and Registry DNS proof are prepared. [The submission packet](mcp-claude-registry-submission.md) is the current ledger for those two channels. Production metadata and reviewer access are deployed. Live reviewer browser login and MCP OAuth/refresh/data reads pass; the live Claude cloud scenario passed and the official Registry listing is published. The correct Pro publisher account has portal access; the historical 43-tool release was exercised through Inspector and the current 40-tool capture is saved in Claude; the portal confirms receipt and In review, with positive native/destructive/delivery limitations disclosed.

## Materials prepared

- [OpenAI package manifest](../distribution/openai/myself-md/.codex-plugin/plugin.json): listing copy, existing app icon, three starter prompts, five positive and three negative reviewer scenarios.
- [OpenAI MCP configuration](../distribution/openai/myself-md/.mcp.json): the production endpoint, with no embedded credentials.
- [Official Registry manifest](../distribution/mcp/server.json): a remote-only entry using our domain namespace.

The OpenAI manifest includes the deployed terms page, restricted `/mcp/chatgpt` endpoint, five positive and three final negative cases, and an accessible walkthrough. The verified individual identity was selected in Isotech's portal. All-supported-country availability and isolated reviewer credentials are saved in private review details. All eight final scenarios passed using fictional records and an explicitly offline source. The owner approved the six final attestations and the submitted version is **In review**, not published. [OpenAI submission ledger](../distribution/openai/README.md).

Validation: the Registry manifest passed the official draft-07 JSON schema through Ajv. OpenAI's revised ZIP uploaded successfully, domain proof verified, and authenticated discovery returned all thirteen allowed tools. Metadata checks report no findings; three data tools require further OpenAI review. Repository formatting and aggregate static checks passed. These checks do not establish public-directory approval.

Build the draft ZIP after formatting, preserving dotfiles:

```sh
cd distribution/openai/myself-md
zip -r /private/tmp/myself-md-openai-draft.zip .codex-plugin .mcp.json assets
```

## Production checks

Unauthenticated public checks against `https://myself.md` on October 12, 2026:

| Endpoint                                    | Observed result                                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/health`                                   | HTTP 200, `ok: true`, Cloudflare platform                                                                       |
| `/mcp`                                      | HTTP 401, `WWW-Authenticate` points to protected-resource metadata                                              |
| `/.well-known/oauth-protected-resource/mcp` | Resource is `https://myself.md/mcp`; scope is `myselfmd`                                                        |
| `/.well-known/oauth-authorization-server`   | Discovery resolves to issuer `https://myself.md/auth/realms/myselfmd`                                           |
| OAuth metadata                              | S256 PKCE, registration endpoint, authorization-code and refresh-token grants, issuer identification advertised |
| `/mcp/server-card`                          | Public `md.myself/mcp` card, version 1.0.0, Streamable HTTP remote                                              |
| `/terms`                                    | HTTP 200 after October 13 deployment                                                                            |

These checks establish public discovery, not successful account linking, token exchange, refresh, tool scanning or data access. Live OAuth, account isolation and fictional export effects were separately verified through the server APIs and actual directory clients; see the submission ledgers. The current Worker DCR callback allowlist includes `chatgpt.com`, `claude.ai` and loopback hosts; do not broaden it without a verified client requirement. OpenAI supports CIMD, DCR or predefined clients and requires the production callback shown in its dashboard. [OpenAI authentication](https://developers.openai.com/plugins/build/auth)

## ChatGPT and Codex

Use the [Plugins portal](https://platform.openai.com/plugins) to upload the draft ZIP and configure its remote server. Individual/business verification, domain verification, authenticated scanning and reviewer materials remain required. The portal requires a working website, support, privacy and terms URL, executed positive/negative cases, and an accessible walkthrough video. Credentials go into private review fields. [Submission workflow](https://developers.openai.com/plugins/deploy/submission)

On October 13, Isotech developer verification completed. The ZIP is uploaded as an OpenAI draft, domain verification succeeded, and authenticated discovery returns thirteen restricted tools. Dedicated reviewer credentials are saved privately. Five positive and three final negative ChatGPT cases passed using the fictional identity; the walkthrough is hosted with owner approval and the six final attestations were approved and accepted. The portal confirms **In review**, **Not published**, and **Configured**. [OpenAI submission ledger](../distribution/openai/README.md).

Portal access, the verified individual publisher, domain ownership and authenticated tool discovery are established. Approval and publication are separate steps. [Remote MCP review requirements](https://developers.openai.com/plugins/deploy/app-review)

Policy considerations for public review:

1. OpenAI prohibits collecting or processing PHI, and sets conditions for other sensitive personal data. Our health-data capabilities need an eligibility assessment; this document does not classify every HealthKit/Health Connect record as PHI or claim eligibility. Disclose the actual data and grants rather than relabeling the service to avoid review.
2. The full endpoint can expose separately consented diagnostics. ChatGPT excludes every diagnostics registration, credential-bearing catalog/feedback fields and export destination settings, and replaces raw phone failures. Runtime tests cover the credential and error boundaries.
3. ChatGPT excludes purchase tools and handoffs and serves documentation without digital-upgrade offers. Existing verified access still applies; the plugin initiates no purchase. The full endpoint retains separate capabilities.
4. Trial/demo-only plugins are ineligible. Our website currently says mobile store distribution is coming soon; demonstrate a functioning installation and complete owner-approved data workflow for reviewers.

[OpenAI plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)

## Remaining directory work

1. Await OpenAI review of the submitted package and three flagged data tools, then resolve any concrete reviewer findings. Do not weaken annotations or capability boundaries to avoid review. Approval and public publication are separate states.
2. Claude was submitted October 14; its portal confirms In review and Live (not yet). Track review updates at cody@isolated.tech and the [listing status](https://claude.ai/directory/manage/myself-md). Keep the isolated reviewer identity and fictional fixtures; both personal Google accounts remain excluded.
3. Complete live-phone capture integration evidence where required. The fictional reviewer source is offline; the passed cloud scenarios do not establish native capture or OS permission completion.
4. Smithery’s authenticated release scan is published successfully with 43 tools and an 86/100 quality score; its TXT ownership proof and homepage backlink pass verification. The badge remains unconfirmed because the owning Personal workspace still reports Hobby — Free; the owner has reported an upgrade and is identifying the paid workspace. Glama ownership, publisher profile, fictional reviewer OAuth with refresh, 43-tool discovery and a public Healthy status are verified. A post-expiry check passed after one transient renewal 401; uninterrupted scheduled health remains unverified. Smithery Gateway approval and renewable fictional reviewer consent are established; its optional resources/prompts scan warnings do not block the successful tool listing. [Directory ledger](mcp-smithery-glama-submission.md). Listing metadata does not authorize forwarding private records through a new intermediary.

The separate ChatGPT endpoint, terms/privacy disclosures and domain proof are deployed. The complete OpenAI package is submitted, private reviewer access is saved, and the eight final client scenarios pass. The approved walkthrough is hosted; the portal confirms version 1.0.0 is in review. Existing Claude/Registry behavior remains available.

## October 16 reconciliation

Listing copy and reviewer instructions now describe retained error-only diagnostics, web dashboard Support approvals and owner-reviewed automatic-export schedules. Earlier full/ChatGPT scans passed at 37/13 tools. Claude’s portal now confirms a refreshed 37-tool snapshot and updated review copy, with In review preserved. Publisher sign-ins are restored; Smithery’s refresh release timed out awaiting OAuth (latest displayed score 60/100), and Glama’s test profile is disconnected; both need verified reviewer OAuth completion. Pending reviews were preserved. [Reconciliation ledger](mcp-tool-reconciliation.md).
