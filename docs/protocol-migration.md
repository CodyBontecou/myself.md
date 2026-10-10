# Protocol migration to myself.md

The canonical native scheme and callback are `myselfmd://` and `myselfmd://oauth`. New OAuth configurations use the `myselfmd` scope and `myselfmd-phone`, `myselfmd-dashboard`, and `myselfmd-mcp` clients. The hosted issuer is configured as `https://myself.md/auth/realms/myselfmd`. The hosted identity migration and matching Worker deployment completed on 10 October 2026 (Worker version `a9149ab4-9db9-4ebd-b867-bef8a6904073`). Updated native apps still require distribution; installed binaries do not change with a Worker deployment.

## Preserve existing data

Keep the production `ACCOUNT_NAMESPACE` unchanged: `https://qr-connect-cloud-cody.fly.dev/auth/realms/qr-connect`. This is an immutable storage identity, not a network endpoint or accepted token issuer. Renaming it would route owners into different Durable Objects and detach existing devices, exports, grants, billing, history and purchase claims. Store bundle/application IDs also stay unchanged. Legacy origin normalization and profile-schema decoding remain migration readers; neither generates old URLs or grants access.

The phone moves `qr-connect-session` into `myselfmd-session`, clears obsolete OAuth credentials, and requests fresh sign-in. Owner/device metadata remain intact. A new authenticated session reuses the old device only after verifying the same owner and an existing owned device; a different account starts without that device. Foreground launch replaces the old registered location task using the existing recording owner and authorization. Stop recording cleans up either task.

## Coordinated rollout

1. Run `npm run identity:protocol` to prepare the migration SQL without applying hosted changes.
2. Update the same production social-provider registrations to accept these exact URLs. Keep the existing provider application IDs and keys so provider subjects and account ownership remain stable:
   - Apple: `https://myself.md/auth/realms/myselfmd/broker/apple/endpoint`
   - GitHub: `https://myself.md/auth/realms/myselfmd/broker/github/endpoint`
   - Google: `https://myself.md/auth/realms/myselfmd/broker/google/endpoint`
3. Complete checks and native builds. Run `npm run verify:protocol`, `npm run verify:identity`, `npm run verify:worker`, `npm run verify:cloud`, and `npm run bundle`.
4. During the coordinated cutover, run `npm run identity:protocol -- --apply --providers-ready`. This exports the identity database into a private ignored backup, clones the first-party registrations with unchanged PKCE and consent policy, migrates allowed scopes, and disables old first-party registrations. Existing users, provider identities, resource grants and account partitions are preserved. Repeated execution is safe.
5. Deploy the matching Worker with `npm run worker:deploy` and distribute rebuilt native apps. Source configuration removes the retired Fly transport alias and registers only the new scheme. Existing binaries and cached MCP sessions require updating/reconnecting.
6. Verify actual Apple/GitHub/Google sign-in, phone callback and same-owner device reuse, then authorize an MCP client and read a previously shared export. Verify another account remains denied and grants can still be revoked. Record outcomes without tokens or personal records.

The migration SQL keeps disabled legacy client rows for audit and rollback. It does not copy grants to a new agent client or treat a delivered profile as approved. Dynamic clients retain their consent policy and must reconnect with the new scope. Previously issued tokens fail the new issuer/scope checks. Provider-console changes and real store/device distribution are separate from compilation.

For rollback, coordinate provider callbacks and the Worker issuer/configuration with the backed-up identity registrations. Do not restore an older database over newer user/account writes or change `ACCOUNT_NAMESPACE`. Retired Fly deployment files are recovery templates; creating an instance under the new template names requires provisioning those resources.

## Cutover evidence

The hosted identity database was backed up privately before applying the migration. Apple, GitHub and Google retain their existing application IDs and credentials; each provider now has only the canonical production callback above, and the retired Fly/development callbacks were removed. Public issuer discovery returns the new scope and issuer; the retired issuer returns 404. An existing browser identity session authorized the new dashboard client and displayed all seven retained exports. This proves account continuity and authenticated dashboard access, but does not by itself prove a fresh social-provider token exchange.

Formatting, aggregate static checks, protocol/session migration fixtures, identity integration, Worker and HTTP/MCP integration, bundle generation, and iOS/Android compilation passed. Physical-phone callbacks, native session/device reuse, production agent reconnection and store distribution remain release checks. Provider screenshots and the identity backup are in ignored `.local/protocol-migration/`; no credentials or personal records belong in committed evidence.

The final Worker release also exposes the provider logout-confirmation endpoint. Production browser verification completed the signed confirmation and reached “Logged out”; the isolated regression verifies that the old session is invalidated.
