import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as profiles from '../core/profiles.js';
import * as data from '../core/data.js';

const db = new DatabaseSync(':memory:');
const sqlite = {
  openDatabaseSync: () => ({
    execSync: (/** @type {string} */ sql) => db.exec(sql),
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    runSync: (sql, ...args) => db.prepare(sql).run(...args),
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    getFirstSync: (sql, ...args) => db.prepare(sql).get(...args) ?? null,
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    getAllSync: (sql, ...args) => db.prepare(sql).all(...args),
  }),
};
/** @param {string} path @param {Record<string,Record<string,unknown>>} dependencies */
async function load(path, dependencies) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'));
  await module.link((specifier) => {
    const values = dependencies[specifier];
    assert.ok(values, `Missing dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
const library =
  /** @type {{saveRecord:(owner:string,row:import('../core/data.js').DataRecord)=>void}} */ (
    await load('../client/library.js', { 'expo-sqlite': sqlite })
  );
const storedProfiles =
  /** @type {{saveProfiles:(owner:string,state:import('../core/profiles.js').ProfileState)=>void,loadProfiles:(owner:string)=>import('../core/profiles.js').ProfileState|null}} */ (
    await load('../client/profiles.js', { 'expo-sqlite': sqlite, '../core/profiles.js': profiles })
  );
const phone =
  /** @type {{catalog:(owner:string,grants:Record<import('../core/data.js').Domain,boolean>)=>Promise<{domains:{types:string[]}[]}>,readPage:(owner:string,query:import('../core/data.js').DataQuery,profile:import('../core/profiles.js').ExportProfile)=>Promise<import('../core/data.js').DataPage>}} */ (
    await load('../client/data.js', {
      'expo-location': { getForegroundPermissionsAsync: async () => ({ granted: true }) },
      'react-native': { Platform: { OS: 'ios' } },
      '../core/profiles.js': profiles,
      '../core/data.js': data,
      './library.js': library,
      './health.js': {
        healthTypes: async () => ['HKQuantityTypeIdentifierStepCount'],
        healthPage: async () => {
          throw new Error('Unexpected health read');
        },
      },
      './usage.js': {
        usageStatus: async () => 'authorized',
        usagePage: async () => {
          throw new Error('Unexpected usage read');
        },
      },
    })
  );
const selection = {
  health: ['native:HKQuantityTypeIdentifierStepCount', 'imported:sleep'],
  time: ['imported:archive'],
  location: ['native:points', 'imported:points'],
};
const legacy = {
  schema: /** @type {const} */ ('myself.md.profile.v1'),
  name: 'Existing',
  selection,
  id: 'existing',
};
assert.throws(() => profiles.parseProfile(legacy), /native:/);
assert.throws(() => profiles.profileLink(legacy), /native:/);
storedProfiles.saveProfiles('phone', {
  activeId: 'existing',
  profiles: [profiles.parseProfile(legacy, true)].map((p) => Object.assign(p, { id: 'existing' })),
});
const migrated = storedProfiles.loadProfiles('phone');
assert.ok(migrated);
assert.equal(migrated.activeId, 'existing');
assert.deepEqual(migrated.profiles[0]?.selection, {
  health: ['native:HKQuantityTypeIdentifierStepCount'],
  time: [],
  location: ['native:points'],
});
const stamp = '2026-10-08T08:00:00.000Z';
for (const source of ['expo-location', 'imported'])
  library.saveRecord(
    'alice',
    data.record('location', 'points', source, {
      timestamp: stamp,
      latitude: 38.7,
      longitude: -9.1,
    }),
  );
library.saveRecord('bob', data.record('location', 'points', 'expo-location', { timestamp: stamp }));
library.saveRecord(
  'alice',
  data.record('location', 'archive', 'imported-original', { text: 'legacy file' }),
);
library.saveRecord(
  'alice',
  data.record('location', 'points', 'expo-location', { timestamp: '2026-10-07T08:00:00.000Z' }),
);
const catalog = await phone.catalog('alice', { health: true, time: true, location: true });
assert.deepEqual(
  catalog.domains.map((d) => d.types),
  [
    ['native:HKQuantityTypeIdentifierStepCount'],
    ['native:applications', 'native:websites'],
    ['native:points'],
  ],
);
const query = {
  domain: /** @type {const} */ ('location'),
  type: 'points',
  source: /** @type {const} */ ('native'),
  start: '2026-10-08T00:00:00.000Z',
  end: '2026-10-09T00:00:00.000Z',
  cursor: '',
  limit: 10,
  format: /** @type {const} */ ('json'),
};
const profile = migrated.profiles[0];
assert.ok(profile);
const page = await phone.readPage('alice', query, profile);
assert.equal(page.records.length, 1);
assert.equal(page.records[0]?.source, 'expo-location');
const importedQuery = JSON.parse(JSON.stringify({ ...query, source: 'imported' }));
await assert.rejects(
  phone.readPage('alice', importedQuery, {
    ...profiles.parseProfile(legacy, true),
    id: 'existing',
  }),
  /disabled/,
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM records WHERE source LIKE 'imported%'").get()?.count,
  2,
  'Legacy data must remain stored',
);
db.close();
console.log(
  'Native sources: legacy profile migration, import rejection, catalog, local isolation and date filtering passed.',
);
