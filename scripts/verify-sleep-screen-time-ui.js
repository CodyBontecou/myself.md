import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { sleepScreenTime } from '../core/sleep-screen-time.js';
import { sleepScreenTimeHtml } from '../server/sleep-screen-time-ui.js';
import { day, prior, sleep, usage } from './sleep-screen-time-fixture.js';
const next = { date: '2026-10-20', start: day.end, end: '2026-10-21T00:00:00Z' };
const data = {
  ...sleepScreenTime(
    [day, next],
    [prior, day, next],
    [{ record: sleep, exportId: 'fictional' }],
    [
      { ...usage, start: '2026-10-18T20:00:00Z', end: '2026-10-18T22:00:00Z' },
      {
        ...usage,
        start: '2026-10-18T21:30:00Z',
        end: '2026-10-18T22:30:00Z',
        native: {
          identifier: 'fixture.boundary',
          displayName: 'Fictional Boundary',
          durationMs: 2700000,
          fictional: true,
          granularity: 'daily',
        },
      },
      {
        ...usage,
        start: '2026-10-19T12:00:00Z',
        end: '2026-10-19T14:00:00Z',
        native: { .../** @type {Record<string,unknown>} */ (usage.native), durationMs: 3600000 },
      },
    ].map((record) => ({ record, exportId: 'fictional' })),
    'UTC',
  ),
  exports: [{ id: 'fictional', day: day.date, partial: false }],
};
const browser = await chromium.launch({ headless: true });
mkdirSync('.local/sleep-screen-time-release', { recursive: true });
try {
  await Promise.all(
    [375, 820].flatMap((width) =>
      /** @type {const} */ (['light', 'dark']).map(async (colorScheme) => {
        const page = await browser.newPage({ viewport: { width, height: 850 }, colorScheme });
        let requests = 0;
        /** @type {string[]} */ const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', (route) => {
          requests++;
          return route.fulfill({
            contentType: 'text/html',
            body: '<iframe style="width:100%;height:800px;border:0"></iframe>',
          });
        });
        await page.goto('http://sleep-usage.fixture');
        await page.evaluate(
          `document.querySelector('iframe').srcdoc=${JSON.stringify(sleepScreenTimeHtml)}`,
        );
        const f = page.frameLocator('iframe');
        await f.getByText('Waiting for your comparison…').waitFor();
        await page.evaluate(
          `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(data)}}},'*')`,
        );
        await f.getByRole('heading', { name: 'WHOOP sleep & screen time', exact: true }).waitFor();
        assert.match(await f.locator('main').innerText(), /Observed usage 2026-10-18 · 2.75 h/);
        await f
          .getByRole('combobox', { name: 'Date alignment', exact: true })
          .selectOption('same_day');
        assert.match(await f.locator('main').innerText(), /Observed usage 2026-10-19 · 1.00 h/);
        await f.getByRole('button', { name: 'Sleep ending 2026-10-19', exact: true }).click();
        assert.equal(
          await f.getByRole('region', { name: 'Loaded comparison overview', exact: true }).count(),
          1,
        );
        assert.equal(await f.locator('.mini').count(), 1);
        assert.match(await f.locator('main').innerText(), /Fictional Reader · 60.0 min/);
        assert.match(await f.locator('main').innerText(), /7.00 h asleep · SCORED/);
        await f.getByRole('button', { name: 'Back to all days', exact: true }).click();
        await f.getByRole('button', { name: 'Sleep ending 2026-10-20', exact: true }).click();
        assert.match(await f.locator('main').innerText(), /WHOOP asleep · Unknown/);
        assert.equal(
          await f
            .locator('body')
            .evaluate(
              (n) =>
                'scrollWidth' in n &&
                typeof n.scrollWidth === 'number' &&
                'clientWidth' in n &&
                typeof n.clientWidth === 'number' &&
                n.scrollWidth <= n.clientWidth,
            ),
          true,
        );
        await f
          .getByRole('combobox', { name: 'Comparison', exact: true })
          .selectOption('before_sleep');
        assert.match(await f.locator('main').innerText(), /135.0–150.0 min/);
        await f.getByRole('button', { name: /Sleep starting/ }).click();
        assert.match(await f.locator('main').innerText(), /Fictional Reader\s+120.0 min/);
        assert.equal(await f.locator('.mini').count(), 1);
        assert.match(await f.locator('main').innerText(), /Fictional Boundary\s+15.0–30.0 min/);
        await f.locator('.review-notes > summary').click();
        assert.match(await f.locator('main').innerText(), /two elapsed hours/);
        assert.match(await f.locator('main').innerText(), /fictional/);
        await f.locator('.review-notes > summary').click();
        await f.getByRole('button', { name: 'Back to all sessions', exact: true }).click();
        await f
          .getByRole('combobox', { name: 'Comparison', exact: true })
          .selectOption('sleep_performance');
        const chartBox = await f.locator('.performance-chart').boundingBox();
        assert.ok(
          chartBox && chartBox.y < 300 && chartBox.y + chartBox.height < 800,
          'Chart is visible without scrolling',
        );
        assert.ok(
          (await f.locator('main').innerText()).split(/\s+/).length < 85,
          'Default card stays concise',
        );
        assert.equal(await f.locator('.review-sources').getAttribute('open'), null);
        assert.equal(await f.locator('.review-notes').getAttribute('open'), null);
        const plot = f.getByRole('group', {
          name: 'Pre-sleep usage and WHOOP sleep performance chart',
          exact: true,
        });
        assert.equal(await plot.getByRole('button').count(), 1);
        const mark = plot.getByRole('button');
        assert.match((await mark.getAttribute('aria-label')) ?? '', /82.5% WHOOP performance/);
        assert.equal(
          await mark.locator('line[stroke="#8875ec"]').first().getAttribute('x1'),
          '423',
        );
        assert.equal(
          await mark.locator('line[stroke="#8875ec"]').first().getAttribute('x2'),
          '465',
        );
        assert.equal(
          await mark.locator('line[stroke="#8875ec"]').first().getAttribute('y1'),
          '85.5',
        );
        assert.equal(
          await mark.locator('circle').count(),
          0,
          'Uncertain usage has no invented midpoint',
        );
        await mark.press('Enter');
        assert.match(await f.locator('.session-metrics').innerText(), /82.5%/);
        assert.equal(await f.locator('.mini').count(), 1);
        await f.getByRole('button', { name: 'Back to all sessions', exact: true }).click();
        /** @param {number|null} score */
        async function verifyScore(score) {
          const scoreData = {
            ...data,
            view: 'sleep_performance',
            usageSources: data.usageSources.map((source) => ({
              ...source,
              preSleep: source.preSleep.map((w) => ({
                ...w,
                sleepPerformancePercent: score,
                performanceStatus: score === null ? 'missing' : 'available',
              })),
            })),
          };
          await page.evaluate(
            `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(scoreData)}}},'*')`,
          );
          if (score === null) {
            await f
              .getByText('No paired observations. See sessions for unknown values.', {
                exact: false,
              })
              .waitFor();
            assert.equal(await plot.getByRole('button').count(), 0);
            await f.locator('.session-list > summary').click();
            assert.match(await f.locator('.session-list').innerText(), /Unknown WHOOP/);
          } else {
            await plot
              .getByRole('button', { name: new RegExp(`${score}% WHOOP performance`) })
              .waitFor();
            assert.equal(
              await plot
                .getByRole('button')
                .locator('line[stroke="#8875ec"]')
                .first()
                .getAttribute('y1'),
              score === 0 ? '300' : '40',
            );
          }
        }
        await verifyScore(null);
        await verifyScore(0);
        await verifyScore(100);
        await page.evaluate(
          `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify({ ...data, view: 'sleep_performance' })}}},'*')`,
        );
        await plot.getByRole('button', { name: /82.5% WHOOP performance/ }).waitFor();
        assert.equal(requests, 1, 'Source/alignment/day actions do not fetch new data');
        await page.screenshot({
          path: `.local/sleep-screen-time-release/comparison-${width}-${colorScheme}.png`,
        });
        const legacy = {
          ...structuredClone(data),
          version: 'myself.md.sleep-screen-time.v2',
          view: 'before_sleep',
        };
        for (const source of legacy.usageSources)
          for (const window of source.preSleep) {
            Reflect.deleteProperty(window, 'sleepPerformancePercent');
            Reflect.deleteProperty(window, 'performanceStatus');
          }
        await page.evaluate(
          `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(legacy)}}},'*')`,
        );
        await f.getByRole('button', { name: /Sleep starting/ }).waitFor();
        assert.match(await f.locator('.session-list').innerText(), /135.0–150.0 min/);
        assert.deepEqual(errors, [], 'Saved v2 windows render without performance fields');
        await page.close();
      }),
    ),
  );
} finally {
  await browser.close();
}
console.log(
  'Sleep/screen-time UI: alignment switching, day details, apps, gaps, retained overview, responsive themes and no extra requests passed.',
);
