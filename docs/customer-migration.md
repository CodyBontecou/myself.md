# Complimentary access for existing customers

Existing health.md and iso.me purchasers can claim a permanent, account-based myself.md lifetime grant. New customers continue to use the native $19.99 lifetime purchase. Grants bypass the five-use allowance for every export/query path and do not expire with native receipt verification caches.

## Customer journey

Start from myself.md’s onboarding **Claim existing-customer access** option or the same button on its paywall. The account screen explains the steps below and the manual time.md offer. These entry points do not purchase anything or claim access without verification.

1. In health.md (iPhone, iPad, or Google Play Android) or iso.me (iOS), open Settings → **Claim myself.md access**.
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
| `HEALTH_MD_APPLE_APP_ID`                                        | Health.md's numeric App Store app ID; required for its Apple verification.       |
| `ISO_ME_APPLE_APP_ID`                                           | `6761960794`                                                                     |
| `APPLE_IAP_KEY_PATH`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID` | App Store Server API key with access to both legacy apps.                        |
| `GOOGLE_APPLICATION_CREDENTIALS`                                | Android Publisher service account with access to Health.md as well as myself.md. |
| `IAP_SANDBOX`                                                   | `1` only in a separate test service. Production rejects sandbox purchases.       |
| `EXPO_PUBLIC_ACCOUNT_SERVER`                                    | Mobile myself.md account server, default `https://myself.md`.                    |

Compose forwards the legacy app IDs and existing verification credentials. In the two Swift apps, an optional `MyselfClaimServerURL` Info.plist value overrides `https://myself.md` for a separate HTTPS test server. Health.md Android currently targets `https://myself.md`.

Deploy the backend and dashboard before shipping the legacy-app claim buttons. Keep all three apps' native purchase flows intact. Explain the existing-customer migration and one-account rule in App Review notes. This implementation has not been deployed or submitted to a store by this change.

Before release, test actual sandbox StoreKit proofs for each base/family product and Health.md's paid-download path; Google Play purchased, pending, and refunded proofs; cancel/sign-in/retry; expiry; an already-claimed purchase; and access on a second myself.md device. Local tests validate policy and account isolation but cannot replace live store verification.

## time.md manual grants

Verify the buyer's successful, unrefunded Stripe payment first. Ask them to sign into myself.md and identify their account in your Keycloak admin console. Use the canonical `ACCOUNT_NAMESPACE|<Keycloak user ID>` subject; an email address alone is not an account ID.

Run against the live persistent billing database, on the service host or inside the service container:

```sh
DATA_DIR=/data npm run billing:grant -- \
  --subject 'https://myself.md/auth/realms/qr-connect|KEYCLOAK_USER_ID' \
  --stripe-payment 'pi_VERIFIED_PAYMENT_ID'
```

Use the same payment ID for retries; it cannot unlock a second account. This is an operator command with database access, not a public grant endpoint. Tell the customer to sign in or tap **Check lifetime access** in myself.md. No Stripe connection or customer messaging is performed automatically.

## Validation

`npm run verify:migration` covers eligible products, grandfather cutoff, revoked/shared purchases, expiry, purchase reuse, and permanent manual grants. `npm run verify:billing` covers the shared quota and clearing cached account access on sign-out. `npm run verify:dashboard` exercises the claim return route through OAuth PKCE. `npm run verify:cloud` checks authenticated claim redemption and phone retrieval across real HTTP boundaries.

Apple references: [App transaction information](https://developer.apple.com/documentation/appstoreserverapi/get-app-transaction-info), [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). Google: [Purchase verification](https://developer.android.com/google/play/billing/security).

Agents can use `get_lifetime_access` to inspect their authenticated account’s allowance and get the same claim guidance, account link, and remaining user steps. The read consumes no export and cannot redeem a claim or grant itself access. After the user completes the original-app/browser flow, call it again to verify the resulting entitlement.

The onboarding/account guide was exercised in an iOS release simulator in light and dark appearance at large text size, including button and edge-swipe returns to the preserved onboarding step. The paywall claim entry and modal dismissal were checked with the store product unavailable. Android and web bundles pass; Android device navigation and actual store proof verification remain release checks. The HTTP/MCP suite verifies strict inputs, account isolation, no export charge for access reads, rejected agent redemption, and entitlement observation after a user-authorized browser claim.

For the hosted Cloudflare deployment, add `--worker https://myself-md.costream.workers.dev` to `npm run billing:grant`. Put the private operator `IMPORT_SECRET` in ignored `.dev.vars`, temporarily enable migration mode, run the grant after verifying the payment, then disable migration mode. This updates global purchase ownership and the account object; writing Fly’s old billing database does not grant hosted access. See [Cloudflare migration](cloudflare-migration.md).
