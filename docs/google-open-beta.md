# Google Play open beta preparation

Prepared on 14 October 2026 for `com.myself.md`, version 1.0.0, Android version code **6**. The owner approved the Android fixes, a replacement beta, all available countries, the recommended adult target audience, the existing restricted fictional reviewer account, IARC terms, listing/graphic and the privacy-only website update. **The owner authorized submission, and all 13 changes are now in Google review.** The pre-submission and post-confirmation quick checks passed. The public Android beta is not yet available.

## Release and audience

- [Open testing draft](https://play.google.com/console/u/0/developers/8478281120215349264/app/4975956814094189615/tracks/open-testing): draft **1.0.0 — Public demo beta 6** now contains uploaded build 6; build 4 was removed only from this open-beta draft and remains in the artifact library/internal track. Readback confirms only build 6 in the saved draft. Internal release 1.0.0 — Demo beta 4 separately still reports Available to internal testers.
- All 178 available country/region entries, including Rest of World; unlimited testers; feedback `cody@isolated.tech`. Targeting is separate from production.
- Intended audience **18 and over**; this is not an implemented age gate. IARC content ratings are separate: ESRB Everyone, PEGI 3, Brazil 14+, Shares Location and In-App Purchases.
- Tools category; approved English listing, icon, feature graphic and three raw phone screenshots. No ads, Advertising ID, government affiliation or financial features. Purchases are disclosed.
- Restricted reviewer credentials are saved only in Google’s dedicated fields. No password is recorded here. The fictional cloud account has complimentary lifetime access; it does not prove native phone collection.
- Existing internal testing release remains build 4. Its tester list is unchanged.

## Verified build and Android changes

Final job `19beba22-1d6b-4c74-856c-a37088616fe5` built canonical local main including dirty/untracked source. [AAB](/Users/codybontecou/dev/local-phone-builds/.local/jobs/19beba22-1d6b-4c74-856c-a37088616fe5/app.aab): SHA-256 `b4329e7878ae4dbebc5c4b3d06f75bf4988a3581bb2137c26ea2bd0888c88754`, 94,636,389 bytes. Runner checks passed: bundle structure, upload signature, package, Release manifest and embedded JavaScript. Manifest inspection confirms target SDK 36, background location, foreground location service, notification permission, 39 health read permissions and no Advertising ID. Beta channel and production backend remain configured; QA/debug modes are disabled.

A cancellable native disclosure now explains precise location collection while closed, local storage, separately approved destinations, battery use and stopping before OS prompts. Notifications and an unblocked native service channel are required before starting. Cancellation has a distinct outcome, so it cannot restart recording after a Settings return. Recording does not enable agent access.

Build-5 native checks verified Cancel and notification denial kept recording off, then granting notifications allowed recording. The exact build-6 AAB was converted with official bundletool and installed cleanly on an isolated Android 36 emulator. The walkthrough verified notification and foreground permission prompts, Allow all the time in Settings, successful return/start, points increasing from one to five while the app was on Home, the foreground notice, and Stop retaining six points while removing that notice. Network was disabled to prevent OTA replacement; no QA fixture mode, personal account or real phone was used.

Recording was stopped, temporary network settings restored, and only the evidence emulator’s Argent services and emulator were shut down after capture.

The emulator APK uses the local debug key solely for installation. This is **not a Play-installed binary** and does not prove Play signing, purchases, OAuth callbacks or Integrity. Store-installed integration smoke checks remain necessary before broad invitations.

## Data safety and privacy

The [19 October reconciliation](store-privacy.md) supersedes the declaration status below. It verifies the existing 18 categories, adds missing opt-in analytics and transactional-notice purposes, and records an unresolved Google retention-policy rejection. After the owner explicitly approved the full bundle, the corrected policy link, Data safety answers and pre-existing Resume open testing change were submitted. Google shows Changes in review; policy approval and public open-test availability remain unverified.

The audited Data safety declaration is **saved in Publishing overview**, ready for owner review. It declares 18 data types, non-ephemeral collection, app functionality and the applicable account/security/support/bug-diagnosis purposes. Identity, purchase history, approximate/precise location, support messages, profile photos, health/fitness, optional diagnostics/performance, files and app activity are optional. **Crash logs and Device or other IDs are required** because Expo automatic update checks send an installation UUID and, after launch failure, a short error report without an in-app opt-out. OAuth profile avatar storage is included under Photos.

The Shared field uses Google’s service-provider and informed user-initiated-transfer exemptions for infrastructure, authentication, support and explicitly approved exports/agent reads. Google’s preview consequently says **No data shared with third parties**. This is a reporting interpretation under those exemptions, **not a promise that data never leaves the app**. Owners should review that interpretation before submission; future transfers outside those exemptions require an amended declaration.

TLS transport and OAuth account creation are declared. Live deletion instructions explain account removal, separate cloud-file deletion, local/other-provider limits, the seven-day deletion receipt and retained unlinked purchase identifiers. URLs: [account deletion](https://myself.md/delete-account) and [data deletion instructions](https://myself.md/privacy#revocation-and-deletion).

The [public privacy policy](https://myself.md/privacy#app-updates-and-launch-recovery) now includes Expo updates and launch recovery, dated 14 October. The owner approved private production inspection and the privacy-only update after automatic approval review initially blocked it. A content-only Cloudflare API replacement changed only the added policy section and date; exact source readback and all bindings/settings were verified. Cloudflare changed only its automatic deployment-method annotation. No unrelated local server changes were deployed.

Health Apps is **Other**, accurately describing read-only personal exports and approved queries, without diagnosis, treatment, coaching or research. All 37 permission fields Google presented have specific justifications; the signed manifest has 39 health read permissions. Saving this declaration does not establish approval of every permission or of the export use case.

## Review video and final gate

The 56.6-second [build-6 review video](/Users/codybontecou/dev/myself.md/.local/google-open-beta/android-build6-review.mp4) combines three consecutive real-device-screen captures with static pauses trimmed. It shows navigation, prominent disclosure, OS permissions, background recording/notification and stopping. The footage has no credentials or personal records; sample coordinates belong to the isolated emulator. A contact sheet was visually inspected.

The owner approved the unlisted YouTube upload and its Terms/Community Guidelines acknowledgment. The interrupted upload survived as an existing Shorts draft; it was resumed without a duplicate upload. [Hosted review video](https://youtube.com/shorts/1pk5RyntKWw): unlisted, processing complete, no restrictions, not made for kids, no age restriction. Playback from the share URL was verified. Both **Location permissions** and **Foreground service permissions** are saved with this actual URL. Location declares user-started personal location-history recording; foreground service declares **Other background location updates** only. The owner approved sending the 13 changes after quick checks passed. Managed publishing remains off, so the authorized open beta can publish automatically when Google approves it.

The final build-6 release preview has **zero blocking errors**. Its sole warning is the missing deobfuscation file. The release was saved into Publishing overview, which displays **Submit 13 changes for review** and includes the build-6 full rollout, 177 countries plus Rest of World, English listing, target 18+, ratings, privacy, ads, Data safety, Health Apps and Tools category. Both permission declarations are listed under What you’ve told us. The owner authorized submission. Both quick-check stages have finished, and Google explicitly confirms **Your changes are now in review**. The 13 changes were sent; no review approval or public availability is inferred. A 15-minute thread monitor, `watch-android-beta-build-6`, will notify on review changes, required intervention and a verified public join link. Evidence: `final-publishing-overview.txt/png`, `final-release-validation.txt/png`, `location-saved.png`, `foreground-service-saved.png`, `youtube-unlisted.png`, `internal-build4-preserved.png`. Formatting, aggregate static checks and native-source adapter verification pass.

The console’s future opt-in URL is `https://play.google.com/apps/testing/com.myself.md`. It becomes an invitation link only after Google approval and publishing; it is not currently live.

## Evidence and policy references

Ignored `.local/google-open-beta/` holds `build6-receipt.json`, `native-fix-verification.json`, `android-build6-review.mp4`, `data-safety-audit.json`, `data-safety-final-preview.png`, `privacy-update-receipt.json`, `privacy-update-live.png`, listing assets and health justifications. Private production snapshots are kept separately in restricted ignored `.local/google-open-beta-private/`; no credentials belong in the review packet or chat.

- [Google Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469): collection, optionality, service-provider and user-initiated-sharing exemptions.
- [Target audience](https://support.google.com/googleplay/android-developer/answer/9867159), [Health permissions](https://support.google.com/googleplay/android-developer/answer/12991134), [background location](https://support.google.com/googleplay/android-developer/answer/9799150), [foreground services](https://support.google.com/googleplay/android-developer/answer/13392821), [open testing](https://support.google.com/googleplay/android-developer/answer/9845334).
