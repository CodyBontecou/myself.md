# Claude reviewer setup

Server: `https://myself.md/mcp`. Authentication: OAuth with automatic dynamic client registration, S256 PKCE and scope `myselfmd`. Claude's callback is `https://claude.ai/api/mcp/auth_callback`. No client ID or client secret needs to be entered manually.

Current source and production metadata (16 October): mobile contains Profiles/Settings only. Debug errors/metadata require the single Settings sharing toggle; no record, credential or URL attachments are captured. Feedback and debug-content tools and the legacy Discord support tools are removed. `get_phone_debug_logs`, `request_phone_debug_access`, `list_phone_logs` and Isobot `support_conversations` remain; support approvals open web dashboard Support. The earlier 37-tool snapshot matched Node/workerd/production metadata; fresh October 17 production and Claude discovery now confirm 40 tools. October 14’s 43-tool invocation ledger remains historical. New tools are read_public_blog, get_phone_export_schedules and set_phone_export_schedule_enabled. Schedule changes require owner confirmation on the phone; accepted requests are not completed changes. See ../mcp/tool-inventory.json for the sanitized inventory.

The operator supplies the password only through private reviewer fields. Username: `reviewer`. Do not use Google, Apple or GitHub sign-in, and do not use an existing personal myself.md session.

1. Use a fresh/private browser session. Open <https://myself.md/auth/realms/myselfmd/reviewer-login> and sign in with the supplied reviewer credentials before connecting Claude. The password form establishes the reviewer session; the dashboard may still ask you to start its own OAuth sign-in.
2. In Claude, open Customize → Connectors → Add connector → Add custom connector. Name it **myself.md reviewer**, use the server URL above, choose **Sign in now** and **Register automatically**, then Add and Connect.
3. If directed to the ordinary myself.md login, choose **Reviewer sign-in**. Complete the reviewer password form and allow access on the consent page. Keep tool permission prompts at **Needs approval** and approve only the operations under review.
4. Verify `get_account_logins` returns a subject ending in `myselfmd-directory-reviewer-v1`, no connected social providers and no available social-link actions. If a different subject appears, disconnect and restart with the reviewer-only login. Do not read exports from that connection.
5. Run the cloud scenarios below. This account contains only fictional data; none of it is a person's actual health, usage or location history.

## Fixture contents and expected results

The dashboard has 12 exports: health, screen-time and location profiles, two days of JSON and JSONL each. MCP `list_cloud_exports` returns 8 shared health/screen-time files. Four location exports remain private. Each health/screen-time day has 72 records: `read_cloud_export` with limit 50 returns 50 records and cursor `50`; the next page has 22 and no next cursor. Each record carries `source: reviewer-fixture` and `native.fictional: true`. Read pages consume normal allowance and create audit history. The account has a complimentary reviewer lifetime grant; no purchase was recorded.

Claude ordinarily requests `myselfmd offline_access`, without OpenID profile/email scopes. `get_account_profile` therefore returns null name/email/picture successfully. That is scope enforcement, not an account-identification failure. Use the subject from `get_account_logins` for identity verification.

Suggested prompts:

- “Use myself.md to list connected logins. Confirm the subject ends in myselfmd-directory-reviewer-v1 and social linking is unavailable, then list my shared cloud exports.”
- “Read a shared fictional health JSON export in pages of 50. Report each page's record count and verify source reviewer-fixture and native.fictional true. Do not provide medical advice.”
- “List connected phones and explain whether the fictional source is online. Do not claim a queued request is a completed capture.”

The single source is labeled **Fictional reviewer source (offline; not a real phone)**. It cannot complete live phone capture or OS permissions. An isolated phone installation with approved fictional sources is required for those cases. Feedback/Gripe is removed, not an outstanding positive test. Do not delete the persistent reviewer account/exports, disconnect its source, change sharing or send support messages during these cloud scenarios. Destructive/external-delivery tests require disposable targets and explicit instructions.

## Private submission material

The operator's ignored `.local/reviewer-login/credentials.json` is the credential source. Enter its password only in the developer portal's private reviewer access field. Never include it in listing copy, attachments, public screenshots, repository files or chat prompts. The public icon and listing copy are in this directory. Review policy acknowledgments and the complete tool-test ledger before submitting; all 43 tools were invoked through the official MCP Inspector CLI on October 14. Only four were executed in the real Claude conversation. The ledger distinguishes successful reads/handoffs from expected guard refusals and untested positive native, destructive and external-delivery effects.

October 17 additions: get_usage_analytics_preference, set_usage_analytics_preference and manage_phone_profiles. Analytics enabling requires explicit owner consent and ALLOW_USAGE_ANALYTICS confirmation; do not opt in during review. Disabling erases linked events. Profile proposals cannot save configuration, grant access or start exports: the owner reviews them in dashboard Profiles & permissions, and completion requires phone confirmation after saving. Do not mutate the shared fictional fixtures. The operator-only analytics report is absent for this reviewer. This metadata refresh does not establish every-tool positive effects.
