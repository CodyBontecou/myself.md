import { chromium } from 'playwright';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import assert from 'node:assert/strict';
import { createAnalyticsClient } from '../core/analytics-client.js';
import { parseAnalyticsBatch, parseAnalyticsRange } from '../core/analytics.js';

/** @typedef {{counts:{name:string,events:number,users:number,verified:number}[],steps:{name:string,step:string,events:number,users:number}[],daily:{day:string,events:number,users:number}[],activation:{step:string,users:number}[],funnel:{step:string,users:number}[],retention:{days:number,eligible:number,retained:number}[],range:{audience:string},browserExclusion:{setupUrl:string,scope:string,requiresBrowser:boolean}}} AnalyticsReport */
/** @typedef {{request:(path:string,bearer:string|null,method?:string,body?:unknown)=>Promise<{status:number,value:unknown}>,token:(subject:string,clientId:string)=>Promise<string>,origin:string,mcp:import('@modelcontextprotocol/client').Client}} AnalyticsFixture */

/** Exercise the real Worker HTTP and MCP paths in the existing workerd fixture.
 * @param {AnalyticsFixture} fixture */
export async function verifyAnalytics({ request, token, mcp, origin }) {
  const owner = await token('analytics-operator', 'myselfmd-dashboard');
  const ordinary = await token('analytics-user', 'myselfmd-phone');
  const agent = await token('analytics-user', 'analytics-agent');
  const range = new URLSearchParams({
    start: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    end: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  });
  const path = `/api/analytics/report?${range}`;
  assert.equal((await request(path, null)).status, 401);
  assert.equal((await request(path, ordinary)).status, 403);
  assert.equal((await request(path, agent)).status, 403);
  assert.equal(
    (await request('/api/analytics/preferences', ordinary, 'PUT', { enabled: true })).status,
    400,
  );
  assert.deepEqual((await request('/api/analytics/preferences', ordinary)).value, {
    enabled: false,
    decided: false,
  });
  assert.equal(
    (
      await request('/api/analytics/preferences', ordinary, 'PUT', {
        enabled: true,
        confirmation: 'ALLOW_USAGE_ANALYTICS',
      })
    ).status,
    200,
  );
  const anonymousId = 'a'.repeat(32),
    at = Date.now() - 60000;
  const event = (
    /** @type {string} */ name,
    /** @type {number} */ i,
    /** @type {string} */ surface = 'ios',
  ) => ({
    id: i.toString(16).padStart(32, '0'),
    name,
    at: i <= 2 ? at + i * 100 : Date.now() - 1000 + i * 50,
    surface,
  });
  const anonymous = { anonymousId, events: [event('page_viewed', 1, 'website')] };
  assert.equal((await request('/api/analytics/anonymous', null, 'POST', anonymous)).status, 200);
  assert.equal(
    (
      await request('/api/analytics/anonymous', null, 'POST', {
        anonymousId,
        events: [{ ...event('page_viewed', 2), token: 'secret' }],
      })
    ).status,
    400,
  );
  const batch = {
    anonymousId,
    events: [
      event('onboarding_started', 3),
      event('onboarding_completed', 4),
      event('export_completed', 5),
    ],
  };
  assert.equal((await request('/api/analytics/events', ordinary, 'POST', batch)).status, 200);
  assert.equal((await request('/api/analytics/events', ordinary, 'POST', batch)).status, 200);
  assert.equal((await request('/api/analytics/anonymous', null, 'POST', anonymous)).status, 409);
  assert.equal(
    (
      await request('/api/analytics/events', ordinary, 'POST', {
        anonymousId,
        events: [event('phone_connected', 6)],
      })
    ).status,
    400,
  );
  const report =
    /** @type {{counts:{name:string,events:number,users:number}[],activation:{step:string,users:number}[],funnel:{step:string,users:number}[],retention:{eligible:number}[]}} */ (
      (await request(path, owner)).value
    );
  assert.equal(report.counts.find((row) => row.name === 'export_completed')?.events, 1);
  assert.deepEqual(
    report.activation.map((row) => row.users),
    [1, 1, 1],
  );
  assert.deepEqual(
    report.funnel.map((row) => row.users),
    [1, 1, 1, 1],
  );
  assert.ok(report.retention.every((row) => row.eligible === 0));
  assert.equal((await request(path + '&unexpected=private', owner)).status, 400);
  const audienceReports = await verifyAnalyticsAudiences({ request, token }, path, owner);
  const metadata = await mcp.listTools();
  assert.ok(metadata.tools.some((tool) => tool.name === 'get_usage_analytics_preference'));
  assert.ok(!metadata.tools.some((tool) => tool.name === 'get_product_analytics_report'));
  const preference = await mcp.callTool({ name: 'get_usage_analytics_preference', arguments: {} });
  assert.ok(!preference.isError);
  await assert.rejects(
    () =>
      mcp.callTool({ name: 'get_product_analytics_report', arguments: Object.fromEntries(range) }),
    /not found/,
  );
  const operatorMcp = new Client({ name: 'analytics-operator-fixture', version: '1' });
  try {
    await operatorMcp.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', origin), {
        requestInit: {
          headers: { Authorization: await token('analytics-operator', 'analytics-owner-agent') },
        },
      }),
    );
    const tools = await operatorMcp.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === 'get_product_analytics_report'));
    const viaMcp = await operatorMcp.callTool({
      name: 'get_product_analytics_report',
      arguments: Object.fromEntries(range),
    });
    assert.ok(!viaMcp.isError);
    assert.deepEqual(
      /** @type {{funnel:unknown}} */ (viaMcp.structuredContent).funnel,
      /** @type {{funnel:unknown}} */ (report).funnel,
    );
    await Promise.all(
      /** @type {const} */ (['customers', 'internal', 'all']).map(async (audience) => {
        const filtered = await operatorMcp.callTool({
          name: 'get_product_analytics_report',
          arguments: { ...Object.fromEntries(range), audience },
        });
        assert.ok(!filtered.isError);
        assert.deepEqual(
          /** @type {AnalyticsReport} */ (filtered.structuredContent).counts,
          audienceReports[audience].counts,
        );
      }),
    );
    assert.equal(
      (
        await request('/api/dashboard/agents', owner, 'PUT', {
          client: 'analytics-owner-agent',
          blocked: true,
        })
      ).status,
      200,
    );
    await assert.rejects(() =>
      operatorMcp.callTool({
        name: 'get_product_analytics_report',
        arguments: Object.fromEntries(range),
      }),
    );
  } finally {
    await operatorMcp.close();
  }
  assert.equal(
    (await request('/api/analytics/preferences', ordinary, 'PUT', { enabled: false })).status,
    200,
  );
  assert.deepEqual((await request('/api/analytics/events', ordinary, 'POST', batch)).value, {
    accepted: 0,
    enabled: false,
  });
  const erased = /** @type {{counts:unknown[]}} */ ((await request(path, owner)).value);
  assert.deepEqual(
    erased.counts.map((row) => /** @type {{name:string}} */ (row).name),
    ['app_opened'],
  );
  const matureRange = new URLSearchParams({
    start: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10),
    end: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  });
  const matureAll = /** @type {AnalyticsReport} */ (
    (await request(`/api/analytics/report?${matureRange}&audience=all`, owner)).value
  );
  const matureInternal = /** @type {AnalyticsReport} */ (
    (await request(`/api/analytics/report?${matureRange}&audience=internal`, owner)).value
  );
  assert.deepEqual(
    matureInternal.retention.map((row) => [row.days, row.eligible, row.retained]),
    [
      [1, 1, 0],
      [7, 1, 1],
      [30, 0, 0],
    ],
  );
  assert.deepEqual(
    matureAll.retention.map((row) => [row.days, row.eligible, row.retained]),
    [
      [1, 2, 0],
      [7, 2, 2],
      [30, 0, 0],
    ],
  );
  const mature = /** @type {{retention:{days:number,eligible:number,retained:number}[]}} */ (
    (await request(`/api/analytics/report?${matureRange}`, owner)).value
  );
  assert.deepEqual(
    mature.retention.map((row) => [row.days, row.eligible, row.retained]),
    [
      [1, 1, 0],
      [7, 1, 1],
      [30, 0, 0],
    ],
  );
  await verifyAnalyticsBrowser(origin, owner);
  console.log(
    'Analytics HTTP/MCP: ownership, consent, strict inputs, customer/internal/all partitions, operator and QA aliases, retention, deduplication, activation and erasure passed.',
  );
}

/** Classifications must change aggregates without erasing events or widening report access.
 * @param {Pick<AnalyticsFixture,'request'|'token'>} fixture @param {string} path @param {string} owner */
async function verifyAnalyticsAudiences({ request, token }, path, owner) {
  /** @param {string} [audience] */
  async function read(audience) {
    const response = await request(path + (audience ? `&audience=${audience}` : ''), owner);
    assert.equal(response.status, 200);
    return /** @type {AnalyticsReport} */ (response.value);
  }
  const at = Date.now() - 5000;
  /** @param {string} anonymousId @param {string|null} bearer @param {boolean} initial */
  async function send(anonymousId, bearer, initial) {
    const response = await request(
      bearer ? '/api/analytics/events' : '/api/analytics/anonymous',
      bearer,
      'POST',
      {
        anonymousId,
        events: initial
          ? [{ id: '1'.repeat(32), name: 'page_viewed', at, surface: 'website' }]
          : [
              'onboarding_started',
              'onboarding_step_viewed',
              'onboarding_completed',
              'export_completed',
            ].map((name, index) => ({
              id: (index + 2).toString(16).repeat(32),
              name,
              at: at + 1000 + index * 100,
              surface: 'ios',
              step: name === 'onboarding_step_viewed' ? 'data' : undefined,
            })),
      },
    );
    assert.equal(response.status, 200);
  }
  const customers = await read();
  assert.equal(customers.range.audience, 'customers');
  assert.equal(customers.browserExclusion.scope, 'browser');
  assert.equal(customers.browserExclusion.requiresBrowser, true);
  assert.ok(customers.browserExclusion.setupUrl.endsWith('/operator/analytics'));
  await Promise.all(
    [
      { subject: 'analytics-operator', anonymousId: 'd'.repeat(32) },
      { subject: 'analytics-github-owner', anonymousId: '9'.repeat(32) },
      { subject: 'analytics-qa', anonymousId: 'c'.repeat(32) },
      { subject: 'analytics-qa-linked', anonymousId: 'b'.repeat(32) },
    ].map(async ({ subject, anonymousId }) => {
      const bearer = await token(subject, 'myselfmd-phone');
      assert.equal(
        (
          await request('/api/analytics/preferences', bearer, 'PUT', {
            enabled: true,
            confirmation: 'ALLOW_USAGE_ANALYTICS',
          })
        ).status,
        200,
      );
      await send(anonymousId, null, true);
      await send(anonymousId, bearer, false);
      if (subject === 'analytics-qa-linked') await send('e'.repeat(32), bearer, true);
    }),
  );
  const after = await read();
  const sections = /** @type {const} */ ([
    'counts',
    'steps',
    'daily',
    'funnel',
    'activation',
    'retention',
  ]);
  for (const field of sections) assert.deepEqual(after[field], customers[field]);
  assert.deepEqual((await read('customers')).counts, customers.counts);
  const [internal, all] = await Promise.all([read('internal'), read('all')]);
  for (const field of sections) {
    const key =
      field === 'daily'
        ? 'day'
        : field === 'retention'
          ? 'days'
          : field === 'counts' || field === 'steps'
            ? 'name'
            : 'step';
    const metrics =
      field === 'retention'
        ? ['eligible', 'retained']
        : field === 'funnel' || field === 'activation'
          ? ['users']
          : field === 'counts'
            ? ['events', 'users', 'verified']
            : ['events', 'users'];
    /** @param {AnalyticsReport} report @returns {Record<string,string|number>[]} */
    const rows = (report) => report[field];
    for (const row of rows(all)) {
      const customerRow = rows(customers).find(
        (value) => value[key] === row[key] && (field !== 'steps' || value.step === row.step),
      );
      const internalRow = rows(internal).find(
        (value) => value[key] === row[key] && (field !== 'steps' || value.step === row.step),
      );
      for (const metric of metrics)
        assert.equal(
          row[metric],
          Number(customerRow?.[metric] ?? 0) + Number(internalRow?.[metric] ?? 0),
          `${field} ${row[key]} ${metric}`,
        );
    }
  }
  assert.equal(internal.counts.find((row) => row.name === 'export_completed')?.events, 4);
  assert.equal(internal.counts.find((row) => row.name === 'page_viewed')?.users, 4);
  assert.deepEqual(
    internal.activation.map((row) => row.users),
    [4, 4, 4],
  );
  await Promise.all(
    [
      { subject: 'analytics-user', client: 'myselfmd-dashboard', status: 403 },
      { subject: 'analytics-user', client: 'analytics-agent', status: 403 },
      { subject: 'analytics-qa', client: 'myselfmd-dashboard', status: 403 },
      { subject: 'myselfmd-directory-reviewer-v1', client: 'myselfmd-dashboard', status: 401 },
    ].map(async (denied) => {
      const bearer = await token(denied.subject, denied.client);
      await Promise.all(
        ['customers', 'internal', 'all'].map(async (audience) => {
          assert.equal(
            (await request(`${path}&audience=${audience}`, bearer)).status,
            denied.status,
          );
        }),
      );
    }),
  );
  assert.equal((await request(`${path}&audience=unknown`, owner)).status, 400);
  assert.equal(
    (await request(path, await token('analytics-github-owner', 'myselfmd-dashboard'))).status,
    200,
  );
  for (const report of [customers, internal, all]) {
    const serialized = JSON.stringify(report);
    assert.equal(/analytics-(operator|github-owner|qa|user)|[a-f0-9]{64}/.test(serialized), false);
  }
  assert.deepEqual(
    (await read('all')).counts,
    all.counts,
    'Reading a filtered report preserves events.',
  );
  return { customers, internal, all };
}

/** Synthetic OAuth exchange; report requests still cross real JWT verification and D1.
 * @param {string} origin @param {string} owner */
async function verifyAnalyticsBrowser(origin, owner) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = /** @type {string[]} */ ([]);
    page.on('pageerror', (error) => errors.push(error.message));
    let captures = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/analytics/anonymous')) captures++;
    });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Allow usage analytics', exact: true }).waitFor();
    assert.equal(captures, 0);
    const received = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/analytics/anonymous') && response.status() === 200,
    );
    await page.getByRole('button', { name: 'Allow usage analytics', exact: true }).click();
    await received;
    await page.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Keep analytics off', exact: true }).click();
    const afterOptOut = captures;
    await page.reload();
    await page.getByRole('button', { name: 'Analytics preferences', exact: true }).waitFor();
    assert.equal(captures, afterOptOut);
    await page.goto(`${origin}/operator/analytics`);
    await page.getByRole('button', { name: 'Exclude this browser', exact: true }).click();
    assert.ok(
      (await context.cookies(origin)).some(
        (value) => value.name === 'myself_internal_traffic' && value.value === '1',
      ),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Include this browser', exact: true }).waitFor();
    await page.goto(origin);
    await page.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Allow usage analytics', exact: true }).click();
    await page.waitForFunction(() => localStorage.getItem('myself-analytics-choice') === 'true');
    await page.reload();
    await page.getByRole('button', { name: 'Analytics preferences', exact: true }).waitFor();
    assert.equal(captures, afterOptOut, 'Excluded browser must not send opted-in product events.');
    await page.goto(`${origin}/operator/analytics`);
    await page.getByRole('button', { name: 'Include this browser', exact: true }).click();
    assert.equal(
      (await context.cookies(origin)).some((value) => value.name === 'myself_internal_traffic'),
      false,
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem('myself-analytics-choice')),
      'true',
    );
    const resumed = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/analytics/anonymous') && response.status() === 200,
    );
    await page.goto(origin);
    await resumed;
    assert.ok(captures > afterOptOut, 'Including the browser restores consented collection.');
    await page.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Keep analytics off', exact: true }).click();
    await page.route('**/protocol/openid-connect/token', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: owner.replace(/^Bearer /, ''), expires_in: 600 }),
      }),
    );
    await page.evaluate(
      `sessionStorage.setItem('myselfmd-dashboard-login',JSON.stringify({verifier:'synthetic-pkce',state:'analytics-ui',created:Date.now(),returnTo:'/operator/analytics'}))`,
    );
    await page.goto(`${origin}/dashboard/callback?code=synthetic&state=analytics-ui`);
    await page.getByRole('button', { name: 'Load report', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Audience').inputValue(), 'customers');
    assert.equal(
      await page.getByLabel('Until (exclusive)', { exact: true }).inputValue(),
      new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      'Default report range must include the current UTC day',
    );
    await ['all', 'internal', 'customers'].reduce(async (previous, audience) => {
      await previous;
      await page.getByLabel('Audience').selectOption(audience);
      const loaded = page.waitForResponse(
        (response) =>
          response.url().includes('/api/analytics/report?') && response.status() === 200,
      );
      await page.getByRole('button', { name: 'Load report', exact: true }).click();
      const loadedReport = /** @type {AnalyticsReport} */ (await (await loaded).json());
      assert.equal(loadedReport.range.audience, audience);
    }, Promise.resolve());
    await page.getByRole('heading', { name: 'Ordered funnel', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Analytics preferences', exact: true }).isVisible(),
      false,
    );
    await page
      .getByRole('heading', { name: 'App activation (including app-first users)', exact: true })
      .waitFor();
    await page.screenshot({ path: '.local/analytics-report-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: '.local/analytics-report-mobile-dark.png', fullPage: true });
    assert.equal(errors.length, 0, errors.join('\n'));
    await context.close();
    console.log(
      'Analytics browser: consent, persistent browser exclusion and restoration, customer/internal/all report controls and responsive rendering passed.',
    );
  } finally {
    await browser.close();
  }
}

// The same outbox runs on web, iOS and Android. These cases test effects, not static rules.
let saved = '',
  fail = true,
  sequence = 0;
const delivered = /** @type {import('../core/analytics.js').AnalyticsBatch[]} */ ([]);
const adapter = {
  read: () => saved || null,
  write: (/** @type {string} */ value) => {
    saved = value;
  },
  id: () => (++sequence).toString(16).padStart(32, '0'),
  now: Date.now,
  surface: /** @type {const} */ ('ios'),
  send: async (/** @type {import('../core/analytics.js').AnalyticsBatch} */ batch) => {
    if (fail) throw new Error('offline');
    delivered.push(batch);
    return { enabled: true };
  },
};
let collector = createAnalyticsClient(adapter);
collector.track('app_opened');
assert.equal(saved, '');
collector.choose(true);
collector.track('onboarding_started');
await collector.flush();
const queued = JSON.parse(saved).events[0].id;
collector = createAnalyticsClient(adapter);
fail = false;
await collector.flush();
assert.equal(delivered[0]?.events[0]?.id, queued);
collector.identify('account-one');
collector.track('onboarding_completed');
await collector.flush();
collector.identify('account-two');
assert.equal(collector.choice(), null);
collector.choose(false);
collector.track('app_opened');
await collector.flush();
assert.equal(JSON.parse(saved).events.length, 0);
assert.throws(() =>
  parseAnalyticsBatch(
    {
      anonymousId: 'a'.repeat(32),
      events: [
        {
          id: 'b'.repeat(32),
          name: 'page_viewed',
          at: Date.now(),
          surface: 'ios',
          email: 'private',
        },
      ],
    },
    Date.now(),
  ),
);
assert.throws(() => parseAnalyticsRange({ start: '2026-02-30', end: '2026-03-02' }));
console.log(
  'Analytics shared outbox: opt-in, offline restart/retry, identity rotation and opt-out passed.',
);

const corrupted = createAnalyticsClient({ ...adapter, read: () => '{"enabled":true}' });
assert.equal(corrupted.choice(), null);
