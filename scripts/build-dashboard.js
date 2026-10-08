import { mkdirSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
mkdirSync('dashboard/dist', { recursive: true });
await build({
  entryPoints: ['dashboard/app.js'],
  outfile: 'dashboard/dist/app.js',
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const require = createRequire(import.meta.url);
const css = spawnSync(
  process.execPath,
  [
    new URL('./dist/index.mjs', `file://${require.resolve('@tailwindcss/cli/package.json')}`)
      .pathname,
    '-i',
    'dashboard/style.css',
    '-o',
    'dashboard/dist/style.css',
    '--minify',
  ],
  { stdio: 'inherit' },
);
if (css.status !== 0) throw new Error('Dashboard stylesheet build failed.');
copyFileSync('dashboard/index.html', 'dashboard/dist/index.html');
console.log('Built dashboard/dist. Start the cloud service to preview /dashboard.');
