# Vercel and Zapier distribution

October 15, 2026: **Vercel submitted for review. Zapier work paused at the owner's request after MCP Client connected.** Neither result confirms a public listing.

## Vercel Connect — submitted

The Isotech [submission portal](https://vercel.com/isotech-1f39ffc1/~/connect/submit-service) confirms **Service Submitted**, **OAuth Token Verified**, **DCR** at 12:18 Berlin / 10:18 UTC. Submission ID: `7825870d-8dc0-428f-9287-de25a3b1387a`. Its receipt explicitly says submission does not publish the service. Contact: `cody@isolated.tech`.

The selected test connector is **myself.md Fictional Reviewer** (`scl_KHfjFc9HTix2YSAHPblZQ`). Its successful token test includes a refresh token. A read-only database check confirmed the reserved identity `myselfmd-directory-reviewer-v1` and exactly `myselfmd offline_access`. Actual Vercel-routed MCP tool execution has not been verified. Keep this connector and token available during review.

An earlier test reused a personal session. The identity check caught it before this agent initiated any account-data read. That test client (`eNBtDOfmOdtAKgApSTVuIDXAnMgCdjew`) was disabled and its access/refresh records revoked; its short-lived token's displayed expiry of 12:12:55 Berlin has passed. It is not selected for submission. The fresh fictional reviewer grant was checked before submission.

[Prepared form copy](../distribution/vercel/listing.json) is a working copy, not a Vercel import schema. The submitted form includes the description, website, docs, contact, MCP target `https://myself.md/mcp` and automatic OAuth registration. The optional SVG upload was omitted. Evidence is private: `.local/vercel-zapier/vercel-submitted.jpg` and `vercel-reviewer-consent.json`.

[Provider requirements](https://vercel.com/docs/connect/providers): describe the service, add a connection method, pass a real OAuth token test, then submit. DCR uses the exact callback `https://connect.vercel.com/callback`. Vercel reviews before publication. [Submission announcement](https://vercel.com/changelog/vercel-connect-service-submissions)

Remaining: await Vercel's decision and address specific findings. Read-only monitoring is enabled every six hours under `monitor-myself-md-vercel-review`. No approval or public listing is claimed.

### Review monitoring

- October 16, 2026, 21:00 UTC scheduled check: refreshed the official portal and confirmed the same submission ID with **Service Submitted**, **OAuth Token Verified**, **DCR**. The receipt still states that submission does not publish the service. No approval, rejection or actionable reviewer requests were displayed. No listing, credentials, grants or submission state were changed.
- October 16, 2026, 14:57 UTC scheduled check: refreshed the official portal. Submission `7825870d-8dc0-428f-9287-de25a3b1387a` still shows **Service Submitted**, **OAuth Token Verified**, **DCR**, with the reminder that submission does not publish the service. No approval, rejection or actionable reviewer requests were displayed. No listing, credentials, grants or submission state were changed.
- October 15, 2026, 22:27 UTC scheduled check: refreshed the official portal and confirmed the same submission ID with **Service Submitted**, **OAuth Token Verified**, **DCR**. No approval, rejection or actionable reviewer requests were displayed. A Connect catalog search for `myself.md` showed no matching listing; this does not establish a review decision. Returned to the existing submission receipt. No listing, credentials, grants or submission state were changed.
- October 15, 2026, 18:25 Berlin (16:25 UTC scheduled check): refreshed the official portal. The same submission ID still shows **Service Submitted**, **OAuth Token Verified**, **DCR**. No approval, rejection or actionable reviewer requests were displayed. A Connect catalog search for `myself.md` returned only search-assist, request-service and submit-service options, with no matching listing shown; this does not establish a review decision. The portal receipt was left open. No listing, credentials, grants or submission state were changed.

## Zapier — paused

The owner requested no further Zapier work on October 15. The Connections page already showed **myself.md (1.0.0) — Connected** under MCP Client by Zapier 4.0.2, connection `66866439`. The grant was confirmed as the fictional reviewer, with `myselfmd offline_access` and resource `https://myself.md/mcp`. Evidence: `.local/vercel-zapier/zapier-connected.jpg` and `zapier-consent-check.json`. No Zap or individual tool call has been verified.

Connection settings: Server URL `https://myself.md/mcp`, Streamable HTTP, OAuth **Yes**, Bearer Token blank. [MCP Client documentation](https://help.zapier.com/hc/en-us/articles/38777069364109-Connect-remote-MCP-servers-to-Zapier-using-MCP-Client)

No direct third-party MCP directory submission was found in the official pages checked. Public app distribution needs a developer integration; confirm its MCP availability during review. [Zapier MCP](https://zapier.com/mcp)

[Public app requirements](https://docs.zapier.com/integrations/publish/integration-publishing-requirements) include documented production APIs, retained successful test Zaps, a qualifying company-domain admin, and a non-expiring account at `integration-testing@zapier.com` with required features. That account must allow password changes unless passwordless. The shared reviewer identity does not meet this unchanged.

The developer portal rendered blank in the controlled browser, reporting a failed session request; one reload did not help. No Developer Platform agreement was accepted, native integration registered, or Zapier support identity provisioned. Proposed future scope: Find Shared Export and Read Shared Export using existing MCP application logic. No implementation or submission is claimed. Zapier supplied a trial automatically; no paid upgrade was selected.

## OAuth interoperability release

Vercel initially failed registration with `Unsupported client callback`. Zapier showed `Failed to start OAuth. Please try again.` The owner approved one temporary origin-only diagnostic, which confirmed rejection of `https://zapier.com`. It logged no paths, queries, bodies or credentials. The diagnostic was removed after the retry, and the capture process stopped.

Final production Worker: `d0e79986-159b-4084-84e5-c7fe4bb49f95`. It patches the verified live predecessor `92ea7591-2371-43d2-98b1-708dca675ce0` with only the exact Vercel callback and exact Zapier HTTPS origin. Nonstandard ports, lookalike hosts, embedded credentials and fragments remain denied. Registration grants no account access; sign-in, consent, PKCE and resource checks remain required. Unrelated in-progress source was excluded.

`npm run verify:identity` reproduced the Zapier-origin rejection (400 instead of 201), then passed after the fix, including consent, unsafe-callback rejection and existing reviewer/resource-isolation checks. Downloaded production bytes match the reviewed final bundle and contain no diagnostic. Health, protected-resource/identity discovery, unauthenticated MCP denial and preserved website asset hashes pass. Evidence: `.local/vercel-zapier/live-verification.json`. Aggregate static checks are separate; concurrent unrelated checkout changes may affect their current result.

## October 16 upstream reconciliation

The full endpoint now exposes 37 tools; current Node, workerd and authenticated production metadata agree. The restricted ChatGPT endpoint retains 13. Existing generic approved-data/phone/cloud listing copy remains accurate. Current inventory and platform follow-ups (local-only: `.local/reports/mcp-tool-reconciliation.md`). This does not establish fresh Cursor, Grok Bot or Vercel client execution, publication, or an ownership claim. Zapier remains paused. No submitted answers or review state were changed.
