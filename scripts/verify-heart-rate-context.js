import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { heartRateContext } from '../core/heart-rate-context.js';
import { screenTimeHourSlots } from '../server/screen-time-hours.js';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { createCloudService } from '../server/cloud-service.js';
import { restrictChatgptTools } from '../server/chatgpt-tools.js';
import { parseProfile } from '../core/profiles.js';

const day = {
  date: '2026-10-19',
  start: '2026-10-19T00:00:00.000Z',
  end: '2026-10-20T00:00:00.000Z',
};
/** @param {string} time @param {number} bpm @returns {import('../core/data.js').DataRecord} */
const heart = (time, bpm) => ({
  domain: 'health',
  type: 'HKQuantityTypeIdentifierHeartRate',
  source: 'fictional-heart',
  start: time,
  end: time,
  native: { quantity: bpm, unit: 'count/min', fictional: true },
});
/** @type {import('../core/data.js').DataRecord} */
const point = {
  domain: 'location',
  type: 'points',
  source: 'fictional-location',
  start: '2026-10-19T01:00:00Z',
  end: '2026-10-19T01:00:00Z',
  native: { coords: { latitude: 18.4, longitude: -66.1, accuracy: 12 }, fictional: true },
};
/** @type {import('../core/data.js').DataRecord} */
const usage = {
  domain: 'time',
  type: 'application',
  source: 'fictional-time',
  start: '2026-10-19T01:00:00Z',
  end: '2026-10-19T02:00:00Z',
  native: {
    displayName: 'Fictional Reader',
    durationMs: 600000,
    granularity: 'hour',
    fictional: true,
  },
};
const hr = [heart('2026-10-19T00:59:00Z', 70), heart('2026-10-19T01:01:00Z', 80)];
const rows = [...hr, point, usage];
/** @param {import('../core/data.js').DataRecord[]} records */
const wrap = (records) => records.map((record) => ({ record, exportId: 'fixture' }));
const slots = screenTimeHourSlots([day], 'UTC');
const result = heartRateContext([day], wrap(hr), wrap([point]), 'location', 'UTC', 300, slots);
assert.equal(result.sources[0]?.observations[0]?.heartRates[0]?.bpm, 70, 'ties use earlier sample');
assert.equal(result.sources[0]?.observations[0]?.heartRates[0]?.offsetSeconds, -60);
const exact = heartRateContext([day], wrap(hr), wrap([point]), 'location', 'UTC', 0, slots);
assert.equal(exact.sources[0]?.observations[0]?.heartRates[0]?.bpm, null);
const boundary = heartRateContext(
  [day],
  wrap([heart('2026-10-19T01:05:00Z', 90)]),
  wrap([point]),
  'location',
  'UTC',
  300,
  slots,
);
assert.equal(boundary.sources[0]?.observations[0]?.heartRates[0]?.bpm, 90);
const outside = heartRateContext(
  [day],
  wrap([heart('2026-10-19T01:05:01Z', 90)]),
  wrap([point]),
  'location',
  'UTC',
  300,
  slots,
);
assert.equal(outside.sources[0]?.observations[0]?.heartRates[0]?.bpm, null);
const hourly = heartRateContext(
  [day],
  wrap([...hr, heart('2026-10-19T02:00:00Z', 120)]),
  wrap([usage]),
  'time',
  'UTC',
  300,
  slots,
);
assert.equal(hourly.sources[0]?.observations[0]?.heartRates[0]?.bpm, 80);
assert.equal(hourly.sources[0]?.observations[0]?.heartRates[0]?.sampleIds.length, 1);
const daily = heartRateContext(
  [day],
  wrap(hr),
  wrap([
    {
      ...usage,
      native: { displayName: 'Fictional Reader', durationMs: 600000, granularity: 'daily' },
    },
  ]),
  'time',
  'UTC',
  300,
  slots,
);
assert.equal(daily.sources[0]?.observations.length, 0);
const invalid = heartRateContext(
  [day],
  wrap([{ ...heart('2026-10-19T01:00:00Z', 80), native: { quantity: 80, unit: 'Hz' } }]),
  wrap([point]),
  'location',
  'UTC',
  300,
  slots,
);
assert.equal(invalid.counts.invalid, 1);
const hc = {
  domain: /** @type {const} */ ('health'),
  type: 'HeartRate',
  source: 'healthconnect',
  start: day.start,
  end: day.end,
  native: {
    samples: [{ time: '2026-10-19T01:00:00Z', beatsPerMinute: 99 }],
    metadata: { dataOrigin: 'fictional' },
  },
};
const nested = heartRateContext(
  [day],
  wrap([hc, ...hr, ...hr]),
  wrap([point]),
  'location',
  'UTC',
  300,
  slots,
);
assert.equal(nested.healthSources.length, 2);
assert.equal(nested.counts.duplicates, 2);
assert.equal(nested.sources[0]?.observations[0]?.heartRates[0]?.bpm, 99);
const cloud = new CloudStore(':memory:', randomBytes(32)),
  billing = new BillingStore(':memory:'),
  history = new HistoryStore(':memory:', cloud);
const subject = 'location-review-fictional-owner',
  device = randomUUID();
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Fictional health review',
    selection: {
      health: ['native:HKQuantityTypeIdentifierHeartRate'],
      time: ['native:application'],
      location: ['native:points'],
    },
    export: { destination: 'cloud', formats: ['jsonl'] },
  }),
  id: 'location-review-test',
};
cloud.access(subject, device, profile, true);
cloud.syncAgentPermissions(subject, device, [
  {
    ...profile,
    agentAccess: true,
    agentPermissions: { health: true, time: true, location: true, logs: false },
  },
]);
billing.grant(subject, 'location-review-fixture', 'fictional');
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
  const server = new McpServer({ name: 'location-review-test', version: '1' });
  restrictChatgptTools(server);
  service.registerCloudTools(server, owner, 'location-review-test');
  const client = new Client({ name: 'location-review-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return { server, client };
}
const owner = await connect(subject),
  other = await connect('other-owner');
const args = {
  healthExportIds: [file.id],
  contextExportIds: [file.id],
  context: 'location',
  start: day.date,
  end: day.date,
  timezone: 'UTC',
  maxOffsetSeconds: 300,
};
try {
  assert.ok(
    (await owner.client.listTools()).tools.some((t) => t.name === 'review_heart_rate_context'),
  );
  const response = await owner.client.callTool({
    name: 'review_heart_rate_context',
    arguments: args,
  });
  assert.ok(!response.isError, JSON.stringify(response));
  const review = /** @type {typeof result} */ (response.structuredContent);
  assert.equal(review.sources[0]?.observations[0]?.heartRates[0]?.bpm, 70);
  const screen = await owner.client.callTool({
    name: 'review_heart_rate_context',
    arguments: { ...args, context: 'screen_time' },
  });
  assert.ok(!screen.isError, JSON.stringify(screen));
  assert.equal(
    /** @type {typeof result} */ (screen.structuredContent).sources[0]?.observations[0]
      ?.heartRates[0]?.bpm,
    80,
  );
  assert.ok(
    (await owner.client.readResource({ uri: 'ui://myself-md/heart-rate-context-v1.html' })).contents
      .length,
  );
  assert.equal(
    (await other.client.callTool({ name: 'review_heart_rate_context', arguments: args })).isError,
    true,
  );
  assert.equal(
    (
      await owner.client.callTool({
        name: 'review_heart_rate_context',
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
    name: 'review_heart_rate_context',
    arguments: args,
  });
  assert.equal(revokedDuringRead.isError, true);
  assert.equal(revokedDuringRead.structuredContent, undefined);
  cloud.bytes = originalBytes;
  cloud.syncAgentPermissions(subject, device, [{ ...profile, id: 'replacement-profile' }]);
  assert.equal(
    (await owner.client.callTool({ name: 'review_heart_rate_context', arguments: args })).isError,
    true,
  );
  console.log(
    'Heart-rate overlays: calculations, hourly bins, time matching, structured MCP result, ownership and sharing checks passed.',
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
