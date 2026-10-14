# Restricted directory-review login

This login uses a new application-owned identity (`myselfmd-directory-reviewer-v1`) with a credential account and the reserved non-deliverable email `reviewer@myself.invalid`. It never uses or links either personal Google account. Public password signup/reset/change routes remain unavailable. Ordinary social sign-in and explicit linking remain unchanged.

## Sign-in and agent access

Start at `/login` and choose **Reviewer sign-in**. Dashboard sign-in starts the normal authorization-code/PKCE flow; MCP clients reach the same credential form through their signed OAuth login query. The form forwards that query to Better Auth's normal password authenticator. Consent, resource audience, scopes, account partitioning, data grants, billing, history and token refresh remain enforced. No custom bearer tokens or bypass sessions are minted. Credentials must be entered privately by a human; they are never MCP tool inputs or outputs.

The password authenticator is disabled unless `REVIEWER_LOGIN_ENABLED=1`. The hosted route also requires the reserved identity's `reviewer_access.enabled=1`. Password attempts for other identities fail, and reviewer social linking is rejected both at the hosted Connected logins page and the identity account-create hook. MCP `get_account_logins` exposes no available social-link actions for this account. Signup cannot create the reserved identity.

## Prepare the isolated account

```sh
npm run reviewer:prepare -- 2026-10-13
```

Preparation writes only ignored `.local/reviewer-login` files with private permissions. `credentials.json` contains the generated password; do not paste it into chat or commit it. `provision.sql` contains only the salted Better Auth password hash and reserved reviewer identity. It deliberately uses plain INSERTs, refusing to silently reuse an existing identity/email. `account-batch.json` contains the encrypted fictional-data batch for the existing operator import. No purchase, payment or personal identity is copied or invented.

The fixture generator accepts only a subject ending in the reserved reviewer ID. It refuses existing non-fixture exports or real devices. It uses ordinary profile validation, CloudStore commit/encryption/quota rules and a clearly named complimentary grant (`reviewer:fictional-fixtures`). It produces:

- 12 JSON/JSONL exports covering the two days before the supplied date.
- Health and screen-time profiles shared for MCP review, each with 72 fictional records per day to exercise pagination.
- A fictional location profile initially private, providing a grant-denial case.
- Six history events with explicit fictional warnings.
- One offline fixture source named **Fictional reviewer source (offline; not a real phone)**. It is not a connected physical device and cannot answer live native queries.

Records use `source: reviewer-fixture` and carry `native.fictional: true`. No HealthKit, Health Connect, usage history, GPS, personal exports or social credentials are read. Repeated local preparation preserves the password and existing fixture sharing settings; it does not duplicate exports or restore revoked sharing.

## Hosted provisioning and revocation

Apply `worker/migrations/reviewer-access.sql` before enabling the feature. Review `.local/reviewer-login/provision.sql`, then apply it only to the hosted identity database through the operator's normal D1 tooling. Import the account batch only for its reserved subject, using the existing private operator migration workflow, and disable migration mode afterward. This is an operator action, not an MCP grant an agent can request for itself. Deploy the checked Worker with `REVIEWER_LOGIN_ENABLED=1` only once the reserved identity and access row exist. The current production configuration enables it; set the flag to `0` to disable the feature.

Revoke by applying `.local/reviewer-login/revoke.sql` to the identity database. It disables reviewer access, advances its token-valid-after boundary, removes browser sessions, refresh/access-token rows and OAuth consent, and removes the password credential. The Worker checks active state and issue time on every reviewer bearer request, so already-signed tokens immediately fail even before their normal expiry. Setting `REVIEWER_LOGIN_ENABLED=0` also closes the feature. Neither action changes personal identities, sessions or grants.

Do not run account-deletion tests on the persistent reviewer account before submission. Normal account deletion permanently removes its identity/data and creates the usual account-deletion tombstone; resetting that outcome is not part of fixture provisioning. Use the isolated destructive-action fixtures for verification.

## Verification and publication state

`npm run verify:identity -- --browser` verifies the dashboard Reviewer sign-in button, private password form and populated dashboard in an isolated Chromium session. It also exercises the real password handler and workerd OAuth flow with synthetic credentials: signed login continuation, consent/PKCE exchange, bounded cloud MCP reads, unrelated-account denial, disabled signup, blocked reviewer linking, fixture retries and immediate bearer/refresh revocation. Existing social sign-in/linking tests still run. Static checks cover the JavaScript/configuration boundaries.

On October 13, 2026, the reserved credential identity and access row were provisioned in production. Its 12 fictional exports were imported and ciphertext/integrity verification succeeded (131,386 plaintext bytes). Worker version `65c7c73a-4929-42a4-9bca-bce3f2b03eb4` enables reviewer login and disables operator import; the live import endpoint returns 404. Neither personal Google identity was read, linked or modified.

Live verification used a fresh browser context and a dynamically registered native loopback MCP client. It verified the Reviewer sign-in button and populated dashboard, OAuth consent/PKCE, correct reviewer token subject/audience, refresh exchange, MCP initialization, all 43 tools’ titles/annotations, 8 shared exports, 50+22 fictional record pagination, denial of a private location export, and unavailable social-link actions. Private evidence and the dashboard screenshot are under ignored `.local/reviewer-login/`. The real Claude custom connector subsequently passed profile-scope handling, reviewer identity discovery, shared-export listing and 50+22 record pagination. See the [submission ledger](mcp-claude-registry-submission.md). The correct Pro publisher account has portal access; all 43 tools have been invoked through Inspector and the Claude listing is submitted and In review; positive native/destructive/delivery effects remain unverified; the official Registry entry is published. The offline fixture does not establish successful native capture, OS permissions or development-only feedback tools, and must be disclosed in reviewer instructions.
