# Claude and MCP Registry submission packet

Updated October 17, 2026. **The official MCP Registry listing `md.myself/mcp` version `1.0.0` is published. Claude is submitted and In review.** Production metadata, isolated reviewer login, live MCP OAuth/refresh checks and the Claude cloud-read scenario passed. The correct Pro publisher account submitted the listing; the portal confirms receipt and In review. The historical October 14 set of 43 tools was invoked through the official MCP Inspector CLI; current portal capture is 40 tools, positive native, destructive and external-delivery effects remain explicitly unverified. All seven policy acknowledgments were accepted with explicit owner authorization. Credentials stay private.

Source scope update (15 October): mobile is Profiles/Settings only; Support, Logs/history, diagnostics viewer and Gripe are removed. Debug reads retain raw errors/metadata behind one phone Settings consent toggle, without record/credential/URL attachments. `request_phone_debug_content`, feedback tools and legacy Discord support APIs/tools are removed. Isobot `support_conversations` and dashboard Support remain with web dashboard owner approvals; legacy deletion cleanup remains. October 14 counts/scans/submission receipts below are historical deployment evidence, not this cut's live inventory or verification.

## Claude listing

Copy the fields from [listing.json](../distribution/claude/listing.json) into [Claude's developer portal](https://claude.ai/directory/manage), choosing MCP connector. This JSON is our worksheet, not a Claude upload format. The portal draft uses the recommended server favicon; the [1024px PNG icon](../distribution/claude/icon.png) remains an optional asset. The draft lists myself.md, slug myself-md, Productivity and Cody Bontecou. This connector returns ordinary MCP tool results, not an MCP App UI; no screenshot carousel is prepared.

The worksheet includes connection/authentication URLs, bounded listing copy, primary use cases, installation and allowance requirements, support contact, and an affirmative health-data disclosure. Private access requires the account owner's OAuth consent and data grants. Public web examples do not substitute for a populated authenticated reviewer account. Owner-authorized policy acceptance and submission completed October 14. [Claude submission requirements](https://claude.com/docs/connectors/building/submission)

## Metadata audit

Current account/data/cloud/diagnostics/Isobot support registrations retain matching human-readable titles and explicit `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`. Feedback and legacy Discord registrations are removed from source; historical metadata scans below predate that removal.

Claude requires a title and a read or modifying hint. Its checklist uses `destructiveHint: true` for modifying tools, so additive operations also use that confirmation hint. These hints guide client permissions; they do not authorize anything at the server. [Claude review criteria](https://claude.com/docs/connectors/building/review-criteria)

| Operations                                                                                               | Metadata and rationale                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public catalog/docs/privacy, owned inventories, history, diagnostics, import previews and result polling | Read-only. These return authorized state; normal cache, expiry and audit bookkeeping does not initiate a new owner action.                                                                                                                                                                                                                                  |
| Profile permission, account-login/deletion and debug-sharing handoffs                                    | Read-only owner instructions/links; no tool changes the phone Settings consent toggle or grants itself access. Debug-content handoffs are removed.                                                                                                                                                                                                          |
| `query_phone_data`                                                                                       | Modifying, non-idempotent globally. Creates a live job and activity entry, reserves allowance and consumes it on successful capture. A supplied `requestKey` supports exact retries; it is optional, so the tool cannot advertise universal idempotency. Native records are unchanged.                                                                      |
| `read_cloud_export`                                                                                      | Modifying, non-idempotent. Each successful page consumes allowance and records access. Stored records are unchanged.                                                                                                                                                                                                                                        |
| `create_phone_pairing`, `create_phone_export_profile`                                                    | Modifying, non-idempotent. Pairing creates a ticket; a profile proposal can enqueue owner review when a device is supplied. Neither grants data access.                                                                                                                                                                                                     |
| `delete_account`, `disconnect_phone`, `forget_phone_request`                                             | Modifying and idempotent for the same target, subject to validation and ownership.                                                                                                                                                                                                                                                                          |
| `delete_cloud_export`                                                                                    | Modifying, conservatively non-idempotent. A repeat after successful deletion can return not-found; no successful-retry guarantee is advertised.                                                                                                                                                                                                             |
| `support_conversations`                                                                                  | Conservatively modifying, open-world and non-idempotent for its entire typed action surface. Includes support creation, sending, requests and acknowledgments; list/read actions are not advertised as automatic safe reads. It accepts no arbitrary URLs or HTTP methods. It remains a compatibility operation, rather than becoming a generic HTTP proxy. |

Debug descriptions must disclose sensitive raw errors even though record, credential and URL attachment capture is removed. `get_phone_debug_logs`, `request_phone_debug_access` and `list_phone_logs` remain; owner consent lives in Settings. `support_conversations` owner approvals use web dashboard Support, not a mobile route. Earlier verification below covers the deployed release at its recorded date.

## Completed local verification

- `npm run format` and `npm run check`: passed.
- `npm run verify:mcp-metadata`: passed emitted `tools/list` metadata through the real authenticated SDK transport, existing phone/cloud ownership, billing and retry fixtures, plus both support implementations. Discord is simulated; no live messages sent.
- `npm run verify:worker`: passed real workerd HTTP/MCP account isolation, quotas, concurrent reservations and persistence; metadata checks also run on its emitted tool list.
- Registry manifest: official draft-07 JSON schema validation passed.
- Claude listing text: within the portal's published lengths; existing icon copied unchanged.

These are synthetic integration results. They do not establish live Claude consent, token refresh, every native permission, every tool's production availability, or completed Anthropic review. The live Claude cloud scenario subsequently passed. The portal now records Inspector self-testing; private instructions and additional notes disclose negative-case coverage and untested live positive effects.

## Reviewer setup and verification

Both personal Google accounts are excluded from reviewer access. The [reviewer-only login](reviewer-login.md) uses the reserved app identity `myselfmd-directory-reviewer-v1`, with no social-provider links. A private local provisioning package supplies a random password and 12 fictional exports (8 shared, 4 private). Public signup is disabled. Production provisioning and deployment are complete; live browser login and an independent MCP verification client passed. The Claude custom connector passed its four-tool fictional-data scenario; [reviewer instructions](../distribution/claude/reviewer-instructions.md) and the [tool-test ledger](../distribution/claude/tool-test-ledger.md) record the exact scope. No personal account data or credentials have been shared with reviewers.

1. Provision the reserved account using the [reviewer setup guide](reviewer-login.md), enable its login, and supply credentials privately through Claude's reviewer fields. The fixtures cover cloud export review; their offline fictional source cannot complete live phone/native scenarios.
2. Keep an owned phone foreground/online for live query tests. Approve only the fictional test profile and its selected types; separately enable cloud sharing, logs and support as needed for the corresponding cases. Feedback tools require a configured iOS Debug build; ordinary builds report them unavailable. Do not attest that every tool succeeds until these prerequisites have been exercised or the public tool surface adjusted.
3. Deploy the checked and reviewed source to the production Worker using the normal release workflow. No native rebuild is needed for titles/hints. Reconnect the reviewer client after deployment so it discovers the new metadata.
4. Use a reviewer-issued **agent** OAuth token to run `npm run mcp:review`. The command discovers all tool-list pages, checks titles and explicit hints, and outputs only names/titles/annotations. It omits schemas because account-bound literals can expose the account subject. Use an ignored environment file under `.local/` or an existing secure environment for the token; do not put it in command arguments or Git.
5. Complete OAuth in MCP Inspector and a Claude custom connector at `https://myself.md/mcp`. Verify callback, consent, initial token exchange, refresh after expiry, reconnect and revoked access. Our local token fixtures do not prove this OAuth lifecycle.
6. Exercise every emitted tool with valid reviewer inputs. For destructive cases, use disposable test accounts/exports, obtain explicit confirmation, and repopulate/reconnect afterward. Record actual results and failures in a private review ledger; do not store returned personal records, tokens, diagnostics secrets or reviewer credentials in the public packet.

Suggested workflow cases:

| Prompt/scenario                                          | Expected result                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Which datasets and approved profiles are available?      | Public catalog pagination and owned phone/catalog discovery; no cross-account data.                                 |
| Show my approved screen-time data for yesterday.         | Allowed type/profile and bounded interval; query accepted, then poll until complete. No summary from a queued job.  |
| Read my latest shared export while the phone is offline. | Explicitly shared cloud export; bounded paginated records and normal allowance/history effects.                     |
| Propose an export profile.                               | Validated proposal/share links and optional phone delivery; no saved profile, grant or schedule until owner action. |
| Read logs without diagnostics consent.                   | Owner handoff or denied/unavailable state, no private report.                                                       |
| Read another account's device/export.                    | Denied or not found, no unrelated account metadata.                                                                 |
| Retry an identical keyed phone query.                    | Same live request, no duplicate billing; changed arguments with that key fail.                                      |
| Revoke sharing and retry.                                | Future reads denied, retained copies not falsely claimed deleted.                                                   |
| Request support and repeat its message ID.               | Explicitly authorized delivery with no duplicate message; a pending queue is not staff acknowledgement.             |
| Disconnect or delete a disposable target.                | Confirmation plus actual effect and status; retries and permanent-account cleanup verified.                         |

## Official MCP Registry

The [manifest](../distribution/mcp/server.json) is remote-only, uses `md.myself/mcp`, version `1.0.0`, and matches the public server card's description and endpoint. No npm package is required for this remote entry. DNS authentication proves the reversed-domain namespace; an authenticated user connection still uses OAuth. [Registry authentication](https://modelcontextprotocol.io/registry/authentication)

Prepared local materials:

- [DNS proof record](../distribution/mcp/dns-proof.txt): the public Ed25519 key to add as a TXT record at the `myself.md` zone apex. Preserve existing TXT records.
- `.local/mcp-registry/key.pem`: ignored private signing key, permission 0600, within a 0700 directory. Retain it securely for future Registry versions; do not upload it with listing materials.
- `.local/mcp-registry/mcp-publisher`: official v1.8.1 macOS ARM64 binary, checked against its published SHA-256. This local tooling is not a repository dependency. [Official release](https://github.com/modelcontextprotocol/registry/releases/tag/v1.8.1)

The apex TXT proof was installed in Cloudflare and matched through public DNS on October 13, 2026. Existing records were preserved. The official publisher authenticated using the retained Ed25519 key and published `md.myself/mcp` version `1.0.0` at `https://myself.md/mcp`. The publisher reported success; compare the recorded public API entry below.

An anonymous pre-publication search on October 13 returned no exact match. The manifest passed the official publisher's `validate` command before publication.

For future releases, authenticate afresh with `.local/mcp-registry/login-dns.mjs`; the publisher token is short-lived. The helper reads the private key without printing it. The official CLI stores its token in `~/.config/mcp-publisher/token.json` (mode 0600), rather than the working directory. Keep the signing key under ignored `.local/mcp-registry`. [Publisher credential storage](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/cli/commands.md). Update the manifest version before publishing another release. The completed publication command was:

```sh
cd /Users/codybontecou/dev/myself.md/.local/mcp-registry
./mcp-publisher publish /Users/codybontecou/dev/myself.md/distribution/mcp/server.json
```

Only run that command when publication is intended. Verify the response, then read the [Registry search API](https://registry.modelcontextprotocol.io/v0.1/servers?search=md.myself%2Fmcp) and compare the exact name, version and remote URL. Record the returned listing/version and date after success. [Official publishing quickstart](https://modelcontextprotocol.io/registry/quickstart)

## Remaining submission gates

| Gate                                                        | Current state                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Titles/annotations and local integration checks             | Completed in source                                                                        |
| Production metadata release and authenticated scan          | Deployed; all 43 emitted tools passed live metadata scan                                   |
| Populated reviewer account and private sign-in instructions | Provisioned live; browser login, MCP OAuth/refresh and fictional reads verified            |
| Every emitted tool invoked in Inspector; four in Claude     | 43 tools / 47 calls recorded; live positive native/destructive/delivery effects unverified |
| Claude publisher/category/slug and acknowledgments          | Submitted; seven policies acknowledged; In review confirmed                                |
| Registry namespace DNS proof and login                      | Installed, public DNS verified and authenticated                                           |
| Registry publication/API confirmation                       | Published version 1.0.0; public API verification recorded                                  |

OpenAI's product-terms/PHI policy questions remain in the [broader readiness document](mcp-listing-readiness.md); this packet does not assert those as Claude or Registry blockers.

## Live Claude connection result

Claude registered automatically and completed its real callback/consent flow. The active grant was checked against the reserved reviewer ID before data reads. An initial connection used an existing browser identity; it was disconnected, its new refresh grant/consent revoked, and no account data was read through it. Reconnecting after the reviewer-only password form established the correct identity. Use a fresh browser session for independent review.

Claude initially exposed an MCP-only-scope error in `get_account_profile`. The tested fix now returns null fields without OIDC profile/email scopes, preserving consent limits. Worker version `e2384822-5d4a-4770-bcd2-d95ffa389610` contains that fix. The real Claude conversation then passed profile, connected-logins, shared-export listing and two export-page reads. It confirmed the reviewer subject, unavailable social linking, 8 shared files, 50+22 records and fictional markers. Screenshots and the private reviewer credential packet remain under ignored `.local/`. Neither personal account's data was used in the scenario.

The October 13 paid-plan block came from the wrong Claude account. On October 14, the owner identified the existing Pro account; its email and Pro plan were verified in Claude, and the developer portal showed **Submissions** and **Submit new** with no plan gate. The submitted listing includes listing copy, three use cases, OAuth/DCR, health disclosure, private reviewer credentials and instructions, Inspector self-testing, and explicit coverage limitations. After explicit owner authorization, all seven policies were acknowledged and submission succeeded. Claude confirmed **Server submitted for review** and **Your MCP server has been received**. The saved listing confirms **In review**, **Submitted (done)** and **Live (not yet)**. An advisory notes that review updates go to the prepared business address cody@isolated.tech, which differs from the Pro login domain. The myself.md reviewer identity remains separate from the Claude publisher login.

## October 14 Inspector and portal verification

The [43-tool ledger](../distribution/claude/tool-test-ledger.md) records 47 Inspector calls. Successful reads, paginated fictional data, proposals and owner handoffs passed; offline, consent, not-found and invalid-confirmation cases returned truthful refusals. No support message was delivered, no persistent reviewer data was deleted, and no native capture is claimed. Positive effects needing an online isolated phone or disposable destructive/delivery targets remain disclosed limitations.

The portal scan exposed missing annotation display names and a redirect at the standard issuer-path OAuth discovery URL. Worker f9cadf9f-1ac7-48fd-94c0-6ca66775fd95 fixes both: every live tool has matching titles in both locations, and hosted discovery serves JSON directly with HTTP 200. Claude refreshed the 43-tool list with no title suggestions and detected protected-resource metadata, provider discovery and DCR successfully. Formatting, aggregate static checks, authenticated metadata integration and real workerd identity verification passed.

## Submission receipt — October 14, 2026

[Claude listing tracker](https://claude.ai/directory/manage/myself-md) confirms **In review** for myself.md, slug myself-md, with 43 tools, OAuth authentication, Productivity category and Cody Bontecou as publisher. Submission is received; directory publication and approval have not happened. Review updates go to cody@isolated.tech. All seven policy acknowledgments were accepted with owner authorization; the disclosed test limitations remain in the submitted notes. Private receipt text and screenshot are retained under ignored .local/claude-submission/.

## October 16 current-source reconciliation

Authenticated production discovery confirms **37 full tools**, exactly matching Node/workerd metadata; the separate ChatGPT endpoint retains **13**. [Reconciliation ledger](mcp-tool-reconciliation.md) and [sanitized inventory](../distribution/mcp/tool-inventory.json) list the nine removals and three additions. Local Claude copy and reviewer instructions now describe errors/metadata-only diagnostics, dashboard Support approvals and owner-reviewed schedule changes. Historical invocation results retain their October 14 date. The initial audit found the old 43-tool capture in the Tools tab; the subsequent owner-authorized revision used Sync from server in the full editor, saved the 37-tool capture and updated copy, and verified In review was preserved. No review was cancelled or resubmitted. Registry v1.0.0 still accurately describes the service and contains no tool inventory, so it was not republished.

## Claude portal revision — October 16, 2026

The owner authorized directory-side refresh and current review copy while preserving pending reviews. The full editor exposed **Sync from server** (37 tools) and explicitly stated that saved edits remain in the current review without resubmission. Saved the current description, reviewer instructions (private credentials unchanged), prerequisites, additional notes and fresh tool/annotation capture through **Save and update submission**. The overview now confirms **Tools · 37**, **In review** and the updated description. Original October 14 discovery/invocation counts remain historical. No review was cancelled, resubmitted or newly attested. Private receipt text and screenshot are under .local/listing-reconciliation/portals/.

## Claude portal revision — October 17, 2026

The owner requested the current 39-tool refresh with the pending review preserved. The live inventory had advanced to **40**: `manage_phone_profiles` was added after the two analytics-preference tools. Fresh production discovery verified the reserved reviewer subject and resource audience and returned 40 tools (28 read-only, 12 modifying), without invoking tools or reading records. Claude’s live probe independently returned the same 40 names.

Used **Sync from server** to refresh tool names and annotation capture, then updated the private reviewer setup and Additional notes. Notes explain explicit analytics opt-in/erasure and the profile suggestion → dashboard owner approval → phone confirmation workflow. Existing historical test limitations and private credentials were retained; no new all-tool effects claim was made. Saved with **Save and update submission**; Claude confirmed **Saved. Reviewers see what’s on this page.** The reloaded overview confirms **Tools · 40**, including all three additions, **Submitted (done)**, **In review (current)** and **Live (not yet)**. No review was cancelled or resubmitted; no new policy acknowledgments were accepted. Proof is under ignored `.local/listing-reconciliation/portals/claude-40-in-review-2026-10-17.txt` and `.png`. The earlier 37-tool Node/workerd comparison and October 14 invocation ledger remain historical; the additions were not freshly exercised for every positive effect in this refresh.
