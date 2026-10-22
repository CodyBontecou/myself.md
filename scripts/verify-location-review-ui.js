import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { locationReview } from '../core/location-review.js';
import { locationReviewHtml } from '../server/location-review-ui.js';
const days = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-10-${14 + i}`,
  start: `2026-10-${14 + i}T00:00:00.000Z`,
  end: `2026-10-${15 + i}T00:00:00.000Z`,
}));
const review = {
  ...locationReview(
    days,
    Array.from({ length: 27 }, (_, i) => ({
      exportId: 'fixture',
      record: {
        domain: /** @type {const} */ ('location'),
        type: 'points',
        source: 'fictional',
        start: `2026-10-19T01:${String(i).padStart(2, '0')}:00Z`,
        end: null,
        native: {
          coords: { latitude: 18.4 + i / 1000, longitude: -66.1, accuracy: i === 0 ? null : 12 },
          fictional: true,
        },
      },
    })),
    'UTC',
  ),
  exports: [{ id: 'fictional', day: '2026-10-20', partial: false }],
};
const browser = await chromium.launch({ headless: true });
mkdirSync('.local/location-review-release', { recursive: true });
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
        await page.goto('http://location.fixture');
        await page.evaluate(
          `document.querySelector('iframe').srcdoc=${JSON.stringify(locationReviewHtml)}`,
        );
        const frame = page.frameLocator('iframe');
        await frame.getByText('Waiting for your location review…').waitFor();
        await page.evaluate(
          `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(review)}}},'*')`,
        );
        await frame.getByRole('heading', { name: 'Recorded locations', exact: true }).waitFor();
        assert.equal(await frame.locator('.dot').count(), 27);
        await frame.getByRole('button', { name: '2026-10-19 · 27 points', exact: true }).click();
        await frame.getByText('Selected day: 2026-10-19', { exact: true }).waitFor();
        assert.equal(
          await frame.getByRole('button', { name: 'Next points', exact: true }).count(),
          1,
        );
        await frame.getByRole('button').filter({ hasText: '18.40000' }).click();
        assert.match(await frame.locator('.point-detail').innerText(), /accuracy Unknown/);
        await frame.getByRole('button', { name: 'Next points', exact: true }).click();
        await frame.getByText('Points 26–27 of 27', { exact: true }).waitFor();
        assert.equal(
          await frame
            .locator('body')
            .evaluate(
              (node) =>
                'scrollWidth' in node &&
                'clientWidth' in node &&
                Number(node.scrollWidth) <= Number(node.clientWidth),
            ),
          true,
        );
        await page.screenshot({
          path: `.local/location-review-release/location-detail-${width}-${colorScheme}.png`,
        });
        await frame.getByRole('button', { name: 'Back to all days', exact: true }).click();
        await frame.getByRole('button', { name: '2026-10-14 · Unknown', exact: true }).click();
        await frame
          .getByText('No recorded points in this selection. Coverage is unknown.', { exact: true })
          .waitFor();
        await page.screenshot({
          path: `.local/location-review-release/location-${width}-${colorScheme}.png`,
        });
        await page.close();
      }),
    ),
  );
  console.log(
    'Location review UI: point pagination and day navigation, unknown days, shared overview, mobile/desktop light/dark and overflow checks passed.',
  );
} finally {
  await browser.close();
}
