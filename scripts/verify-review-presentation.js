import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { screenTimeReview } from '../core/screen-time-review.js';
import { screenTimeReviewHtml } from '../server/screen-time-review-ui.js';
import { screenTimeHourSlots } from '../server/screen-time-hours.js';
import { scheduleCalendar } from '../server/schedule-calendar.js';

const timezone = 'America/Puerto_Rico';
const calendar = scheduleCalendar(timezone);
const days = Array.from({ length: 14 }, (_, i) => {
  const date = `2026-10-${String(i + 7).padStart(2, '0')}`;
  const next = `2026-10-${String(i + 8).padStart(2, '0')}`;
  return { date, start: calendar.instant(date, 0, 0), end: calendar.instant(next, 0, 0) };
});
const rows = days.slice(7).map((day) => ({
  exportId: 'fictional-export',
  record: {
    domain: /** @type {const} */ ('time'),
    type: 'applications',
    source: 'fictional-usage',
    start: day.start,
    end: new Date(Date.parse(day.start) + 3600000).toISOString(),
    native: {
      identifier: 'com.openai.chat',
      displayName: 'com.openai.chat',
      durationMs: 1800000,
      granularity: 'hourly-aggregate',
      fictional: true,
    },
  },
}));
const review = screenTimeReview(
  days,
  rows,
  [],
  timezone,
  undefined,
  screenTimeHourSlots(days, timezone),
);
assert.equal(review.series[0]?.topApps[0]?.name, 'ChatGPT');
assert.equal(review.series[0]?.appDrilldowns[0]?.identifier, 'com.openai.chat');
assert.equal(review.series[0]?.heatmap.cells[0]?.topApps[0]?.name, 'ChatGPT');
assert.equal(review.series[0]?.previous.observedDurationMs, null);
const browser = await chromium.launch({ headless: true });
mkdirSync('.local/review-design', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 1000 } });
  page.setDefaultTimeout(10000);
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<iframe style="width:100%;height:1600px;border:0"></iframe>',
    }),
  );
  await page.goto('http://review.fixture');
  await page.evaluate(
    `document.querySelector('iframe').srcdoc=${JSON.stringify(screenTimeReviewHtml)}`,
  );
  const frame = page.frameLocator('iframe');
  await frame.getByText('Waiting for your weekly review…', { exact: true }).waitFor();
  await page.evaluate(
    `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(Object.fromEntries(Object.entries(review).filter(([key]) => !['weekEnd', 'comparisonWeekEnd', 'currentDays', 'comparisonDays'].includes(key))))}}},'*')`,
  );
  await frame
    .getByText('No comparison data for 2026-10-07 – 2026-10-13.', { exact: false })
    .waitFor();
  assert.equal(await frame.locator('.chart-day').count(), 7);
  await frame.locator('.chart-day').first().focus();
  assert.match(await frame.locator('.chart-readout').innerText(), /Wednesday, Oct 14/);
  await frame.locator('.daily-values summary').click();
  assert.equal(await frame.getByRole('columnheader', { name: 'Previous', exact: true }).count(), 0);
  await frame.getByRole('columnheader', { name: 'Review period', exact: true }).waitFor();
  assert.equal(await frame.locator('tbody tr').count(), 7);
  await frame.getByRole('button', { name: 'ChatGPT', exact: true }).click();
  await frame.getByRole('heading', { name: 'ChatGPT · daily usage', exact: true }).waitFor();
  await frame.getByText('com.openai.chat', { exact: true }).waitFor();
  assert.equal(
    await frame.getByRole('region', { name: 'Loaded period overview', exact: true }).count(),
    1,
  );
  assert.match(await frame.locator('.detail-overview').innerText(), /App: ChatGPT/);
  await frame.getByRole('button', { name: 'Back to weekly review', exact: true }).click();
  await frame.locator('.daily-values summary').click();
  await frame.getByRole('button', { name: 'Explore 2026-10-14: 30m', exact: true }).click();
  await frame.getByRole('heading', { name: 'Apps on 2026-10-14', exact: true }).waitFor();
  assert.equal(
    await frame.locator('.detail-overview-slot.selected').getAttribute('data-date'),
    '2026-10-14',
  );
  await frame.getByRole('button', { name: 'ChatGPT', exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Back to weekly review', exact: true }).click();
  await frame.getByRole('button', { name: 'Attention heatmap', exact: true }).click();
  assert.equal(await frame.locator('.heat-cell').count(), 336);
  await frame
    .getByRole('button', {
      name: 'Explore 2026-10-14 00:00: 30m observed · 1 records',
      exact: true,
    })
    .click();
  await frame.getByText('ChatGPT', { exact: true }).waitFor();
  assert.match(await frame.locator('.detail-overview').innerText(), /Hour: 2026-10-14 · 00:00/);
  assert.equal(
    await frame.locator('.detail-overview-slot.selected').getAttribute('data-date'),
    '2026-10-14',
  );
  await frame.getByRole('button', { name: 'Explore whole day', exact: true }).click();
  await frame.getByRole('heading', { name: 'Apps on 2026-10-14', exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Back to heatmap', exact: true }).click();
  const inspectCell = frame.getByRole('button', {
    name: 'Explore 2026-10-14 00:00: 30m observed · 1 records',
    exact: true,
  });
  await inspectCell.focus();
  assert.match(await frame.locator('.heatmap-readout').innerText(), /ChatGPT leads this hour/);
  assert.equal(
    await page.evaluate(
      'window.frames[0].document.documentElement.scrollWidth > document.querySelector("iframe").clientWidth',
    ),
    false,
  );

  // Paired app values must preserve absence and explicit zero, even when the series is comparable.
  const template = rows[0];
  assert.ok(template);
  const pairedRows = days.flatMap((day, index) =>
    [
      { identifier: 'com.openai.chat', name: 'ChatGPT', ms: index < 7 ? 900000 : 1800000 },
      ...(index < 7 ? [{ identifier: 'com.apple.mobilesafari', name: 'Safari', ms: 1200000 }] : []),
      { identifier: 'fixture.zero', name: 'Zero app', ms: 0 },
    ].map((app) => ({
      exportId: 'fictional-export',
      record: {
        ...template.record,
        start: day.start,
        end: new Date(Date.parse(day.start) + 3600000).toISOString(),
        native: {
          ...template.record.native,
          identifier: app.identifier,
          displayName: app.name,
          durationMs: app.ms,
        },
      },
    })),
  );
  const paired = screenTimeReview(
    days,
    pairedRows,
    [],
    timezone,
    undefined,
    screenTimeHourSlots(days, timezone),
  );
  await page.evaluate(
    `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(paired)}}},'*')`,
  );
  const chatApp = frame.locator('.app-comparisons li[data-app="com.openai.chat"]');
  await chatApp.waitFor();
  assert.deepEqual(await chatApp.locator('.app-duration').allTextContents(), ['1h 45m', '3h 30m']);
  assert.equal(await chatApp.locator('.app-change').innerText(), '+1h 45m');
  const safariApp = frame.locator('.app-comparisons li[data-app="com.apple.mobilesafari"]');
  assert.deepEqual(await safariApp.locator('.app-duration').allTextContents(), [
    '2h 20m',
    'Unknown',
  ]);
  assert.equal(await safariApp.locator('.app-change').innerText(), 'Change unavailable');
  assert.equal(await safariApp.locator('.app-pair-bar.unknown').count(), 1);
  const zeroApp = frame.locator('.app-comparisons li[data-app="fixture.zero"]');
  assert.deepEqual(await zeroApp.locator('.app-duration').allTextContents(), ['0m', '0m']);
  assert.equal(await zeroApp.locator('.app-pair-bar.zero').count(), 2);
  assert.equal(await zeroApp.locator('.app-change').innerText(), 'No change');
  assert.equal(await frame.locator('.review-controls').getAttribute('open'), null);
  const answerBox = await frame.locator('.review-answer').boundingBox();
  const controlsBox = await frame.locator('.review-controls').boundingBox();
  assert.ok(answerBox && controlsBox);
  assert.ok(answerBox.y < controlsBox.y, 'Outcome appears before date controls');
  await frame.getByRole('button', { name: 'Attention heatmap', exact: true }).click();
  assert.deepEqual(await frame.locator('.heatmap-bin').allTextContents(), [
    '>0–9 min',
    '>9–18 min',
    '>18–27 min',
    '>27–36 min',
    'Zero',
    'Unknown',
  ]);
  assert.equal(await frame.locator('.heatmap-period').count(), 2);
  assert.equal(await frame.locator('[data-period="comparison"] .heat-cell').count(), 168);
  assert.equal(await frame.locator('[data-period="review"] .heat-cell').count(), 168);
  assert.equal(await frame.locator('.heatmap-bin').nth(3).innerText(), '>27–36 min');
  const comparisonHour = frame.getByRole('button', {
    name: 'Explore 2026-10-07 00:00: 35m observed · 3 records',
    exact: true,
  });
  await comparisonHour.focus();
  assert.match(await frame.locator('.heatmap-readout').innerText(), /Comparison · 2026-10-07/);
  await comparisonHour.click();
  await frame.getByRole('heading', { name: '2026-10-07 · 00:00', exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Back to heatmap', exact: true }).click();
  assert.equal(await frame.getByLabel('Heatmap dates', { exact: true }).inputValue(), '0');

  const partial = screenTimeReview(
    days,
    pairedRows,
    [{ id: 'fictional-export', day: '2026-10-20', created: '2026-10-20T00:00:00Z', partial: true }],
    timezone,
  );
  await page.evaluate(
    `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(partial)}}},'*')`,
  );
  await frame.getByText('A selected export is partial.', { exact: true }).waitFor();
  assert.equal(await chatApp.locator('.app-change').innerText(), 'Change unavailable');

  // A varied fictional fixture exercises chart scales, paired weeks, unknowns, and zeros.
  const chartRows = days.flatMap((day, dayIndex) =>
    [
      ['com.openai.chat', 'ChatGPT'],
      ['com.apple.mobilesafari', 'Safari'],
      ['md.obsidian', 'Obsidian'],
      ['com.google.ios.youtube', 'YouTube'],
    ].flatMap(([identifier, displayName], appIndex) =>
      Array.from({ length: dayIndex === 9 ? 0 : 6 }, (_, hourIndex) => ({
        exportId: 'fictional-export',
        record: {
          domain: /** @type {const} */ ('time'),
          type: 'applications',
          source: 'fictional-usage',
          start: new Date(Date.parse(day.start) + (hourIndex + 9) * 3600000).toISOString(),
          end: new Date(Date.parse(day.start) + (hourIndex + 10) * 3600000).toISOString(),
          native: {
            identifier,
            displayName,
            durationMs:
              dayIndex === 10 ? 0 : ((dayIndex * 7 + appIndex * 13 + hourIndex * 11) % 48) * 60000,
            granularity: 'hourly-aggregate',
            fictional: true,
          },
        },
      })),
    ),
  );
  const varied = screenTimeReview(
    days,
    chartRows,
    [],
    timezone,
    undefined,
    screenTimeHourSlots(days, timezone),
  );
  /** Wait for the actual view transition before capturing; never capture mid-animation. */
  async function settleView() {
    await page.evaluate(
      `Promise.all(window.frames[0].document.getAnimations().map(animation=>animation.finished.catch(()=>{})))`,
    );
    await page.evaluate(
      `document.querySelector('iframe').style.height=window.frames[0].document.documentElement.scrollHeight+'px'`,
    );
  }
  /** @param {number} width @param {'light'|'dark'} colorScheme */
  async function verifyTheme(width, colorScheme) {
    await page.setViewportSize({ width, height: 1700 });
    await page.emulateMedia({ colorScheme });
    await page.evaluate(
      `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(varied)}}},'*')`,
    );
    await frame.locator('.chart-day').first().waitFor();
    assert.equal(await frame.locator('.chart-column.unknown').count(), 1);
    assert.equal(await frame.locator('.chart-column.zero').count(), 1);
    assert.equal(await frame.locator('.chart-column.old').count(), 7);
    assert.equal(
      await page.evaluate(
        'window.frames[0].document.documentElement.scrollWidth > document.querySelector("iframe").clientWidth',
      ),
      false,
    );
    await settleView();
    await page.screenshot({
      path: `.local/review-design/weekly-${width}-${colorScheme}.png`,
      fullPage: true,
    });
    await frame.getByRole('button', { name: 'Attention heatmap', exact: true }).click();
    await frame.locator('.heat-cell').first().focus();
    assert.equal(await frame.locator('.heat-cell').count(), 336);
    await settleView();
    const comparison = frame.locator('[data-period="comparison"] .heatmap-table tbody tr').first();
    const current = frame.locator('[data-period="review"] .heatmap-table tbody tr').first();
    const comparisonBox = await comparison.boundingBox(),
      currentBox = await current.boundingBox();
    assert.ok(comparisonBox && currentBox);
    if (width > 560) {
      assert.ok(Math.abs(comparisonBox.y - currentBox.y) < 1, 'Hour rows align across periods');
      assert.ok(currentBox.x > comparisonBox.x, 'Review is beside comparison');
    } else assert.ok(currentBox.y > comparisonBox.y, 'Narrow screens stack readable panels');
    assert.equal(await frame.locator('.heatmap-scale').count(), 1);
    assert.equal(await frame.locator('.heat-zero').filter({ hasText: '0' }).count(), 6);

    await settleView();
    await page.screenshot({
      path: `.local/review-design/heatmap-${width}-${colorScheme}.png`,
      fullPage: true,
    });
    await frame.getByRole('button', { name: 'Period totals', exact: true }).click();
    await frame.locator('.chart-day').first().focus();
    await page.keyboard.press('Enter');
    await frame.getByRole('heading', { name: 'Apps on 2026-10-14', exact: true }).waitFor();
    assert.equal(
      await page.evaluate('window.frames[0].document.getAnimations().length'),
      0,
      'Keyboard navigation has no entrance motion',
    );
    assert.equal(await frame.locator('.detail-overview-slot').count(), 14);
    assert.equal(await frame.locator('.detail-overview-mark.unknown').count(), 1);
    assert.equal(await frame.locator('.detail-overview-mark.zero').count(), 1);
    await frame.getByRole('button', { name: 'ChatGPT', exact: true }).click();
    await frame.getByRole('heading', { name: 'ChatGPT · daily usage', exact: true }).waitFor();
    assert.match(
      await frame.locator('.detail-overview').innerText(),
      /App: ChatGPT · from 2026-10-14/,
    );
    assert.equal(
      await frame.locator('.detail-overview-slot.selected').getAttribute('data-date'),
      '2026-10-14',
    );
    await settleView();
    await page.setViewportSize({ width, height: 650 });
    await page.evaluate(
      `document.querySelector('iframe').style.height='600px';window.scrollTo(0,0);window.frames[0].scrollTo(0,window.frames[0].document.querySelector('.detail-overview').offsetTop+180)`,
    );
    const pinned = await page.evaluate(
      `(()=>{const doc=window.frames[0].document;const overview=doc.querySelector('.detail-overview').getBoundingClientRect();const detail=doc.querySelector('.drilldown').getBoundingClientRect();return {top:overview.top,height:overview.height,detailBottom:detail.bottom,viewport:window.frames[0].innerHeight}})()`,
    );
    assert.ok(pinned.top >= -1 && pinned.top <= 1, 'Overview stays pinned while detail scrolls');
    assert.ok(pinned.height < pinned.viewport / 2, 'Compact overview leaves room for details');
    assert.ok(pinned.detailBottom > pinned.height, 'Details remain below the overview');
    await page.screenshot({
      path: `.local/review-design/overview-sticky-${width}-${colorScheme}.png`,
      fullPage: false,
    });
    await page.setViewportSize({ width, height: 1700 });
    await page.evaluate('window.frames[0].scrollTo(0,0)');
    await settleView();
    await frame.getByRole('button', { name: 'Back to 2026-10-14', exact: true }).click();
    await frame.getByRole('heading', { name: 'Apps on 2026-10-14', exact: true }).waitFor();
  }
  await verifyTheme(820, 'light');
  await verifyTheme(375, 'light');
  await verifyTheme(820, 'dark');
  await verifyTheme(375, 'dark');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await frame.getByRole('button', { name: 'Back to weekly review', exact: true }).click();
  await frame.locator('.chart-day').first().click();
  assert.equal(
    await page.evaluate('window.frames[0].document.getAnimations().length'),
    0,
    'Reduced motion disables pointer entrance motion',
  );
  writeFileSync(
    '.local/review-design/preview.html',
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>myself.md review preview · Fictional data</title></head><body style="margin:0"><iframe style="width:100%;height:2000px;border:0" title="Fictional weekly review"></iframe><script>const frame=document.querySelector('iframe');frame.srcdoc=${JSON.stringify(screenTimeReviewHtml).replaceAll('<', '\\u003c')};frame.addEventListener('load',()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(varied).replaceAll('<', '\\u003c')}}},'*'));</script></body></html>`,
  );
  console.log(
    'PASS embedded review: app names, comparison gaps, chart focus, day/app/hour drilldowns, missing/zero values, both themes at 375/820px, keyboard navigation and reduced motion. Screenshots and fictional preview: .local/review-design/.',
  );
} finally {
  await browser.close();
}
