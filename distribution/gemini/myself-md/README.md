# myself.md for Gemini CLI

Connect Gemini CLI to https://myself.md/mcp to discover owner-approved phone data and read explicitly shared cloud exports. This extension exposes a focused inspection tool set; it starts no local server.

## Install

```sh
gemini extensions install https://github.com/CodyBontecou/myself-md-gemini
```

Restart Gemini CLI, run `/mcp auth myself-md`, and complete the normal browser sign-in and consent flow. Public dynamic client registration is used; no API key or embedded client secret is required. Keep the local callback port 7777 available. Run `/mcp list` to verify connection.

Try: “List my shared cloud exports,” “Show the available data schemas,” or “Read one page from the shared export I select.” Resolve real IDs from discovery, and approve a bounded data read before proceeding.

## Privacy and limits

Use only phone profiles and cloud exports the owner approves. Health, screen-time and recorded-location records can be sensitive; this integration is for personal analysis, not medical advice. OAuth uses PKCE and account consent with `myselfmd` and `offline_access`. The myselfmd scope covers the full MCP surface, including modifying tools; tool filters and the inspection workflow do not reduce the token's server-side capabilities. Approve only the actions you intend. Sharing can be revoked; data already copied by an assistant cannot be recalled.

Prefer existing explicitly shared exports. An offline phone cannot complete a new capture, and an accepted/queued request is not a completed result. Follow each metadata/record cursor separately. Each successful record page can consume normal allowance and create audit history. Paid entitlements, ownership, source selection, OS consent and quotas apply. Empty or missing observations are unknown, not proof of zero activity. No purchase or setting change is performed by installation.

Directory reviewers should request private fictional-reviewer access from cody@isolated.tech and use Reviewer sign-in. Never use a personal account for automated tests or put sign-in credentials into chat or issues. Public synthetic examples do not grant access to private records.

This MIT-licensed package contains only configuration/documentation; the separate hosted application retains its existing license. Icon/trademark rights remain with Isotech.

[Website](https://myself.md) · [Docs](https://myself.md/docs) · [Privacy](https://myself.md/privacy) · [Terms](https://myself.md/terms) · [Support](https://myself.md/contact)
