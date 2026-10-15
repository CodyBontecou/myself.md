# Beta release preparation

Console inspection on 12 October 2026 used the owner's authenticated Apple and Google accounts. These observations are approval evidence at that time, not a claim that a beta has passed review or been installed.

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
