import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { heartRateContext } from '../core/heart-rate-context.js';
import { screenTimeHourSlots } from '../server/screen-time-hours.js';
import { heartRateContextHtml } from '../server/heart-rate-context-ui.js';
import { heartRateContextFixture } from './heart-rate-context-fixture.js';
const days = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-10-${14 + i}`,
  start: `2026-10-${14 + i}T00:00:00.000Z`,
  end: `2026-10-${15 + i}T00:00:00.000Z`,
}));
const rows = heartRateContextFixture('2026-10-19').map((record) => ({
  record,
  exportId: 'fictional-fixture',
}));
const browser = await chromium.launch({ headless: true });
mkdirSync('.local/heart-rate-context-release', { recursive: true });
try {
  await Promise.all(
    [375, 820].flatMap((width) =>
      /** @type {const} */ (['light', 'dark']).flatMap((colorScheme) =>
        /** @type {const} */ (['location', 'time']).map(async (context) => {
          const page = await browser.newPage({ viewport: { width, height: 850 }, colorScheme });
          const errors = /** @type {string[]} */ ([]);
          page.on('pageerror', (error) => errors.push(error.message));
          await page.route('**/*', (route) =>
            route.fulfill({
              contentType: 'text/html',
              body: '<iframe style="width:100%;height:700px;border:0"></iframe>',
            }),
          );
          await page.goto('http://overlay.fixture');
          await page.evaluate(
            `document.querySelector('iframe').srcdoc=${JSON.stringify(heartRateContextHtml)}`,
          );
          const frame = page.frameLocator('iframe');
          await frame.getByText('Waiting for your heart-rate overlay…').waitFor();
          const data = {
            ...heartRateContext(
              days,
              rows.filter((r) => r.record.domain === 'health'),
              rows.filter((r) => r.record.domain === context),
              context,
              'UTC',
              300,
              screenTimeHourSlots(days, 'UTC'),
            ),
            exports: [{ id: 'fictional-fixture', day: '2026-10-19', partial: false }],
            scope: {
              deviceId: 'fictional',
              healthProfileId: 'fictional',
              contextProfileId: 'fictional',
            },
          };
          await page.evaluate(
            `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(data)}}},'*')`,
          );
          await frame
            .getByRole('heading', {
              name: context === 'location' ? 'Heart rate & locations' : 'Heart rate & screen time',
              exact: true,
            })
            .waitFor();
          assert.equal(await frame.getByLabel('Heart-rate color scale').count(), 1);
          if (context === 'time') {
            assert.equal(await frame.locator('.usage-bar').count(), 3);
            await frame.getByRole('button').filter({ hasText: '30.0 min' }).click();
          }
          await frame
            .getByRole('button', {
              name: context === 'location' ? '2026-10-19 · 3 points' : '2026-10-19 · 3 hours',
              exact: true,
            })
            .click();
          await frame.getByText('Selected day: 2026-10-19', { exact: true }).waitFor();
          await frame
            .getByRole('button')
            .filter({ hasText: context === 'location' ? '18.40000, -66.10000' : '30.0 min' })
            .click();
          assert.match(
            await frame.locator('.match-detail').innerText(),
            context === 'location' ? /Sample offset: 0 seconds/ : /3 samples · mean 90.7 BPM/,
          );
          assert.equal(await frame.locator('.timeline .dot').count(), 4);
          await frame.getByRole('button').filter({ hasText: 'sample 1' }).click();
          assert.match(await frame.locator('.sample-detail').innerText(), /72 BPM/);
          assert.equal(
            await frame
              .locator('body')
              .evaluate(
                (n) =>
                  'scrollWidth' in n &&
                  'clientWidth' in n &&
                  Number(n.scrollWidth) <= Number(n.clientWidth),
              ),
            true,
          );
          await page.screenshot({
            path: `.local/heart-rate-context-release/${context}-${width}-${colorScheme}.png`,
          });
          await frame
            .getByRole('button')
            .filter({ hasText: context === 'location' ? '18.40200' : '10.0 min' })
            .click();
          assert.match(
            await frame.locator('.match-detail').innerText(),
            /No matching heart-rate observations/,
          );
          await frame.getByRole('button', { name: 'Back to all days', exact: true }).click();
          await frame.getByRole('button', { name: '2026-10-14 · Unknown', exact: true }).click();
          await frame
            .getByText('No context observations. Coverage is unknown.', { exact: true })
            .waitFor();
          if (context === 'location') {
            await page.evaluate(
              `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify({ ...data, mapTiles: true, fictional: false })}}},'*')`,
            );
            await frame.locator('.catalog-map').waitFor();
            assert.match(
              (await frame.locator('.map-tiles img').first().getAttribute('src')) ?? '',
              /map-tiles/,
            );
            await frame.getByRole('button', { name: 'Show coordinate plot', exact: true }).click();
            assert.equal(await frame.locator('.catalog-map').count(), 0);
            await page.evaluate(
              `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify({ ...data, mapTiles: true, healthSources: [] })}}},'*')`,
            );
            await frame.getByText('Heart rate unknown', { exact: true }).waitFor();
            assert.equal(await frame.locator('.catalog-map .dot').count(), 3);
            await frame.locator('.catalog-map .dot').last().click();
            assert.equal(await frame.locator('.timeline').count(), 0);
            assert.match(
              await frame.locator('.match-detail').innerText(),
              /No matching heart-rate observations/,
            );
          }
          assert.deepEqual(errors, []);
          await page.close();
        }),
      ),
    ),
  );
  console.log(
    'Heart-rate overlay UI: both contexts, linked samples, gaps, detail navigation, and responsive light/dark checks passed.',
  );
} finally {
  await browser.close();
}
