import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Simulator Keychain uses build-time simulated entitlements. Signing an already
// linked binary does not supply them and can prevent the simulator from launching it.
const { ios } = JSON.parse(readFileSync('app.json', 'utf8')).expo;
if (!/^[A-Z0-9]{10}$/.test(ios.appleTeamId) || !/^[a-zA-Z0-9.-]+$/.test(ios.bundleIdentifier))
  throw new Error('Set the iOS team and bundle identifier in app.json before building.');
const source = spawnSync(
  '/usr/bin/plutil',
  ['-convert', 'json', '-o', '-', 'ios/myselfmd/myselfmd.entitlements'],
  { encoding: 'utf8' },
);
if (source.status !== 0)
  throw new Error(
    source.stderr || 'Could not read generated iOS entitlements. Run Expo prebuild first.',
  );
const identity = `${ios.appleTeamId}.${ios.bundleIdentifier}`;
const entitlements = {
  ...JSON.parse(source.stdout),
  'application-identifier': identity,
  'com.apple.developer.team-identifier': ios.appleTeamId,
  'keychain-access-groups': [identity],
  'get-task-allow': true,
};
mkdirSync('.local/ios-simulator', { recursive: true });
const path = resolve('.local/ios-simulator/entitlements.plist');
const converted = spawnSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', path, '-'], {
  input: JSON.stringify(entitlements),
  encoding: 'utf8',
});
if (converted.status !== 0)
  throw new Error(converted.stderr || 'Could not prepare simulator entitlements.');
const build = spawnSync(
  'xcodebuild',
  [
    '-workspace',
    'ios/myselfmd.xcworkspace',
    '-scheme',
    'myselfmd',
    '-configuration',
    'Debug',
    '-destination',
    'generic/platform=iOS Simulator',
    'CODE_SIGNING_ALLOWED=YES',
    'CODE_SIGN_IDENTITY=-',
    `CODE_SIGN_ENTITLEMENTS=${path}`,
    '-derivedDataPath',
    '.local/xcode/ios-simulator-debug',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
if (build.error) throw build.error;
process.exitCode = build.status ?? 1;
