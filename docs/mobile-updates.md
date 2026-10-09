# Remote mobile updates

The app uses Expo SDK 57 and EAS Update. Preview and production builds have separate channels and use native fingerprint runtime compatibility. JavaScript and assets can update remotely; changes to native modules, config plugins, entitlements or permissions need a new installed binary. Existing installations with updates disabled cannot receive the first update-enabled build over the air.

## Configured project

The app is linked to [@codybontecou/myself-md](https://expo.dev/accounts/codybontecou/projects/myself-md), project ID `17768428-9e08-4033-9e72-2f630bbaa9aa`. Remote updates are enabled. Both EAS environments contain the public hosted-backend values, and GitHub has the EXPO_TOKEN secret. Expo has not enabled restricted token scopes on this account; the explicitly approved CI token inherits the account permissions and is stored only in GitHub Secrets. Revoke or rotate it from Expo account settings when needed.

The local iOS Release build and all-platform export passed after adding expo-updates. The first EAS iPhone build still needs Apple login to create this app's internal-distribution signing profile. The proposed release changes passed the aggregate check in an isolated copy of the committed app; unrelated support/diagnostics work is being edited concurrently in the shared checkout. Phone installation and actual update delivery remain unverified.

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
