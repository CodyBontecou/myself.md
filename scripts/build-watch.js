import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

if (process.platform !== 'darwin')
  throw new Error('Watch compilation requires macOS and Xcode with the watchOS SDK.');
/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('npm', ['run', 'prebuild', '--', '--platform', 'ios', '--no-install']);
const project = readdirSync('ios').find((file) => file.endsWith('.xcodeproj'));
if (!project) throw new Error('Expo did not generate an iOS project.');
run('xcodebuild', [
  '-project',
  join('ios', project),
  '-scheme',
  'MyselfWatch',
  '-configuration',
  'Debug',
  '-destination',
  'generic/platform=watchOS Simulator',
  'CODE_SIGNING_ALLOWED=NO',
  '-derivedDataPath',
  '.local/xcode/watch-simulator-debug',
]);
