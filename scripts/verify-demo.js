import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { demoApi, resetDemo } from '../dashboard/demo.js';
import { datasetExportPreview } from '../dashboard/dataset-export-preview.js';
import { datasets } from '../dashboard/dataset-catalog.js';
import { parseProfile } from '../core/profiles.js';
import { readExplorerRoute } from '../dashboard/explorer-route.js';
import { parseHistoryEvent } from '../core/history.js';

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
exportProfile.selection.time = ['imported:archive'];
const archiveRow = /** @type {import('../core/data.js').DataRecord[]} */ (
  datasetExportPreview(exportProfile).value.records
).find((row) => row.type === 'archive');
assert.ok(archiveRow);
assert.equal(archiveRow.source, 'imported-original');
assert.ok(JSON.parse(/** @type {{text:string}} */ (archiveRow.native).text).websites.length);
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
    assert.deepEqual(result.emptyTypes, [], `${dataset.domain}:${key} needs a mock reading`);
    const rows = /** @type {import('../core/data.js').DataRecord[]} */ (result.value.records);
    assert.ok(rows.length > 0, `${dataset.domain}:${key} must add data`);
    assert.equal(result.value.recordCount, rows.length);
    for (const row of rows) {
      assert.equal(row.domain, dataset.domain);
      assert.equal(row.type, key.slice(key.indexOf(':') + 1));
      assert.equal(row.source.startsWith('imported'), key.startsWith('imported:'));
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

      if (row.type !== 'archive')
        assert.ok(
          row.start &&
            row.start >= '2026-10-08T00:00:00.000Z' &&
            row.start < '2026-10-09T00:00:00.000Z',
        );
    }
    coveredTypes++;
  }
  allSelections[dataset.domain] = keys;
}
const allData = datasetExportPreview(
  parseProfile({ schema: 'myself.md.profile.v1', name: 'All types', selection: allSelections }),
);
assert.deepEqual(allData.emptyTypes, []);
assert.equal(allData.value.recordCount, coveredTypes);
console.log(
  `Dataset preview: all ${coveredTypes} selectable options produce source payloads; single-type isolation, dates, and combined export counts passed.`,
);

/** @returns {import('../dashboard/workspace.js').Workspace} */
const workspace = () =>
  /** @type {import('../dashboard/workspace.js').Workspace} */ (
    demoApi('/api/dashboard', 'GET', undefined)
  );
const original = workspace();
assert.equal(original.exports.length, 90);
assert.equal(original.profiles.length, 3);
/** @param {string} search */
const explore = (search) => {
  const data = demoApi('/api/dashboard/explore', 'POST', readExplorerRoute(search).query);
  return /** @type {{total:number,rows:import('../core/explorer.js').ExplorerRow[],visuals:ReturnType<typeof import('../core/explorer.js').visualizeRecords>}} */ (
    data
  );
};
assert.equal(explore('').total, 720);
for (const domain of ['health', 'time', 'location']) {
  const result = explore(`?domain=${domain}`);
  assert.equal(result.total, 240);
  assert.ok(result.rows.every((row) => row.domain === domain));
}
const steps = explore('?metric=HKQuantityTypeIdentifierStepCount');
assert.equal(steps.total, 120);
assert.ok(steps.visuals.compatible);
const page = explore('?offset=50&limit=50');
assert.equal(page.rows.length, 50);
assert.notEqual(page.rows[0]?.id, explore('').rows[0]?.id);
assert.equal(
  explore(
    '?domain=time&where=' +
      encodeURIComponent(
        JSON.stringify([{ field: 'application', operator: 'eq', value: 'Books' }]),
      ),
  ).total,
  60,
);
const first = original.exports[0];
assert.ok(first);
assert.equal(explore(`?export=${first.id}`).total, 8);
const detail = /** @type {{record:import('../core/data.js').DataRecord}} */ (
  demoApi(`/api/dashboard/record?export=${first.id}&index=0`, 'GET', undefined)
);
assert.equal(detail.record.domain, 'health');
const history = /** @type {{events:unknown[],hasMore:boolean}} */ (
  demoApi('/api/dashboard/history', 'GET', undefined)
);
assert.ok(history.hasMore);
for (const item of history.events) parseHistoryEvent(item);
const access = history.events.map(parseHistoryEvent).find((event) => event.kind === 'access');
assert.ok(access);
const entry = /** @type {{event:unknown,related:unknown[]}} */ (
  demoApi(`/api/dashboard/history/entry?id=${access.id}`, 'GET', undefined)
);
assert.equal(entry.related.length, 1);
const profile = original.profiles[0];
assert.ok(profile);
demoApi('/api/dashboard/permissions', 'PUT', {
  deviceId: profile.deviceId,
  profileId: profile.profileId,
  shared: false,
});
assert.ok(
  workspace()
    .exports.filter((item) => item.profileId === profile.profileId)
    .every((item) => !item.shared),
);
assert.equal(original.profiles[0]?.shared, true, 'Responses must not alias mutable demo state');
const agent = original.agents[0];
assert.ok(agent);
demoApi('/api/dashboard/agents', 'PUT', { client: agent.client, blocked: true });
assert.equal(workspace().agents[0]?.blocked, true);
demoApi(`/api/dashboard/exports/${first.id}`, 'DELETE', undefined);
assert.equal(workspace().exports.length, 89);
assert.equal(explore('').total, 712);
assert.throws(
  () => demoApi(`/api/dashboard/record?export=${first.id}&index=0`, 'GET', undefined),
  /not found/,
);
assert.equal(
  parseHistoryEvent(
    /** @type {{event:unknown}} */ (
      demoApi(`/api/dashboard/history/entry?id=demo-export-${first.id}`, 'GET', undefined)
    ).event,
  ).artifacts[0]?.cloudId,
  first.id,
);
resetDemo();
assert.equal(workspace().exports.length, 90);
assert.equal(workspace().agents[0]?.blocked, false);
assert.equal(workspace().profiles[0]?.shared, true);

// Exercise the actual session boundary: the demo route must never fetch config or authenticated APIs.
const result = await build({
  entryPoints: ['dashboard/session.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
});
assert.ok(result.outputFiles[0]);
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, {
  module,
  location: { pathname: '/demo' },
  Date,
  Map,
  Set,
  URL,
  URLSearchParams,
  TextEncoder,
  structuredClone,
  fetch: () => {
    throw new Error('The demo must not make network requests.');
  },
});
const session =
  /** @type {{initializeSession:()=>Promise<boolean>,api:(path:string,method?:string,body?:unknown)=>Promise<unknown>}} */ (
    module.exports
  );
assert.equal(await session.initializeSession(), true);
assert.equal(
  /** @type {import('../dashboard/workspace.js').Workspace} */ (await session.api('/api/dashboard'))
    .exports.length,
  90,
);
await session.api('/api/dashboard/permissions', 'PUT', {
  deviceId: profile.deviceId,
  profileId: profile.profileId,
  shared: false,
});
assert.equal(workspace().profiles[0]?.shared, true, 'Independent demo sessions must be isolated');
await assert.rejects(session.api('/api/private'), /not available/);
console.log(
  'Demo: query filters, charts, pagination, records, history, sharing, blocking, deletion, reset, and network isolation passed.',
);
