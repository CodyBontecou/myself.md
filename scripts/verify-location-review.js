import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { locationReview } from '../core/location-review.js';
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
/** @type {import('../core/data.js').DataRecord} */
const point = {
  domain: 'location',
  type: 'points',
  source: 'fictional',
  start: '2026-10-19T01:00:00Z',
  end: '2026-10-19T01:00:00Z',
  native: { coords: { latitude: 18.4, longitude: -66.1, accuracy: 12 }, fictional: true },
};
const rows = [
  point,
  {
    ...point,
    start: '2026-10-19T02:00:00Z',
    native: { latitude: 18.5, longitude: -66.2, accuracy: -1, fictional: true },
  },
  point,
];
const result = locationReview(
  [day],
  rows.map((record) => ({ record, exportId: 'fixture' })),
  'UTC',
);
assert.equal(result.series[0]?.daily[0]?.count, 2);
assert.equal(result.counts.duplicates, 1);
assert.equal(result.series[0]?.points[1]?.accuracy, null);
const invalid = locationReview(
  [day],
  [
    { ...point, native: { latitude: 91, longitude: 0 } },
    { ...point, start: 'bad' },
    { ...point, type: 'visits' },
  ].map((record) => ({ record, exportId: 'bad' })),
  'UTC',
);
assert.equal(invalid.counts.invalid, 2);
assert.equal(invalid.counts.unsupported, 1);
const missing = locationReview(
  [day],
  [{ record: { ...point, start: day.end }, exportId: 'outside' }],
  'UTC',
);
assert.equal(missing.series.length, 0);
const separate = locationReview(
  [day],
  [point, { ...point, source: 'other' }].map((record) => ({ record, exportId: 'source' })),
  'UTC',
);
assert.equal(separate.series.length, 2);
// The lower boundary is inclusive; the next midnight is outside this day.
const boundaries = locationReview(
  [day],
  [
    { ...point, start: day.start },
    { ...point, start: day.end },
  ].map((record) => ({ record, exportId: 'boundaries' })),
  'UTC',
);
assert.equal(boundaries.series[0]?.daily[0]?.count, 1);
const gaps = locationReview(
  [day, { date: '2026-10-20', start: day.end, end: '2026-10-21T00:00:00.000Z' }],
  [{ record: point, exportId: 'gaps' }],
  'UTC',
);
assert.equal(gaps.series[0]?.daily[1]?.count, null);
const provenance = locationReview(
  [day],
  [
    { record: point, exportId: 'first' },
    { record: point, exportId: 'second' },
  ],
  'UTC',
);
assert.deepEqual(provenance.series[0]?.points[0]?.exportIds, ['first', 'second']);

const cloud = new CloudStore(':memory:', randomBytes(32)),
  billing = new BillingStore(':memory:'),
  history = new HistoryStore(':memory:', cloud);
const subject = 'location-review-fictional-owner',
  device = randomUUID();
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Fictional health review',
    selection: { health: [], time: [], location: ['native:points'] },
    export: { destination: 'cloud', formats: ['jsonl'] },
  }),
  id: 'location-review-test',
};
cloud.access(subject, device, profile, true);
cloud.syncAgentPermissions(subject, device, [
  {
    ...profile,
    agentAccess: true,
    agentPermissions: { health: false, time: false, location: true, logs: false },
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
const args = { exportIds: [file.id], start: day.date, end: day.date, timezone: 'UTC' };
try {
  assert.ok(
    (await owner.client.listTools()).tools.some((t) => t.name === 'review_recorded_locations'),
  );
  const response = await owner.client.callTool({
    name: 'review_recorded_locations',
    arguments: args,
  });
  assert.ok(!response.isError, JSON.stringify(response));
  const review = /** @type {typeof result} */ (response.structuredContent);
  assert.equal(review.series[0]?.daily[0]?.count, 2);
  assert.ok(
    (await owner.client.readResource({ uri: 'ui://myself-md/location-review-v1.html' })).contents
      .length,
  );
  assert.equal(
    (await other.client.callTool({ name: 'review_recorded_locations', arguments: args })).isError,
    true,
  );
  assert.equal(
    (
      await owner.client.callTool({
        name: 'review_recorded_locations',
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
    name: 'review_recorded_locations',
    arguments: args,
  });
  assert.equal(revokedDuringRead.isError, true);
  assert.equal(revokedDuringRead.structuredContent, undefined);
  cloud.bytes = originalBytes;
  cloud.syncAgentPermissions(subject, device, [{ ...profile, id: 'replacement-profile' }]);
  assert.equal(
    (await owner.client.callTool({ name: 'review_recorded_locations', arguments: args })).isError,
    true,
  );
  console.log(
    'Location review: point validation, bounds, structured MCP result, ownership and sharing checks passed.',
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
