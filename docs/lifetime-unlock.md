# Lifetime unlock

The apps are free to install. The non-consumable `myself_md_lifetime` product unlocks unlimited exports and queries for a one-time US price of $19.99. Payments and restores use native StoreKit and Google Play Billing through `expo-iap`; there is no RevenueCat account or service.

Lifetime app access does not include unlimited hosted cloud storage. An included 100 MB cloud allowance with no recurring charge for lifetime users (including complimentary lifetime grants) and larger 1 GB/10 GB plans billed monthly or yearly are tracked in [Cloud service](cloud-service.md#proposed-hosted-storage-plans). Planned prices are $1.99/month or $19.99/year for 1 GB and $4.99/month or $49.99/year for 10 GB. Included storage is enforced for server-verified lifetime accounts; larger storage subscriptions are not implemented. Settings and the dashboard display account usage. Cloud exports retain their existing 30-day retention; the included allowance itself has no trial expiration.

## What counts

Five free uses share one allowance. One manual profile export, one system-share export, or one scheduled occurrence consumes one use, even when it creates multiple daily files or formats. Uploading those files to cloud or HTTP does not charge again. Each `query_phone_data` or `read_cloud_export` call consumes one use, including each new pagination call. Polling the same request, retrying the same scheduled occurrence, listing metadata, browsing the owner dashboard, and changing settings do not consume uses.

Reservations prevent simultaneous calls from exceeding five. A failed manual export with no output releases its slot. An export that produces partial output counts. Scheduled work keeps its reservation across retries; disabling or changing its schedule releases an unused slot. Native counters persist across app launches, profile changes, and sign-out. Local uses are merged into the account once by operation ID before pairing completes. Once a phone has connected an account, free exports require that connection and network access so signing out cannot create a second allowance. Paid local exports can work offline. Deleting app storage or reinstalling an unpaired app can reset its local free allowance; a connected account's allowance persists on the server.

The reminder appears after the second completed use, with three remaining. The fifth completed use shows the exhaustion paywall. Further attempts show the paywall and are blocked before reading data. When a background or cloud operation crosses a milestone, the phone presents the paywall on its next foreground sync. Users can dismiss the paywall and continue browsing. Settings also offers purchase and restore access.

## Store setup required before release

App Store Connect setup on 11 October 2026 created the `myself.md` app record (Apple ID `6821601165`, bundle `com.myself.md`) and **Lifetime Unlock** non-consumable product (ID `6821601267`, SKU `myself_md_lifetime`). Apple's API verified its current US price as **$19.99**. English (US) localization describes unlimited exports/queries and the included 100 MB. Availability now includes all 175 Apple storefronts, following the worldwide update described below; release review remains unfinished. The product now reports `READY_TO_SUBMIT` after completion of its review metadata; it has not been submitted for review.

The owner downloaded replacement In-App Purchase key `RT857RN2F4` (issuer `6c3b3640-c6bf-40a9-b6e5-57cda2c7776e`). Its EC private key is stored only in ignored local storage and Worker secrets. An authenticated Apple sandbox notification-history request succeeded. The existing production Worker received all seven Apple purchase settings, including the app ID, SKU, bundle, key, issuer and root certificates; sandbox mode remains disabled. The original key `3P4963GQGT` could not be recovered after the browser download stalled and is not configured on either server. Do not substitute the broad App Store Connect administration key or another app’s RevenueCat key. Private keys never belong in source control or the phone binary.

The installed physical-phone Debug build now resolves the native product and displays `Unlock forever · $19.99`; the displayed button price comes from StoreKit product discovery. No purchase was initiated during this discovery check. Sandbox purchase, restore, transaction verification and purchase-derived cloud eligibility are still unverified. Keep `IAP_SANDBOX=1` confined to an isolated sandbox server; production must continue rejecting sandbox transactions.

1. In App Store Connect, create **Non-Consumable** product `myself_md_lifetime` for bundle `com.myself.md`. Set its US price to **$19.99**, provide localization and review information, and submit it with the free app.
2. In Google Play Console, create and activate a **one-time product** with the same ID for package `com.myself.md`. Set the US price to **$19.99**. The app acknowledges this purchase and never consumes it. Configure license testers and publish an internal test build.
3. Configure the server variables below. Keep private keys and service-account credentials outside the image and source control. The server verifies Apple JWS signatures and checks the current transaction through Apple's App Store Server API, or checks the purchase token directly with the Google Play Developer API. Transaction ownership prevents one receipt from unlocking multiple app accounts. Cloud access refreshes stored purchase verification independently of a phone heartbeat. Failed verification does not grant access.
   For Docker Compose, place these files in `IAP_CREDENTIALS_DIR` (default `.local/iap`); the service mounts that directory read-only at `/iap`. Use `/iap/...` paths for its certificate, private key, and service-account variables. Fly deployments need the equivalent secret variables and credential files in their persistent volume.
4. Rebuild both native apps after installing dependencies or changing Expo config. `expo-iap` requires a native development/release build; Expo Go cannot perform these purchases.
5. Test a purchase, cancellation, pending payment, restore after reinstall, account association, and refund in each store's sandbox. Store products and verification credentials are not configured by this code change, so a real purchase cannot be verified until setup is complete.

| Variable                             | Purpose                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_LIFETIME_PRODUCT_ID`    | Native SKU override; defaults to `myself_md_lifetime`.                                                                         |
| `LIFETIME_PRODUCT_ID`                | Matching server SKU override.                                                                                                  |
| `APPLE_IAP_BUNDLE_ID`                | Defaults to `com.myself.md`.                                                                                                   |
| `APPLE_IAP_APP_ID`                   | Numeric App Store app ID, required in production.                                                                              |
| `APPLE_IAP_ROOT_CERTIFICATES`        | Comma-separated paths to Apple root certificates in DER format, from [Apple PKI](https://www.apple.com/certificateauthority/). |
| `APPLE_IAP_ROOT_CERTIFICATES_BASE64` | Workers secret: JSON array of base64-encoded Apple root certificates in DER format; takes precedence over certificate paths.   |
| `APPLE_IAP_PRIVATE_KEY`              | Workers secret containing the dedicated In-App Purchase `.p8` private key; takes precedence over the key path.                 |
| `APPLE_IAP_KEY_PATH`                 | Path to the App Store Server API `.p8` private key.                                                                            |
| `APPLE_IAP_KEY_ID`                   | App Store Server API key ID.                                                                                                   |
| `APPLE_IAP_ISSUER_ID`                | App Store Connect issuer UUID.                                                                                                 |
| `IAP_SANDBOX`                        | `1` only for a sandbox server; production rejects sandbox transactions.                                                        |
| `GOOGLE_PLAY_PACKAGE`                | Defaults to `com.myself.md`.                                                                                                   |
| `GOOGLE_SERVICE_ACCOUNT_JSON`        | Workers secret containing the Android Publisher service-account JSON; takes precedence over a local credential path.           |
| `GOOGLE_APPLICATION_CREDENTIALS`     | Service account JSON path with Android Publisher access to this app.                                                           |

The price shown during purchase is the localized price returned by the native store; $19.99 is the configured US price, not a currency conversion hardcoded into checkout. A restored store purchase can unlock a phone without signing in; linking cloud/agent access requires sign-in and server verification. The same purchase remains attached to its first app account; restore from that account. Receipt proof is retained in SecureStore for later synchronization. OAuth credentials use after-first-unlock device-only keychain access so scheduled workers can check the account allowance while the phone is locked.

Run `npm run verify:billing` for quota, reservation, retry, offline merge, purchase ownership, revocation, and upload-scope checks. `npm run verify:cloud` covers the authenticated billing endpoint and metered uploads/agent reads alongside cloud behavior. Static checks cannot prove store checkout or purchase UI behavior.

References: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo IAP purchase APIs](https://hyochan.github.io/expo-iap/api/methods/unified-apis/), [Apple server library](https://github.com/apple/app-store-server-library-node), [Google product purchase API](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get).

Existing health.md, iso.me, and time.md customers can receive complimentary account access through the [customer migration flow](customer-migration.md).

Google Play test purchases (`purchaseType=0`) are accepted only by an isolated server with `IAP_SANDBOX=1`. Production rejects them; the isolated server rejects ordinary purchases. Completed and unconsumed purchase state is still required. Android package configuration now uses the owner-selected `com.myself.md`; earlier test binaries remain separate installations.

On 11 October 2026, Google Play app `4975956814094189615` was created for the owner-selected `com.myself.md` package. The owner approved Google policy/export declarations and creation of the first Expo-managed Android signing keystore. A signed local production-profile App Bundle (version code 1) was uploaded and its internal release `1.0.0 — Lifetime purchase QA` published; the publisher API reports `completed`. The existing License Testers list contains `cody@isolated.tech` and is selected for the internal track. Google service-account verification secrets and the package binding are configured on production and isolated QA Workers. Production test-purchase rejection is deployed. After the owner selected worldwide availability, SKU `myself_md_lifetime` and Buy option `lifetime` were activated in all 174 regions at $19.99 US with Google-converted local prices. The publisher API independently confirms ACTIVE and AVAILABLE regional settings. The Pixel accepted the internal-test invitation using its existing license-tester account. Native product discovery returns the active Lifetime option and its localized price. Checkout initially returned item-not-found; after refreshing only Play Store cache and restarting Play Store, it reached Google’s digital-content consent screen. After the owner approved the digital-content agreement, Google displayed Test card, always approves and explicitly confirmed the order would not be charged. Checkout completed, the isolated server verified the real Google test purchase, and the native non-consumable transaction was acknowledged. Both explicit restore and restore after app restart returned the same hashed transaction reference and 100,000,000-byte allowance. No real charge occurred.

The shared Android adapter sends the active `lifetime` Buy option’s offer token from current native product discovery. This supports Google’s new one-time purchase-option model for both ordinary checkout and isolated QA. The version-code-1 internal bundle predates this JS correction; the connected Debug app runs current main through Metro. Rebuild before distributing the corrected adapter. Isolated purchase diagnostics expose a SHA-256 transaction reference, never the Android purchase token.

The purchase-derived Pixel account passed real cloud uploads, HTTP 413 rejection for 2 MB at 99 MB, exact 100 MB capacity, another rejected upload, deletion reclaim and re-upload. All 15 committed encrypted R2 objects decrypted and passed integrity checks for 100,000,000 bytes. Cleanup and subsequent verification reported zero used bytes, zero files and zero stored objects. This was an isolated license-test purchase in a Debug app; production paid checkout, restore after reinstall, pending/cancelled payment and refund/revocation remain unverified.

## Google Play regional Lifetime pricing

Applied on 11 October 2026 to `com.myself.md` / `myself_md_lifetime` / Buy option `lifetime`. The US remains $19.99. All 174 regions remain available and the purchase option remains active. The included 100 MB allowance and purchase-verification rules are identical at every price. App Store pricing was not changed in this update.

This is an initial affordability model, not a measured revenue optimum. Start with `19.99 × sqrt(country PPP GDP per capita / US PPP GDP per capita)` using World Bank 2024 data, then select the nearest USD tier from $4.99, $7.99, $9.99, $14.99, $19.99 or $24.99. The square root moderates discounts; the floor and ceiling limit extremes. GDP is an economic proxy, not individual income or app willingness to pay, and can be distorted in some markets. Where GDP data is missing, use current World Bank income groups: low $4.99, lower-middle $7.99, upper-middle $9.99, high $19.99; unclassified regions retain the baseline.

Google converts each tier using current exchange rates, local tax rules and valid local price patterns. USD tiers are tax-exclusive anchors, not a guarantee of the final USD equivalent paid locally. Regions remaining in the $19.99 tier retain their prior local prices; new regions retain the existing default until explicitly repriced. Store country determines regional eligibility, not device language, GPS or IP. Native checkout reads the actual store price.

| Region         | Lifetime price |
| -------------- | -------------- |
| Brazil         | BRL 49.99      |
| Germany        | EUR 20.99      |
| United Kingdom | GBP 13.49      |
| India          | INR 920.00     |
| Japan          | JPY 2600.00    |
| Portugal       | EUR 15.99      |
| Singapore      | SGD 34.98      |
| United States  | USD 19.99      |

The [full regional price list](lifetime-regional-prices.csv) records all 174 configured prices and their basis. All prices were read back through the publisher API and matched the proposed list; non-price fields were unchanged. 150 regional prices changed. Play Console independently displayed Portugal at EUR 15.99 and available. Local checkout price propagation has not been re-tested on the Pixel following this price-only update; Google warns store changes can take several hours. Compare regional purchase conversion and net proceeds once usage is sufficient, then revise prices deliberately; do not schedule automatic income-based repricing.

Sources: [World Bank PPP GDP per capita](https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.CD), [World Bank country classifications API](https://api.worldbank.org/v2/country?format=json&per_page=400), [Google regional price conversion](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization/convertRegionPrices), [Google store pricing](https://support.google.com/googleplay/android-developer/answer/6334373). Exact before/after catalog snapshots and conversion inputs are preserved in ignored `.local/google-play/regional-pricing-*.json` files for review or rollback.

## App Store regional Lifetime pricing

On 11 October 2026, the same balanced affordability tiers were applied to iOS non-consumable `myself_md_lifetime` (Apple product `6821601267`). The United States remains the base territory at USD 19.99. Country tiers reuse the Google Play model above; additional Apple storefronts use the same 2024 PPP calculation and income-group fallback. Apple equalizations of the six US anchors provide valid local price points, including local tax and currency adjustments. The $24.99 ceiling applies to the US anchor tier; local tax and Apple price patterns can produce a higher USD equivalent. Local iOS prices can differ from Google Play prices. Storefronts in the $19.99 tier retain their existing prices and automatic Apple adjustments; other tiers have explicit regional overrides and need deliberate review as currency or taxes change.

| Region        | iOS Lifetime price |
| ------------- | ------------------ |
| United States | USD 19.99          |
| Portugal      | EUR 17.99          |
| India         | INR 799.00         |
| Brazil        | BRL 59.90          |
| Singapore     | SGD 34.98          |

The [full iOS price list](lifetime-ios-regional-prices.csv) records all 175 configured storefront prices. The initial pricing update verified every price and the USA base territory while retaining USA/Portugal availability. The subsequent owner-authorized worldwide update enabled all 175 Apple storefronts; API read-back verified the complete territory set and that all 152 manual and 23 automatic price records and price points were unchanged. Availability in new Apple territories is also enabled; those storefronts inherit Apple’s base-price defaults until deliberately assigned an affordability tier. This configuration update does not submit the product for review; its state at the time was `MISSING_METADATA` (subsequently resolved by the review metadata update below). Of 175 prices, 151 changed; the resulting schedule contains 152 manual and 23 automatic regional prices. All purchasers receive the same Lifetime entitlement and 100 MB cloud allowance. No iPhone checkout was exercised after this catalog update; catalog verification does not prove device propagation or App Review readiness. Exact before/after schedules, availability and the update payload are preserved in ignored `.local/iap/` snapshots for review or rollback, including `worldwide-availability-*.json` and `worldwide-prices-*.json`.

Source: [Apple in-app purchase pricing API](https://developer.apple.com/documentation/appstoreconnectapi/managing-in-app-purchases).

## iOS Lifetime App Review readiness

On 11 October 2026, Apple product `6821601267` changed from `MISSING_METADATA` to `READY_TO_SUBMIT`. The existing English (US) name and description were retained. Reviewer notes now explain Settings → Unlock forever, native one-time checkout and localized prices, Restore purchases, the shared five-export free allowance, unlimited Lifetime exports/queries, and the included 100,000,000-byte cloud storage allowance with 30-day export expiry and account receipt verification. Local unlock/restore do not require app sign-in; cloud access does.

An actual iOS simulator screenshot of the normal-mode Lifetime screen was uploaded as private review asset `05e92b19-733b-4e38-96ce-6b59d65c9321`. Apple reports delivery `COMPLETE` with no warnings or errors. The original screenshot and metadata read-backs are retained in ignored `.local/iap/lifetime-review-screenshot.png` and `review-*.json`. No store transaction was initiated during screenshot capture, and this is not evidence of completed Apple sandbox purchase/restore. The temporary development dependency repair was reverted, and the simulator returned to its QA environment with the Metro connection configured for port 8082.

All regional price records were unchanged by these metadata edits. The product is metadata-ready, but has not been added to or sent in a review submission. Apple requires the first non-consumable product to accompany a new app version. App version 1.0 (`cc375887-17d7-4605-bcf6-01d8590157b5`) is still `PREPARE_FOR_SUBMISSION`, with no uploaded builds, description, support URL, keywords, or review contact details. Complete the app version metadata, privacy disclosures, screenshots and reviewer access requirements, upload/select a signed iOS build, and include this Lifetime product in the same submission.

Sources: [Apple first In-App Purchase submission requirements](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase), [Apple app submission requirements](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/).
