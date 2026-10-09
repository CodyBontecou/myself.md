import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as profiles from '../core/profiles.js';
import * as data from '../core/data.js';
import * as schedules from '../core/schedules.js';
import * as diagnostics from '../core/diagnostics.js';
import { localCalendar } from '../client/calendar.js';

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
    await load('../client/profiles.js', {
      'expo-sqlite': sqlite,
      '../core/profiles.js': profiles,
      './qa-runtime.js': {
        qaEnabled: false,
        qaSession: { deviceId: 'argent-qa-device' },
        qaSnapshot: () => {
          throw new Error('QA must stay disabled.');
        },
        updateQa: () => {
          throw new Error('QA must stay disabled.');
        },
      },
    })
  );
let foregroundGranted = true;
let usageAuthorization = 'authorized';
const phone =
  /** @type {{catalog:(owner:string,grants:Record<import('../core/data.js').Domain,boolean>)=>Promise<{domains:{types:string[],selectableTypes:string[],permission:string}[]}>,readPage:(owner:string,query:import('../core/data.js').DataQuery,profile:import('../core/profiles.js').ExportProfile,forChat?:boolean)=>Promise<import('../core/data.js').DataPage>}} */ (
    await load('../client/data.js', {
      'expo-location': {
        getForegroundPermissionsAsync: async () => ({ granted: foregroundGranted }),
      },
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
        usageStatus: async () => usageAuthorization,
        usagePage: async () => {
          throw new Error('Unexpected usage read');
        },
      },
    })
  );
let usageRequests = 0;
let cancelUsage = false;
let locationRequests = 0;
const sourceAccess =
  /** @type {{requestSourceAccess:(domain:import('../core/data.js').Domain)=>Promise<{message:string}>}} */ (
    await load('../client/source-access.js', {
      'expo-location': {
        requestForegroundPermissionsAsync: async () => {
          locationRequests++;
          return { granted: foregroundGranted, canAskAgain: false };
        },
      },
      './health.js': { authorizeHealth: async () => {} },
      './usage.js': {
        usageStatus: async () => usageAuthorization,
        authorizeUsage: async () => {
          usageRequests++;
          if (cancelUsage) throw new Error('Family Controls authorization canceled.');
          return usageAuthorization;
        },
      },
    })
  );
usageAuthorization = 'not-requested';
assert.match((await sourceAccess.requestSourceAccess('time')).message, /not granted/);
assert.equal(usageRequests, 1);
cancelUsage = true;
assert.match((await sourceAccess.requestSourceAccess('time')).message, /not granted/);
cancelUsage = false;
usageAuthorization = 'authorized';
assert.match((await sourceAccess.requestSourceAccess('time')).message, /allowed/);
assert.equal(usageRequests, 2, 'Authorized usage does not request again');
usageAuthorization = 'unavailable';
assert.match((await sourceAccess.requestSourceAccess('time')).message, /unavailable/);
assert.equal(usageRequests, 2, 'Unsupported usage does not request authorization');
usageAuthorization = 'limited';
assert.match((await sourceAccess.requestSourceAccess('time')).message, /unavailable/);
usageAuthorization = 'settings-opened';
assert.match((await sourceAccess.requestSourceAccess('time')).message, /Settings/);
foregroundGranted = false;
assert.match((await sourceAccess.requestSourceAccess('location')).message, /Settings/);
foregroundGranted = true;
assert.match((await sourceAccess.requestSourceAccess('location')).message, /Start recording/);
assert.equal(locationRequests, 2, 'Selection requests foreground access without recording');
usageAuthorization = 'authorized';
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
db.prepare('INSERT OR REPLACE INTO export_profiles VALUES (?,?)').run(
  'phone',
  JSON.stringify({
    activeId: 'existing',
    profiles: ['existing', 'private'].map((id) =>
      Object.assign(profiles.parseProfile(legacy, true), { id }),
    ),
  }),
);
const migrated = storedProfiles.loadProfiles('phone');
assert.ok(migrated);
assert.equal(migrated.profiles[0]?.agentAccess, true);
assert.equal(migrated.profiles[1]?.agentAccess, false);
assert.ok(!('activeId' in migrated));
storedProfiles.saveProfiles('phone', migrated);
assert.deepEqual(storedProfiles.loadProfiles('phone'), migrated);
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
foregroundGranted = false;
usageAuthorization = 'not-requested';
const pendingCatalog = await phone.catalog('alice', {
  health: false,
  time: false,
  location: false,
});
assert.deepEqual(pendingCatalog.domains[1]?.types, []);
assert.deepEqual(pendingCatalog.domains[1]?.selectableTypes, [
  'native:applications',
  'native:websites',
]);
assert.deepEqual(pendingCatalog.domains[2]?.selectableTypes, ['native:points']);
assert.equal(pendingCatalog.domains[1]?.permission, 'not-requested');
assert.equal(pendingCatalog.domains[2]?.permission, 'required');
foregroundGranted = true;
usageAuthorization = 'authorized';
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
const privateProfile = migrated.profiles[1];
assert.ok(privateProfile);
await assert.rejects(phone.readPage('alice', query, privateProfile), /approved/);
assert.equal(
  (await phone.readPage('alice', query, privateProfile, false)).records.length,
  1,
  'Manual exports do not require agent approval',
);
assert.ok(!('agentAccess' in profiles.parseProfile({ ...privateProfile, agentAccess: true })));
assert.ok(
  !profiles
    .profileLink(Object.assign({}, privateProfile, { agentAccess: true }))
    .includes('agentAccess'),
  'Portable profiles never carry approval',
);
const importedQuery = JSON.parse(JSON.stringify({ ...query, source: 'imported' }));
await assert.rejects(
  phone.readPage('alice', importedQuery, {
    ...profiles.parseProfile(legacy, true),
    id: 'existing',
  }),
  /approved/,
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM records WHERE source LIKE 'imported%'").get()?.count,
  2,
  'Legacy data must remain stored',
);
// Approval changes must not reset schedules, pending exports or existing files.
const exportTask =
  /** @type {{scheduleState:(device:string,profile:import('../core/profiles.js').ExportProfile)=>{progress:import('../core/schedules.js').ScheduleProgress,files:string[],job:unknown,fingerprint:string}}} */ (
    await load('../client/export-task.js', {
      './billing.js': { reserveExport: async () => {}, settleExport: async () => {} },
      '../core/diagnostics.js': diagnostics,
      'expo-background-task': {},
      'expo-task-manager': { defineTask: () => {} },
      'expo-sqlite': sqlite,
      '../core/schedules.js': schedules,
      './export-context.js': { loadExportContext: () => null },
      './profiles.js': storedProfiles,
      './calendar.js': { localCalendar },
      './history.js': { beginExport: () => {}, recordArtifact: () => {}, finishExport: () => {} },
      './profile-export.js': { exportProfileDay: async () => {} },
    })
  );
const schedule = exportTask.scheduleState('phone', privateProfile);
const enabledAt = '2026-10-01T00:00:00.000Z';
const pendingSchedule = {
  ...schedule,
  progress: { ...schedule.progress, enabled: true, enabledAt },
  files: ['existing.json'],
  job: { historyId: 'pending' },
};
db.prepare('INSERT OR REPLACE INTO profile_schedules VALUES (?,?,?)').run(
  'phone',
  privateProfile.id,
  JSON.stringify(pendingSchedule),
);
assert.deepEqual(
  exportTask.scheduleState('phone', { ...privateProfile, agentAccess: true }),
  pendingSchedule,
);
// Exercise the domain export boundary using the viewed private profile and native reader.
const exportedFiles = new Map();
class ShareFile {
  /** @param {string} folder @param {string} name */
  constructor(folder, name) {
    this.name = name;
    this.uri = `${folder}/${name}`;
  }
  create() {
    exportedFiles.set(this.uri, '');
  }
  /** @param {string} value @param {{append?:boolean}} [options] */
  write(value, options) {
    exportedFiles.set(this.uri, (options?.append ? exportedFiles.get(this.uri) : '') + value);
  }
  delete() {
    exportedFiles.delete(this.uri);
  }
}
/** @type {import('../core/history.js').HistoryEvent[]} */
const shareEvents = [];
let sharedFile = '';
let billed = false;
const share =
  /** @type {{shareDomain:(context:{owner:string,deviceId:string,server:string},grants:Record<import('../core/data.js').Domain,boolean>,domain:import('../core/data.js').Domain,profile:import('../core/profiles.js').ExportProfile,days:number,progress:(message:string)=>void)=>Promise<number>}} */ (
    await load('../client/export.js', {
      './billing.js': {
        reserveExport: async () => {},
        settleExport: async (
          /** @type {unknown} */ _context,
          /** @type {string} */ _id,
          /** @type {boolean} */ produced,
        ) => {
          billed = produced;
        },
      },
      'expo-file-system': { File: ShareFile, Paths: { cache: 'cache' } },
      'expo-sharing': {
        isAvailableAsync: async () => true,
        shareAsync: async (/** @type {string} */ uri) => {
          sharedFile = exportedFiles.get(uri) ?? '';
        },
      },
      './history.js': {
        saveShareEvent: (
          /** @type {unknown} */ _context,
          /** @type {import('../core/history.js').HistoryEvent} */ event,
        ) => {
          shareEvents.push(event);
        },
      },
      './data.js': phone,
    })
  );
library.saveRecord(
  'manual',
  data.record('location', 'points', 'expo-location', {
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  }),
);
const context = { owner: 'manual', deviceId: 'phone', server: '' };
assert.equal(
  await share.shareDomain(
    context,
    { health: true, time: true, location: true },
    'location',
    privateProfile,
    7,
    () => {},
  ),
  1,
);
assert.equal(JSON.parse(sharedFile).records.length, 1);
assert.equal(
  shareEvents.at(-1)?.profile.id,
  privateProfile.id,
  'Shared data and audit belong to the viewed profile',
);
assert.equal(shareEvents.at(-1)?.status, 'complete');
assert.equal(billed, true);
assert.equal(exportedFiles.size, 0, 'Temporary shared files are cleaned up');
db.close();
console.log(
  'Native sources: legacy profile migration, import rejection, pre-permission choices, access requests, catalog, local isolation, date filtering, profile approval, independent schedules and manual sharing passed.',
);
