import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { healthReview } from '../core/health-review.js';
import { healthReviewHtml } from '../server/health-review-ui.js';
const days = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-10-${14 + i}`,
  start: `2026-10-${14 + i}T00:00:00Z`,
  end: `2026-10-${15 + i}T00:00:00Z`,
}));
/** @type {import('../core/data.js').DataRecord[]} */
const records = [
  {
    domain: 'health',
    type: 'HKQuantityTypeIdentifierStepCount',
    source: 'fictional',
    start: '2026-10-19T01:00:00Z',
    end: '2026-10-19T02:00:00Z',
    native: { quantity: 4000, unit: 'count', fictional: true },
  },
  {
    domain: 'health',
    type: 'HKCategoryTypeIdentifierSleepAnalysis',
    source: 'fictional',
    start: '2026-10-19T00:00:00Z',
    end: '2026-10-19T06:00:00Z',
    native: { value: 4, fictional: true },
  },
];
records.push({
  domain: 'health',
  type: 'whoop.sleep',
  source: 'whoop',
  start: '2026-10-18T22:00:00Z',
  end: '2026-10-19T06:00:00Z',
  native: {
    id: 'whoop-ui-fixture',
    user_id: 1,
    score_state: 'SCORED',
    nap: false,
    fictional: true,
    score: {
      stage_summary: {
        total_light_sleep_time_milli: 4 * 3600000,
        total_slow_wave_sleep_time_milli: 3600000,
        total_rem_sleep_time_milli: 2 * 3600000,
        total_awake_time_milli: 3600000,
        total_no_data_time_milli: 0,
        total_in_bed_time_milli: 8 * 3600000,
      },
    },
  },
});
const review = {
  ...healthReview(
    days,
    records.map((record) => ({ record, exportId: 'fixture' })),
    'UTC',
  ),
  exports: [{ id: 'fictional', day: '2026-10-20', partial: false }],
};
const browser = await chromium.launch({ headless: true });
mkdirSync('.local/health-review-release', { recursive: true });
try {
  await Promise.all(
    [375, 820].flatMap((width) =>
      /** @type {const} */ (['light', 'dark']).map(async (colorScheme) => {
        const page = await browser.newPage({ viewport: { width, height: 850 }, colorScheme });
        await page.route('**/*', (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: '<iframe style="width:100%;height:700px;border:0"></iframe>',
          }),
        );
        await page.goto('http://health.fixture');
        await page.evaluate(
          `document.querySelector('iframe').srcdoc=${JSON.stringify(healthReviewHtml)}`,
        );
        const frame = page.frameLocator('iframe');
        await frame.getByText('Waiting for your health review…').waitFor();
        await page.evaluate(
          `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(review)}}},'*')`,
        );
        await frame.getByRole('heading', { name: 'Activity & sleep', exact: true }).waitFor();
        assert.equal(
          await frame
            .getByRole('button', { name: '2026-10-19 · 4,000 steps', exact: true })
            .count(),
          1,
        );
        assert.equal(await frame.locator('.sleep-segment').count(), 1);
        assert.equal(
          await frame
            .locator('body')
            .evaluate(
              (node) =>
                'scrollWidth' in node &&
                typeof node.scrollWidth === 'number' &&
                'clientWidth' in node &&
                typeof node.clientWidth === 'number' &&
                node.scrollWidth <= node.clientWidth,
            ),
          true,
          'No horizontal overflow',
        );
        await frame.getByRole('button', { name: '2026-10-19 · 6.00 h', exact: true }).click();
        await frame.getByText('Selected day: 2026-10-19', { exact: true }).waitFor();
        assert.equal(await frame.locator('.mini').count(), 2);
        assert.match(await frame.locator('li').innerText(), /Deep/);
        assert.match(await frame.locator('.stage-breakdown').innerText(), /Deep · 6.00 h/);
        await page.screenshot({
          path: `.local/health-review-release/health-detail-${width}-${colorScheme}.png`,
        });
        await frame.getByRole('button', { name: 'Back to all days', exact: true }).click();
        await frame
          .getByRole('button', { name: '2026-10-14 · Unknown', exact: true })
          .first()
          .click();
        assert.equal(await frame.getByText('No recorded intervals', { exact: true }).count(), 1);
        await page.screenshot({
          path: `.local/health-review-release/health-${width}-${colorScheme}.png`,
        });
        await frame.getByRole('button', { name: 'Back to all days', exact: true }).click();
        await frame.locator('.review-sources > summary').click();
        await frame.getByRole('combobox', { name: 'sleep source', exact: true }).selectOption('1');
        await frame.getByRole('button', { name: '2026-10-19 · 7.00 h', exact: true }).click();
        assert.equal(
          await frame.locator('.sleep-segment').count(),
          0,
          'WHOOP has no stage timeline',
        );
        assert.match(await frame.locator('.whoop-session').innerText(), /Light · 4.00 h/);
        assert.match(await frame.locator('.whoop-session').innerText(), /SCORED · 7.00 h asleep/);
        assert.match(await frame.locator('.whoop-session').innerText(), /Oct 18.*Oct 19/);
        await page.screenshot({
          path: `.local/health-review-release/whoop-${width}-${colorScheme}.png`,
        });
        await page.close();
      }),
    ),
  );
  console.log(
    'Health review UI: activity/sleep day navigation, unknown days, shared overview, mobile/desktop light/dark and overflow checks passed.',
  );
} finally {
  await browser.close();
}
