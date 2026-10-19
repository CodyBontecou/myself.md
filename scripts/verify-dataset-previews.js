import assert from 'node:assert/strict';
import { datasetExportPreview } from '../dashboard/dataset-export-preview.js';
import { datasets } from '../dashboard/dataset-catalog.js';
import { parseProfile } from '../core/profiles.js';

const exportProfile = parseProfile({
  schema: 'myself.md.profile.v1',
  name: 'Example export',
  selection: {
    health: ['native:HKQuantityTypeIdentifierHeartRate'],
    time: ['native:websites'],
    location: ['native:points'],
  },
});
assert.equal(
  parseProfile({ ...exportProfile, schema: 'qr-connect.profile.v1' }).schema,
  'myself.md.profile.v1',
);
const exported = datasetExportPreview(exportProfile);
const exportRows = /** @type {import('../core/data.js').DataRecord[]} */ (exported.value.records);
assert.equal(exported.value.schema, 'myself.md.export.v1');
assert.equal(exported.value.recordCount, 3);
assert.deepEqual(
  exportRows.map((row) => row.domain),
  ['health', 'time', 'location'],
);
assert.ok(exportRows[0]);
assert.equal(/** @type {{quantity:number}} */ (exportRows[0].native).quantity, 72);
exportProfile.selection.health = [];
const withoutHeartRate = datasetExportPreview(exportProfile);
assert.equal(withoutHeartRate.value.recordCount, 2);
assert.ok(
  /** @type {import('../core/data.js').DataRecord[]} */ (withoutHeartRate.value.records).every(
    (row) => row.domain !== 'health',
  ),
);
exportProfile.selection = { health: [], time: [], location: [] };
assert.equal(datasetExportPreview(exportProfile).value.recordCount, 0);
/** @type {Record<import('../core/data.js').Domain,string[]>} */
const allSelections = { health: [], time: [], location: [] };
let coveredTypes = 0;
for (const dataset of Object.values(datasets)) {
  const keys = [...new Set(dataset.groups.flatMap((group) => group.keys))];
  for (const key of keys) {
    const selection = { health: [], time: [], location: [], [dataset.domain]: [key] };
    const result = datasetExportPreview(
      parseProfile({ schema: 'myself.md.profile.v1', name: 'Single type', selection }),
    );
    if (key.startsWith('native:whoop.')) {
      assert.equal(result.value.recordCount, 0);
      assert.equal(result.emptyTypes.length, 1);
      assert.equal(result.emptyTypes[0]?.type, key.slice('native:'.length));
      continue;
    }
    assert.deepEqual(result.emptyTypes, [], `${dataset.domain}:${key} needs a mock reading`);
    const rows = /** @type {import('../core/data.js').DataRecord[]} */ (result.value.records);
    assert.ok(rows.length > 0, `${dataset.domain}:${key} must add data`);
    assert.equal(result.value.recordCount, rows.length);
    for (const row of rows) {
      assert.equal(row.domain, dataset.domain);
      assert.equal(row.type, key.slice(key.indexOf(':') + 1));
      assert.equal(key.startsWith('native:'), true);
      assert.ok(row.native && typeof row.native === 'object');
      const payload = /** @type {Record<string,unknown>} */ (row.native);
      if (row.source === 'healthkit' && row.type.startsWith('HKQuantityType')) {
        assert.equal(payload.quantityType, row.type);
        assert.ok(typeof payload.quantity === 'number' && Number.isFinite(payload.quantity));
        assert.ok(typeof payload.unit === 'string' && payload.unit.length > 0);
      }
      if (row.source === 'healthkit' && row.type.startsWith('HKCategoryType')) {
        assert.equal(payload.categoryType, row.type);
        assert.ok(typeof payload.value === 'number' && Number.isInteger(payload.value));
      }
      if (row.source === 'health-connect') assert.equal(payload.recordType, row.type);

      if (payload.captureKind === 'current-snapshot') {
        assert.equal(row.start, null);
        assert.equal(row.end, null);
        assert.deepEqual(row.timeSeries, {});
        assert.ok(payload.capturedAt);
      } else
        assert.ok(
          row.start &&
            row.start >= '2026-10-08T00:00:00.000Z' &&
            row.start < '2026-10-09T00:00:00.000Z',
        );
    }
    coveredTypes++;
  }
  allSelections[dataset.domain] = keys.filter((key) => !key.startsWith('native:whoop.'));
}
const allData = datasetExportPreview(
  parseProfile({ schema: 'myself.md.profile.v1', name: 'All types', selection: allSelections }),
);
assert.deepEqual(allData.emptyTypes, []);
assert.equal(allData.value.recordCount, coveredTypes);
console.log(
  `Dataset preview: ${coveredTypes} native options produce source payloads; unavailable WHOOP previews are explicit; single-type isolation, dates, and combined export counts passed.`,
);

console.log('Dataset previews: catalog coverage, serialization, and selection isolation passed.');
