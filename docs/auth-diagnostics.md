# Retained sign-in diagnostics

The identity service emits structured `myself.md.auth.v1` events through its operational log sink. The hosted Worker retains them using Cloudflare Workers Logs, without a temporary diagnostic deployment or an active live tail. Retention and account limits are controlled by [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/); these records are not an indefinite archive. Self-hosted Node operators must retain their process logs through their own log service.

Only these fields are emitted:

| Phase         | Fields                                             | Meaning                                                                                                                                                                                                                                                                            |
| ------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`       | `reason`                                           | Fixed categories: `verification_missing`, `browser_cookie_mismatch`, `browser_cookie_missing`, `state_value_mismatch`, `expired`, `state_missing`, `state_invalid`, or `other`. The library's cookie mismatch does not distinguish a missing cookie from a different signed value. |
| `callback`    | `provider`, `method`, `target`, `error`, `hasCode` | Apple/Google/GitHub; GET/POST; fixed destination category; allowlisted error category; code presence only. No URL or code value.                                                                                                                                                   |
| `phone_token` | `httpStatus`, `outcome`                            | Hosted first-party phone token exchanges: `issued` for HTTP 200, otherwise `rejected`. Refreshes use the same endpoint, so this event alone does not establish a new sign-in.                                                                                                      |

The error vocabulary is `none`, `state_mismatch`, `state_not_found`, `state_invalid`, `account_not_linked`, `account_already_linked_to_different_user`, `access_denied`, `invalid_code`, `invalid_grant`, `invalid_client`, `invalid_request`, `login_required`, and `other`. Unrecognized values are replaced, never copied. Library errors, stacks, descriptions, tokens, codes, OAuth state, cookies, request/response bodies, account/device identifiers, emails and phone records are never serialized by this diagnostic path. Sink failures cannot change authentication results. The Worker redacts query strings in its log metadata, disables invocation logs, and explicitly enables persisted logs and full head sampling. Platform limits can still drop logs.

## Investigating a failure

Use the owner's approximate failure time and timezone in the **myself-md Worker → Observability → Logs** view and search for `myself.md.auth.v1`. Compare the provider's POST, canonical GET and native return in the same time window. Cloudflare's platform request metadata may group events from one invocation, but these diagnostics add no cross-request identity or OAuth-derived correlation identifier. Overlapping sign-ins can therefore remain ambiguous.

A `state` event identifies the library's rejected check. A callback with `target: native`, `error: none` and `hasCode: true` proves a code was returned, not that the app accepted it. A subsequent successful phone token exchange and the app's accepted account establish more of the flow. If the app reports a state error after a successful native code return and no exchange, a client return mismatch is a possibility, not a confirmed cause without client evidence. A browser-window cancellation or a request that never reaches the server may leave no event.

These are service-operator logs, accessible only with the operator's Cloudflare dashboard/API permissions. The existing Wrangler OAuth token may lack historical Observability read access; use an authorized operator session or a suitably scoped token rather than weakening application authorization. There is no public log endpoint, customer diagnostic browser, new agent grant, or authentication bypass. Existing MCP diagnostics continue to require account/device ownership and the phone's Logs consent. Mobile and dashboard actions are unchanged, and existing installed phones benefit from the hosted server instrumentation without a new phone build.

## Local read-only access

On the owner's Mac, run `npm run auth:diagnostics` for the last 30 minutes, or provide an explicit window (at most two hours):

```sh
npm run auth:diagnostics -- --from 2026-10-20T20:08:00-04:00 --to 2026-10-20T20:10:00-04:00
```

The command reads the token from Mac Keychain, service `myself.md.cloudflare.observability`, account `myself-md`. It never prints the credential or raw platform logs. It fixes the account, Worker and diagnostic schema filters; validates and projects only the allowlisted diagnostic fields plus the event timestamp; and limits retrieval to 200 events. A full page reports `possiblyTruncated`; narrow the window rather than treating it as complete. `omitted` reports records that failed validation. The query uses `dry: true`, so it does not save a query. No background polling is installed.

The owner-approved account token `myself-md-signin-diagnostics-read` expires January 18, 2027. Its permissions are Individual Workers Metadata Read-Only for `myself-md` and account-wide Workers Observability Read. The latter can read Observability data from other Workers: the command's filter limits this workflow, not the credential's underlying authority. No write permissions were granted, and the existing deployment credentials are unchanged. Revoke or edit the token through Cloudflare's account API token settings; remove the local credential through Keychain Access. A future Mac needs its own approved credential setup.

On October 20, 2026, Worker metadata access alone returned HTTP 403 for historical queries; adding legacy Workers Observability Read returned HTTP 200 and retrieved the previously retained synthetic Apple rejection. Although the [query API reference](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/query/) lists Workers Observability Write, the read-only permission succeeded in this account. Use the tested read-only permission rather than broadening to write access. Token expiry, platform retention and a request that never reaches the server can still prevent retrieval.

## Verification

`node scripts/verify-native-oauth-return.js` exercises actual signed Apple callbacks and checks emitted success, missing-record and cookie-mismatch categories. Adversarial sentinel values in error objects and redirect parameters must never appear in retained events; unrecognized library messages and invalid providers/statuses are dropped. Throwing log sinks must preserve callback behavior. `npm run verify:identity` also exercises the hosted Worker token boundary and existing OAuth/MCP authorization contracts.

## Hosted deployment — 20 October 2026

Worker `c47fbe3d-8dc2-477c-9c99-866daa07bf5b` serves all traffic with this instrumentation. Its exact package passed the isolated identity/MCP suite before activation. The deployment preserved the prior live module's unrelated code, assets, bindings and runtime, removed expired temporary diagnostic helpers, and verified persisted-log and query-redaction settings through the control-plane API. A deliberately invalid live Apple callback returned `state_mismatch` without a code and emitted only `verification_missing` plus the categorized callback outcome. The read-only command later retrieved both retained events at 20:08:50 AST on October 20, with zero omitted records and no truncation. A separate successful token exchange in the window does not establish a relationship to that rejected callback. This verifies live logging and subsequent historical retrieval, not a new real Apple sign-in or the cause of an earlier failure.
