import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { collectWebsiteAudit } from './website-audit.js';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} */
const originalFetch = globalThis.fetch;
/** @type {string[]} */
const requested = [];
const site = 'https://myself.md';
const pages = ['/', '/blog', '/docs', '/pricing', '/public-noindex'];
/** @param {string} path */
const html = (path) =>
  `<!doctype html><html><head><title>Fixture ${path}</title><meta name="description" content="Unique fixture description ${path}"><link rel="canonical" href="${site}${path}">${path === '/public-noindex' ? '<meta name="robots" content="noindex">' : ''}${path === '/docs' ? '<script type="application/ld+json">{invalid}</script>' : ''}</head><body>${path === '/' ? '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>' : ''}</body></html>`;
/** @type {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} */
const fixtureFetch = async (input) => {
  const url = new URL(String(input));
  requested.push(url.href);
  assert.equal(url.origin, site, 'Crawler must never fetch a discovered external origin.');
  if (url.pathname === '/robots.txt')
    return new Response(`User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
  if (url.pathname === '/sitemap.xml')
    return new Response(
      `<urlset>${[...pages.map((path) => site + path), 'https://attacker.invalid/collect', `${site}/auth/secret`, `${site}/docs?token=private`].map((location) => `<url><loc>${location}</loc></url>`).join('')}</urlset>`,
      { headers: { 'Content-Type': 'application/xml' } },
    );
  if (url.pathname === '/pricing')
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://attacker.invalid/redirect' },
    });
  return new Response(html(url.pathname), {
    headers: {
      'Content-Type': 'text/html',
      ...(url.pathname === '/'
        ? { 'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'" }
        : {}),
    },
  });
};
Reflect.set(globalThis, 'fetch', fixtureFetch);
try {
  const report = await collectWebsiteAudit({ mode: 'daily', now: '2026-10-16T12:00:00Z' });
  assert.ok(
    report.findings.some(
      (finding) =>
        finding.id.startsWith('public-noindex-') && finding.url === `${site}/public-noindex`,
    ),
    'An accidentally excluded sitemap page must be reported.',
  );
  assert.ok(
    report.findings.some(
      (finding) => finding.id.startsWith('structured-data-json-') && finding.url === `${site}/docs`,
    ),
    'Malformed JSON-LD must be reported.',
  );
  assert.ok(
    report.findings.some(
      (finding) => finding.id.startsWith('beacon-script-csp-') && finding.url === `${site}/`,
    ),
    'An installed beacon blocked by CSP must be reported.',
  );
  assert.ok(
    report.sources.public.sampled.some(
      (sample) => sample.url === `${site}/pricing` && sample.status === 'error',
    ),
    'An unsafe redirect must not become an apparently healthy page.',
  );
  assert.ok(
    requested.every((url) => !new URL(url).search && !new URL(url).pathname.startsWith('/auth/')),
  );
  assert.ok((report.sources.public.sitemap.ignoredLocations ?? 0) >= 3);
  assert.equal(report.sources.cloudflare.status, 'unavailable');
  assert.equal(report.sources.searchConsole.status, 'unavailable');
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= 12000);
  console.log(
    'Website audit: crawl isolation, unsafe redirects, noindex, JSON-LD and blocked-beacon regression checks passed.',
  );
} finally {
  Reflect.set(globalThis, 'fetch', originalFetch);
}

const directory = await mkdtemp(join(tmpdir(), 'website-audit-guard-'));
const environment = { PATH: process.env.PATH, HOME: directory };
/** @param {string[]} args */
const fixtureGit = (args) =>
  execFileSync('git', args, { cwd: directory, env: environment, encoding: 'utf8' }).trim();
/** @param {string[]} args */
const fixtureAgent = (args) =>
  spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./website-audit-agent.js', import.meta.url)), ...args],
    {
      cwd: directory,
      env: environment,
      encoding: 'utf8',
    },
  );
try {
  await mkdir(join(directory, 'core'));
  await mkdir(join(directory, '.github', 'workflows'), { recursive: true });
  await writeFile(join(directory, 'core', 'public-site.js'), 'export const title = "Before";\n');
  const privileged = join(directory, '.github', 'workflows', 'check.yml');
  await writeFile(privileged, 'name: original\n');
  fixtureGit(['init', '--quiet']);
  fixtureGit(['config', 'user.name', 'Audit fixture']);
  fixtureGit(['config', 'user.email', 'audit@example.invalid']);
  fixtureGit(['add', '.']);
  fixtureGit(['commit', '--quiet', '-m', 'Fixture base']);
  const base = fixtureGit(['rev-parse', 'HEAD']);
  await writeFile(join(directory, 'core', 'public-site.js'), 'export const title = "After";\n');
  assert.equal(
    fixtureAgent(['guard', base]).status,
    0,
    'A tracked public presentation edit must be admitted.',
  );
  await writeFile(privileged, 'name: altered\n');
  assert.notEqual(fixtureAgent(['guard', base]).status, 0, 'Workflow changes must be rejected.');
  const patch = fixtureGit(['diff', '--', '.github/workflows/check.yml']);
  await writeFile(privileged, 'name: original\n');
  await writeFile(join(directory, 'core', 'public-site.js'), 'export const title = "Before";\n');
  const patchDirectory = await mkdtemp(join(tmpdir(), 'website-audit-patch-'));
  try {
    const patchPath = join(patchDirectory, 'candidate.patch');
    await writeFile(patchPath, `${patch}\n`);
    assert.notEqual(
      fixtureAgent(['apply', patchPath, base]).status,
      0,
      'An untrusted workflow patch must be rejected before application.',
    );
    assert.equal(
      await readFile(privileged, 'utf8'),
      'name: original\n',
      'Rejected patch must leave privileged files untouched.',
    );
  } finally {
    await rm(patchDirectory, { recursive: true, force: true });
  }
  console.log('Website audit: public-file guard and privileged patch rejection passed.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
