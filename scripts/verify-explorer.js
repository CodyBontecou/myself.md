import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseProfile } from '../core/profiles.js';
import { record } from '../core/data.js';
import { createBucketKey } from '../core/explorer.js';
import { readExplorerRoute, explorerRoute } from '../dashboard/explorer-route.js';
const directory = mkdtempSync(join(tmpdir(), 'explorer-test-'));
process.env.DATA_DIR = directory;
process.env.CLOUD_ENCRYPTION_KEY = 'c'.repeat(64);
const { cloud, history } = await import('../server/cloud.js');
const { explore, recordDetail } = await import('../server/explorer.js');
const energy = 'HKQuantityTypeIdentifierActiveEnergyBurned',
  heart = 'HKQuantityTypeIdentifierHeartRate',
  sleep = 'HKCategoryTypeIdentifierSleepAnalysis';
const device = randomUUID();
const selection = {
  health: [`native:${energy}`, `native:${heart}`, `native:${sleep}`, 'imported:archive'],
  time: ['native:applications'],
  location: ['native:points'],
};
/** @param {string} name */
function profile(name) {
  return { ...parseProfile({ schema: 'myself.md.profile.v1', name, selection }), id: name };
}
/** @param {string} owner @param {string} name @param {string} day @param {import('../core/data.js').DataRecord[]} records */
function upload(owner, name, day, records) {
  const p = profile(name);
  cloud.authorize(owner, device, p);
  const { id } = cloud.begin(owner, device, p.id, {
    profile: p,
    day,
    format: 'jsonl',
    manifest: { profileId: p.id, recordCount: records.length },
  });
  cloud.commit(
    owner,
    device,
    p.id,
    id,
    Buffer.from(records.map((r) => JSON.stringify(r)).join('\n') + '\n'),
  );
  return id;
}
const energyRecords = Array.from({ length: 60 }, (_v, i) =>
  record('health', energy, 'healthkit', {
    uuid: `energy-${i}`,
    quantity: i + 1,
    unit: 'Cal',
    startDate: `2026-10-${i < 30 ? '07' : '08'}T12:00:00.000Z`,
    endDate: `2026-10-${i < 30 ? '07' : '08'}T12:05:00.000Z`,
    sampleType: { identifier: energy, isMaxDurationRestricted: true },
  }),
);
const metadataRecord = record('health', heart, 'healthkit', {
  quantity: 60,
  unit: 'bpm',
  startDate: '2026-10-08T23:30:00.000Z',
  sampleType: { identifier: heart },
});
const sleepRecord = record('health', sleep, 'healthkit', {
  value: 3,
  startDate: '2026-10-07T22:00:00.000Z',
  endDate: '2026-10-08T06:00:00.000Z',
});
const usageRecord = record('time', 'applications', 'native-usage', {
  identifier: 'com.fixture.reader',
  displayName: 'Reader',
  durationMs: 3600000,
  startMs: Date.parse('2026-10-08T11:00:00.000Z'),
  endMs: Date.parse('2026-10-08T12:00:00.000Z'),
});
const locationRecord = record('location', 'points', 'expo-location', {
  timestamp: Date.parse('2026-10-08T12:00:00.000Z'),
  coords: { latitude: 38.72, longitude: -9.14, accuracy: 8 },
});
const archive = record('health', 'archive', 'imported-original', {
  privateArchive: 'fixture',
  samples: energyRecords,
});
try {
  const first = upload('alice', 'Primary', '2026-10-08', [
    ...energyRecords,
    metadataRecord,
    sleepRecord,
    usageRecord,
    locationRecord,
    archive,
  ]);
  const second = upload('alice', 'Overlap', '2026-10-07', energyRecords.slice(0, 30));
  const bob = upload('bob', 'Private', '2026-10-08', [metadataRecord]);
  const all = explore('alice', {});
  assert.equal(all.scanned, 95);
  assert.equal(all.total, 64);
  assert.equal(all.duplicates, 30);
  assert.equal(all.archives, 1);
  assert.equal(all.rows.length, 50);
  assert.ok(all.rows.some((r) => r.provenance.length === 2));
  assert.equal(all.visuals.aggregation, 'count');
  assert.equal(all.visuals.unit, 'records');
  const foldedHour = createBucketKey('America/New_York', 'hour');
  assert.equal(foldedHour('2026-11-01T05:30:00.000Z'), foldedHour('2026-11-01T06:30:00.000Z'));
  assert.equal(
    explore('alice', {
      metric: energy,
      filters: [{ field: 'bucket', operator: 'eq', value: '2026-10-08' }],
    }).total,
    30,
  );
  const quantities = explore('alice', {
    metric: energy,
    filters: [{ field: 'unit', operator: 'eq', value: 'Cal' }],
    sort: 'value',
    direction: 'desc',
  });
  assert.equal(quantities.total, 60);
  assert.equal(quantities.visuals.aggregation, 'sum');
  assert.equal(
    quantities.visuals.trend.reduce((sum, v) => sum + (v.value ?? 0), 0),
    1830,
  );
  assert.equal(quantities.rows[0]?.value, 60);
  assert.equal(quantities.rows[49]?.value, 11);
  assert.equal(explore('alice', { metric: energy, offset: 50 }).rows.length, 10);
  assert.ok(
    quantities.facets.fields.some(
      (f) => f.field === 'native.sampleType.isMaxDurationRestricted' && f.type === 'boolean',
    ),
  );
  assert.equal(
    explore('alice', { metric: energy, filters: [{ field: 'value', operator: 'gt', value: '50' }] })
      .total,
    10,
  );
  assert.equal(
    explore('alice', {
      filters: [
        { field: 'native.sampleType.isMaxDurationRestricted', operator: 'eq', value: 'true' },
      ],
    }).total,
    60,
  );
  assert.equal(
    explore('alice', {
      metric: energy,
      filters: [{ field: 'value', operator: 'gt', value: 'not a number' }],
    }).total,
    0,
  );
  assert.equal(
    explore('alice', {
      metric: energy,
      start: '2026-10-08T00:00:00.000Z',
      end: '2026-10-09T00:00:00.000Z',
    }).total,
    30,
  );
  assert.equal(explore('alice', { exportIds: [second] }).total, 30);
  assert.equal(explore('alice', { profileIds: ['Overlap'] }).total, 30);
  assert.equal(explore('alice', { deviceIds: [randomUUID()] }).total, 0);
  assert.equal(explore('alice', { deduplicate: false }).total, 94);
  assert.equal(explore('alice', { includeArchives: true }).total, 65);
  assert.equal(explore('alice', { source: 'native-usage' }).total, 1);
  assert.equal(
    explore('alice', {
      metric: energy,
      filters: [{ field: 'start', operator: 'gte', value: '2026-10-08T00:00:00.000Z' }],
    }).total,
    30,
  );
  assert.equal(
    explore('alice', { filters: [{ field: 'value', operator: 'missing', value: '' }] }).total,
    1,
  );
  assert.equal(
    explore('alice', { metric: heart, timezone: 'Asia/Tokyo' }).visuals.trend[0]?.date,
    '2026-10-09',
  );
  assert.equal(explore('alice', { metric: heart }).visuals.aggregation, 'mean');
  const sleepResult = explore('alice', { metric: sleep });
  assert.equal(sleepResult.rows[0]?.value, 28800);
  assert.equal(sleepResult.rows[0]?.fields.category, 'Asleep (core)');
  assert.equal(sleepResult.visuals.intervals[0]?.duration, 28800);
  const usage = explore('alice', { domain: 'time' });
  assert.equal(usage.rows[0]?.duration, 3600);
  assert.equal(usage.visuals.ranking[0]?.label, 'Reader');
  assert.equal(usage.visuals.ranking[0]?.value, 3600);
  const location = explore('alice', { domain: 'location' });
  assert.equal(location.visuals.points[0]?.latitude, 38.72);
  assert.equal(location.visuals.points[0]?.accuracy, 8);
  assert.throws(() => explore('alice', { exportIds: [bob] }));
  assert.throws(() => recordDetail('bob', new URLSearchParams({ export: first, index: '0' })));
  assert.deepEqual(
    recordDetail('alice', new URLSearchParams({ export: first, index: '0' })).record,
    energyRecords[0],
  );
  assert.throws(() => explore('alice', { timezone: 'invalid' }));
  assert.throws(() =>
    explore('alice', { start: '2026-10-09T00:00:00.000Z', end: '2026-10-08T00:00:00.000Z' }),
  );
  assert.throws(() => explore('alice', { offset: -1 }));
  const roundTrip = explorerRoute(
    { ...quantities.query, offset: 50 },
    {
      chart: 'distribution',
      columns: ['value', 'native.sampleType.identifier'],
      record: `${first}:0`,
    },
  );
  assert.deepEqual(readExplorerRoute(roundTrip).query, { ...quantities.query, offset: 50 });
  assert.equal(readExplorerRoute(roundTrip).record, `${first}:0`);
  assert.equal(readExplorerRoute('?where=garbage').query.filters.length, 0);
  assert.equal(readExplorerRoute('?offset=-100').query.offset, 0);
  const mixedUnit = upload('alice', 'Other unit', '2026-10-08', [
    record('health', energy, 'healthkit', {
      quantity: 42,
      unit: 'kJ',
      startDate: '2026-10-08T12:00:00.000Z',
    }),
  ]);
  assert.equal(explore('alice', { metric: energy }).visuals.aggregation, 'count');
  assert.equal(explore('alice', { metric: energy }).visuals.distribution.length, 0);
  cloud.delete('alice', mixedUnit);
  // Duplicate samples within one export are preserved; only overlaps across exports collapse.
  const repeated = upload(
    'alice',
    'Repeated',
    '2026-10-08',
    [energyRecords[0], energyRecords[0]].filter((r) => r !== undefined),
  );
  assert.equal(explore('alice', { exportIds: [repeated] }).total, 2);
  assert.ok(!Buffer.from(cloud.row('alice', first).content ?? []).includes('energy-0'));
  console.log(
    'Explorer: full-result filtering/aggregation, units, missing values, archive exclusion, exact overlap provenance, pagination, timezone grouping, all chart domains, raw fidelity, URL state and tenant isolation passed.',
  );
} finally {
  history.db.close();
  cloud.db.close();
  rmSync(directory, { recursive: true, force: true });
}
