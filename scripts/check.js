import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

// npm adds node_modules/.bin to PATH. Run independent checks concurrently.
/** @type {Array<[string, string, string[]]>} */
const checks = [
  ['Oxlint', 'oxlint', ['--deny-warnings', '--report-unused-disable-directives', '.']],
  ['Prettier', 'prettier', ['--check', '--cache', '.']],
  ['Mobile types', 'tsc', ['-p', 'jsconfig.json']],
  ['Core types', 'tsc', ['-p', 'core/jsconfig.json']],
  ['Server types', 'tsc', ['-p', 'server/jsconfig.json']],
  ['Dashboard types', 'tsc', ['-p', 'dashboard/jsconfig.json']],
  ['Unused code', 'knip', ['--no-progress']],
  ['Native lint', 'eslint', ['.', '--cache', '--max-warnings', '0']],
];
const start = performance.now();
const results = await Promise.all(
  checks.map(([name, command, args]) => {
    return new Promise((resolve) => {
      const started = performance.now();
      const child = spawn(command, args, { shell: process.platform === 'win32' });
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.on('error', (error) => {
        console.error(`${name}: ${error.message}`);
        resolve(false);
      });
      child.on('close', (code) => {
        const elapsed = ((performance.now() - started) / 1000).toFixed(2);
        console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${name} (${elapsed}s)`);
        if (output.trim()) console.log(output.trim());
        resolve(code === 0);
      });
    });
  }),
);
console.log(`Static checks: ${((performance.now() - start) / 1000).toFixed(2)}s total`);
process.exitCode = results.every(Boolean) ? 0 : 1;
