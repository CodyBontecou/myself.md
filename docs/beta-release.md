# Beta release preparation

## Automatic and cloud export distribution — 18 October 2026

Android Google Play internal build 14 now receives the beta export update group `ae8bd95b-21a1-467f-bf6c-c762ac3e1ab2`, with packaged runtime `55a2052c2ea05a4dce76326e3cc703c992584951`. A fresh store readback verified the completed internal release and exact AAB checksum. Native-loader manifest requests and authorized bundle downloads confirm the published export controls. The existing store binary is compatible, so no replacement AAB or Play track mutation was needed.

iOS **1.0.0 build 15** embeds the export changes and is available through the existing TestFlight Internal QA and Demo Beta groups. Apple build `35eab355-8aef-4d68-b198-be4a903a02be` is `VALID`, internal `READY_FOR_BETA_TESTING`, external `IN_BETA_TESTING` and review `APPROVED`. Canonical local-main job `18c7788a-5d0e-4e59-a23c-3695dcce4bca` included current uncommitted/untracked source; the signed IPA passed provisioning, entitlements, embedded-code and runtime checks before upload. Its SHA-256 is `26eb4d7a7b3507708a3a2c327e7a838633e409f9e7dcd7e792bc2417811476e6` and runtime is `d3f02c085da2c049a12b913590206ec4924060ff`. The runner's normal auto-increment is retained in app.json. Build 14's older iOS runtime requires installation of build 15; no fingerprint override or exclusion was used.

Existing testers, group settings, prior builds, reviewer credentials/contact fields, public store versions and other Play tracks were preserved. What to Test and reviewer notes explain multiple daily times, Cloud append/replace/new snapshots, possible append duplicates, owner permissions and OS background scheduling. Use the [existing TestFlight link](https://testflight.apple.com/join/5GwaFaQD) or [Google internal tester opt-in](https://play.google.com/apps/internaltest/4700960087233428532). Actual handset installation and OTA application are not claimed. See [mobile distribution evidence](mobile-updates.md#android-and-store-export-release-18-october-2026); private receipts are in ignored `.local/export-mobile-release/`.

## Launch flow fixes distribution — 17 October 2026

The current beta candidate is **1.0.0 build 13**, distributed to the existing TestFlight Internal QA and Demo Beta groups and Google Play internal-testing track. Apple build `4f6d68e5-f1fa-472a-9185-844516f70636` independently read back as `VALID`, internal `READY_FOR_BETA_TESTING`, external `IN_BETA_TESTING` and review `APPROVED` at 22:04:57 UTC. Google internal release `1.0.0 — Launch flow fixes 13` committed successfully and independently read back as `completed` with the exact uploaded checksum at 22:15:18 UTC. Group settings, tester resources, reviewer credential/contact fields, prior builds, other Google tracks and production releases were preserved. Google commit used `changesInReviewBehavior=ERROR_IF_IN_REVIEW`; no new tester invitations or production rollout occurred.

Both store artifacts came from canonical local `main` at `14f228b6728056b382d48be8d696358959dc0342`, including the current uncommitted/untracked source, through the standard local-phone-build runner:

| Platform | Verified artifact                                                                                                                                        | Size             | Native runtime                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------ |
| iOS      | [IPA from job 443c4e69-065d-437f-a3ca-1a407a282147](/Users/codybontecou/dev/local-phone-builds/.local/jobs/443c4e69-065d-437f-a3ca-1a407a282147/app.ipa) | 28,769,524 bytes | `259d5f6a4b43cdc29b9faed32a7c3182484877b7` |
| Android  | [AAB from job a07db105-87b0-4b34-b222-1bbf750cee10](/Users/codybontecou/dev/local-phone-builds/.local/jobs/a07db105-87b0-4b34-b222-1bbf750cee10/app.aab) | 95,224,339 bytes | `54b487ff8698ec4f6585fb4726d2aea2d2fd82bf` |

IPA SHA-256: `a547ca2d00b4e7708f9e9147eaf908fd6aec5553c49c74cf1900d3fd42f31775`. AAB SHA-256: `192a18e7a1bb66b26b0ee0ff2714401b87062def9cfae68e52e48ca74507c9a3`. All runner checks passed. Independent checks confirmed signed Release artifacts, package/version identity and embedded Hermes markers for profile pairing, visible one-point capture, atomic capture receipts, replaced-session rejection and cross-account pairing protection. Android additionally passed independent bundletool, JAR-signature and nondebuggable-manifest checks. The Android artifact includes the keyboard-height adjustment verified in the isolated onboarding fixture. These are native store binaries with embedded JavaScript; no OTA update or runtime override was published.

The compatible Location-capture backend was activated before this candidate as Worker `0c67f278-0b42-40e9-8c92-ae73bf0f3b1b` at 100% traffic, preserving runtime bindings/settings and retained assets. The hosted `request_phone_location_capture` operation requires owner confirmation on the phone and retains existing OS/source grants; native start/completion are phone-owned operations. Exact-candidate HTTP/MCP and native fixtures cover ownership, queue outcomes, revocation, retry and atomic saved-point receipts. Those synthetic checks do not prove a real phone captured or delivered a point; see [MCP parity and activation evidence](mcp-parity.md#visible-one-point-location-capture-17-october-2026).

Build 13 **passed the bounded onboarding → first pairing → export → agent retest** from TestFlight on the physical iPhone 13 Pro Max and Google Play on the physical Pixel 7. Fresh six-screen onboarding/save/restart and ordinary Apple authentication/pairing retained the same private profile. The ordinary Location entry worked; cancelling an agent capture saved zero points, approving a new request saved one, and its exact retry retained one. Each local JSON export completed two nonpartial day files with metadata counts of zero yesterday and one today. A private query was denied, a Location-only grant delivered one timestamp-matched native record, and revocation denied fresh queries, exact retries and completed-result retrieval before expiry. Result forgetting and cold restart passed, retaining authentication and private access. The temporary client was blocked and its still-valid token denied. File bodies were not independently parsed; purchases, background recording and offline recovery remain untested. Source formatting/aggregate checks and the isolated Android onboarding flow passed; final repository checks, physical receipts and coverage limits are recorded in the [QA journal](argent-qa.md). Earlier build-11 failures remain historical evidence.

Use the existing [TestFlight link](https://testflight.apple.com/join/5GwaFaQD) or [Google internal tester opt-in](https://play.google.com/apps/internaltest/4700960087233428532). Private exact-artifact manifests, embedded-code proofs, upload receipts, audience snapshots and independent store read-backs are retained under ignored `.local/launch-fixes-store-release-13/`. The separate bounded physical runtime receipts are `.local/launch-fixes-e2e-oct17/ios13-receipt.json` and `.local/launch-fixes-e2e-oct17/pixel13-receipt.json`.

## Profile syncing distribution — 17 October 2026

Version **1.0.0 build 11** is distributed to the existing TestFlight Internal QA and Demo Beta groups and the existing Google Play internal-testing track. Apple build `ae14c446-b224-458e-b223-0274343ecb95` processed as `VALID`, external review is `APPROVED`, and external availability is `IN_BETA_TESTING`. Google release `1.0.0 — Profile sync 11` was committed as `completed` and independently read back with the exact uploaded AAB checksum. Testers, public-link settings, other Google tracks (including public beta 6), existing review state and production releases were preserved. No new invitations or production rollout occurred.

Both store builds came from canonical local `main` at `14f228b6728056b382d48be8d696358959dc0342`, including uncommitted/untracked source, through the standard local runner. iOS job `3876289b-1a04-4cc1-9127-cf18580ba6ef` produced IPA SHA-256 `6355fae04eae0e1e0be489bb0c7695118ed0fefff77d1214a33fb3a65e2fe617`; Android job `7eaaa535-eb58-47fd-b9e8-88c930aac90f` produced AAB SHA-256 `d23b8728b180d7f31d8a992d7aff317cd08f65fcd200babfaef169a9d3f8c471`. Signed identifiers, Release configuration, native entitlements/structure and embedded profile-sync code were verified before upload. The packaged-code check recognizes Hermes UTF-8 and UTF-16 string tables, retaining the complete permission-explanation assertion.

The update includes web/phone profile configuration synchronization, persisted merge baselines, conflict handling, and explanations that source permissions also control old cloud exports. The live hosted synchronization smoke test used only the isolated fictional account and restored all profiles and sharing. The physical iPhone/Pixel preview QA described in [Argent evidence](argent-qa.md#physical-profile-sync-across-iphone-android-and-dashboard-16-october-2026) remains separate from these store-upload checks; no TestFlight/Play-installed handset pass is claimed. Existing account entitlements, source grants and OS permissions were unchanged by publication. Beta purchases still use the production backend's existing sandbox restrictions.

Use the existing [TestFlight link](https://testflight.apple.com/join/5GwaFaQD) or [Google internal tester opt-in](https://play.google.com/apps/internaltest/4700960087233428532). Repository formatting, aggregate checks and the profile-sync regression passed. Expo Doctor reported newer patch releases for nine pinned Expo packages; the already-tested package versions were preserved, and both native builds and store validation succeeded. Private manifests, upload receipts, store snapshots and final confirmations are under ignored `.local/profile-sync-store-release/`. Google's historical version 1 was independently verified through generated-APK metadata after it stopped appearing in the current-edit bundle list; no bundle-deletion operation was performed.

Console inspection on 12 October 2026 used the owner's authenticated Apple and Google accounts. These observations are approval evidence at that time, not a claim that a beta has passed review or been installed.

## SQLite fix beta distribution, 16 October 2026

Both version 1.0.0 build 10 betas contain the retained independent SQLite connection fix and were compiled from canonical dirty local `main` through the standard runner. iOS job `0419eb2f-04fd-4cdb-accd-11365fc153ab` produced IPA SHA-256 `12b56688ca90c093275b4182c47f26e03a44e751440cb21d8f845786d2343358`. Apple delivery/build ID `c00132b4-f52d-441a-a6ef-949a014ab251` processed as VALID, reports APPROVED / IN_BETA_TESTING and is assigned to the existing Internal QA and Demo Beta groups. Android job `81a8be15-5f16-469d-972a-f91c80716a51` produced AAB SHA-256 `aeb1de2fc116938fba8b105f642e1fc1413ae370fb3b589b017fb36aeca784be`; Google Play internal release `1.0.0 — SQLite fix 10` was committed as completed and independently read back. Existing tester settings, other tracks and production releases were preserved.

Both beta native runtimes match their published SQLite updates, and direct update-service requests returned the expected IDs. Signing, embedded-bundle, retained-connection bytecode and isolated analytics HTTP/MCP checks passed. Standalone build-10 preview QA subsequently passed on both physical phones, including sign-in, SQLite-backed reads, restart and live identity linking. Fresh TestFlight-installed and Play-installed handset checks are not claimed; see the variant details in product analytics. See [mobile release evidence](mobile-updates.md#sqlite-connection-fix-distribution-16-october-2026). Private receipts are in `.local/sqlite-release/`.

## Analytics beta distribution — 16 October 2026

Version 1.0.0 build **9** is distributed to the existing beta audiences on both platforms. iOS processing is `VALID`, Internal QA is `READY_FOR_BETA_TESTING`, and Demo Beta external review is `APPROVED` with state `IN_BETA_TESTING`. Google Play internal testing contains the committed release `1.0.0 — Analytics 9`, status `completed`; a fresh edit independently confirmed version code 9 and the uploaded SHA-256. Existing TestFlight groups, public-link settings, testers, other Google tracks and previously uploaded bundles were preserved. No production store rollout or new tester invitation was performed.

Both artifacts were compiled through the standard local runner from canonical `main`, including uncommitted/untracked source: iOS captured `7885b8ec2039fe04cb831c40d31329eee59d782f`, and Android captured the newer `4d1c457145edacf9fe64315d678961d1ade7dc1b`. iOS job `bb601fce-aef0-42df-aded-fb092a12f41e` embeds runtime `b9247a7cf7567e34c5434a94722849d1539da6cd`; Android job `d8339d73-d951-4f84-87d9-76db04382dde` embeds runtime `3f9e88acad00b773f835389f8cf58e68d2fceb6c`. Artifact signatures, identifiers, release configuration, embedded JavaScript and native entitlement/structure checks passed. Both bundles independently contain the usage-consent control, first-party collector endpoints and onboarding/export event markers. Packaged update settings use the beta channel and the existing Expo project.

Apple build ID is `abc43678-7e6a-4631-873d-3ad18906b8e8`. The upload SHA-256 is `6fd637cd796270817de6f9e32b9f1791fa5e62c768fb866040d0fcd5e752849a`; Google's is `a3189116c487b29a4318b2ed87b018508d75adea46079445d11501a9f3ccbb7f`. Apple reviewer contact/demo fields were preserved; What to Test and reviewer notes explain optional analytics and the existing production-backend purchase limitations. Google commit retained `changesInReviewBehavior=ERROR_IF_IN_REVIEW`.

Use the [existing TestFlight link](https://testflight.apple.com/join/5GwaFaQD) or [Google internal tester opt-in](https://play.google.com/apps/internaltest/4700960087233428532). Analytics remains off until the owner enables **Share usage analytics** on Welcome or Settings → Privacy. No real account consent or phone data grant was changed by distribution. Actual installation and physical-device collection were not observed. Formatting, aggregate static checks, native analytics adapters and isolated HTTP/MCP/browser authorization/consent/reporting checks passed. Evidence is retained under ignored `.local/analytics-mobile-release/`.

## Cloud storage and profile-permission distribution — 16 October 2026

Both store artifacts were compiled locally through the standard runner from canonical `main` at `467408e7bf705735bf100b610316fb4f8cf1917a`, including the uncommitted/untracked source captured by each job. App identifiers remain `com.myself.md`, app version remains `1.0.0`, and native build numbers are retained in `app.json`. These are beta releases, not a production App Store rollout.

| Platform | Build | Verified distribution                                                                                                                        |
| -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | 8     | App Store Connect processing `VALID`; Internal QA `READY_FOR_BETA_TESTING`; Demo Beta review `APPROVED` and external state `IN_BETA_TESTING` |
| Android  | 8     | Google Play internal testing release `1.0.0 — Cloud tiers 8`, committed and independently read back as `completed`                           |

The [existing TestFlight public link](https://testflight.apple.com/join/5GwaFaQD) and [Google internal tester opt-in](https://play.google.com/apps/internaltest/4700960087233428532) remain the install handoffs. Existing TestFlight audiences/public-link settings and Google tester resources were preserved; no new invitations, audience expansion or production-track release was performed. Google commit explicitly used `changesInReviewBehavior=ERROR_IF_IN_REVIEW`, preserving the existing open-beta review and all other tracks. The obsolete internal draft 7 was superseded without deleting its bundle.

iOS job `989bb4ab-8ea9-453d-a44c-76efc3a37d55` produced the signed IPA, SHA-256 `3c10b7189799c8d9176a762a0a87c72fbaa158559240caea50f1c34bd00201bb`, native runtime `226dc84de2a7c5e99896ec37e5f82acacc8296b5`. Apple delivery/build ID is `406fdc72-af07-42d3-a98f-4c85c97f817c`. Store provisioning, signature, HealthKit/Family Controls/usage/Apple sign-in entitlements, purpose strings, embedded JavaScript, no Metro/debugger and nonexpired signing checks passed. Apple automatically approved this build for the existing external group. Reviewer credentials/contact fields were preserved; reviewer instructions and What to Test now describe the current build and purchase limitations.

Android job `27196d48-3536-4a01-8c9e-fdaaa69bcf82` produced the signed AAB, SHA-256 `eb43bc8a706fb8b361d3820a323beaed4f8e5f0f8dfbc71d8ed481b65d940adc`. Bundletool structure, signature, identifier/version, Release manifest and embedded JavaScript checks passed; Google's upload checksum matched exactly.

Both packaged bundles were independently checked for the 10 GB/1 TB cloud catalog and the untracked profile-log consent migration. Obsolete 1 GB products and the removed master profile-access control are absent. Initial iOS build 7 captured an earlier permission UI while source work continued; it was uploaded before the packaging discrepancy was found, but received no group assignment or distribution. Its receipts remain under `ios/held-build7/`; build 8 is the intended install.

The required profile-permission backend compatibility deployed as Worker `ec6a430c-71e5-41ab-90d4-860c27e0b2fb` at 100% traffic before availability. It accepts profile-owned permission handoffs and updates debug review links/policy while preserving existing secrets/bindings and the deployed documentation-sidebar presentation. Static checks, cloud HTTP/MCP, debug-log, real workerd and identity fixtures passed; live health/discovery/JWKS, unauthenticated denials, disabled migration endpoint, updated policy and asset hashes passed. Native-source, billing, export, scheduling and QA fixtures also passed. Private source manifests, upload receipts, checksums and fresh store read-backs are retained under ignored `.local/cloud-tier-mobile-release/`.

Installation and physical-device behavior were not observed. TestFlight purchases remain sandbox purchases and cannot unlock production Lifetime/cloud entitlements; the existing reviewer grant supports included storage only. No production subscription review or sandbox-acceptance setting was changed.

## Latest preparation — 14 October 2026

Android build 6 replaces build 4 in the open-beta draft. The disclosure/notification fixes, current-source AAB, native background-recording video and SDK Data safety audit are prepared. The privacy-only update is published and verified through the website and authenticated MCP read. The review video is published as unlisted, both location/foreground-service declarations are saved, and release validation has zero blocking errors. The owner approved sending all 13 changes, both quick-check stages passed, and Google confirms they are in review. Approval/public availability are pending and a 15-minute monitor is active; see the [open-beta packet](google-open-beta.md). Internal testing remains on build 4.

## Submission history — 13 October 2026

On 14 October, Google open-beta preparation for Android build 4 was saved in the console with all 178 available country/region entries, unlimited testers, adult target audience, reviewer access, listing assets and policy drafts. It is not submitted or active. The [open-beta review packet](google-open-beta.md) records the exact remaining release blockers, Data safety review, and native location-disclosure/video evidence.

TestFlight groups **Internal QA** (internal) and **Demo Beta** (external) both contain version 1.0.0, build 4. Neither group has testers; Demo Beta's public link is disabled. The owner approved the beta description, feedback information, test instructions, review contact and restricted reviewer account. These were saved in App Store Connect and verified; the reviewer password was transferred only into Apple's dedicated demo-account field and is not recorded here.

Build 4 was submitted for external Beta App Review on 13 October 2026 at 09:05 UTC. Apple confirms submission state **WAITING_FOR_REVIEW** and external build state **WAITING_FOR_BETA_REVIEW**. Internal state is **READY_FOR_BETA_TESTING**. This confirms submission, not approval or installation. No tester invitations were sent. Add App Store Connect users to Internal QA for internal testing; after Apple approves the build, add external tester emails to Demo Beta or deliberately enable its public link. [Open TestFlight](https://appstoreconnect.apple.com/apps/6821601165/testflight). The verified receipt is `.local/testflight-review/verified-submission.json` (ignored, no reviewer credentials).

The verified Android version-code-4 AAB from job `2404157a-98d3-41ea-a470-d845efc5b89c` was uploaded through the authenticated Play Console and published to the existing internal testing track as **1.0.0 — Demo beta 4**. The console confirms **Available to internal testers**, with release ID `2`. Existing tester enrollment was preserved; no tester list was expanded. Google still labels the app **Not reviewed**. The only release validation warning was a missing deobfuscation file; there were no blocking validation errors. Distribution to a device and actual installation remain unverified.

- [Internal release](https://play.google.com/console/u/0/developers/8478281120215349264/app/4975956814094189615/tracks/4700960087233428532/releases/2/details)
- [Tester opt-in](https://play.google.com/apps/internaltest/4700960087233428532)
- Local screenshot evidence: `.local/beta-submission/android-internal-active.jpg` (ignored).

After the owner approved continuing with the saved Apple login, EAS authenticated using the existing Keychain credential without a two-factor prompt. It reused the existing distribution certificate and created an active App Store provisioning profile for `com.myself.md`. No capabilities were changed. The local runner now uses Fastlane's supported `app-store` export method.

Apple rejected the first upload for a missing `NSHealthUpdateUsageDescription` purpose string because the bundled HealthKit SDK references write APIs. The Expo HealthKit plugin now supplies a truthful string describing the app's read-only behavior. The adapter continues to request only `toRead`; no write capability or grant was added. Signed-IPA verification now checks both HealthKit purpose strings and rejected the older binary before upload.

The rebuilt [iOS IPA](/Users/codybontecou/dev/local-phone-builds/.local/jobs/e56a857c-a294-4589-9901-dde0d66b09f2/app.ipa), job `e56a857c-a294-4589-9901-dde0d66b09f2`, passed native compilation and all artifact checks, including store provisioning, HealthKit/Family Controls/usage/Apple sign-in entitlements, both health purpose strings, Release signing and the beta update channel. Apple's local `altool` uploaded it using the existing App Store Connect administration key, keeping the private key local. The alternate saved key that failed authentication was not used for this upload.

Apple confirms **version 1.0.0, build 4**, delivery/build ID `04e78e10-c3df-4065-abb7-eca84b9bbeac`, with **build-status VALID**, **import-status VALID**, and **is-on-app-store-connect true**. Processing completed successfully. [Open TestFlight](https://appstoreconnect.apple.com/apps/6821601165/testflight). The local receipt is `.local/beta-submission/ios-build-status.json` (ignored). Store signing expires on 14 November 2026; Apple reports this TestFlight build expires on 11 January 2027. Test group assignment, external Beta App Review and real-device installation remain separate steps; no external tester invitations were sent. Both projects' formatting and aggregate checks passed.

## Confirmed console state

| Item                                               | Observed state                                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Apple app                                          | myself.md, Apple ID `6821601165`, bundle `com.myself.md`, team `67KC823C9A`                              |
| Family Controls distribution                       | Capability Requests reports **Assigned**; capability enabled for this bundle                             |
| App and Website Usage                              | Enabled for this bundle                                                                                  |
| HealthKit, Apple sign-in, associated domains, push | Enabled for this bundle                                                                                  |
| TestFlight                                         | No builds uploaded                                                                                       |
| TestFlight test information                        | Description, feedback email, URLs, review contact and review notes are blank; sign-in-required unchecked |
| Google account                                     | Organization account; the new-personal-account 12-testers/14-days production gate does not apply         |
| Google app                                         | Existing `myself.md`, package `com.myself.md`, console app ID `4975956814094189615`                      |
| Google internal testing                            | Existing release `1.0.0 — Lifetime purchase QA`; broader app status remains draft                        |
| Google policy declarations                         | 12 need attention; no approval inferred from the internal test release                                   |

The Apple identifier detail is at [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/bundleId/edit/4DV5FY85TD). The configured entitlements match the enabled capabilities. Store provisioning must still be generated and checked in the signed IPA. Family Controls data access has separate device/OS/region/user-authorization limits; see README's native source limits.

## Build and upload

The `beta` EAS build profile extends production, uses store distribution, Release iOS and an Android App Bundle, increments native build numbers locally, and uses a separate `beta` update channel. It currently uses the production EAS environment and `https://myself.md` backend. It does not grant free beta access or enable sandbox purchase verification. QA fixtures and embedded Debug mode are not enabled by this profile.

Run from the canonical app checkout on local `main`, including its uncommitted and untracked source:

```sh
npm run build:beta:ios
npm run build:beta:android
```

Each command dispatches to the standard sibling local phone build runner and returns an accepted job ID. Run them sequentially: its shared build lock permits one job at a time. Inspect `npm run status` from `../local-phone-builds` until the job completes or fails. The runner repeats formatting and aggregate checks, verifies local main before compilation, builds locally, and validates the signed artifact. Android requires the official bundletool JAR at the runner's ignored `.local/tools/bundletool.jar`. It is installed locally for this setup. Completion means a verified local artifact, not store upload/review/installation. Store artifacts are never sent to the private install host. Preserve EAS's build-number edits before subsequent builds.

Upload the exact completed job artifact, not a guessed latest artifact:

```sh
npm run submit:beta:ios -- --path /absolute/path/to/completed-job/app.ipa
npm run submit:beta:android -- --path /absolute/path/to/completed-job/app.aab
```

Submission credentials must be configured in EAS or provided through its interactive credential workflow. Apple needs an App Store Connect upload key; the dedicated In-App Purchase key is a different credential. Google needs an authorized Play Developer API service account for automated upload; manual Play Console upload is also supported. No key or service-account path is committed. Android submission targets **internal**, **draft**, with changes not sent for review; complete and roll out the draft in Play Console after review. iOS upload goes to TestFlight; external beta review and invitations are separate actions. Never pass `--auto-submit` to the local build commands.

## Signing setup and validation evidence

Both projects passed their aggregate static checks. The installed EAS CLI successfully resolved both beta build and submission profiles. The new AAB verifier passed against the existing signed version-1 AAB (bundle structure, signature, identifier, release manifest and embedded JavaScript); that older artifact is not a build of the current beta source. A private-publication retry of a beta job was rejected before publishing.

The `beta` profile now has active App Store signing credentials for `com.myself.md`, configured with the existing distribution certificate and a store provisioning profile. For future renewal, run `npm run credentials:beta:ios` interactively and select **beta**. Keep the working preview certificate and ad hoc profile for direct-install builds. Family Controls distribution approval remains assigned.

`npm run credentials:beta:android` manages Android credentials if needed; preserve the existing upload key because version 1 is already enrolled in Play signing.

The fresh Android beta build completed as job `2404157a-98d3-41ea-a470-d845efc5b89c`, version code **4**, from local main commit `8483cab65805cd78cefc44df3283865cb2349e3f` including uncommitted source. Its [verified AAB](/Users/codybontecou/dev/local-phone-builds/.local/jobs/2404157a-98d3-41ea-a470-d845efc5b89c/app.aab) passed bundletool structure, JAR signature, package, Release manifest and embedded-JS checks. Independent manifest inspection confirmed the **beta** Expo update request header, 39 Health Connect read permissions and no Advertising ID permission. The runner now supplies the installed Android SDK path and JDK; earlier SDK-path failures were corrected. The artifact has not been uploaded, reviewed or installed.

For this completed artifact, upload manually to Play Console or run:

```sh
npm run submit:beta:android -- --path /Users/codybontecou/dev/local-phone-builds/.local/jobs/2404157a-98d3-41ea-a470-d845efc5b89c/app.aab
```

## Apple console: owner checklist

Open [TestFlight test information](https://appstoreconnect.apple.com/apps/6821601165/testflight/test-info).

1. Fill beta description and feedback email (`cody@isolated.tech`), marketing URL (`https://myself.md`), and privacy URL (`https://myself.md/privacy`). Draft description: “Choose health, screen time and location data to export or share with your agents. This beta tests onboarding, profiles, exports, account pairing and cloud access. Screen Time availability depends on device, OS and region. Please report failures through in-app support or TestFlight feedback.”
2. Supply your review contact name, phone and email. Provide a dedicated review account and reliable sign-in instructions for authenticated/cloud capabilities. Do not paste credentials into this repository. Local exports and account/cloud features should be explained separately.
3. Explain where to grant health, Screen Time and location access, how to try an export, and how to pair an agent. Document unsupported Screen Time conditions and how reviewers can still exercise the app. Include any complimentary reviewer access in the instructions once actually granted.
4. After upload, resolve processing/export-compliance questions based on the binary. The app config declares no nonexempt encryption; confirm that remains accurate.
5. Create an internal group and smoke-test the installed build. Then create an external beta group, provide “What to Test,” submit the build for Beta App Review, and invite users after approval.
6. Finish App Privacy and verify the live privacy/deletion information before broader release. App Store listing screenshots and full production review remain separate from the initial TestFlight upload.

Do not request Family Controls distribution again unless Apple changes the assigned status. Regenerate store provisioning with the existing approved capabilities.

## Google console: owner checklist

Open [App content](https://play.google.com/console/u/0/developers/8478281120215349264/app/4975956814094189615/app-content/overview). The twelve declarations needing attention are:

- Privacy policy: `https://myself.md/privacy`.
- Ads: confirm the app contains no advertising.
- Sign-in details: provide usable reviewer access and instructions.
- Content ratings: complete the questionnaire truthfully.
- Target audience and content: choose the intended supported ages.
- Data safety: describe health, location, usage, account, cloud and support data accurately, including user-authorized agent sharing, SDK behavior, retention and deletion. Internal-only testing is exempt from the Data safety form; closed testing is not.
- Advertising ID: confirm from the final merged manifest and SDK inventory before declaring no use.
- Government apps: confirm no government affiliation.
- Financial features: confirm the app does not provide financial services; the lifetime app unlock is a store purchase.
- Health apps: declare the health-data features. Review Health Connect permission requests/type-specific justifications against the final AAB. Do not claim approval until Google confirms it.
- Location permissions: justify user-started location-history tracking, foreground/background access and in-app disclosure. Supply the required demonstration video and review path.
- Foreground service permissions: declare the location service type and user-started tracking behavior; supply evidence requested by the form.

Inspection of the existing signed version-1 AAB found 39 Health Connect read permissions, coarse/fine/background location, and the location foreground-service permissions. It did not contain the Advertising ID permission. Reconfirm the final beta AAB before filing declarations.

Keep requested Health Connect types aligned with the supported selectable types. If a permission is unnecessary for the beta, change the shared native/catalog behavior and Expo configuration together, then rebuild; this preparation does not silently remove data types.

Under Test and release → Testing → Internal testing, upload the new AAB, review validation and pre-launch findings, add the testers' Google-account emails, and roll out the intended internal release. Use the testers tab's [existing opt-in link](https://play.google.com/apps/internaltest/4700960087233428532); only enrolled tester accounts can use it. For a larger controlled cohort, finish store-listing/app-content setup and create a closed track. Existing internal distribution does not prove approval for closed or production tracks.

## Access and acceptance before invitations

The existing five-use allowance and paywall remain active. Choose and apply complimentary beta account grants through the existing owner billing workflow, or set up a separate sandbox backend before purchase testing. Production rejects sandbox transactions. Do not change production to accept sandbox receipts solely for TestFlight.

On installed store builds, verify cold launch without Metro, sign-in, denied/revoked permissions, supported data capture, local export, pairing and MCP queries, grant revocation, cloud upload/read/delete, account deletion, feedback and offline/reconnect behavior. Exercise iPhone and Android; iPad is supported by config and needs an appropriate smoke check before including tablet testers. A local binary verifier or static check does not prove these behaviors.

No beta users have been granted access, no external invitations sent, and no console declarations submitted by this preparation.

## References

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) and [EAS configuration](https://docs.expo.dev/eas/json/).
- [EAS submission](https://docs.expo.dev/deploy/submit-to-app-stores/).
- [Apple Family Controls distribution](https://developer.apple.com/documentation/FamilyControls/requesting-the-family-controls-entitlement) and [external TestFlight testing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/).
- [Google test tracks](https://support.google.com/googleplay/android-developer/answer/9845334), [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469), and [bundletool](https://developer.android.com/tools/bundletool).

## Lifetime check fix, 14 October 2026

Local store-build job `4bf050ec-8968-480b-bdf2-36f7b9e78d4a` completed as iOS 1.0.0 build 5 from canonical local main `8483cab65805cd78cefc44df3283865cb2349e3f`, including uncommitted source. The signed IPA passed all runner checks and an independent packaged-bundle check for the lifetime-access timeout message and Account action. Runtime is `eaef66cdcb5aa57a683a4237cfcbcb838327a4ec`. The fix bounds phone billing synchronization to 15 seconds, releases account actions on failure, rejects late cached-allowance updates and supports retry; successful login is saved before billing sync. Billing/session regression fixtures and aggregate static checks passed.

The owner explicitly chose a new TestFlight upload rather than replacing their TestFlight installation with a preview. Build 5 submission uses the existing beta submission profile and Internal QA group. Apple processing, installed-build verification and real-phone post-fix behavior remain pending until separately observed; local build completion alone proves none of those effects.

## Portrait icon release builds, 14 October 2026

The supplied portrait is packaged in iOS 1.0.0 build 6 (job `5e32bd22-92a1-4b04-916f-d89aaeea0ba9`) and Android 1.0.0 version code 7 (job `b5ddf6a0-afff-484c-9bb7-aaa92bd07108`). Both standard local-phone-builds store jobs completed from canonical local main `8483cab65805cd78cefc44df3283865cb2349e3f`, including current uncommitted/untracked source. iOS signing, store provisioning, required entitlements, embedded JavaScript and release checks passed; Android bundletool structure, signature, package, release and embedded JavaScript checks passed. Independent packaged-image comparisons verified the iOS launcher icon and Android launcher, adaptive foreground and monochrome icons against the new source artwork. Build number increments are retained in app.json.

Verified artifacts remain at `/Users/codybontecou/dev/local-phone-builds/.local/jobs/5e32bd22-92a1-4b04-916f-d89aaeea0ba9/app.ipa` and `/Users/codybontecou/dev/local-phone-builds/.local/jobs/b5ddf6a0-afff-484c-9bb7-aaa92bd07108/app.aab`. IPA SHA-256: `061b33a11b024207b36422d44c7f3a5a2d7d0fee4c20206d492ddce4c0e7de42`; AAB SHA-256: `4b96f27cfa8b636d0b117228dcbae36d594bd44208f394e4649fdcf4ac8e6225`. Neither artifact was submitted to the stores or installed by this operation.

The website favicon was deployed separately as Worker `83be4900-d1c0-4241-af55-6eb814cf336b`, with live image bytes, markup, preserved assets/configuration and health/OAuth/MCP checks verified. See the icon entry in [MCP parity](mcp-parity.md).

## Portrait icon store uploads, 14 October 2026

After owner authorization, iOS build 6 was uploaded directly with Apple's altool and the existing App Store Connect upload key. Apple delivery/build UUID is `22f7a9fa-503a-47cc-ac09-a6ecc09b026f`. The uploader reported success without errors. App Store Connect subsequently reported `VALID`, internal state `READY_FOR_BETA_TESTING` and external state `READY_FOR_BETA_SUBMISSION`. No external beta-review submission or tester invitations were initiated.

Android version code 7 was uploaded through the Google Play Developer API using the existing local service account and committed to the internal track as draft `1.0.0 — Portrait icon 7`. A fresh edit read verified the committed draft and its exact AAB SHA-256. Internal version 4 remains completed; the beta/public, alpha and production tracks were preserved. This uploads the artifact without rolling out version 7. Google required omitting `changesNotSentForReview` on commit; the release itself remains a draft.

The initial EAS archive transfers succeeded, but neither created a submission because managed Apple/Google submission credentials were not configured. Direct vendor uploads used the already verified artifacts and existing credentials; no rebuilt binary was substituted. Private receipts are in ignored `.local/icon-submission`.
