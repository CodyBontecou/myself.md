import { publicFAQs } from '../core/public-site.js';
import { mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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
await build({
  entryPoints: ['dashboard/browser-tools.js'],
  outfile: 'dashboard/dist/public-tools.js',
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
});
const cliBundle = await build({
  metafile: true,
  entryPoints: ['scripts/myself.js'],
  outfile: 'dashboard/dist/myself.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  banner: {
    js: "import { createRequire as cliCreateRequire } from 'node:module'; const require = cliCreateRequire(import.meta.url);",
  },
});
await build({
  entryPoints: ['dashboard/public-client.js'],
  outfile: 'dashboard/dist/myself-sdk.mjs',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: ['es2022'],
});
const bundledPackages = new Set(
  Object.keys(cliBundle.metafile.inputs).flatMap((input) => {
    const directory = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1];
    return directory ? [directory] : [];
  }),
);
const cliNotices = [...bundledPackages]
  .map((directory) => {
    const manifest = JSON.parse(readFileSync(`${directory}/package.json`, 'utf8'));
    const licensePath = [
      'LICENSE',
      'LICENSE.md',
      'LICENSE.txt',
      'LICENSE-MIT',
      'license',
      'license.md',
    ]
      .map((name) => `${directory}/${name}`)
      .find((path) => existsSync(path));
    if (!licensePath) throw new Error(`Missing bundled dependency license: ${manifest.name}`);
    return `${manifest.name} (${manifest.version})\n\n${readFileSync(licensePath, 'utf8')}`;
  })
  .join('\n\n---\n\n');
writeFileSync('dashboard/dist/cli-notices.txt', cliNotices);

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
writeFileSync(
  'dashboard/dist/index.html',
  readFileSync('dashboard/index.html', 'utf8').replace(
    '"__PUBLIC_FAQ_SCHEMA__"',
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: publicFAQs.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    }),
  ),
);
copyFileSync('dashboard/favicon.svg', 'dashboard/dist/favicon.svg');
cpSync('dashboard/store-badges', 'dashboard/dist/store-badges', { recursive: true });
console.log('Built dashboard/dist. Start the cloud service to preview /dashboard.');

for (const asset of [
  'docs.css',
  'geist-regular.ttf',
  'geist-medium.ttf',
  'geist-semibold.ttf',
  'geist-license.txt',
])
  copyFileSync(`dashboard/${asset}`, `dashboard/dist/${asset}`);
