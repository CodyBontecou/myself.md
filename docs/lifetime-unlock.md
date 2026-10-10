# Lifetime unlock

The apps are free to install. The non-consumable `myself_md_lifetime` product unlocks unlimited exports and queries for a one-time US price of $19.99. Payments and restores use native StoreKit and Google Play Billing through `expo-iap`; there is no RevenueCat account or service.

Lifetime app access does not include unlimited hosted cloud storage. A planned 30-day free cloud trial with a 50 MB limit for lifetime purchasers and larger 1 GB/10 GB plans billed monthly or yearly are tracked in [Cloud service](cloud-service.md#proposed-hosted-storage-plans). Planned prices are $1.99/month or $19.99/year for 1 GB and $4.99/month or $49.99/year for 10 GB. Storage subscriptions are not implemented; current technical cloud limits remain in effect.

## What counts

Five free uses share one allowance. One manual profile export, one system-share export, or one scheduled occurrence consumes one use, even when it creates multiple daily files or formats. Uploading those files to cloud or HTTP does not charge again. Each `query_phone_data` or `read_cloud_export` call consumes one use, including each new pagination call. Polling the same request, retrying the same scheduled occurrence, listing metadata, browsing the owner dashboard, and changing settings do not consume uses.

Reservations prevent simultaneous calls from exceeding five. A failed manual export with no output releases its slot. An export that produces partial output counts. Scheduled work keeps its reservation across retries; disabling or changing its schedule releases an unused slot. Native counters persist across app launches, profile changes, and sign-out. Local uses are merged into the account once by operation ID before pairing completes. Once a phone has connected an account, free exports require that connection and network access so signing out cannot create a second allowance. Paid local exports can work offline. Deleting app storage or reinstalling an unpaired app can reset its local free allowance; a connected account's allowance persists on the server.

The reminder appears after the second completed use, with three remaining. The fifth completed use shows the exhaustion paywall. Further attempts show the paywall and are blocked before reading data. When a background or cloud operation crosses a milestone, the phone presents the paywall on its next foreground sync. Users can dismiss the paywall and continue browsing. Settings also offers purchase and restore access.

## Store setup required before release

1. In App Store Connect, create **Non-Consumable** product `myself_md_lifetime` for bundle `com.myself.md`. Set its US price to **$19.99**, provide localization and review information, and submit it with the free app.
2. In Google Play Console, create and activate a **one-time product** with the same ID for package `com.codybontecou.sharedjsapp`. Set the US price to **$19.99**. The app acknowledges this purchase and never consumes it. Configure license testers and publish an internal test build.
3. Configure the server variables below. Keep private keys and service-account credentials outside the image and source control. The server verifies Apple JWS signatures and checks the current transaction through Apple's App Store Server API, or checks the purchase token directly with the Google Play Developer API. Transaction ownership prevents one receipt from unlocking multiple app accounts. Cloud access refreshes stored purchase verification independently of a phone heartbeat. Failed verification does not grant access.
   For Docker Compose, place these files in `IAP_CREDENTIALS_DIR` (default `.local/iap`); the service mounts that directory read-only at `/iap`. Use `/iap/...` paths for its certificate, private key, and service-account variables. Fly deployments need the equivalent secret variables and credential files in their persistent volume.
4. Rebuild both native apps after installing dependencies or changing Expo config. `expo-iap` requires a native development/release build; Expo Go cannot perform these purchases.
5. Test a purchase, cancellation, pending payment, restore after reinstall, account association, and refund in each store's sandbox. Store products and verification credentials are not configured by this code change, so a real purchase cannot be verified until setup is complete.

| Variable                          | Purpose                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_LIFETIME_PRODUCT_ID` | Native SKU override; defaults to `myself_md_lifetime`.                                                                         |
| `LIFETIME_PRODUCT_ID`             | Matching server SKU override.                                                                                                  |
| `APPLE_IAP_BUNDLE_ID`             | Defaults to `com.myself.md`.                                                                                                   |
| `APPLE_IAP_APP_ID`                | Numeric App Store app ID, required in production.                                                                              |
| `APPLE_IAP_ROOT_CERTIFICATES`     | Comma-separated paths to Apple root certificates in DER format, from [Apple PKI](https://www.apple.com/certificateauthority/). |
| `APPLE_IAP_KEY_PATH`              | Path to the App Store Server API `.p8` private key.                                                                            |
| `APPLE_IAP_KEY_ID`                | App Store Server API key ID.                                                                                                   |
| `APPLE_IAP_ISSUER_ID`             | App Store Connect issuer UUID.                                                                                                 |
| `IAP_SANDBOX`                     | `1` only for a sandbox server; production rejects sandbox transactions.                                                        |
| `GOOGLE_PLAY_PACKAGE`             | Defaults to `com.codybontecou.sharedjsapp`.                                                                                    |
| `GOOGLE_APPLICATION_CREDENTIALS`  | Service account JSON path with Android Publisher access to this app.                                                           |

The price shown during purchase is the localized price returned by the native store; $19.99 is the configured US price, not a currency conversion hardcoded into checkout. A restored store purchase can unlock a phone without signing in; linking cloud/agent access requires sign-in and server verification. The same purchase remains attached to its first app account; restore from that account. Receipt proof is retained in SecureStore for later synchronization. OAuth credentials use after-first-unlock device-only keychain access so scheduled workers can check the account allowance while the phone is locked.

Run `npm run verify:billing` for quota, reservation, retry, offline merge, purchase ownership, revocation, and upload-scope checks. `npm run verify:cloud` covers the authenticated billing endpoint and metered uploads/agent reads alongside cloud behavior. Static checks cannot prove store checkout or purchase UI behavior.

References: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo IAP purchase APIs](https://hyochan.github.io/expo-iap/api/methods/unified-apis/), [Apple server library](https://github.com/apple/app-store-server-library-node), [Google product purchase API](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get).

Existing health.md, iso.me, and time.md customers can receive complimentary account access through the [customer migration flow](customer-migration.md).
