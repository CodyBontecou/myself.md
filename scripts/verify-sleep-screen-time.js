import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { sleepScreenTime } from '../core/sleep-screen-time.js';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { createCloudService } from '../server/cloud-service.js';
import { restrictChatgptTools } from '../server/chatgpt-tools.js';
import { parseProfile } from '../core/profiles.js';
import { day, prior, sleep, usage } from './sleep-screen-time-fixture.js';
/** @param {import('../core/data.js').DataRecord} record */
const row = (record) => ({ record, exportId: 'fixture' });
const health = [row(sleep)],
  time = [
    row(usage),
    row({
      ...usage,
      start: '2026-10-19T12:00:00Z',
      end: '2026-10-19T14:00:00Z',
      native: { .../** @type {Record<string,unknown>} */ (usage.native), durationMs: 3600000 },
    }),
  ];
const result = sleepScreenTime([day], [prior, day], health, time, 'UTC');
assert.equal(result.rows[0]?.sleepHours, 7);
assert.equal(result.rows[0]?.screenHours, 2);
assert.equal(result.rows[0]?.usageDate, prior.date);
assert.equal(result.rows[0]?.paired, true);
assert.equal(
  sleepScreenTime([day], [prior, day], health, time, 'UTC', { alignment: 'same_day' }).rows[0]
    ?.screenHours,
  1,
);
assert.equal(sleepScreenTime([day], [prior, day], health, [], 'UTC').rows[0]?.screenHours, null);
assert.equal(
  sleepScreenTime(
    [day],
    [prior, day],
    health,
    [
      row({
        ...usage,
        native: { .../** @type {Record<string,unknown>} */ (usage.native), durationMs: 0 },
      }),
    ],
    'UTC',
  ).rows[0]?.screenHours,
  0,
);
assert.equal(
  sleepScreenTime([day], [prior, day], [...health, ...health], time, 'UTC').rows[0]?.sleepHours,
  7,
);
assert.equal(
  sleepScreenTime(
    [day],
    [prior, day],
    health,
    [
      ...time,
      row({
        ...usage,
        native: { .../** @type {Record<string,unknown>} */ (usage.native), durationMs: 1 },
      }),
    ],
    'UTC',
  ).rows[0]?.screenHours,
  null,
);
assert.throws(() =>
  sleepScreenTime([day], [prior, day], health, time, 'UTC', { sleepSourceId: 'missing' }),
);
assert.equal('correlation' in result, false);
// WHOOP's provider metric stays independent of duration, efficiency and scoring availability.
const nativeSleep = /** @type {Record<string,unknown>} */ (sleep.native);
const nativeScore = /** @type {Record<string,unknown>} */ (nativeSleep.score);
/** @param {unknown} value @param {string} [state] */
function performance(value, state = 'SCORED') {
  const record = {
    ...sleep,
    native: {
      ...nativeSleep,
      score_state: state,
      score: {
        ...nativeScore,
        sleep_performance_percentage: value,
        sleep_efficiency_percentage: 99,
      },
    },
  };
  return sleepScreenTime([day], [prior, day], [row(record)], time, 'UTC', {
    view: 'sleep_performance',
  });
}
assert.equal(performance(0).sleepSources[0]?.daily[0]?.sessions[0]?.sleepPerformancePercent, 0);
assert.equal(performance(100).sleepSources[0]?.daily[0]?.sessions[0]?.sleepPerformancePercent, 100);
assert.equal(performance(82.5).usageSources[0]?.preSleep[0]?.sleepPerformancePercent, 82.5);
for (const invalid of [-1, 101, NaN, Infinity, '82']) {
  assert.equal(performance(invalid).usageSources[0]?.preSleep[0]?.sleepPerformancePercent, null);
  assert.equal(performance(invalid).usageSources[0]?.preSleep[0]?.performanceStatus, 'invalid');
}
for (const missingScore of [undefined, null]) {
  assert.equal(
    performance(missingScore).usageSources[0]?.preSleep[0]?.sleepPerformancePercent,
    null,
  );
  assert.equal(
    performance(missingScore).usageSources[0]?.preSleep[0]?.performanceStatus,
    'missing',
  );
}
for (const state of ['PENDING_SCORE', 'UNSCORABLE']) {
  assert.equal(performance(82, state).usageSources[0]?.preSleep[0]?.sleepPerformancePercent, null);
  assert.equal(
    performance(82, state).usageSources[0]?.preSleep[0]?.performanceStatus,
    'not_scored',
  );
}
assert.equal('correlation' in performance(82.5), false);
// Two-hour windows use exact elapsed boundaries; aggregates yield bounds, not prorated estimates.
const windowSleep = { ...sleep, start: '2026-10-18T21:30:00Z' };
/** @param {string} start @param {string} end @param {number} minutes @param {string} [identifier] */
const interval = (start, end, minutes, identifier = 'fixture.reader') => ({
  ...usage,
  start,
  end,
  native: {
    identifier,
    displayName: identifier,
    durationMs: minutes * 60000,
    granularity: 'hourly-aggregate',
    fictional: true,
  },
});
const windowRows = [
  interval('2026-10-18T19:00:00Z', '2026-10-18T20:00:00Z', 10),
  interval('2026-10-18T20:00:00Z', '2026-10-18T21:00:00Z', 20),
  interval('2026-10-18T21:00:00Z', '2026-10-18T22:00:00Z', 45),
  interval('2026-10-18T21:30:00Z', '2026-10-18T22:30:00Z', 10, 'outside'),
];
const windowResult = sleepScreenTime(
  [day],
  [prior, day],
  [row(windowSleep)],
  windowRows.map(row),
  'UTC',
  { view: 'before_sleep' },
);
const window = windowResult.usageSources[0]?.preSleep[0];
assert.ok(window);
assert.equal(window.windowStart, '2026-10-18T19:30:00.000Z');
assert.equal(Date.parse(window.windowEnd), Date.parse(windowSleep.start));
assert.equal(window.lowerMs, 35 * 60000);
assert.equal(window.upperMs, 60 * 60000);
assert.equal(window.containedMs, 20 * 60000);
assert.equal(window.boundaryRecords, 2);
assert.equal(window.observedSpanMs, 7200000);
assert.equal(window.topApps[0]?.lowerMs, window.lowerMs);
const doubled = sleepScreenTime(
  [day],
  [prior, day],
  [row(windowSleep)],
  [...windowRows, ...windowRows].map(row),
  'UTC',
);
assert.equal(doubled.usageSources[0]?.preSleep[0]?.lowerMs, window.lowerMs);
const missing = sleepScreenTime(
  [day],
  [prior, day],
  [row(windowSleep)],
  [row(interval('2026-10-18T12:00:00Z', '2026-10-18T13:00:00Z', 10))],
  'UTC',
);
assert.equal(missing.usageSources[0]?.preSleep[0]?.lowerMs, null);
const zero = sleepScreenTime(
  [day],
  [prior, day],
  [row(windowSleep)],
  [row(interval('2026-10-18T20:00:00Z', '2026-10-18T21:00:00Z', 0))],
  'UTC',
);
assert.equal(zero.usageSources[0]?.preSleep[0]?.upperMs, 0);
const conflict = sleepScreenTime(
  [day],
  [prior, day],
  [row(windowSleep)],
  [
    row(interval('2026-10-18T20:00:00Z', '2026-10-18T21:00:00Z', 20)),
    row(interval('2026-10-18T20:00:00Z', '2026-10-18T21:00:00Z', 21)),
  ],
  'UTC',
);
assert.equal(conflict.usageSources[0]?.preSleep[0]?.lowerMs, null);
assert.equal(conflict.usageSources[0]?.preSleep[0]?.conflictingRecords, 2);
const midnight = sleepScreenTime(
  [day],
  [prior, day],
  [
    row({
      ...sleep,
      start: '2026-10-19T00:30:00Z',
      native: { .../** @type {Record<string,unknown>} */ (sleep.native), nap: true },
    }),
  ],
  [row(interval('2026-10-18T23:00:00Z', '2026-10-19T01:00:00Z', 60))],
  'America/New_York',
);
assert.equal(midnight.usageSources[0]?.preSleep[0]?.upperMs, 60 * 60000);
assert.equal(midnight.usageSources[0]?.preSleep[0]?.nap, true);
const dstDay = { date: '2026-11-01', start: '2026-11-01T04:00:00Z', end: '2026-11-02T05:00:00Z' };
const dst = sleepScreenTime(
  [dstDay],
  [dstDay],
  [row({ ...sleep, start: '2026-11-01T06:30:00Z', end: '2026-11-01T14:00:00Z' })],
  [row(interval('2026-11-01T05:00:00Z', '2026-11-01T06:00:00Z', 30))],
  'America/New_York',
);
const dstWindow = dst.usageSources[0]?.preSleep[0];
assert.ok(dstWindow);
assert.equal(Date.parse(dstWindow.windowEnd) - Date.parse(dstWindow.windowStart), 7200000);
assert.equal(dstWindow.windowStart, '2026-11-01T04:30:00.000Z');
assert.equal(dstWindow.lowerMs, 30 * 60000);
const cloud = new CloudStore(':memory:', randomBytes(32)),
  billing = new BillingStore(':memory:'),
  history = new HistoryStore(':memory:', cloud),
  subject = 'sleep-usage-fixture',
  device = randomUUID();
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Fictional sleep usage',
    selection: {
      health: ['native:whoop.sleep', 'native:HKQuantityTypeIdentifierHeartRate'],
      time: ['native:application'],
      location: [],
    },
    export: { destination: 'cloud', formats: ['jsonl'] },
  }),
  id: 'sleep-usage',
};
cloud.access(subject, device, profile, true);
cloud.syncAgentPermissions(subject, device, [
  {
    ...profile,
    agentAccess: true,
    agentPermissions: { health: true, time: true, location: false, logs: false },
  },
]);
billing.grant(subject, 'fixture', 'fictional');
const file = cloud.begin(subject, device, profile.id, {
  day: day.date,
  format: 'jsonl',
  profile,
  manifest: { profileId: profile.id, recordCount: 4 },
});
await cloud.commit(
  subject,
  device,
  profile.id,
  file.id,
  Buffer.from(
    [
      sleep,
      ...time.map((r) => r.record),
      {
        ...sleep,
        source: 'healthkit',
        type: 'HKQuantityTypeIdentifierHeartRate',
        native: { payload: 'x'.repeat(210000) },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n',
  ),
);
await assert.rejects(async () => {
  const page = await cloud.page(subject, file.id, 0, 50, true, 'health');
  if (page.nextCursor)
    await cloud.page(subject, file.id, Number(page.nextCursor), 50, true, 'health');
}, /Record exceeds MCP response size/);
const service = createCloudService({ cloud, billing, history, refreshEntitlement: async () => {} });
/** @param {string} owner */
async function connect(owner) {
  const server = new McpServer({ name: 'sleep-usage-test', version: '1' });
  restrictChatgptTools(server);
  service.registerCloudTools(server, owner, 'fixture');
  const client = new Client({ name: 'sleep-usage-test', version: '1' }),
    [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return { server, client };
}
const owner = await connect(subject),
  other = await connect('foreign-owner');
const args = {
  healthExportIds: [file.id],
  screenTimeExportIds: [file.id],
  start: day.date,
  end: day.date,
  timezone: 'UTC',
  view: 'sleep_performance',
};
try {
  const response = await owner.client.callTool({
    name: 'compare_sleep_screen_time',
    arguments: args,
  });
  assert.ok(!response.isError, JSON.stringify(response));
  const d = /** @type {typeof result} */ (response.structuredContent);
  assert.equal(d.rows[0]?.screenHours, 2);
  assert.equal(d.rows[0]?.sleepHours, 7);
  assert.equal(d.view, 'sleep_performance');
  assert.equal(d.usageSources[0]?.preSleep[0]?.sleepPerformancePercent, 82.5);
  assert.equal(d.usageSources[0]?.preSleep.length, 1);
  assert.equal(
    (await owner.client.readResource({ uri: 'ui://myself-md/sleep-screen-time-v1.html' })).contents
      .length,
    1,
  );
  assert.equal(
    (await other.client.callTool({ name: 'compare_sleep_screen_time', arguments: args })).isError,
    true,
  );
  const bytes = cloud.bytes.bind(cloud);
  let reads = 0;
  cloud.bytes = async (artifact) => {
    const b = await bytes(artifact);
    if (++reads === 2)
      cloud.syncAgentPermissions(subject, device, [
        { ...profile, selection: { ...profile.selection, health: [] } },
      ]);
    return b;
  };
  const revoked = await owner.client.callTool({
    name: 'compare_sleep_screen_time',
    arguments: args,
  });
  assert.equal(revoked.isError, true);
  assert.equal(revoked.structuredContent, undefined);
} finally {
  await owner.client.close();
  await other.client.close();
  await owner.server.close();
  await other.server.close();
  history.db.close();
  billing.db.close();
  cloud.db.close();
}
console.log(
  'Sleep/screen time: same/previous dates, null/zero, duplicates/overlaps, source selection, MCP/resource, ownership and revocation passed.',
);
