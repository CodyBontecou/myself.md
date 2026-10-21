# myself.md for Cursor

Connect Cursor to phone data you approve and cloud exports you explicitly share.

The hosted MCP server uses Streamable HTTP at `https://myself.md/mcp` with OAuth dynamic registration and PKCE. No API key or embedded credential is needed. Complete sign-in and review consent when Cursor requests authentication.

Discover connected phones and approved profiles, query supported health, screen-time and recorded-location data, and read shared cloud exports. Device ownership, sharing grants, OS permissions and service allowances apply. Some features require paid myself.md entitlements. Phone queries may require the app to stay open; queued requests are not completed captures.

Start with `get_account_profile`, `list_connected_phones` and `list_cloud_exports`. To read an export, pass an ID returned by the list to `read_cloud_export` and follow its cursor for more records. Only use records the owner has authorized. Revocation stops future access; it cannot recall copies already delivered to an agent.

For directory review, request private fictional-reviewer credentials from cody@isolated.tech. Use Reviewer sign-in rather than a personal Google account. The fixture phone is offline; shared exports are available. Do not put credentials in this repository or chat prompts.

Validation so far: local/server checks and Grok web OAuth, profile, export-list and paginated export-read tests passed with fictional data. Cursor-specific installation and tool execution have not yet been verified.

This package contains only connector configuration, documentation and branding. Its configuration and documentation use the MIT license; icon/trademark rights remain with Isotech. The hosted myself.md application is separate and retains its existing license. The plugin license does not remove hosted-service allowances or paid entitlements.

- [Documentation](https://myself.md/docs)
- [Privacy policy](https://myself.md/privacy)
- [Terms of service](https://myself.md/terms)
- [Support](https://myself.md/contact)
