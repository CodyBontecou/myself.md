# App Store review — 24 October 2026

## Rejection and verified findings

Apple rejected iOS 1.0.0 build **23** under **2.5.1 Performance: Software Requirements**. The sole message on [submission `00e64031-1783-4641-851a-d4e96a9bfa9b`](https://appstoreconnect.apple.com/apps/6821601165/distribution/reviewsubmissions/details/00e64031-1783-4641-851a-d4e96a9bfa9b) says automated analysis found Screen Time APIs without the Family Controls entitlement. The submission is `UNRESOLVED_ISSUES`; the app item is `REJECTED`. Lifetime Unlock, both Cloud subscriptions and the subscription group remain `READY_FOR_REVIEW` and are blocked by the app rejection, rather than separately rejected.

The entitlement described as missing is present:

- Fresh App Store Connect API reads of App ID `4DV5FY85TD` (`com.myself.md`, team `67KC823C9A`) include `FAMILY_CONTROLS`, `FAMILY_CONTROLS_DISTRIBUTION` and `FAMILY_CONTROLS_WEBSITE_USAGE`. The signed-in Developer portal also shows all three enabled.
- The exact uploaded IPA has SHA-256 `f3fbe884684c9fc315212394b5deb53e20e333f77c4468503019e5fa5e742b28`, matching the build-23 upload receipt. Its code signature and embedded App Store provisioning profile both contain `com.apple.developer.family-controls = true` and `com.apple.developer.family-controls.app-and-website-usage = true`.
- `codesign --verify --deep --strict --verbose=2` passes for the extracted app. Direct inspection of its Mach-O signature also confirms the entitlement values in the XML blob; a sandbox-restricted signing-service warning was not an artifact defect.
- Only `com.myself.md` links DeviceActivity, FamilyControls and ManagedSettings. Embedded `com.myself.md.watch` and `com.myself.md.watch.widgets` link none of them. There are no Device Activity or Shield extensions in this IPA.
- Current Expo configuration already requests both entitlements. No source or signing change is justified by the observed rejection.

These checks contradict the missing-entitlement message but do not establish what Apple's scanner inspected or guarantee acceptance. Request manual inspection of the processed build before replacing it or removing Screen Time functionality. Apple's [reply workflow](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/reply-to-app-review-messages/) permits correspondence and supporting attachments for a rejected submission.

The version's saved App Review notes now begin with these entitlement facts, with readback verification that the original instructions, credentials and contact fields are preserved. No new binary, entitlement grant, release or resubmission was made. No mobile/dashboard capability or MCP authorization changed. Private API receipts, extracted artifact and signing evidence are under ignored `.local/app-review-oct24/`; never attach its credential-bearing review-detail snapshots.

## Reply sent to Apple — 24 October 2026

Sent with owner authorization through App Store Connect at **6:16 PM Puerto Rico time**. The submission conversation shows **Messages (2)** and the new reply attributed to Cody Bontecou. Status remains **Unresolved Issues**; this correspondence does not resubmit or approve the app.

Hello App Review,

We investigated the automated guideline 2.5.1 message for myself.md 1.0.0 build 23, submission 00e64031-1783-4641-851a-d4e96a9bfa9b.

Family Controls (Distribution) and Family Controls App and Website Usage are enabled for our App ID com.myself.md, team 67KC823C9A. We independently verified the exact IPA uploaded for build 23. Both the app's code signature and its embedded App Store provisioning profile contain:

```
com.apple.developer.family-controls = true
com.apple.developer.family-controls.app-and-website-usage = true
```

The IPA also passes deep, strict code-signature verification. Its SHA-256 is f3fbe884684c9fc315212394b5deb53e20e333f77c4468503019e5fa5e742b28.

Screen Time APIs are used only by the main iOS app. The included Watch app and Watch widget do not link Screen Time frameworks. This build contains no Device Activity or Shield extensions. App Review notes now include the entitlement details and the existing testing instructions.

Could you manually inspect the entitlements of the processed build and continue review? If the automated finding concerns a different executable or entitlement, please identify it so we can make the specific correction.

Thank you.

## Follow-up sent with evidence — 28 October 2026

The owner-authorized follow-up was sent through the same App Store Connect submission at **7:53 PM Puerto Rico time**. The conversation now shows **Messages (3)** and the new message attributed to Cody Bontecou, with `build-23-entitlement-evidence.pdf` listed under Message Attachments and a Download action.

The attached sanitized report contains selected code-signature and embedded-profile entitlement values, the 24 October App ID capability readback, uploaded IPA checksum/build identifiers and the main/Watch framework inventory. It explicitly distinguishes our uploaded artifact inspection from Apple's processed copy and excludes credentials, private keys, certificates and full provisioning profiles. The follow-up requests manual inspection of processed build 23 and identification of the exact executable and entitlement if another finding caused the rejection. Private evidence is under ignored `.local/app-review-oct28/`.

The initial text-file upload returned an error; the PDF upload completed and its attachment was verified on the sent message. The submission remains **Unresolved Issues**, with app build 23 rejected. No resubmission, new binary, publication or application/MCP capability change was made.
