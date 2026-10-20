import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
  entryPoints: ['dashboard/analytics.js'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'analytics',
});
const source = bundle.outputFiles[0]?.text;
assert.ok(source);
const browser = await chromium.launch({ headless: true });
try {
  await Promise.all(
    ['none', 'local', 'all'].flatMap((blocked) =>
      [false, true].map(async (enabled) => {
        const page = await browser.newPage();
        await page.route('http://localhost/**', (route) =>
          route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
        );
        let deliveries = 0;
        await page.route('http://localhost/api/analytics/anonymous', (route) => {
          deliveries++;
          return route.fulfill({ json: { accepted: 1 } });
        });
        await page.addInitScript(`(() => {
        const blockedStorage = ${JSON.stringify(blocked)};
        if (blockedStorage === 'none') return;
        Object.defineProperty(window, 'localStorage', {
          get() { throw new DOMException('Storage denied', 'SecurityError'); },
        });
        if (blockedStorage === 'all') Object.defineProperty(window, 'sessionStorage', {
          get() { throw new DOMException('Storage denied', 'SecurityError'); },
        });
      })()`);
        await page.goto('http://localhost/');
        await page.addScriptTag({
          content: `${source}\nanalytics.initializeWebAnalytics();`,
        });
        const delivered = enabled
          ? page.waitForResponse('http://localhost/api/analytics/anonymous')
          : null;
        await page
          .getByRole('button', {
            name: enabled ? 'Allow usage analytics' : 'Keep analytics off',
            exact: true,
          })
          .click();
        assert.equal(
          await page
            .getByText('Could not save your account choice. Try again.', { exact: true })
            .isVisible(),
          false,
          `${blocked} storage blocked: choice ${enabled} must not produce an account error`,
        );
        await page.locator('.analytics-consent').waitFor({ state: 'hidden', timeout: 1000 });
        await page.evaluate("window.dispatchEvent(new Event('popstate'))");
        assert.equal(await page.locator('.analytics-consent').isVisible(), false);
        if (delivered) await delivered;
        assert.equal(deliveries, enabled ? 1 : 0, 'Only explicit opt-in delivers events.');
        await page.reload();
        await page.addScriptTag({
          content: `${source}\nanalytics.initializeWebAnalytics();`,
        });
        assert.equal(
          await page.locator('.analytics-consent').isVisible(),
          blocked === 'all',
          'Choice survives reload only when browser storage is available.',
        );
        let failAccountSave = true;
        /** @type {unknown[]} */
        const accountWrites = [];
        await page.route('http://localhost/api/account', (route) =>
          route.fulfill({ json: { subject: 'fictional-preview-owner' } }),
        );
        await page.route('http://localhost/api/analytics/preferences', (route) => {
          if (route.request().method() === 'PUT') {
            accountWrites.push(route.request().postDataJSON());
            if (failAccountSave)
              return route.fulfill({ status: 503, json: { error: 'Fixture unavailable.' } });
          }
          return route.fulfill({ json: { enabled: false, decided: true } });
        });
        await page.route('http://localhost/api/analytics/events', (route) =>
          route.fulfill({ json: { accepted: 1 } }),
        );
        await page.evaluate(`analytics.connectWebAnalytics(async (path, method = 'GET', body) => {
        const response = await fetch(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok) throw new Error('Fixture unavailable.');
        return response.json();
      })`);
        await page.evaluate("window.dispatchEvent(new Event('myself-analytics-preferences'))");
        const choice = page.getByRole('button', {
          name: enabled ? 'Allow usage analytics' : 'Keep analytics off',
          exact: true,
        });
        await choice.click();
        await page
          .getByText('Could not save your account choice. Try again.', { exact: true })
          .waitFor();
        assert.equal(await page.locator('.analytics-consent').isVisible(), true);
        failAccountSave = false;
        await choice.click();
        await page.locator('.analytics-consent').waitFor({ state: 'hidden' });
        assert.deepEqual(accountWrites, [
          { enabled, ...(enabled ? { confirmation: 'ALLOW_USAGE_ANALYTICS' } : {}) },
          { enabled, ...(enabled ? { confirmation: 'ALLOW_USAGE_ANALYTICS' } : {}) },
        ]);
        await page.close();
      }),
    ),
  );
  console.log(
    'Analytics storage: consent delivery, reload persistence, blocked storage, account save failures and retries passed.',
  );
} finally {
  await browser.close();
}
