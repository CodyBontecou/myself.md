import { publicSiteHeaderStyles } from '../core/site-header.js';
import { projectSchema } from '../core/project-identity.js';
import { publicFAQs } from '../core/public-site.js';
import { buildProfileShare } from './build-profile-share.js';
import { buildBlog } from './build-blog.js';
import { mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { buildScreenTimeReview } from './build-screen-time-review.js';
import { buildHealthReview } from './build-health-review.js';
import { buildLocationReview } from './build-location-review.js';
import { buildChatgptCatalog } from './build-chatgpt-catalog.js';
import { buildHeartRateContext } from './build-heart-rate-context.js';
await buildScreenTimeReview();
await buildHealthReview();
await buildHeartRateContext();
await buildChatgptCatalog();
await buildLocationReview();
mkdirSync('dashboard/dist', { recursive: true });
await buildBlog();
await buildProfileShare();
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
  entryPoints: ['dashboard/usage-analytics.js'],
  outfile: 'dashboard/dist/usage-analytics.js',
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
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
  'dashboard/dist/style.css',
  readFileSync('dashboard/dist/style.css', 'utf8') + '\n' + publicSiteHeaderStyles,
);
writeFileSync(
  'dashboard/dist/index.html',
  readFileSync('dashboard/index.html', 'utf8')
    .replace('"__PROJECT_SCHEMA__"', JSON.stringify(projectSchema))
    .replace(
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
copyFileSync('dashboard/favicon.png', 'dashboard/dist/favicon.png');
copyFileSync('assets/myself-portrait.png', 'dashboard/dist/hero-portrait.png');
cpSync('dashboard/store-badges', 'dashboard/dist/store-badges', { recursive: true });
cpSync('dashboard/brand-icons', 'dashboard/dist/brand-icons', { recursive: true });
cpSync('dashboard/agent-logos', 'dashboard/dist/agent-logos', { recursive: true });
cpSync('dashboard/showcase', 'dashboard/dist/showcase', { recursive: true });
console.log('Built dashboard/dist. Start the cloud service to preview /dashboard.');

for (const asset of [
  'analytics.css',
  'blog.css',
  'docs.css',
  'geist-regular.ttf',
  'geist-medium.ttf',
  'geist-semibold.ttf',
  'geist-license.txt',
  'geist-pixel-square.woff2',
  'geist-pixel-license.txt',
])
  copyFileSync(`dashboard/${asset}`, `dashboard/dist/${asset}`);

cpSync('dashboard/getting-started', 'dashboard/dist/getting-started', { recursive: true });
cpSync('dashboard/guide-images', 'dashboard/dist/guide-images', { recursive: true });
