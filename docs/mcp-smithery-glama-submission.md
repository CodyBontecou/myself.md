# Smithery and Glama listing ledger

Updated October 14, 2026. Glama's public listing is ownership-verified and its authenticated test passed with 43 tools. Renewable reviewer authorization and a successful health check beyond the original token expiry are verified, with one transient renewal failure recorded below. Smithery's authenticated release scan succeeds with 43 tools and its quality score is now 86/100.

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
