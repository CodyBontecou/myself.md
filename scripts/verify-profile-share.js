import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { parseProfile, profileFromLink, profileLink, profileShareLink } from '../core/profiles.js';

const profile = parseProfile({
  schema: 'myself.md.profile.v1',
  name: '<img src=x> Family & friends',
  selection: { health: ['native:Steps'], time: ['native:applications'], location: [] },
});
const shared = profileShareLink(Object.assign({}, profile, { id: 'sender', agentAccess: true }));
assert.deepEqual(profileFromLink(shared), profile);
assert.deepEqual(profileFromLink(shared.replace('profile#', 'profile/#')), profile);
assert.deepEqual(profileFromLink(profileLink(profile)), profile);
assert.equal(shared.includes('sender'), false);
assert.equal(shared.includes('agentAccess'), false);
for (const invalid of [
  shared.replace('myself.md', 'evil.example'),
  shared.replace('#', '?'),
  shared + '&extra=1',
  shared.replace('https:', 'http:'),
  shared + '#extra',
  'https://myself.md/share/profile#payload=%ZZ',
])
  assert.throws(() => profileFromLink(invalid));

const html = readFileSync('dashboard/dist/profile-share/share/profile/index.html', 'utf8');
const script = readFileSync('dashboard/dist/profile-share/share/profile/app.js', 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  /** @type {string[]} */
  const requests = [];
  await page.route('https://myself.md/**', async (route) => {
    const url = route.request().url();
    requests.push(url);
    await route.fulfill({
      contentType: url.endsWith('/app.js') ? 'text/javascript' : 'text/html',
      body: url.endsWith('/app.js') ? script : html,
    });
  });
  await page.goto(shared);
  await page.locator('#profile-open').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#profile-name').textContent(), profile.name);
  assert.equal(await page.locator('img').count(), 0);
  assert.equal(await page.locator('#profile-open').getAttribute('href'), profileLink(profile));
  assert.equal(
    await page.locator('#profile-summary').textContent(),
    '2 selected data types · JSON',
  );
  assert.ok(requests.every((url) => !url.includes('payload') && !url.includes('#')));
  await page.locator('#profile-copy').click();
  await page
    .locator('#profile-status')
    .filter({ hasText: /^Copied\./ })
    .waitFor();
  assert.equal(await page.evaluate('navigator.clipboard.readText()'), shared);
  await page.goto('https://myself.md/share/profile#payload=%ZZ');
  await page.getByRole('heading', { name: 'This profile link is invalid', exact: true }).waitFor();
  assert.equal(await page.locator('#profile-open').isVisible(), false);
  assert.equal(await page.locator('#profile-copy').isVisible(), false);
  await page.addInitScript(
    "Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } })",
  );
  await page.goto('about:blank');
  await page.goto(shared);
  await page.locator('#profile-copy').click();
  await page
    .locator('#profile-status')
    .filter({ hasText: /^Copy the link from/ })
    .waitFor();
} finally {
  await browser.close();
}
console.log(
  'Profile sharing: HTTPS/native round trips, fragment privacy, rendered safe text, validated app handoff, clipboard and denied-clipboard fallback passed.',
);
