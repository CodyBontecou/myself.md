import { spawnSync } from 'node:child_process';

const result = spawnSync('swift', ['test', '--package-path', 'watch'], { stdio: 'inherit' });
if (result.error)
  throw new Error('Install the Swift toolchain or run this check on your Xcode Mac.', {
    cause: result.error,
  });
process.exitCode = result.status ?? 1;
