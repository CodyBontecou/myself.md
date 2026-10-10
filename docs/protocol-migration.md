# Protocol migration to myself.md

The canonical native scheme and callback are `myselfmd://` and `myselfmd://oauth`. New OAuth configurations use the `myselfmd` scope and `myselfmd-phone`, `myselfmd-dashboard`, and `myselfmd-mcp` clients. The hosted issuer is configured as `https://myself.md/auth/realms/myselfmd`. The hosted identity migration and matching Worker deployment completed on 10 October 2026 (Worker version `a9149ab4-9db9-4ebd-b867-bef8a6904073`). Updated native apps still require distribution; installed binaries do not change with a Worker deployment.

## Clean hosted storage

The owner authorized discarding the legacy hosted data on 10 October 2026. The production `ACCOUNT_NAMESPACE` is now `https://myself.md/auth/realms/myselfmd`; active deployment and recovery configuration no longer use the retired storage identifier. Store bundle/application IDs and social-provider application IDs remain unchanged.

A two-deployment Durable Object reset creates `MyselfAccount` and `MyselfPurchase` and moves the bindings first, retaining the old class exports during that deployment. The next migration removes the old exports and deletes the former Account/Purchase classes and all their stored data. This is a deletion, not a rename or data transfer. Old devices, grants, export metadata, history and purchase-claim records are discarded. The exact pre-reset R2 export inventory is deleted separately; directory routes, OAuth sessions/tokens/consents and obsolete first-party client registrations are cleared. Social login identities and canonical client policy remain so users can sign in to a fresh account partition.

Phone installations and external copies cannot be erased by the hosted reset. Existing sessions need fresh sign-in and pairing; the different account namespace prevents old device reuse. Legacy local-session/task cleanup and profile decoding remain upgrade readers, not active hosted storage identifiers or accepted token issuers.

## Initial protocol rollout (before storage reset)

1. Run `npm run identity:protocol` to prepare the migration SQL without applying hosted changes.
2. Update the same production social-provider registrations to accept these exact URLs. Keep the existing provider application IDs and keys so provider subjects and account ownership remain stable:
   - Apple: `https://myself.md/auth/realms/myselfmd/broker/apple/endpoint`
   - GitHub: `https://myself.md/auth/realms/myselfmd/broker/github/endpoint`
   - Google: `https://myself.md/auth/realms/myselfmd/broker/google/endpoint`
3. Complete checks and native builds. Run `npm run verify:protocol`, `npm run verify:identity`, `npm run verify:worker`, `npm run verify:cloud`, and `npm run bundle`.
4. During the coordinated cutover, run `npm run identity:protocol -- --apply --providers-ready`. This exports the identity database into a private ignored backup, clones the first-party registrations with unchanged PKCE and consent policy, migrates allowed scopes, and disables old first-party registrations. Existing users, provider identities, resource grants and account partitions are preserved. Repeated execution is safe.
5. Deploy the matching Worker with `npm run worker:deploy` and distribute rebuilt native apps. Source configuration removes the retired Fly transport alias and registers only the new scheme. Existing binaries and cached MCP sessions require updating/reconnecting.
6. Verify actual Apple/GitHub/Google sign-in, phone callback and same-owner device reuse, then authorize an MCP client and read a previously shared export. Verify another account remains denied and grants can still be revoked. Record outcomes without tokens or personal records.

The initial protocol migration kept disabled legacy client rows; the subsequent authorized storage reset removes those rows. It does not copy grants to a new agent client or treat a delivered profile as approved. Dynamic clients retain their consent policy and must reconnect with the new scope. Previously issued tokens fail the new issuer/scope checks. Provider-console changes and real store/device distribution are separate from compilation.

The storage reset has no data-preserving rollback. Do not restore pre-reset snapshots into the fresh account namespace. Retired Fly deployment files are recovery templates; creating an instance under the new template names requires provisioning those resources.

## Cutover evidence

The hosted identity database was backed up privately before applying the migration. Apple, GitHub and Google retain their existing application IDs and credentials; each provider now has only the canonical production callback above, and the retired Fly/development callbacks were removed. Public issuer discovery returns the new scope and issuer; the retired issuer returns 404. After completing production logout, a fresh GitHub sign-in completed through the new provider callback and returned the same account with all seven retained exports. This proves fresh GitHub authentication, account continuity and authenticated dashboard access. Google reached its account chooser with the new callback and identity-only scopes, but the in-app browser stalled after account selection; its fresh token exchange remains unverified. Apple fresh sign-in remains a user/device release step.

Formatting, aggregate static checks, protocol/session migration fixtures, identity integration, Worker and HTTP/MCP integration, bundle generation, and iOS/Android compilation passed. Physical-phone callbacks, native session/device reuse, production agent reconnection and store distribution remain release checks. Provider screenshots are in ignored `.local/protocol-migration/`; retired private identity/account snapshots are removed by the reset; no credentials or personal records belong in committed evidence.

The final Worker release also exposes the provider logout-confirmation endpoint. Production browser verification completed the signed confirmation and reached “Logged out”; the isolated regression verifies that the old session is invalidated.

The historical account-continuity check above preceded the owner-authorized reset. Retained exports are no longer expected after reset. Fresh accounts must pair a phone and approve new data grants before MCP reads can succeed.

## Storage reset verification

The 10 October 2026 reset completed with deletion migration `v3-delete-legacy-storage`. The release artifact is Worker version `332591d1-6ef9-45d5-9da7-f62fe9077492`; removal of the legacy key binding produced active version `f1c1468a-1cc5-4346-94ed-a448d3c61937`. Deployed bindings resolve only to `MyselfAccount` and `MyselfPurchase`. All seven inventoried export objects were deleted and R2 listing returned zero objects. Before fresh sign-in, D1 checks returned zero obsolete clients, sessions, refresh tokens, consents, old account routes and tickets. Public JWKS now publishes only fresh key IDs; the retired verification-key bridge and binding are removed. Retired hosted export/identity snapshots were deleted locally while current provider credentials were preserved.

Fresh GitHub authentication returned a dashboard with zero stored exports and zero allowed/blocked agents. Existing hosted phone sessions with a pre-reset owner partition immediately require sign-in again; the actual session module regression checks cleared credentials, rejection of the old device association and continued ownership checks for canonical accounts. The isolated release passed formatting, the aggregate static check and real Worker/identity integration. Concurrent unfinished support/feedback work was excluded from the final reset deployment.
