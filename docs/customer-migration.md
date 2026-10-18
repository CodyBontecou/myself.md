# Complimentary access for existing customers

Existing health.md, iso.me, and paid time.md purchasers can claim a permanent, account-based myself.md lifetime grant. New customers continue to use the native $19.99 lifetime purchase. Grants bypass the five-use allowance for every export/query path and do not expire with native receipt verification caches.

## Customer journey

Start from myself.md’s onboarding **Claim existing-customer access** option or the same button on its paywall. The account screen explains the steps below and the time.md activation-key verification flow. These entry points do not purchase anything or claim access without verification.

1. In health.md (iPhone, iPad, or an updated Google Play Android build) or iso.me (iOS), open Settings → **Claim myself.md access**. Health.md's Android implementation requires a new app build; the backend configuration alone does not update installed apps.
2. Read the disclosure and choose **Verify purchase and continue**. Only purchase evidence is sent to myself.md; no health, location, or export data is uploaded.
3. The server verifies ownership with Apple or Google and opens a 15-minute claim link. Sign in with Apple or GitHub, check the displayed account, and explicitly claim lifetime access.
4. Open myself.md → Settings → **Your myself.md account**, then sign in with the same account. The app retrieves the lifetime grant. Agent pairing remains a separate action.

The link contains only a random ticket, never a receipt or Google purchase token. The browser removes it from the address bar and retains it in session storage during the PKCE login round-trip. Claim tickets are stored hashed on the server. Each original purchase can grant one account; retries for that account are safe. A purchase already claimed for another account is rejected.

## Eligibility

- Health.md iOS original downloads: Apple-signed original purchase date strictly before **April 26, 2026, 00:00 UTC**, matching Health.md's existing grandfather policy. This honors the existing policy rather than inferring an amount paid from a download receipt. Apple app transaction ID is required; the original app explicitly refreshes the App Store proof before claiming.
- Health.md iOS: `com.codybontecou.obsidianhealth.unlock` or `com.codybontecou.obsidianhealth.unlock.family`.
- iso.me iOS: `com.bontecou.isome.lifetime.individual` or `com.bontecou.isome.lifetime`.
- Health.md Google Play: `health_md_premium_lifetime` in `com.healthmd.android`.
- Family purchasers qualify for their own myself.md account only; family-shared recipients do not qualify independently. Customers who upgraded from Individual to Family claim through their original Individual purchase, which remains eligible. Family upgrade products alone do not grant another claim or extra accounts. This migration grants myself.md lifetime access to the purchaser, without creating a transferable family entitlement. Pending, revoked, wrong-app, and unsupported purchases are rejected.
- Health.md F-Droid and free macOS companion access do not establish a paid purchase and do not expose this claim flow.

Eligibility is verified when issuing a claim. Once redeemed, the complimentary grant is permanent and independent of ongoing source-store receipt polling. Store refunds after a completed claim do not automatically revoke the grant.

## Server setup and release

Configure the existing native verification credentials from [lifetime-unlock.md](lifetime-unlock.md), plus:

| Variable                                                        | Value                                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `HEALTH_MD_APPLE_APP_ID`                                        | `6757763969`; required for Health.md Apple verification.                         |
| `ISO_ME_APPLE_APP_ID`                                           | `6761960794`                                                                     |
| `APPLE_IAP_KEY_PATH`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID` | App Store Server API key with access to both legacy apps.                        |
| `GOOGLE_APPLICATION_CREDENTIALS`                                | Android Publisher service account with access to Health.md as well as myself.md. |
| `IAP_SANDBOX`                                                   | `1` only in a separate test service. Production rejects sandbox purchases.       |
| `EXPO_PUBLIC_ACCOUNT_SERVER`                                    | Mobile myself.md account server, default `https://myself.md`.                    |

Compose forwards the legacy app IDs and existing verification credentials. In the two Swift apps, an optional `MyselfClaimServerURL` Info.plist value overrides `https://myself.md` for a separate HTTPS test server. Health.md Android currently targets `https://myself.md`.

The hosted Worker requires `ISO_ME_APPLE_APP_ID=6761960794` and `HEALTH_MD_APPLE_APP_ID=6757763969` as deployment secrets, alongside its shared Apple verification credentials. These original app IDs are distinct from myself.md's `APPLE_IAP_APP_ID`; configuring only the latter leaves the legacy Apple claims unavailable with HTTP 503 before purchase verification.

On 18 October 2026, production reproduced that exact iso.me configuration error. Worker version `96dc8182-ba75-471f-9ccd-fec4c1f79604` added only the missing iso.me binding to the active application, preserving its script etag and existing bindings. The invalid-proof probe no longer returns the configuration error and issues no claim; it still receives the Worker's generic HTTP 503 failure response. Health, dashboard and OAuth discovery return HTTP 200. This confirms the missing configuration was repaired, without establishing successful Apple verification or real-purchaser redemption; those require a purchaser retry. Private version metadata and smoke results are retained under `.local/iso-me-claim-config/`.

The follow-up audit found the same missing setting for both Health.md Apple proof kinds. Worker version `a05d201d-852a-4b0a-878f-b9d2ca95f54c` added `HEALTH_MD_APPLE_APP_ID`, preserving the active script, assets, runtime and existing bindings. The retained Apple key authenticates requests for Health.md and iso.me; nonexistent transaction IDs return Apple's `TRANSACTION_ID_NOT_FOUND` rather than an authentication error. The retained Google service account can read Health.md's active `health_md_premium_lifetime` one-time product; an invalid purchase token is rejected. These credential checks do not establish real purchase ownership or successful production redemption.

time.md's nonexistent-license probes return HTTP 403 from its proof endpoint, myself.md's migration endpoint and the time.md claim endpoint. Its production Stripe secret is configured, its claim page is reachable, and its regression suite covers paid eligibility, trial/free/refund/dispute/revocation rejection and the browser handoff. The myself.md HTTP/MCP fixtures also verify claim completion, ownership isolation and entitlement observation. Real Stripe payment retrieval still needs a consenting purchaser's license. Android Health.md has backend product support but its current native source documents the disclosure/deep-link claim UI as planned; it must not be described as a verified available flow. Follow-up evidence is retained under `.local/other-app-claims/`.

The subsequent Android implementation adds the Play-only Settings entry and exact `healthmd://myself/claim` route. It presents disclosure before querying fresh completed lifetime-purchase evidence, submits only that evidence to the existing verifier, validates the same-origin browser ticket and reports awaiting-user confirmation. Cached unlocks, grandfathered Android access and F-Droid access do not establish a paid purchase. See [Health.md Android claim behavior](../../health-md/apps/android/docs/features/myself-md-claim.md). Native distribution and real-purchaser redemption remain separate release checks; no Google Play release is implied by source completion.

Deploy the backend and dashboard before shipping the legacy-app claim buttons. Keep all three apps' native purchase flows intact. Explain the existing-customer migration and one-account rule in App Review notes. This implementation has not been deployed or submitted to a store by this change.

Before release, test actual sandbox StoreKit proofs for each base/family product and Health.md's paid-download path; Google Play purchased, pending, and refunded proofs; cancel/sign-in/retry; expiry; an already-claimed purchase; and access on a second myself.md device. Local tests validate policy and account isolation but cannot replace live store verification.

## time.md paid-license claims

In time.md for macOS, open Settings → License & Trial → **Claim myself.md access**, or visit [the claim page](https://timemd.app/myself-claim.html) from the website footer or purchase-success page. Enter the activation key from your purchase email and choose **Verify purchase and continue**. The browser then opens the existing myself.md OAuth sign-in and explicit account confirmation described above. The phone's existing-purchases screen also links to this page.

`POST https://timemd.app/api/myself-claim` accepts `{ "activation_key": "TMD-…" }`, forwards the credential to myself.md's existing `/api/migration/proof` endpoint as `{ app: "time.md", store: "stripe", kind: "license", proof }`, and returns `{ status: "awaiting_user", claimUrl }`. It does not grant access. myself.md calls the fixed HTTPS `https://timemd.app/api/myself-proof` endpoint server-to-server; client-supplied payment IDs, email addresses, verification URLs and eligibility assertions are never trusted.

The time.md verifier checks the activation-key hash against an active D1 license, retrieves that license's Checkout Session and current PaymentIntent through its existing Stripe secret, and requires a completed live-mode time.md desktop-license payment with a positive amount, captured successful charge, no refund (including partial refunds) and no dispute. It rechecks license revocation after Stripe I/O. Trials, free promotional licenses, sandbox payments, revoked licenses and unavailable verification do not issue a ticket. Verification does not activate a device, create a new license, send an email or upload screen-time data.

The verified payment intent is the canonical `time.md:stripe|pi_…` ownership reference, shared with prior operator grants. The existing ticket expiry, account confirmation, one-account rule and same-account retry behavior apply. As with the other complimentary migrations, the redeemed grant is permanent; later source-payment refunds do not automatically revoke it.

Deploy time.md's verification endpoint before deploying the myself.md verifier; then publish the time.md claim page and updated Mac app. time.md uses its existing `DB` binding and `STRIPE_SECRET_KEY`; no new OAuth provider, secret or database migration is needed. The website and API were deployed on 12 October 2026; native Settings links still require updated app distribution. Production payment verification still needs a consenting real purchaser's activation key; fixtures cannot establish production eligibility.

The operator grant command remains available as a fallback after independently verifying payment. Use the same canonical payment intent ID and account subject, never an email address. See [Cloudflare migration](cloudflare-migration.md) for hosted operator grants.

## Validation

`npm run verify:migration` covers eligible products, grandfather cutoff, revoked/shared purchases, expiry, purchase reuse, and permanent manual grants. `npm run verify:billing` covers the shared quota and clearing cached account access on sign-out. `npm run verify:dashboard` exercises the claim return route through OAuth PKCE. `npm run verify:cloud` checks authenticated claim redemption and phone retrieval across real HTTP boundaries.

Apple references: [App transaction information](https://developer.apple.com/documentation/appstoreserverapi/get-app-transaction-info), [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). Google: [Purchase verification](https://developer.android.com/google/play/billing/security).

Agents can use `get_lifetime_access` to inspect their authenticated account’s allowance and get the same claim guidance, account link, and remaining user steps. The read consumes no export and cannot redeem a claim or grant itself access. After the user completes the original-app/browser flow, call it again to verify the resulting entitlement.

The onboarding/account guide was exercised in an iOS release simulator in light and dark appearance at large text size, including button and edge-swipe returns to the preserved onboarding step. The paywall claim entry and modal dismissal were checked with the store product unavailable. Android and web bundles pass; Android device navigation and actual store proof verification remain release checks. The HTTP/MCP suite verifies strict inputs, account isolation, no export charge for access reads, rejected agent redemption, and entitlement observation after a user-authorized browser claim.

For the hosted Cloudflare deployment, add `--worker https://myself-md.costream.workers.dev` to `npm run billing:grant`. Put the private operator `IMPORT_SECRET` in ignored `.dev.vars`, temporarily enable migration mode, run the grant after verifying the payment, then disable migration mode. This updates global purchase ownership and the account object; writing Fly’s old billing database does not grant hosted access. See [Cloudflare migration](cloudflare-migration.md).

## Production claim deployment — 12 October 2026

The time.md Pages release and myself.md Worker/dashboard release publish the paid-license verification and existing OAuth claim handoff. The myself.md release was built from commit `8483cab65805cd78cefc44df3283865cb2349e3f` with only the claim implementation, guide, dashboard copy and regression coverage overlaid. The baseline dashboard SHA-256 matched production before the change; unrelated local changes were excluded.

Live smoke checks cover both sites, OAuth discovery, unauthenticated account/claim rejection, disabled migration access and exact deployed asset hashes. A nonexistent activation key must return HTTP 403 through all three hops (`time.md /api/myself-proof`, `myself.md /api/migration/proof`, and `time.md /api/myself-claim`) without issuing a ticket or granting access.

The initial production smoke check exposed Cloudflare's rejection of fetch `redirect: error`. Both verification calls now use `redirect: manual` and reject non-success responses, so redirects are never followed. Regression tests include an upstream HTTP 302 denial. Temporary transport diagnostics were removed. Successful verification of a real customer's Stripe payment and authenticated redemption remain untested; native binaries were not published as part of this web/API rollout.

Final releases: time.md Pages `fa2c3de3` and myself.md Worker `6f3977ad-0c08-4985-8348-7c366607eeb4`. All final production smoke checks passed, including HTTP 403 across the complete verification chain. The private release manifest and asset hashes are retained under `.local/time-md-claim-release/`.
