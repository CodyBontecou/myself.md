# Agent Bridge

A mobile bridge between your agent and your phone’s health, screen time, and location data. The grouped interface keeps connections and access controls together; detailed data selection, file destinations, and schedules live under Profiles & exports.

## Run

```sh
npm ci
npm start
```

The app includes native HealthKit, Health Connect, Screen Time/Usage Access, SQLite, background location, and scheduled exports. Use a development or release build rather than Expo Go.

## Restored features

- HealthKit/Health Connect permissions and native readable samples.
- Native Screen Time/Usage Access plus original time.md archive imports. iOS raw usage still depends on the system entitlement and eligibility; unavailable access is reported rather than simulated.
- Location permission review, explicit single-point capture, background recording, and imported history.
- Original JSON archive preservation, indexed records, local file export/share, and deliberate deletion.
- Per-domain agent permissions and per-type sharing profiles.
- Profile review/import/share, JSON/JSONL formats, local/HTTP/cloud destinations, and automatic export schedules with foreground catch-up.
- QR/deep-link pairing, account sign-in, live MCP queries, and disconnection/revocation.

The app retains the original `com.codybontecou.sharedjsapp` identity, `qrconnect` links, `qr-connect-session` key, and `phone-data.sqlite` database. Updating the existing installation preserves its sandbox. A new install uses private local data until paired; collection permissions and sharing permissions are separate. New profile data types remain off until selected.

The preserved `client/`, `core/`, and local `modules/phone-usage/` implementations came from the main checkout. Expo Router screens live in `src/app`; the UI uses the new semantic light/dark theme. `server/` retains the original MCP/cloud service; run `npm run server` with its required environment configured, or pair with an existing service.

## Builds

The internal EAS profile is `preview`. This session used the user-authorized local workflow:

```sh
npx expo prebuild --platform ios --clean
npx expo run:ios --device <device-id> --configuration Release --no-bundler
```

Native projects are generated and ignored. Configure native capabilities through `app.json` and config plugins.

## Validation

```sh
npm run lint
npm run typecheck
npm run verify:exports
npm run verify:disconnect
npx expo install --check
```

The export regressions cover date cadence, opt-in, today refresh, DST, JSON/JSONL output, and source failure isolation. Available records continue to export when a selected source is unavailable or fails to read. JSON metadata and the JSONL companion manifest mark partial results and list source failures, including any records retained before a later page failed. Manual and scheduled messages flag partial exports. A partial scheduled day advances after delivery acknowledgement; manually retry after repairing permissions to replace it. If every source fails before returning records, previous daily files are preserved. Cancellation, disk errors, and delivery errors still fail the run. Disconnect regressions exercise failed/pending cleanup and ensure stale token refresh cannot restore a signed-out session. Device checks cover the corrected home, native source screens, and management navigation. OS consent and account access remain controlled by the user.
