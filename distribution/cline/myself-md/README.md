# myself.md for Cline

Connect Cline directly to the hosted MCP server https://myself.md/mcp. Discover approved phone data and schemas, list explicitly shared exports, and read the records the owner selects. No local server process is required.

## Install

In Cline, open MCP Servers → Configure → Configure MCP Servers. Merge `cline_mcp_settings.json` from this repository into your existing `mcpServers` map, preserving other entries. The entry must use `"type": "streamableHttp"` and `"url": "https://myself.md/mcp"`. Keep `autoApprove` empty.

For Cline CLI, merge the same configuration into `~/.cline/data/settings/cline_mcp_settings.json`. Run `cline mcp` and select Authorize OAuth for myself-md. In the IDE use Authenticate. Complete normal sign-in and review consent. Public dynamic registration uses the client's local callback; no client ID, client secret or API key needs to be copied.

Try “List my shared myself.md cloud exports,” “Show the available data schemas,” or “Read one page from this shared export.” Discover and use returned IDs. Follow metadata cursors before selecting files, then follow record cursors only for the requested reads.

## Privacy and limits

Use only phone profiles and cloud exports the owner approves. Health, screen-time and recorded-location records can be sensitive; this integration is for personal analysis, not medical advice. OAuth uses PKCE and account consent with `myselfmd` and `offline_access`. The myselfmd scope covers the full MCP surface, including modifying tools; tool filters and the inspection workflow do not reduce the token's server-side capabilities. Approve only the actions you intend. Sharing can be revoked; data already copied by an assistant cannot be recalled.

Prefer existing explicitly shared exports. An offline phone cannot complete a new capture, and an accepted/queued request is not a completed result. Follow each metadata/record cursor separately. Each successful record page can consume normal allowance and create audit history. Paid entitlements, ownership, source selection, OS consent and quotas apply. Empty or missing observations are unknown, not proof of zero activity. No purchase or setting change is performed by installation.

Directory reviewers should request private fictional-reviewer access from cody@isolated.tech and use Reviewer sign-in. Never use a personal account for automated tests or put sign-in credentials into chat or issues. Public synthetic examples do not grant access to private records.

This MIT-licensed package contains only configuration/documentation; the separate hosted application retains its existing license. Icon/trademark rights remain with Isotech.

[Website](https://myself.md) · [Docs](https://myself.md/docs) · [Privacy](https://myself.md/privacy) · [Terms](https://myself.md/terms) · [Support](https://myself.md/contact)
