import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { healthReview } from '../core/health-review.js';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { createCloudService } from '../server/cloud-service.js';
import { restrictChatgptTools } from '../server/chatgpt-tools.js';
import { parseProfile } from '../core/profiles.js';
import { scheduleCalendar } from '../server/schedule-calendar.js';

const day = { date: '2026-10-19', start: '2026-10-19T00:00:00Z', end: '2026-10-20T00:00:00Z' };
/** @param {string} type @param {string} start @param {string} end @param {unknown} native @param {string} [source] @returns {import('../core/data.js').DataRecord} */
function sample(type, start, end, native, source = 'healthkit') {
  return { domain: 'health', type, source, start, end, native };
}
const step = sample(
  'HKQuantityTypeIdentifierStepCount',
  '2026-10-19T01:00:00Z',
  '2026-10-19T02:00:00Z',
  { quantity: 1200, unit: 'count', fictional: true },
);
const sleep = sample(
  'HKCategoryTypeIdentifierSleepAnalysis',
  '2026-10-19T00:00:00Z',
  '2026-10-19T06:00:00Z',
  { value: 1, fictional: true },
);
const rows = [
  step,
  sleep,
  sample(sleep.type, '2026-10-19T01:00:00Z', '2026-10-19T04:00:00Z', { value: 4, fictional: true }),
  step,
];
const result = healthReview(
  [day],
  rows.map((record) => ({ record, exportId: 'fixture' })),
  'UTC',
);
assert.equal(result.series.find((s) => s.kind === 'activity')?.daily[0]?.value, 1200);
assert.equal(result.series.find((s) => s.kind === 'sleep')?.daily[0]?.value, 6);
assert.equal(result.counts.duplicates, 1);
assert.deepEqual(result.series.find((s) => s.kind === 'sleep')?.daily[0]?.stageDurations, [
  { kind: 'Asleep', hours: 6 },
  { kind: 'Deep', hours: 3 },
]);
const overlap = healthReview(
  [day],
  [step, { ...step, start: '2026-10-19T01:30:00Z' }].map((record) => ({
    record,
    exportId: 'fixture',
  })),
  'UTC',
);
assert.equal(overlap.counts.overlaps, 2);
assert.equal(overlap.series[0]?.daily[0]?.value, null);
const zero = healthReview(
  [day],
  [
    { ...step, native: { quantity: 0, unit: 'count' } },
    { ...step, source: 'other' },
  ].map((record) => ({ record, exportId: 'fixture' })),
  'UTC',
);
assert.equal(zero.series.length, 2);
assert.equal(zero.series[0]?.daily[0]?.value, 0);
const crossing = healthReview(
  [day],
  [{ ...step, start: '2026-10-18T23:00:00Z' }].map((record) => ({ record, exportId: 'fixture' })),
  'UTC',
);
assert.equal(crossing.counts.crossingDay, 1);
const hc = sample(
  'SleepSession',
  day.start,
  '2026-10-19T06:00:00Z',
  {
    stages: [
      { startTime: day.start, endTime: '2026-10-19T02:00:00Z', stage: 5 },
      { startTime: '2026-10-19T02:00:00Z', endTime: '2026-10-19T03:00:00Z', stage: 1 },
    ],
    metadata: { dataOrigin: 'fictional' },
  },
  'healthconnect',
);
assert.equal(
  healthReview([day], [{ record: hc, exportId: 'hc' }], 'UTC').series[0]?.daily[0]?.value,
  2,
);
const calendar = scheduleCalendar('America/New_York');
const dst = {
  date: '2026-11-01',
  start: calendar.instant('2026-11-01', 0, 0),
  end: calendar.instant('2026-11-02', 0, 0),
};
assert.equal(Date.parse(dst.end) - Date.parse(dst.start), 25 * 3600000);
assert.equal(
  healthReview(
    [dst],
    [{ exportId: 'dst', record: { ...sleep, start: dst.start, end: dst.end } }],
    'America/New_York',
  ).series[0]?.daily[0]?.value,
  25,
);

const whoop = sample(
  'whoop.sleep',
  '2026-10-18T22:00:00Z',
  '2026-10-19T06:00:00Z',
  {
    id: 'whoop-sleep',
    user_id: 1,
    updated_at: '2026-10-19T07:00:00Z',
    nap: false,
    score_state: 'SCORED',
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
  'whoop',
);
const whoopRows = [whoop, whoop].map((record) => ({ record, exportId: 'whoop-export' }));
const whoopResult = healthReview([day], whoopRows, 'UTC');
assert.equal(whoopResult.series[0]?.basis, 'session_end');
assert.equal(whoopResult.series[0]?.daily[0]?.value, 7);
assert.equal(whoopResult.series[0]?.daily[0]?.intervals.length, 0, 'No fabricated stage intervals');
assert.equal(whoopResult.series[0]?.daily[0]?.sessions?.[0]?.start, '2026-10-18T22:00:00.000Z');
assert.equal(whoopResult.counts.duplicates, 1);
assert.equal(whoopResult.counts.unsupported, 0);
const whoopNative = /** @type {Record<string,unknown>} */ (whoop.native);
const pending = {
  ...whoop,
  native: { ...whoopNative, score_state: 'PENDING_SCORE', score: undefined },
};
assert.equal(
  healthReview([day], [{ record: pending, exportId: 'p' }], 'UTC').series[0]?.daily[0]?.value,
  null,
);
const invalidWhoop = {
  ...whoop,
  native: { ...whoopNative, score: { stage_summary: { total_in_bed_time_milli: 1 } } },
};
assert.equal(
  healthReview([day], [{ record: invalidWhoop, exportId: 'p' }], 'UTC').counts.invalid,
  1,
);
const newer = { ...pending, native: { ...pending.native, updated_at: '2026-10-19T08:00:00Z' } };
assert.equal(
  healthReview([day], [...whoopRows, { record: newer, exportId: 'new' }], 'UTC').series[0]?.daily[0]
    ?.value,
  null,
  'New provider revision replaces stale scored values',
);
const overlappingWhoop = { ...whoop, native: { ...whoopNative, id: 'overlap' } };
assert.equal(
  healthReview(
    [day],
    [
      { record: whoop, exportId: 'a' },
      { record: overlappingWhoop, exportId: 'b' },
    ],
    'UTC',
  ).series[0]?.daily[0]?.value,
  null,
);
const otherDay = { date: '2026-10-18', start: '2026-10-18T00:00:00Z', end: day.start };
const whole = healthReview([otherDay, day], whoopRows, 'UTC').series[0];
assert.equal(whole?.daily[0]?.value, null);
assert.equal(whole?.daily[1]?.value, 7, 'Whole session belongs to local end date, never prorated');

const nap = {
  ...whoop,
  start: '2026-10-19T12:00:00Z',
  end: '2026-10-19T20:00:00Z',
  native: { ...whoopNative, id: 'nap', nap: true },
};
const withNap = healthReview(
  [day],
  [
    { record: whoop, exportId: 'night' },
    { record: nap, exportId: 'nap' },
  ],
  'UTC',
);
assert.equal(withNap.series[0]?.daily[0]?.value, 14);
assert.equal(withNap.series[0]?.daily[0]?.sessions?.[1]?.nap, true);
const unscorable = { ...pending, native: { ...pending.native, score_state: 'UNSCORABLE' } };
assert.equal(
  healthReview([day], [{ record: unscorable, exportId: 'u' }], 'UTC').series[0]?.daily[0]?.value,
  null,
);
const dstWhoop = {
  ...whoop,
  start: dst.start,
  end: new Date(Date.parse(dst.start) + 8 * 3600000).toISOString(),
};
assert.equal(
  healthReview([dst], [{ record: dstWhoop, exportId: 'dst' }], 'America/New_York').series[0]
    ?.daily[0]?.value,
  7,
);

const midnight = { ...whoop, end: day.start };
const midnightReview = healthReview(
  [otherDay, day],
  [{ record: midnight, exportId: 'midnight' }],
  'UTC',
);
assert.equal(midnightReview.series[0]?.daily[0]?.value, null);
assert.equal(
  midnightReview.series[0]?.daily[1]?.value,
  7,
  'An exact midnight session end belongs to the new local day',
);
const conflicting = healthReview(
  [day],
  [
    { record: whoop, exportId: 'a' },
    { record: pending, exportId: 'b' },
  ],
  'UTC',
);
assert.equal(
  conflicting.counts.invalid,
  1,
  'Conflicting provider snapshots without an ordered revision are excluded',
);
assert.equal(conflicting.series.length, 0);

const cloud = new CloudStore(':memory:', randomBytes(32)),
  billing = new BillingStore(':memory:'),
  history = new HistoryStore(':memory:', cloud);
const subject = 'health-review-fictional-owner',
  device = randomUUID();
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Fictional health review',
    selection: {
      health: [`native:${step.type}`, `native:${sleep.type}`, 'native:whoop.sleep'],
      time: [],
      location: [],
    },
    export: { destination: 'cloud', formats: ['jsonl'] },
  }),
  id: 'health-review-test',
};
cloud.access(subject, device, profile, true);
cloud.syncAgentPermissions(subject, device, [
  {
    ...profile,
    agentAccess: true,
    agentPermissions: { health: true, time: false, location: false, logs: false },
  },
]);
billing.grant(subject, 'health-review-fixture', 'fictional');
rows.push(whoop);
const file = cloud.begin(subject, device, profile.id, {
  day: day.date,
  format: 'jsonl',
  profile,
  manifest: {
    schema: profile.export.schema,
    profileId: profile.id,
    recordCount: rows.length,
    interval: { start: day.start, end: day.end },
  },
});
await cloud.commit(
  subject,
  device,
  profile.id,
  file.id,
  Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'),
);
const service = createCloudService({ cloud, billing, history, refreshEntitlement: async () => {} });
/** @param {string} owner */
async function connect(owner) {
  const server = new McpServer({ name: 'health-review-test', version: '1' });
  restrictChatgptTools(server);
  service.registerCloudTools(server, owner, 'health-review-test');
  const client = new Client({ name: 'health-review-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return { server, client };
}
const owner = await connect(subject),
  other = await connect('other-owner');
const args = { exportIds: [file.id], start: day.date, end: day.date, timezone: 'UTC' };
try {
  assert.ok((await owner.client.listTools()).tools.some((t) => t.name === 'review_activity_sleep'));
  const response = await owner.client.callTool({ name: 'review_activity_sleep', arguments: args });
  assert.ok(!response.isError, JSON.stringify(response));
  const review = /** @type {typeof result} */ (response.structuredContent);
  assert.equal(review.series.find((s) => s.kind === 'sleep')?.daily[0]?.value, 6);
  assert.equal(review.series.find((s) => s.source === 'whoop')?.daily[0]?.value, 7);
  assert.ok(
    (await owner.client.readResource({ uri: 'ui://myself-md/activity-sleep-review-v1.html' }))
      .contents.length,
  );
  assert.equal(
    (await other.client.callTool({ name: 'review_activity_sleep', arguments: args })).isError,
    true,
  );
  assert.equal(
    (
      await owner.client.callTool({
        name: 'review_activity_sleep',
        arguments: { ...args, end: '2099-01-01' },
      })
    ).isError,
    true,
  );
  const originalBytes = cloud.bytes.bind(cloud);
  cloud.bytes = async (row) => {
    const bytes = await originalBytes(row);
    cloud.syncAgentPermissions(subject, device, [{ ...profile, id: 'replacement-profile' }]);
    return bytes;
  };
  const revokedDuringRead = await owner.client.callTool({
    name: 'review_activity_sleep',
    arguments: args,
  });
  assert.equal(revokedDuringRead.isError, true);
  assert.equal(revokedDuringRead.structuredContent, undefined);
  cloud.bytes = originalBytes;
  cloud.syncAgentPermissions(subject, device, [{ ...profile, id: 'replacement-profile' }]);
  assert.equal(
    (await owner.client.callTool({ name: 'review_activity_sleep', arguments: args })).isError,
    true,
  );
  console.log(
    'Health review: calculation, DST, structured MCP result, ownership and sharing checks passed.',
  );
} finally {
  await owner.client.close();
  await other.client.close();
  await owner.server.close();
  await other.server.close();
  history.db.close();
  cloud.db.close();
  billing.db.close();
}
