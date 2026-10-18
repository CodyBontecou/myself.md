# Community MCP directory submissions

Updated October 17, 2026.

## Cursor — submitted October 16, 2026

The owner signed into the official [publisher portal](https://cursor.com/marketplace/publish) and explicitly approved publishing the proposed MIT connector package and submitting under Cursor's publisher terms. Submitted as Isotech / `isotech`, contact `cody@isolated.tech`, under the selected individual Cursor account. The portal confirms **Thanks for applying** and **We've received your submission**, with review follow-up promised. Receipt screenshot: private `.local/cursor/submitted.jpg`. No application ID was displayed. Awaiting review; no approval or marketplace listing is claimed. The Grok Bot application is separate.

Published the five-file package from `distribution/cursor/myself-md/` to [CodyBontecou/myself-md-cursor-plugin](https://github.com/CodyBontecou/myself-md-cursor-plugin), commit `38ba2e1f1bd8cbb27269d6863ef2b7e425e992c0`. GitHub's reported main commit matches the exact local package commit. It contains `.cursor-plugin/plugin.json`, root `mcp.json`, MIT LICENSE, the existing icon and setup README. It points to `https://myself.md/mcp`, contains no credentials, executable components or application source, and discloses that Cursor-specific testing is unverified. JSON parsing and referenced-file checks pass. The [official reference](https://cursor.com/docs/reference/plugins) requires a public repository, valid manifest, setup README and local testing for the standard publisher flow.

The existing GitHub app repository is public but its root license is AGPL-3.0. The publisher terms exclude copyleft components; the separate package includes no app source. Its owner-approved MIT license covers only the new configuration/documentation, retaining branding rights and leaving hosted application licensing unaffected. The submitted form and public README explicitly disclose successful Grok web tests and no verified Cursor-specific installation or tool execution. Hosted-service allowances and paid entitlements are disclosed. No Cursor client test was performed for this submission.

## Grok Bot — submitted October 16, 2026

Read-only monitoring is enabled every six hours under `monitor-myself-md-grok-bot-review`. It checks the official marketplace and accessible review feedback, notifying on confirmed approval, rejection or requested changes. The receipt promises email follow-up, but no email connector is available; monitoring cannot read those messages. A missing listing is not a rejection. No resubmission, listing changes or credential tests are authorized by the monitor.

The official [Grok Bot submission form](https://x.ai/bot/marketplace/submit-a-plugin) accepts a remote MCP URL. Filled a draft for Isotech / `isotech`, contact `cody@isolated.tech`, target `https://myself.md/mcp`. The final submission selects only Grok Bot. Automatic approval review rejected an attempt targeting all three destinations; narrowing to the requested Grok Bot directory succeeded. [Saved form copy](../distribution/grok/listing.json) contains no reviewer secrets. Final testing instructions are 420 characters and explicitly state: “Tested locally/server-side and in Grok web with fictional reviewer data; Grok Bot desktop not tested.” The portal confirms: “Thanks for submitting your plugin! We'll review it and follow up by email.” Receipt screenshot: private `.local/grok/submitted.jpg`. Awaiting review and email follow-up at `cody@isolated.tech`; no approval or public listing is claimed. No submission ID was displayed.

Public checks returned health 200, protected-resource discovery 200, unauthenticated MCP 401 and icon 200. The existing icon is a 256×256 PNG. After publisher sign-in, Grok web created **myself.md Fictional Reviewer**. A read-only consent check confirmed client `qVbGTNivmwOXvuNqrEaKDwCLHplLNqmK`, callback `https://grok.com/connectors-oauth-exchange-code/`, the reserved fictional reviewer identity and scopes `openid profile email offline_access myselfmd`. No personal account records were read. The [Grok web test conversation](https://grok.com/c/226fe373-bf5f-4498-b398-e2aa99e1e089) shows actual connector calls for `get_account_profile` and `list_cloud_exports`, reporting the fictional profile and eight shared exports. Two actual `read_cloud_export` calls also succeeded with limit 1, returning one fictional record per page and cursors `1` then `2` for a 72-record export. Screenshot: private `.local/grok/web-test.jpg`. This verifies Grok web, not the separate Grok Bot desktop client.

The form links to [Cursor Marketplace Publisher Terms](https://cursor.com/marketplace-publisher-terms), dated May 6, 2026. Section 3.1 requires free access/use through the marketplace, potentially conflicting with our paid service entitlements, which the draft discloses. Terms also grant distribution/promotion rights, assign publisher support/security obligations and indemnification, and require arbitration. Automatic approval review rejected the first submission attempt because testing was unverified and terms unresolved; nothing was submitted. The owner then explicitly authorized accepting these terms and submitting after successful testing, and requested that the test happen first. After the Grok web tests passed, the owner explicitly instructed submission with the desktop-test limitation disclosed. The final Grok Bot-only submission accepted the terms under that authorization.

At the owner's request, downloaded the Apple silicon DMG from the official x.ai download link at `https://api2.cursor.sh/updates/download/stable/darwin-arm64/grok-bot-bd824e1890d8b96f`. Both the mounted original and temporary copied app fail `codesign --verify --deep --strict` with “invalid signature (code or signature have been modified)” in arm64. The test launch was mistakenly started before verification completed; its process was terminated and confirmed absent before login or data access. No security protection was bypassed. Installer: `/tmp/myself-grok-bot.dmg`; temporary app: `/tmp/myself-grok-bot/Grok Bot.app`. Grok Bot desktop testing remains pending a verifiable vendor build; the submission discloses this limitation and relies on the successful Grok web tests.

## MCPServers.org

**Published — verified October 17, 2026.** The public directory search for `myself` returns one exact myself.md entry: [myself.md](https://mcpservers.org/servers/myself-md-docs). Its detail page matches the submitted description and Productivity category, shows Hosted MCP Server `https://myself.md/mcp`, and links Documentation to `https://myself.md/docs`. Publication is confirmed; no separate approval email was found in the verified `cody@isolated.tech` mailbox, including spam/trash (`in:anywhere`). No reviewer request or required action was found. This is the first reported publication confirmation; avoid notifying again for this same listing/status. Read-only evidence: `.local/community-directories/mcpservers-published-2026-10-17.txt` and `.png`. No resubmission, update request or purchase was made.

Historical submission receipt:

Free submission received October 14, 2026 at https://mcpservers.org/submit. After the owner explicitly authorized sharing the public listing details and cody@isolated.tech, the WebMCP submission succeeded. The portal confirms **Submission Successful!** and says myself.md will be listed after review within two weeks, with an email notification on approval. Status at submission: submitted, awaiting review; publication was not yet confirmed. No paid plan or purchase was selected. Receipt text and screenshot are retained under ignored .local/community-directories/.

Submitted fields:

- Name: myself.md
- Category: Productivity
- Description: Connect AI agents to owner-approved health, screen-time and recorded location data through connected phones and shared cloud exports.
- Documentation: https://myself.md/docs
- Registry name: md.myself/mcp
- Remote endpoint: https://myself.md/mcp
- Remote authentication: OAuth
- Review contact: cody@isolated.tech
- Plan: Free ($0; advertised review within two weeks)

## MCP.Directory

The site's search at https://mcp.directory/servers?q=myself returned **No servers found**. This establishes that no matching entry was returned by that search, rather than proving the entire catalog lacks every possible alias. No existing listing was available to claim.

Its https://mcp.directory/submit page says it auto-discovers entries from the official Registry and asks owners to email hello@mcp.directory for verified-badge/edit-access claims. The manual submission form requires a GitHub repository; no repository was supplied or made public for this task.

The [import/ownership inquiry](../distribution/community/mcp-directory-inquiry.txt) was sent October 16, 2026 from **cody@isolated.tech** to **hello@mcp.directory**, subject **Import and ownership claim for myself.md (md.myself/mcp)**. Gmail first returned no sent messages for this recipient, then confirmed **Message sent**. The message is verified in Sent Mail; its expanded details confirm the exact sender, recipient and mailed-by isolated.tech. [Private sent-message receipt](https://mail.google.com/mail/u/0/#sent/KtbxLrjjBcjBghnXwHBZvcjkTcnFfqFlxq). Evidence text and screenshot are retained under ignored .local/community-directories/. Status: **inquiry sent, awaiting directory response**. Sending is confirmed; recipient delivery/read status, import and ownership approval are not confirmed. Ownership remains unclaimed until the directory confirms its process.

## October 16 upstream reconciliation

The full endpoint now exposes 37 tools; current Node, workerd and authenticated production metadata agree. The restricted ChatGPT endpoint retains 13. Existing generic approved-data/phone/cloud listing copy remains accurate. [Current inventory and platform follow-ups](mcp-tool-reconciliation.md). This does not establish fresh Cursor, Grok Bot or Vercel client execution, publication, or an ownership claim. Zapier remains paused. No submitted answers or review state were changed.
