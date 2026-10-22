import assert from 'node:assert/strict';
import { screenTimePresetPeriod } from '../core/screen-time-period.js';
import { chromium } from 'playwright';
import { screenTimeReview } from '../core/screen-time-review.js';
import { screenTimeHourSlots } from '../server/screen-time-hours.js';
import { scheduleCalendar } from '../server/schedule-calendar.js';
import { screenTimeReviewHtml } from '../server/screen-time-review-ui.js';
const scope = { deviceId: '11111111-1111-4111-8111-111111111111', profileId: 'fixture-profile' };
const files = /** @type {const} */ ([
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
]);
/** @param {string} weekStart @param {string} timezone @param {string} [comparisonWeekStart] @param {string} [weekEnd] @param {string} [comparisonWeekEnd] */
function fixture(weekStart, timezone, comparisonWeekStart, weekEnd, comparisonWeekEnd) {
  const currentDays = weekEnd ? (Date.parse(weekEnd) - Date.parse(weekStart)) / 86400000 + 1 : 7;
  const previousDays =
    comparisonWeekEnd && comparisonWeekStart
      ? (Date.parse(comparisonWeekEnd) - Date.parse(comparisonWeekStart)) / 86400000 + 1
      : currentDays;
  const calendar = scheduleCalendar(timezone);
  const days = Array.from({ length: previousDays + currentDays }, (_, index) => {
    const date = new Date(
      index < previousDays
        ? Date.parse(
            comparisonWeekStart ??
              new Date(Date.parse(weekStart) - previousDays * 86400000).toISOString().slice(0, 10),
          ) +
            index * 86400000
        : Date.parse(weekStart) + (index - previousDays) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    const next = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
    return { date, start: calendar.instant(date, 0, 0), end: calendar.instant(next, 0, 0) };
  });
  const records = days.map((day) => ({
    exportId: files[0],
    record: {
      domain: /** @type {const} */ ('time'),
      type: 'applications',
      source: 'fixture',
      start: day.start,
      end: new Date(Date.parse(day.start) + 3600000).toISOString(),
      native: {
        identifier: 'com.openai.chat',
        displayName: 'ChatGPT',
        durationMs: 1800000,
        granularity: 'hourly-aggregate',
        fictional: true,
      },
    },
  }));
  return {
    ...screenTimeReview(
      days,
      records,
      [],
      timezone,
      undefined,
      screenTimeHourSlots(days, timezone),
      previousDays,
    ),
    scope,
  };
}
assert.deepEqual(screenTimePresetPeriod('yesterday', '2024-03-01'), {
  weekStart: '2024-02-29',
  weekEnd: '2024-02-29',
  comparisonWeekStart: '2024-02-28',
  comparisonWeekEnd: '2024-02-28',
});
assert.deepEqual(screenTimePresetPeriod('last_30_days', '2026-01-01'), {
  weekStart: '2025-12-02',
  weekEnd: '2025-12-31',
  comparisonWeekStart: '2025-11-02',
  comparisonWeekEnd: '2025-12-01',
});
assert.throws(() => screenTimePresetPeriod('last_7_days', '2026-02-30'), /valid/);
const initial = fixture('2026-10-14', 'America/Puerto_Rico');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 1200 } });
  page.setDefaultTimeout(10000);
  await page.clock.install({ time: new Date('2026-10-21T23:30:00Z') });
  page.on('pageerror', (error) => console.error(error));
  /** @type {{name:string,arguments:Record<string,any>}[]} */
  const calls = [];
  let failure = '';
  let large = false;
  let holdPresetLoad = false;
  /** @type {undefined|(()=>void)} */
  let releasePresetLoad;
  const presetGate = new Promise((resolve) => {
    releasePresetLoad = () => resolve(undefined);
  });
  await page.exposeFunction(
    'fixtureCall',
    async (/** @type {{name:string,arguments:Record<string,any>}} */ request) => {
      calls.push(request);
      if (request.name === 'list_cloud_exports') {
        if (holdPresetLoad) await presetGate;
        assert.equal(request.arguments.deviceId, scope.deviceId);
        assert.equal(request.arguments.profileId, scope.profileId);
        assert.equal(
          request.arguments.start,
          undefined,
          'Upload dates must not filter record coverage',
        );
        if (large)
          return {
            structuredContent: {
              exports: Array.from({ length: 33 }, (_, index) => ({
                id: `file-${index}`,
                agentPermissions: { time: true },
              })),
            },
          };
        return {
          structuredContent: request.arguments.cursor
            ? { exports: [{ id: files[1], agentPermissions: { time: true } }], nextCursor: null }
            : {
                exports: [
                  { id: files[0], agentPermissions: { time: true } },
                  { id: 'revoked', agentPermissions: { time: false } },
                ],
                nextCursor: 'second',
              },
        };
      }
      assert.equal(request.name, 'review_weekly_screen_time');
      assert.deepEqual(request.arguments.exportIds, files);
      if (failure) return { isError: true, content: [{ type: 'text', text: failure }] };
      return {
        structuredContent: fixture(
          request.arguments.weekStart,
          request.arguments.timezone,
          request.arguments.comparisonWeekStart,
          request.arguments.weekEnd,
          request.arguments.comparisonWeekEnd,
        ),
      };
    },
  );
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body style="margin:0"><iframe style="width:100%;height:3000px;border:0"></iframe></body>',
    }),
  );
  await page.goto('http://period.fixture');
  await page.evaluate(
    `window.addEventListener('message',async event=>{const m=event.data;if(m.method==='ui/initialize')event.source.postMessage({jsonrpc:'2.0',id:m.id,result:{}},'*');if(m.method==='tools/call'){const result=await window.fixtureCall(m.params);event.source.postMessage({jsonrpc:'2.0',id:m.id,result},'*')}});document.querySelector('iframe').srcdoc=${JSON.stringify(screenTimeReviewHtml)}`,
  );
  const frame = page.frameLocator('iframe');
  await frame.getByText('Waiting for your weekly review…', { exact: true }).waitFor();
  await page.evaluate(
    `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(initial)}}},'*')`,
  );
  assert.equal(await frame.locator('.review-controls[open]').count(), 0);
  assert.equal(await frame.locator('.review-controls .period-presets').count(), 0);
  await frame.getByRole('button', { name: 'Yesterday', exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Last 7 days', exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Last 30 days', exact: true }).waitFor();
  holdPresetLoad = true;
  await frame.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await frame
    .getByRole('status')
    .getByText('Discovering shared exports and loading this period…', { exact: true })
    .waitFor();
  assert.equal(
    await frame.getByRole('button', { name: 'Last 30 days', exact: true }).isEnabled(),
    false,
  );
  assert.equal(calls.length, 1, 'One pending metadata request while every preset is disabled');
  holdPresetLoad = false;
  assert.ok(releasePresetLoad, 'Preset gate initialized');
  releasePresetLoad();
  await frame.getByText('2026-10-20 – 2026-10-20 · America/Puerto_Rico', { exact: true }).waitFor();
  assert.equal(await frame.locator('.review-controls[open]').count(), 0);
  await frame.getByRole('button', { name: 'Last 30 days', exact: true }).click();
  await frame.getByText('2026-09-21 – 2026-10-20 · America/Puerto_Rico', { exact: true }).waitFor();
  assert.equal(await frame.locator('.review-controls[open]').count(), 0);
  await frame.getByRole('button', { name: 'Last 7 days', exact: true }).click();
  await frame.getByText('2026-10-14 – 2026-10-20 · America/Puerto_Rico', { exact: true }).waitFor();
  assert.equal(await frame.locator('.review-controls[open]').count(), 0);
  failure = 'The read allowance is exhausted. Try again after reset.';
  await frame.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await frame.getByRole('alert').getByText(failure, { exact: true }).waitFor();
  assert.equal(await frame.locator('.review-controls[open]').count(), 0);
  await frame.getByText('2026-10-14 – 2026-10-20 · America/Puerto_Rico', { exact: true }).waitFor();
  failure = '';
  calls.length = 0;
  await frame.getByText('Change dates or explore a day / hour', { exact: true }).click();
  await frame.locator('form').waitFor();
  await frame.getByLabel('Day', { exact: true }).selectOption('2026-10-15');
  await frame.getByRole('heading', { name: 'Apps on 2026-10-15', exact: true }).waitFor();
  await frame.getByLabel('Hour · America/Puerto_Rico', { exact: true }).selectOption('0');
  await frame.getByRole('heading', { name: '2026-10-15 · 00:00', exact: true }).waitFor();
  assert.equal(calls.length, 0, 'Day and hour selection does not call tools');
  await frame.getByLabel('Day', { exact: true }).selectOption('');
  await frame.getByLabel('Review start', { exact: true }).fill('2026-10-07');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  await frame.getByText('2026-10-07 – 2026-10-13 · America/Puerto_Rico', { exact: true }).waitFor();
  assert.equal(calls.length, 3, 'Follow both metadata pages then load once');
  await frame.getByRole('button', { name: 'Next week', exact: true }).click();
  await frame.getByText('2026-10-14 – 2026-10-20 · America/Puerto_Rico', { exact: true }).waitFor();
  await frame.getByLabel('Time zone', { exact: true }).fill('America/New_York');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  await frame.getByText('2026-10-14 – 2026-10-20 · America/New_York', { exact: true }).waitFor();
  assert.equal(calls.at(-1)?.arguments.timezone, 'America/New_York');
  await frame.getByLabel('Compare with', { exact: true }).selectOption('custom');
  await frame.getByLabel('Comparison start', { exact: true }).fill('2026-09-23');
  await frame.getByLabel('Comparison end', { exact: true }).fill('2026-09-29');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  await frame
    .getByText('Comparison: 2026-09-23 – 2026-09-29 · Days align by position within each range.', {
      exact: true,
    })
    .waitFor();
  assert.equal(calls.at(-1)?.arguments.comparisonWeekStart, '2026-09-23');
  await frame.getByLabel('Day', { exact: true }).selectOption('2026-09-24');
  await frame.getByRole('heading', { name: 'Apps on 2026-09-24', exact: true }).waitFor();
  await frame.getByLabel('Day', { exact: true }).selectOption('');
  const beforeOverlap = calls.length;
  await frame.getByLabel('Compare with', { exact: true }).selectOption('custom');
  await frame.getByLabel('Comparison start', { exact: true }).fill('2026-10-13');
  await frame.getByLabel('Comparison end', { exact: true }).fill('2026-10-19');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  await frame
    .getByText('Choose non-overlapping review and comparison date ranges.', { exact: true })
    .waitFor();
  assert.equal(calls.length, beforeOverlap);
  await frame.getByLabel('Compare with', { exact: true }).selectOption('previous');
  const used = calls.length;
  await frame.getByLabel('Review start', { exact: true }).fill('2099-01-01');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  assert.equal(calls.length, used, 'Future weeks never read exports');
  await frame.getByLabel('Review start', { exact: true }).fill('2026-10-07');
  await frame.getByLabel('Time zone', { exact: true }).fill('Not/A_Timezone');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  assert.equal(calls.length, used, 'Invalid timezone never reads exports');
  await frame.getByLabel('Time zone', { exact: true }).fill('America/New_York');
  failure = 'The read allowance is exhausted. Try again after reset.';
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  await frame.getByRole('alert').getByText(failure, { exact: true }).waitFor();
  assert.equal(await frame.getByLabel('Review start', { exact: true }).inputValue(), '2026-10-07');
  await frame.getByText('2026-10-14 – 2026-10-20 · America/New_York', { exact: true }).waitFor();
  large = true;
  failure = '';
  const beforeLarge = calls.filter((call) => call.name === 'review_weekly_screen_time').length;
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  await frame
    .getByRole('alert')
    .getByText('More than 32 shared files are available.', { exact: false })
    .waitFor();
  assert.equal(
    calls.filter((call) => call.name === 'review_weekly_screen_time').length,
    beforeLarge,
    'Oversized discovery never silently drops files',
  );
  assert.equal(
    await page.evaluate(
      'window.frames[0].document.documentElement.scrollWidth > document.querySelector("iframe").clientWidth',
    ),
    false,
  );
  failure = '';
  large = false;
  await frame.getByLabel('Range', { exact: true }).selectOption('custom');
  await frame.getByLabel('Review start', { exact: true }).fill('2026-10-14');
  await frame.getByLabel('Review end', { exact: true }).fill('2026-10-16');
  await frame.getByLabel('Compare with', { exact: true }).selectOption('custom');
  await frame.getByLabel('Comparison start', { exact: true }).fill('2026-10-01');
  await frame.getByLabel('Comparison end', { exact: true }).fill('2026-10-05');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  await frame.getByText('2026-10-14 – 2026-10-16 · America/New_York', { exact: true }).waitFor();
  await frame.getByText(/Different range lengths/).waitFor();
  assert.equal(await frame.locator('.chart-day').count(), 3);
  await frame.getByRole('button', { name: 'Attention heatmap', exact: true }).click();
  assert.equal(await frame.locator('.heat-outside').count(), 2 * 24);
  assert.equal(await frame.locator('[data-period="review"] .heat-cell').count(), 3 * 24);
  assert.equal(await frame.locator('[data-period="comparison"] .heat-cell').count(), 5 * 24);
  await frame.getByRole('button', { name: 'Period totals', exact: true }).click();

  assert.equal(await frame.getByLabel('Day', { exact: true }).locator('option').count(), 9);
  await frame.getByText('Daily values & comparison', { exact: true }).click();
  assert.equal(await frame.getByText('Outside range', { exact: true }).count(), 2);
  await frame.locator('.chart-day').first().click();
  assert.equal(await frame.locator('.detail-overview-mark.outside').count(), 2);
  assert.equal(
    await frame.locator('.detail-overview-slot.selected').getAttribute('data-date'),
    '2026-10-14',
  );
  await frame.getByRole('button', { name: 'Back to weekly review', exact: true }).click();

  const beforeInvalid = calls.length;
  await frame.getByLabel('Review end', { exact: true }).fill('2026-10-13');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  await frame
    .getByRole('alert')
    .getByText(/1–31 days/)
    .waitFor();
  assert.equal(calls.length, beforeInvalid);
  await frame.getByLabel('Review start', { exact: true }).fill('2026-09-01');
  await frame.getByLabel('Review end', { exact: true }).fill('2026-10-02');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  assert.equal(calls.length, beforeInvalid);
  await frame.getByLabel('Review start', { exact: true }).fill('2026-09-01');
  await frame.getByLabel('Review end', { exact: true }).fill('2026-10-01');
  await frame.getByLabel('Comparison start', { exact: true }).fill('2026-08-01');
  await frame.getByLabel('Comparison end', { exact: true }).fill('2026-08-31');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  await frame.getByText('2026-09-01 – 2026-10-01 · America/New_York', { exact: true }).waitFor();
  assert.equal(await frame.locator('.chart-day').count(), 31);
  await frame.getByRole('button', { name: 'Attention heatmap', exact: true }).click();
  assert.equal(
    await frame.getByLabel('Heatmap dates', { exact: true }).locator('option').count(),
    5,
  );
  await frame.getByLabel('Heatmap dates', { exact: true }).selectOption('28');
  assert.equal(await frame.locator('.heat-cell').count(), 2 * 3 * 24);
  await frame.getByLabel('Day', { exact: true }).selectOption('2026-10-01');
  await frame.getByRole('heading', { name: 'Apps on 2026-10-01', exact: true }).waitFor();
  assert.ok(
    await frame
      .locator('main')
      .evaluate(
        (node) =>
          /** @type {{scrollWidth:number}} */ (/** @type {unknown} */ (node)).scrollWidth <=
          /** @type {{clientWidth:number}} */ (/** @type {unknown} */ (node)).clientWidth + 1,
      ),
    'Long range stays within mobile card',
  );
  await frame.getByLabel('Day', { exact: true }).selectOption('');
  await frame.getByLabel('Time zone', { exact: true }).fill('America/Puerto_Rico');
  await frame.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await frame.getByText('2026-10-20 – 2026-10-20 · America/Puerto_Rico', { exact: true }).waitFor();
  assert.equal(calls.at(-1)?.arguments.comparisonWeekStart, '2026-10-19');
  assert.equal(calls.at(-1)?.arguments.comparisonWeekEnd, '2026-10-19');
  assert.equal(
    await frame
      .getByRole('button', { name: 'Yesterday', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  const samePresetCalls = calls.length;
  await frame.getByRole('button', { name: 'Yesterday', exact: true }).click();
  assert.equal(calls.length, samePresetCalls, 'Selecting the loaded preset avoids extra reads');
  await frame.getByRole('button', { name: 'Last 7 days', exact: true }).click();
  await frame.getByText('2026-10-14 – 2026-10-20 · America/Puerto_Rico', { exact: true }).waitFor();
  assert.equal(calls.at(-1)?.arguments.comparisonWeekStart, '2026-10-07');
  assert.equal(calls.at(-1)?.arguments.comparisonWeekEnd, '2026-10-13');
  await frame.getByRole('button', { name: 'Last 30 days', exact: true }).click();
  await frame.getByText('2026-09-21 – 2026-10-20 · America/Puerto_Rico', { exact: true }).waitFor();
  assert.equal(calls.at(-1)?.arguments.comparisonWeekStart, '2026-08-22');
  assert.equal(calls.at(-1)?.arguments.comparisonWeekEnd, '2026-09-20');
  assert.equal(await frame.getByLabel('Day', { exact: true }).locator('option').count(), 61);
  await frame.getByLabel('Time zone', { exact: true }).fill('Pacific/Kiritimati');
  await frame.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await frame.getByText('2026-10-21 – 2026-10-21 · Pacific/Kiritimati', { exact: true }).waitFor();
  assert.equal(calls.at(-1)?.arguments.comparisonWeekStart, '2026-10-20');
  const beforeInvalidZone = calls.length;
  await frame.getByLabel('Time zone', { exact: true }).fill('Not/A_Timezone');
  await frame.getByRole('button', { name: 'Last 7 days', exact: true }).click();
  await frame
    .getByRole('alert')
    .getByText(/valid IANA timezone/)
    .waitFor();
  assert.equal(calls.length, beforeInvalidZone);
  await frame.getByLabel('Time zone', { exact: true }).fill('Pacific/Kiritimati');
  failure = 'The read allowance is exhausted. Try again after reset.';
  await frame.getByRole('button', { name: 'Last 30 days', exact: true }).click();
  await frame.getByRole('alert').getByText(failure, { exact: true }).waitFor();
  await frame.getByText('2026-10-21 – 2026-10-21 · Pacific/Kiritimati', { exact: true }).waitFor();

  failure = '';
  await frame.getByLabel('Day', { exact: true }).selectOption('');
  await frame.getByLabel('Range', { exact: true }).selectOption('custom');
  await frame.getByLabel('Review start', { exact: true }).fill('2026-09-01');
  await frame.getByLabel('Review end', { exact: true }).fill('2026-09-03');
  await frame.getByLabel('Time zone', { exact: true }).fill('America/New_York');
  await frame.getByLabel('Compare with', { exact: true }).selectOption('custom');
  await frame.getByLabel('Comparison start', { exact: true }).fill('2026-08-01');
  await frame.getByLabel('Comparison end', { exact: true }).fill('2026-08-31');
  await frame.getByRole('button', { name: 'Load review', exact: true }).click();
  await frame.getByText('2026-09-01 – 2026-09-03 · America/New_York', { exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Attention heatmap', exact: true }).click();
  const beforePaging = calls.length;
  await frame.getByLabel('Heatmap dates', { exact: true }).selectOption('21');
  assert.equal(await frame.locator('[data-period="review"] .heat-outside').count(), 7 * 24);
  assert.equal(await frame.locator('[data-period="review"] .heat-cell').count(), 0);
  assert.equal(await frame.locator('[data-period="comparison"] .heat-cell').count(), 7 * 24);
  assert.equal(calls.length, beforePaging, 'Paired paging uses loaded data');
  console.log(
    'PASS period picker: local day/hour navigation, paginated scoped discovery, week reload, next week, timezone reload, invalid/future prevention, retained review on quota failure, file cap, 375px layout.',
  );
} finally {
  await browser.close();
}
