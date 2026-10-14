import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
export async function buildProfileShare() {
  const directory = 'dashboard/dist/profile-share';
  mkdirSync(`${directory}/share/profile`, { recursive: true });
  await build({
    entryPoints: ['dashboard/profile-share.js'],
    outfile: `${directory}/share/profile/app.js`,
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
  });
  copyFileSync('dashboard/profile-share.html', `${directory}/share/profile/index.html`);
  writeFileSync(
    `${directory}/_headers`,
    `/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'\n`,
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildProfileShare();
