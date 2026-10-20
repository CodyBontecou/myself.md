# Smithery and Glama listing ledger

Updated October 16, 2026. Glama's public listing is ownership-verified and its authenticated test passed with 43 tools. Renewable reviewer authorization and a successful health check beyond the original token expiry are verified, with one transient renewal failure recorded below. Smithery’s historical successful release scanned 43 tools at 86/100. The latest authorized refresh timed out awaiting OAuth and the portal now shows 60/100; the current 37-tool scan is not complete.

Current reconciliation (16 October): the authenticated upstream exposes **37 tools**, and its sanitized metadata matches Node and workerd fixtures. Feedback/debug-content and legacy Discord tools are removed; public blog and automatic-export schedule tools are added. Current inventory (local-only: `.local/reports/mcp-tool-reconciliation.md`). The 43-tool scans, platform health and Smithery 86/100 score below remain dated platform evidence; no fresh Smithery/Glama release scan or quality score is claimed.

## Listing materials

| Field             | Value                                                               |
| ----------------- | ------------------------------------------------------------------- |
| Name              | myself.md                                                           |
| Registry identity | `md.myself/mcp`, version `1.0.0`                                    |
| Description       | Owner-approved health, screen time and location data for AI agents. |
| Remote            | `https://myself.md/mcp`                                             |
| Transport         | Streamable HTTP                                                     |
| Authentication    | OAuth with S256 PKCE and account consent                            |
| Website           | `https://myself.md`                                                 |
| Privacy           | `https://myself.md/privacy`                                         |
| Terms             | `https://myself.md/terms`                                           |
| Support           | `cody@isolated.tech`                                                |

Expanded copy:

> Connect AI agents to the health, screen-time and recorded location data you choose to share from myself.md. Discover available data and schemas, query connected phones, and read paginated cloud exports as JSON or JSONL. Phone requests depend on device connectivity, OS permissions and the owner's data grants. Cloud reads require existing storage access. Owners control sharing and can revoke access; revocation does not erase copies a recipient already received.

## Smithery

[Publisher workflow](https://smithery.ai/new); [publishing requirements](https://smithery.ai/docs/build/publish).

The owner completed publisher sign-in and explicitly approved publishing through Smithery Gateway, including its OAuth credential handling and request/result logging. The production remote URL is `https://myself.md/mcp`, namespace `cody-82px`, server ID `myself-md`. No static secret parameters are required; OAuth supplies account authorization.

On October 14, the fresh release completed **SUCCESS** in 4m 55s. Release logs at displayed 09:06:37 retrieved server name `myself.md`, version `1.0.0`; at 09:06:40 they discovered **43 tools**. The public listing https://smithery.ai/servers/cody-82px/myself-md displays all 43 tools and a **72/100** quality score. This replaces the previous unverified, timed-out or cancelled attempts; those historical rows remain visible.

The first resumed scan requested authorization again. The controlled setup flow explicitly signed in through the isolated reviewer form, preserving the signed OAuth request. Identity metadata verifies client `zkGjPZoLJqcpgHJzEYleXHdCrNQpulUZ` has consent and a refresh grant for **only** `myselfmd-directory-reviewer-v1`, scopes `myselfmd offline_access`, resource `https://myself.md/mcp`. No personal Google account was used. The scan succeeded after the next resume. Client `cFXyzDOKZvHVvODQHcMrtahBVpehYphc` had consent but no observed refresh grant before the controlled flow; consent alone was not treated as scan completion.

Scan warnings are limited to no static configuration schema (none is required for this OAuth-only connection) and optional `resources/list` and `prompts/list` returning -32601. The server advertises tools, not resources or prompts. No unrelated capability was added to suppress these warnings.

The separate verification badge is **not earned**. Quality greater than 80, homepage and successful-release requirements now pass. TXT proof and the Smithery backlink are now verified. The only remaining blocker is that the owning Personal workspace still reports Hobby — Free, despite the owner reporting an upgrade; the upgraded account/workspace must be identified. These are distinct from the successful release and public listing. The Observability page reported that metrics/reliability/usage data could not load; continuous uptime is not inferred from a successful tool scan. Proof screenshots are kept under ignored `.local/smithery-verification/`.

Smithery's URL publishing route proxies through its Gateway and supports Client ID Metadata Documents. Its optional scan-card format differs from our existing Registry-style card; compatibility has not been established. GitHub publisher OAuth was cancelled because it requested unrelated write permissions for gists, stars and watched repositories.

### Quality improvement: 72 → 86

Worker `c5f9ed2d-1925-4ac6-9eb1-7345d059bf09` deploys explicit MCP parameter descriptions, including nested profile/permission inputs, discovery IDs, pagination, UTC intervals, retries and owner handoffs. MCP server info now supplies its title, description, homepage and the existing public icon at `https://myself.md/dashboard/favicon.svg` (verified 200, image/svg+xml). Validation, permissions, billing, outputs and truthful annotations are unchanged. A separate upload of the existing application PNG to Smithery's publisher icon field supplied the icon points; server-info icons alone did not update that field.

Smithery's fresh authenticated scan succeeded in **13 seconds** with **43 tools**, reusing the isolated renewable reviewer connection. Parameter-description coverage rose from **13/43** to **43/43**; score first rose to 78, then to **86/100** after the publisher icon upload. The scorecard shows full metadata/configuration UX coverage. Output schemas (0/43) and naming remain improvement opportunities; tool names were not changed and fabricated output contracts were not added to raise the score.

Validation passed: `npm run format`, aggregate `npm run check`, `npm run verify:identity` for the parameter changes and `npm run verify:mcp-metadata` for the final metadata. A production reviewer OAuth/SDK read confirmed 43 tools, complete parameter descriptions and the public server icon. No private records were read in that metadata verification.

Remaining badge actions from Settings → Verification:

- Add a separate TXT value at exact host `myself.md` (apex / `@`), preserving all other TXT records: `smithery-verification=ffd7038433c915cc6c482625a60e902f739292a6e6c47d50d94adfe41c3abd8b`.
- Publish a same-domain homepage/README/custom-page link to `https://smithery.ai/servers/cody-82px/myself-md` (or its Smithery badge URL). The checker optionally accepts a custom backlink page URL on the homepage domain.
- Upgrade this publisher workspace to a paid developer plan. No plan purchase, DNS proof or website backlink change was performed for the quality-score task.
- Re-run the verification checks after those actions. A verified badge must not be claimed while any requirement is unmet.

### TXT proof and backlink deployment

The owner explicitly authorized adding the TXT record and publishing the backlink, then reported a paid-plan upgrade and requested final badge verification. Cloudflare saved an additional apex TXT value without altering the existing MCP Registry or Glama proofs. A public resolver query (`dig +short TXT myself.md @1.1.1.1`) returned both the Smithery proof and the existing MCP Registry TXT value.

Worker `45901844-23c8-406e-8d9a-35e105d52ec0` publishes the Smithery listing URL in the homepage footer, server-rendered public navigation and shared setup documentation/agent copy. Static formatting/checks passed. Live HTTP checks verified a real homepage HTML hyperlink and the URL in setup Markdown; browser accessibility confirms **Find us on Smithery** links to the correct published listing.

Smithery's re-run explicitly reports **TXT record found on myself.md** and **Smithery link found on https://myself.md**. Release, score greater than 80 and homepage checks also pass. The badge is **not yet confirmed**: after refreshing, verification still requests a paid plan. The signed-in publisher is `cody@isolated.tech`, Personal workspace; its official `/account/billing` page reports **Hobby**, **Free**, with an **Upgrade to Pay as you Go** button. The owner has been asked which account/workspace received the upgrade. No additional subscription or transfer was initiated, and no verified badge is claimed.

## Glama

Existing imported listing: [myself.md](https://glama.ai/mcp/connectors/md.myself/mcp). Do not create a duplicate.

The owner approved and completed publisher signup as Cody Bontecou / `cody@isolated.tech`, including Glama's terms, CAPTCHA and email verification. Ownership was claimed through the owner-approved TXT record `_glama-claim.myself.md` with public value `glama_claim_TuqxguhFzzdatHR2cmODCLq8RNnzWllS`; the public listing confirms **Ownership verified**.

Saved listing materials include the expanded data/grants/connectivity/revocation description, Health & Wellness / Location Services / Workplace & Productivity categories, the existing 1024-square application icon, and private support contact `cody@isolated.tech`. Glama listing details are selected as the description source of truth. The original imported listing was reused.

OAuth registration now passes **Works in Glama**. The registered client `kqPeNOJhexsuocQMXbgtoyhhhoZrnFLj` uses `https://glama.ai/api/app/mcp/oauth/callback` and `http://localhost:6749/callback`. Its consent was verified against `myselfmd-directory-reviewer-v1` with scope `myselfmd`. Glama shows **OAuth Authenticated**. Its connection test at the displayed October 14 08:31 timestamp passed **Healthy** in 4485 ms; the public listing shows **Healthy**, **Works in Glama** and **43 tools**. The tool-quality score is still being calculated. Screenshot: `.local/glama-consent-debug/listing-healthy.jpg` (ignored local proof).

Glama initially requested no `offline_access` scope. The follow-up test at displayed 08:35 failed with HTTP 401, `Invalid or expired access token`, after the five-minute token window. Worker `fcc91914-a39e-4514-8baa-ebf5bd539a7b` now advertises the already-supported optional refresh scope in protected-resource metadata. Glama's refreshed configuration explicitly shows `myselfmd offline_access`; the owner approved the new consent. Glama displayed **Authentication Successful** and the 08:41 connection test passed **Healthy** in 5096 ms. D1 metadata confirms an unrevoked refresh grant for `myselfmd-directory-reviewer-v1` with both scopes, expiring November 13, 2026 at 07:39:22 UTC. Refresh rotation metadata confirms repeated successful renewals, preserving the `https://myself.md/mcp` resource and reviewer identity. The first test after original-token expiry at displayed 08:44 returned 401 (`OAuth sign-in required or token expired`). Reloading Glama and testing again at 08:45:50 passed **Healthy** in 3413 ms without new sign-in or consent. Another test at 08:46:56 passed Healthy in 4571 ms without reloading or reauthenticating; the public listing again confirmed Healthy, Works in Glama, ownership verified and 43 tools. Final proof: `.local/glama-consent-debug/listing-renewed-healthy.jpg`. This establishes working renewal, but the transient 401 means uninterrupted scheduled health is not established. No credentials were extracted or manually installed in Glama. No existing grant is silently widened. The aggregate check and identity runtime suite passed for this deployment.

## Consent failure and verification

The owner reported that Allow access did nothing. The production HTTP diagnostic also timed out during reviewer sign-in; public identity discovery timed out after ten seconds while `/health` and a direct identity-database `SELECT 1` succeeded. Worker `039a6457-b123-4f76-ab44-402e3c64bf28` removes authentication-instance reuse across requests while retaining awaited schema initialization. After deployment the same fictional reviewer diagnostic completed sign-in, authorization and consent with a 302 callback containing a code; public identity discovery returned 200 promptly. Glama then completed authentication and its healthy scan. Formatting, aggregate static checks and `npm run verify:identity` passed before that deployment. The local diagnostic prints no credentials, codes or tokens.

Earlier registration fixes in Worker `c860eae8-94bb-43f2-8835-957e7c3c480d` permit the verified Glama HTTPS origin, infer native application type only for omitted-type registrations containing already-allowed HTTP loopback callbacks, and normalize direct browser authorization redirects. Explicit web declarations and unsafe callbacks stay rejected. The owner-approved temporary origin-only diagnostic was removed before the production cleanup deployment.

## Data boundaries

Use only the isolated `myselfmd-directory-reviewer-v1` identity and fictional fixtures for tests. Both personal Google accounts remain excluded from reviewer access. Keep credentials in ignored local files and explicitly private test fields, never public metadata or proof URLs.

A listing or ownership claim does not authorize gateway access to personal records. Smithery proxies upstream requests; Glama Gateway logs full tool inputs and outputs and manages OAuth credentials. Verify the actual consent and account subject before scanning or reading records. Add callback support only for a verified client requirement; preserve resource/audience isolation and ownership checks. Do not disable authentication or bot protection for a scan.

Completion requires verified listing URLs, ownership and authenticated scan results. Record pending review, unhealthy checks and access blockers accurately.

Smithery public client metadata at https://connect.smithery.ai/.well-known/oauth-client confirms the exact redirect `https://connect.smithery.ai/oauth/callback`. The Worker now allows that exact URL, preserving the existing callback policy for other clients. Local workerd identity verification passes registration, required account consent, altered-callback rejection, reviewer isolation and separate resource audiences. Worker `9ed6e2fc-d1ab-4af1-9efc-df4dab632848` is deployed. Production checks pass exact callback registration (201), altered callback rejection (400), protected MCP (401), and health (200), without authorizing an account or reading records. Gateway approval, isolated renewable reviewer authorization and the successful 43-tool Smithery release scan are now established.

## October 16 scan reconciliation

Use the 37-tool current upstream inventory (local-only: `.local/reports/distribution/mcp/tool-inventory.json`) for new scans. Retained logs contain consented errors/metadata only, approved in phone Settings. Isobot support approvals use web dashboard Support. Schedule changes await owner confirmation on the phone. Existing ownership proofs remain valid; the Smithery paid-workspace/badge issue is separate. A platform rescan and OAuth/health check remain to refresh directory-cached tool definitions; the upstream scan alone does not update their cached score.

## Directory-side refresh attempt — October 16, 2026

The upstream 37-tool scan is verified, but Smithery’s release portal is signed out (Login; Publish disabled) and Glama’s authenticated test-profile URL redirects to account signup/sign-in. No authenticated scan was triggered and no replacement platform score/health result is claimed. Owner sign-in to the existing publisher accounts was requested; both tabs are retained for continuation. Do not create duplicate accounts or listings. Claude’s separate portal refresh succeeded at 37 tools while preserving In review.

### Publisher sessions restored; scan authorization pending

The owner restored both publisher sign-ins and explicitly authorized Smithery’s Publish workflow for the 37-tool refresh. A new release reached **AUTHORIZE** (setup ID 0fb1a8ae-ee97-4bad-9355-1966c6125c81). The visible setup link returned Authentication Successful; read-only identity metadata verified the latest Smithery grant belongs to the reserved reviewer, with myselfmd/offline_access. The portal still shows Waiting for Sign In / Resuming, so no completed replacement release or score is claimed. The prior successful published release remains the verified public baseline.

Glama’s restored upstream grant did not belong to the reserved reviewer. No requested connection test was initiated. Used the current test profile’s Revoke Token control and confirmed Not Authenticated, then tried a fresh reviewer-only browser sign-in. Glama restored a non-reviewer grant again, so the profile was disconnected again and scanning stopped. No personal records were read by this agent. Automatic approval review rejected a proposed production-database cleanup because the client-wide non-reviewer filter could affect other users; that command did not execute and no database changes were made. Cleanup was limited to this test profile’s own UI. The upstream OAuth popup is not exposed in the controllable tab inventory; the owner was asked to complete Reviewer sign-in in that popup. Verification of the resulting identity and a successful authenticated scan are still required. No new Glama health or tool count is claimed.

### Final refresh attempt state

Smithery release 0fb1a8ae-ee97-4bad-9355-1966c6125c81 finished **AUTH TIMED OUT** after 5m 7s. Its log says: “Authorization window expired. Click Deploy again and complete the OAuth prompt within 5 minutes.” The portal now displays **60/100**, superseding the historical 86/100 as the latest observed score; no successful 37-tool directory scan is claimed. Earlier SUCCESS releases remain in the history. Glama’s current test profile confirms **Not Authenticated**, with no requested Test Connection run. The owner reviewer-popup handoff remains pending.

### Follow-up after owner authorization

The owner reported authorization completed. A fresh read-only grant check still classified Glama’s latest active grant as a non-reviewer identity. The test profile showed OAuth Authenticated after reload, so its own Revoke Token control was used again; Not Authenticated was confirmed. No connection test was initiated with that identity. The owner was asked to sign out inside Glama’s upstream popup and use the separate Reviewer sign-in.

A new authorized Smithery Publish attempt started at the portal’s displayed 17:54:40. Identity metadata confirms a fresh reviewer-only grant at 21:54:44 UTC, but the release remained AUTHORIZE rather than completing its scan. The earlier timed-out attempt subsequently displayed CANCELLED in history. The latest displayed score remains 60/100. Opening the visible setup link exposed a separate consent flow, now retained as a Reviewer sign-in tab with its OAuth request preserved. The owner must complete that sign-in/consent; neither the consent page nor an existing grant is proof of a completed 37-tool directory scan. Both directory scans remain pending; Claude’s 37-tool In review revision is unaffected.

### Latest rerun: Smithery complete at 39; Glama blocked

The owner authorized another Smithery Publish and isolated reviewer Glama setup. Smithery completed **SUCCESS** in **10 seconds**, with log timestamp **19:33:41** and **Capabilities found: 39 tools**. Its public listing independently confirms **Tools 39** and **86/100**. The latest Smithery refresh grant (`BoZRVpLaHwKeUobFqfHQdajIKlhPhdTk`) belongs to `myselfmd-directory-reviewer-v1`. Optional resources/prompts remain unsupported (method-not-found warnings); tool discovery succeeded. Proof: `.local/listing-reconciliation/portals/smithery-39-public.png` and `smithery-39-success.txt`.

Fresh production discovery, verified against the reviewer subject/audience, also returned 39 tools without invoking any. The two additions since the earlier 37 snapshot are `get_usage_analytics_preference` and `set_usage_analytics_preference`, added by the recent analytics deployment. The operator-only report is absent. No tools were removed to force an outdated count. The sanitized inventory now records this production metadata; the earlier Node/workerd comparison remains dated evidence only.

Glama displayed scheduled Healthy results, but identity metadata still classified its latest active grant as non-reviewer. Used its test profile Revoke Token, retried Authenticate with OAuth, rechecked the resulting grant, then disconnected that profile again and confirmed **Not Authenticated**. No Test Connection was deliberately invoked by this agent. The OAuth popup is not present in the controllable inventory; a focused recent browser-history lookup provided no usable navigation. Glama remains blocked on reviewer-only popup authentication and subsequent scan. No database mutation or broad revocation was attempted. Neither both-directory completion nor 37 current tools is claimed. Claude’s pending submission was not changed by this rerun.
