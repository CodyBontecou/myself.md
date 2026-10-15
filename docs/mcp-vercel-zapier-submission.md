# Vercel and Zapier distribution

Started October 15, 2026. Neither platform has received a submission. The owner completed both publisher sign-ins. Personal Google accounts must never be used as the myself.md reviewer identity.

## Vercel Connect

Use [Submit a Service](https://vercel.com/d?to=/%5Bteam%5D/~/connect/submit-service), not a deployment template or Vercel's own MCP server. The [provider documentation](https://vercel.com/docs/connect/providers) requires service information, a connection method and an OAuth token test before review. Automatic registration can use DCR. The documented exact redirect is `https://connect.vercel.com/callback`. The test connector and token must remain present at submission. Drafts are browser/account/team specific. Vercel reviews submissions before publication. [Announcement](https://vercel.com/changelog/vercel-connect-service-submissions)

Prepared [form copy](../distribution/vercel/listing.json) uses our full production MCP resource and existing SVG icon. This JSON is a working copy, not a Vercel import schema. Confirm the publisher team in the portal. The endpoint has existing account, device, profile, data-grant, quota and consent boundaries; tokens are personal delegated access, not application-wide access.

The live draft is saved in this browser under the **Isotech** team at `https://vercel.com/isotech-1f39ffc1/~/connect/submit-service`. Service information, the MCP target and the OAuth method are filled. Discovery succeeds and reports automatic registration available. Creating the test connector fails with `Dynamic Client Registration failed (400): {"error":"Unsupported client callback."}`, confirming the production callback blocker. No token or access grant was created. The optional SVG upload and final review are still pending. Evidence: ignored `.local/vercel-zapier/vercel-draft-registration-blocker.jpg`.

Source preparation adds only the exact Vercel callback to dynamic registration. It preserves sign-in, consent, PKCE and resource isolation. Runtime coverage includes accepted registration, consent handoff and rejection of altered callbacks. This change has not been deployed. Production discovery and Vercel's real token test remain unverified for this integration.

`npm run verify:identity` passed with isolated local accounts, including the new callback cases and the existing resource-isolation/reviewer checks. Its added OAuth requests use a distinct fixture IP to avoid consuming the earlier tests' rate-limit bucket; production rate limits are unchanged.

Remaining execution: deploy the checked callback change; complete the publisher form; run the test connector using only the fictional reviewer; verify a token and a bounded tool read; inspect the final submission and any terms before submitting. Never publish credentials in listing material.

## Zapier

The documented existing-server route is [MCP Client](https://help.zapier.com/hc/en-us/articles/38777069364109-Connect-remote-MCP-servers-to-Zapier-using-MCP-Client): Server URL `https://myself.md/mcp`, Streamable HTTP, OAuth **Yes**, no manually pasted bearer token. It supports tool calls. Connecting it establishes compatibility for that account; it does not establish a public myself.md listing.

No direct third-party MCP listing submission was found in the official pages checked. [Zapier MCP](https://zapier.com/mcp) exposes its app actions to AI clients. For public app distribution, prepare a native developer integration and confirm its MCP availability during review rather than promising an automatically generated MCP page.

The [publishing requirements](https://docs.zapier.com/integrations/publish/integration-publishing-requirements) call for documented production APIs, successful retained test Zaps for every included operation, and a qualifying admin email from the API owner's company domain. The support test account must use `integration-testing@zapier.com`, be non-expiring, include required features, and permit password changes unless passwordless. Our shared `reviewer@myself.invalid` account does not meet that requirement unchanged.

Proposed first integration scope: **Find Shared Export** (`list_cloud_exports`) and **Read Shared Export** (`read_cloud_export`), using the existing application logic and authorization. Defer live phone query triggers until asynchronous completion, pagination and deduplication have been designed and verified. This is a proposal, not implemented behavior.

Listing copy: “myself.md is a personal data service for connecting applications and AI agents to owner-approved phone data and shared cloud exports.” Website `https://myself.md`; documentation `https://myself.md/docs`; support `https://myself.md/contact`; privacy `https://myself.md/privacy`.

Remaining execution: sign into publisher account; test MCP Client with fictional reviewer data; inspect the developer portal; build the selected native integration; provision Zapier's separate support identity; retain successful test workflows; complete review information and any agreement step. No production account, OAuth credential or API entitlement has been created for Zapier by this preparation.

Publisher onboarding is complete (Engineering, 1–49 employees; app preferences skipped). MCP Client was selected in Connections. Its separate connection window is not exposed to browser controls, so the owner is entering the server, transport and OAuth selection. Bearer Token should remain blank when OAuth is Yes. No successful authentication or tool call has been verified yet. Zapier displays an automatically supplied 14-day Professional trial; no paid upgrade was selected.

The owner's screenshot confirms the intended URL, Streamable HTTP, OAuth Yes and an empty bearer-token field, but shows “Failed to start OAuth. Please try again.” before the reviewer login. The cause is unconfirmed; do not treat it as a proven callback rejection. An origin-only diagnostic patch is prepared privately under `.local/vercel-zapier/`, pending explicit approval to deploy it temporarily. No production diagnostic has been added. Formatting and the aggregate check passed after the preparation; the local identity fixture also passed. Two blog sorting compatibility errors encountered in the shared checkout were resolved using the existing `core/collections.js` helper without changing its checker configuration.
