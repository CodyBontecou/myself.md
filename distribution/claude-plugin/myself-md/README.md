# myself.md

Connect Claude to phone data you approve and cloud exports you explicitly share. This plugin adds a shared-export inspection skill and the hosted MCP connector https://myself.md/mcp. It is being submitted to Anthropic's plugin directory and is not yet approved there.

## Install

In Claude Code 2.1.275 or later:

```text
/plugin install myself-md --marketplace CodyBontecou/myself-md-claude-code
```

Run `/mcp`, authenticate myself-md and review the normal OAuth consent screen. Dynamic registration and PKCE require no embedded credentials. On Claude.ai or Cowork, connect the existing myself.md connector from the plugin's Connectors tab once the bundle is available.

Try “List my shared cloud exports,” “Read the health export I select and explain missing coverage,” or “Summarize my shared screen-time observations for this completed week.” The skill discovers source IDs, reads only selected records and distinguishes observations from complete coverage. It does not independently schedule capture or change phone settings.

## Privacy and limits

Use only phone profiles and cloud exports the owner approves. Health, screen-time and recorded-location records can be sensitive; this integration is for personal analysis, not medical advice. OAuth uses PKCE and account consent with `myselfmd` and `offline_access`. The myselfmd scope covers the full MCP surface, including modifying tools; tool filters and the inspection workflow do not reduce the token's server-side capabilities. Approve only the actions you intend. Sharing can be revoked; data already copied by an assistant cannot be recalled.

Prefer existing explicitly shared exports. An offline phone cannot complete a new capture, and an accepted/queued request is not a completed result. Follow each metadata/record cursor separately. Each successful record page can consume normal allowance and create audit history. Paid entitlements, ownership, source selection, OS consent and quotas apply. Empty or missing observations are unknown, not proof of zero activity. No purchase or setting change is performed by installation.

Directory reviewers should request private fictional-reviewer access from cody@isolated.tech and use Reviewer sign-in. Never use a personal account for automated tests or put sign-in credentials into chat or issues. Public synthetic examples do not grant access to private records.

This MIT-licensed package contains only configuration/documentation; the separate hosted application retains its existing license. Icon/trademark rights remain with Isotech.

[Website](https://myself.md) · [Docs](https://myself.md/docs) · [Privacy](https://myself.md/privacy) · [Terms](https://myself.md/terms) · [Support](https://myself.md/contact)
