# Remote mobile updates

The app uses Expo SDK 57 and EAS Update. Preview and production builds have separate channels and use native fingerprint runtime compatibility. JavaScript and assets can update remotely; changes to native modules, config plugins, entitlements or permissions need a new installed binary. Existing installations with updates disabled cannot receive the first update-enabled build over the air.

## Configured project

The app is linked to [@codybontecou/myself-md](https://expo.dev/accounts/codybontecou/projects/myself-md), project ID `17768428-9e08-4033-9e72-2f630bbaa9aa`. Remote updates are enabled. Both EAS environments contain the public hosted-backend values, and GitHub has the EXPO_TOKEN secret. Expo has not enabled restricted token scopes on this account; the explicitly approved CI token inherits the account permissions and is stored only in GitHub Secrets. Revoke or rotate it from Expo account settings when needed.

The local iOS Release build, Android Debug build and all-platform export passed after adding expo-updates. Aggregate static checks passed for both the isolated release candidate and the shared checkout, and GitHub PR checks passed. The initial preview updates published successfully for [iOS](https://expo.dev/accounts/codybontecou/projects/myself-md/updates/2c567107-be34-4b4a-9402-33a14b43f76b) and [Android](https://expo.dev/accounts/codybontecou/projects/myself-md/updates/f38cf652-f672-44c2-a08c-3a6826947a3e). Apple login and the ad hoc signing profile are configured for Cody Bontecou’s current iPhone. Live Apple capability synchronization passed. Phone installation and actual update delivery remain unverified. The GitHub preview workflow activates when its PR is merged.

## One-time setup

Log into Expo with `npx eas-cli@24.12.1 login`. Link the app with `npx eas-cli@24.12.1 init --account <your-expo-account> --non-interactive`, then run `npm run updates:configure`. Verify that app.json contains the real project ID and update URL, `updates.enabled: true`, and `runtimeVersion.policy: fingerprint`. Until that linking is complete, updates stay disabled; do not invent a project ID.

Create these plaintext EAS environment variables in both preview and production: `EXPO_NO_DOTENV=1`, `EXPO_PUBLIC_ACCOUNT_SERVER=https://myself.md` and `EXPO_PUBLIC_ALLOW_HTTP=0`. Build profiles also set these values. Update publishing uses EAS environments rather than the local .env; all EXPO_PUBLIC values are public app configuration. Never upload the development .env or backend credentials.

For an iPhone internal build, register the phone using `npx eas-cli@24.12.1 device:create` and complete enrollment on the phone. Establish Apple distribution signing and an ad hoc profile once through an interactive EAS build, or provide existing credentials. Only devices included in that provisioning profile can install it. Subsequent unattended builds reuse the credentials; newly registered devices require a refreshed profile. Install the generated preview build through its EAS link. Android previews produce an installable APK.

Create an Expo access token in the Expo account settings and save it as the GitHub repository secret EXPO_TOKEN. Never put it in source or chat. CLI login authorizes local commands but does not create this CI secret.

## Release commands

After setup, run `npm run build:preview -- --platform ios` for a new iPhone binary, or use android. Publish compatible changes with `npm run update:preview -- --message "Describe the change"`. The preview command never publishes to production.

The Mobile preview GitHub workflow runs checks and publishes to preview on pushes to main. Its manual trigger offers update/build and platform selection. Native builds are explicitly triggered to avoid consuming build quota on every push. A new fingerprint update cannot reach an older binary: build and install the corresponding native runtime when native inputs change. Build jobs wait for EAS completion, so a successful submission alone does not count as a successful build. There is no automatic production publishing or store submission.

Default update behavior checks on launch, downloads in the background and applies on a subsequent cold launch. To verify, install a preview binary, publish an observable compatible change, open the app online, then fully close and reopen it. Successful publishing is not evidence that a phone downloaded or applied the update. Offline launch uses the cached or embedded bundle.

Remote delivery adds no Settings action or account-data grant. EAS publishing is a developer release operation accessed by CLI/CI, not an application MCP operation. Phone installation and Apple authorization are platform handoffs. Existing application MCP authorization and coverage remain unchanged.

## Validation and references

Run npm run format and npm run check, export with npm run bundle, and compile the affected native platform after adding expo-updates or changing native configuration. Cloud build and phone update delivery still require authenticated runtime verification.

- [SDK 57 Updates](https://docs.expo.dev/versions/v57.0.0/sdk/updates/)
- [EAS Update setup](https://docs.expo.dev/eas-update/getting-started/)
- [EAS CI authentication and signing](https://docs.expo.dev/build/building-on-ci/)
- [Internal distribution](https://docs.expo.dev/build/internal-distribution/)

## Preserve Apple sign-in during capability sync

The existing primary App ID com.myself.md has Sign in with Apple enabled and anchors the web Services ID used by browser authentication. app.json explicitly declares `com.apple.developer.applesignin: ["Default"]` in ios.entitlements so EAS retains that capability. Missing entitlements make EAS request APPLE_ID_AUTH OFF, which Apple rejects for an App ID with linked apps/services. Keep the capability enabled and retry the build after updating config. No new authentication flow is introduced. Disabling capability sync globally or deleting/recreating the App ID is unnecessary. The EAS capability planner was exercised before and after the change; the OFF request disappeared. Live Apple synchronization reported no updates, and the corrected iOS Release build passed locally. Cloud binaries and phone delivery still require verification.

## Stable fingerprints after local Android compilation

The first cloud builds exposed two dependency differences: masked-view removes its legacy Android manifest package attribute when Gradle runs, and Health Connect generates android-expo/build files. fingerprint.config.cjs normalizes only that redundant package attribute and excludes only Health Connect generated build output. All other dependency source remains hashed. A runtime comparison confirmed identical hashes for the locally compiled and pristine npm packages, and a changed manifest attribute still changes its transformed contents. The configuration is included in strict server type checking and registered as a Knip entry. See [SDK 57 fingerprint configuration](https://docs.expo.dev/versions/v57.0.0/sdk/fingerprint/).

The corrected noninteractive [iOS build](https://expo.dev/accounts/codybontecou/projects/myself-md/builds/627ace1a-ba71-41eb-984a-f6d5f3401e05) and [Android build](https://expo.dev/accounts/codybontecou/projects/myself-md/builds/7282bb86-0727-4bab-b23b-f383605cb07a) both passed CONFIGURE_EXPO_UPDATES with runtime versions matching the published preview updates. The iOS cloud build subsequently failed because the ad hoc profile lacks the Family Controls entitlement. Android compilation was still running at this checkpoint. The saved Apple certificate/profile expires on November 14, 2026; renew signing credentials before further builds after expiry.

## Family Controls distribution signing

The saved Apple ad hoc profile does not include com.apple.developer.family-controls, so iOS distribution compilation cannot finish yet. App configuration and development signing do not grant distribution approval. The account holder must [request Family Controls distribution access](https://developer.apple.com/contact/request/family-controls-distribution), confirm Assigned status and Ad Hoc provisioning support in Capability Requests for com.myself.md, then regenerate the EAS provisioning profile and retry. If approval was already granted, enable the distribution capability for this App ID before refreshing the profile. Keep the existing Screen Time entitlements; removing them would remove an existing capability. See [Apple’s instructions](https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement).

## Apple approval and signing refreshed

On October 10, 2026, Apple showed Family Controls (Distribution) as Assigned. After explicit owner approval, it was enabled and saved for com.myself.md. EAS refreshed profile PURK5DUTX8 for the owner’s current iPhone. The decoded profile includes Family Controls, app-and-website-usage and Sign in with Apple entitlements. The [new iOS preview build](https://expo.dev/accounts/codybontecou/projects/myself-md/builds/9f3fea3d-076c-4932-af8a-367866b2bfc6) was submitted successfully. The [Android preview build](https://expo.dev/accounts/codybontecou/projects/myself-md/builds/7282bb86-0727-4bab-b23b-f383605cb07a) completed successfully. iOS cloud completion and actual phone update delivery still require verification.
