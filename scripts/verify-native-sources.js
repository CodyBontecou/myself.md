import * as dataAggregation from '../core/data-aggregation.js';
import * as dataRange from '../core/data-range.js';
import * as hosting from '../core/hosting.js';
import { disconnectedWhoop } from './whoop-fixture.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule, createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import * as profiles from '../core/profiles.js';
import * as data from '../core/data.js';
import * as healthTypeCatalog from '../client/health-types.js';
import * as exportFiles from '../core/export-files.js';
import * as timeSeries from '../core/time-series.js';
import * as errors from '../packages/support-chat/errors.js';
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
    const values =
      specifier === '../packages/support-chat/errors.js' ? errors : dependencies[specifier];
    assert.ok(values, `Missing dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
const library =
  /** @type {{loadGrants:(owner:string)=>Record<import('../core/data.js').Domain,boolean>,saveRecord:(owner:string,row:import('../core/data.js').DataRecord)=>void,localPage:(owner:string,query:import('../core/data.js').DataQuery,token:string)=>import('../core/data.js').DataPage,earliestLocationDate:(owner:string,types:string[],end:string)=>string|null}} */ (
    await load('../client/library.js', {
      '../core/time-series.js': timeSeries,
      './phone-database.js': { phoneDatabase: sqlite.openDatabaseSync },
    })
  );
const storedProfiles =
  /** @type {{saveProfiles:(owner:string,state:import('../core/profiles.js').ProfileState)=>void,loadProfiles:(owner:string)=>import('../core/profiles.js').ProfileState|null}} */ (
    await load('../client/profiles.js', {
      '../core/hosting.js': hosting,
      './library.js': library,
      './phone-database.js': { phoneDatabase: sqlite.openDatabaseSync },
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
// Paired diagnostics normalize legacy flags; anonymous local partitions never publish logs.
const logConsent = new Map();
const profileLogs =
  /** @type {{loadAgentProfiles:(session:{owner:string,deviceId:string})=>import('../core/profiles.js').ProfileState|null,saveAgentProfiles:(session:{owner:string,deviceId:string},state:import('../core/profiles.js').ProfileState)=>void}} */ (
    await load('../client/profile-logs.js', {
      './profiles.js': storedProfiles,
      './phone-database.js': { phoneDatabase: sqlite.openDatabaseSync },
      './qa-runtime.js': { qaEnabled: false },
      '../core/profiles.js': profiles,
      './debug-log.js': {
        debugSharing: (/** @type {{owner:string,deviceId:string}} */ context) => ({
          shared: logConsent.get(`${context.owner}:${context.deviceId}`) === true,
        }),
        setDebugSharing: (
          /** @type {{owner:string,deviceId:string}} */ context,
          /** @type {boolean} */ shared,
        ) => logConsent.set(`${context.owner}:${context.deviceId}`, shared),
      },
    })
  );
const logSession = {
  owner: 'logs-owner',
  deviceId: 'logs-device',
  server: '',
  issuer: '',
  resource: '',
  accessToken: '',
  refreshToken: '',
  expires: 0,
  account: '',
};
const logState = {
  profiles: ['one', 'two'].map((id) =>
    Object.assign(
      profiles.parseProfile({
        schema: 'myself.md.profile.v1',
        name: id,
        selection: { health: [], time: [], location: [] },
      }),
      {
        id,
        agentAccess: true,
        agentPermissions: { health: true, time: true, location: true, logs: true },
      },
    ),
  ),
};
storedProfiles.saveProfiles(logSession.deviceId, logState);
const pairedLogs = profileLogs.loadAgentProfiles(logSession);
assert.ok(pairedLogs);
assert.ok(pairedLogs.profiles.every((p) => p.agentPermissions?.logs === true));
assert.equal(logConsent.get('logs-owner:logs-device'), true);
const legacyDeniedLogs = {
  profiles: pairedLogs.profiles.map((profile) => ({
    ...profile,
    agentAccess: false,
    agentPermissions: { health: false, time: false, location: false, logs: false },
  })),
};
profileLogs.saveAgentProfiles(logSession, legacyDeniedLogs);
const normalizedLogs = profileLogs.loadAgentProfiles(logSession);
assert.ok(normalizedLogs);
assert.ok(normalizedLogs.profiles.every((p) => p.agentPermissions?.logs === true));
assert.equal(
  logConsent.get('logs-owner:logs-device'),
  true,
  'Legacy flags do not disable paired diagnostics',
);
assert.deepEqual(
  normalizedLogs.profiles.map((p) => p.selection),
  pairedLogs.profiles.map((p) => p.selection),
);
const localLogSession = { owner: 'local-device', deviceId: 'local-device' };
profileLogs.saveAgentProfiles(localLogSession, legacyDeniedLogs);
assert.notEqual(
  logConsent.get('local-device:local-device'),
  true,
  'Unpaired local data does not publish diagnostics',
);
const originalSecond = logState.profiles[1];
assert.ok(originalSecond);
assert.equal(
  profiles.saveProfileDraft(logState, originalSecond, 'new').profiles.at(-1)?.agentPermissions
    ?.logs,
  true,
  'New profiles expose paired diagnostics through the same normalization',
);
// System folder grants stay account/device-local and writes use the selected provider.
const folderNodes = new Map();
let pickerCancelled = false;
let folderDenied = false;
class PickedDirectory {
  /** @param {string} uri */
  constructor(uri) {
    this.uri = uri;
    this.parent = '';
    this.name = uri.split('/').at(-1) ?? '';
  }
  get exists() {
    return !folderDenied;
  }
  list() {
    return [...folderNodes.values()].filter((item) => item.parent === this.uri);
  }
  /** @param {string} name */
  createDirectory(name) {
    const dir = new PickedDirectory(`${this.uri}/${name}`);
    folderNodes.set(dir.uri, dir);
    dir.parent = this.uri;
    return dir;
  }
  /** @param {string} name */
  createFile(name) {
    const file = new PickedFile(`${this.uri}/${name}`);
    file.parent = this.uri;
    folderNodes.set(file.uri, file);
    return file;
  }
  static async pickDirectoryAsync() {
    if (pickerCancelled) throw new Error('Picker cancelled');
    return new PickedDirectory('content://picked/exports');
  }
}
class PickedFile {
  /** @param {string} uri */
  constructor(uri) {
    this.uri = uri;
    this.parent = '';
    this.name = uri.split('/').at(-1) ?? '';
    this.size = 12;
  }
  /** @param {string} mode */
  open(mode) {
    const file = this;
    let read = false;
    return {
      readBytes() {
        if (read) return new Uint8Array();
        read = true;
        return new Uint8Array(file.size);
      },
      /** @param {Uint8Array} bytes */
      writeBytes(bytes) {
        assert.equal(mode, 'wt');
        file.size = bytes.length;
      },
      close() {},
    };
  }
  /** @param {PickedFile} target */
  async copy(target) {
    target.size = this.size;
  }
}
const folderPlatform = { OS: 'android' };
let bookmarkRestores = 0;
const bookmarkBridge = {
  bookmark: async () => 'fixture-bookmark',
  restore: async () => {
    bookmarkRestores++;
    return { uri: 'file://restored/exports', bookmark: 'fixture-bookmark-renewed' };
  },
};
const folderContext = { owner: 'folder-owner', deviceId: 'folder-device' };
const folderRuntime =
  /** @type {{chooseExportFolder:(context:typeof folderContext,previous?:string)=>Promise<string>,exportFolder:(context:typeof folderContext,id?:string)=>{name:string}|null,exportFolderStatus:(context:typeof folderContext,profile:import('../core/profiles.js').ExportProfile)=>{status:string},saveInExportFolder:(context:typeof folderContext,profile:import('../core/profiles.js').ExportProfile,file:PickedFile,format:string)=>Promise<PickedFile>}} */ (
    await load('../client/export-folder.js', {
      'expo-file-system': {
        Directory: PickedDirectory,
        File: PickedFile,
        FileMode: { ReadOnly: 'r', Truncate: 'wt' },
        Paths: {},
      },
      '../core/export-files.js': exportFiles,
      'react-native': { Platform: folderPlatform },
      expo: { requireOptionalNativeModule: () => bookmarkBridge },
      './phone-database.js': { phoneDatabase: sqlite.openDatabaseSync },
      './qa-runtime.js': { qaEnabled: false },
    })
  );
const selectedFolder = await folderRuntime.chooseExportFolder(folderContext);
assert.ok(folderRuntime.exportFolder(folderContext, selectedFolder));
assert.equal(
  folderRuntime.exportFolder({ ...folderContext, owner: 'foreign' }, selectedFolder),
  null,
);
assert.equal(
  folderRuntime.exportFolder({ ...folderContext, deviceId: 'foreign' }, selectedFolder),
  null,
);
pickerCancelled = true;
await assert.rejects(folderRuntime.chooseExportFolder(folderContext, selectedFolder), /cancelled/);
assert.ok(
  folderRuntime.exportFolder(folderContext, selectedFolder),
  'Picker cancellation preserves existing selection',
);
const folderProfile = {
  ...logState.profiles[0],
  id: 'folder-profile',
  ...profiles.parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Folder test',
    selection: { health: [], time: [], location: [] },
    export: { localFolderId: selectedFolder, formatFolders: true },
  }),
};
const stagedFolderFile = new PickedFile('cache/2026-10-16.json');
const savedFolderFile = await folderRuntime.saveInExportFolder(
  folderContext,
  folderProfile,
  stagedFolderFile,
  'json',
);
assert.equal(savedFolderFile.uri, `content://picked/exports/json/2026-10-16.json`);
assert.equal(
  await folderRuntime.saveInExportFolder(folderContext, folderProfile, stagedFolderFile, 'json'),
  savedFolderFile,
  'Daily replacement reuses the same file',
);
assert.equal(folderRuntime.exportFolderStatus(folderContext, folderProfile).status, 'selected');
const directProfile = {
  ...folderProfile,
  export: { ...folderProfile.export, formatFolders: false },
};
const directFile = await folderRuntime.saveInExportFolder(
  folderContext,
  directProfile,
  stagedFolderFile,
  'json',
);
assert.equal(directFile.uri, 'content://picked/exports/2026-10-16.json');
assert.equal(
  await folderRuntime.saveInExportFolder(folderContext, directProfile, stagedFolderFile, 'json'),
  directFile,
  'Direct daily replacement reuses the file in the selected root',
);

await assert.rejects(
  folderRuntime.saveInExportFolder(
    { ...folderContext, owner: 'foreign' },
    folderProfile,
    stagedFolderFile,
    'json',
  ),
  /Choose/,
);
folderDenied = true;
await assert.rejects(
  folderRuntime.saveInExportFolder(folderContext, folderProfile, stagedFolderFile, 'json'),
  /unavailable/,
  'Revoked provider access cannot fall back to app storage',
);
assert.equal(stagedFolderFile.uri, 'cache/2026-10-16.json');
folderDenied = false;
pickerCancelled = false;
folderPlatform.OS = 'ios';
const bookmarkedFolder = await folderRuntime.chooseExportFolder(folderContext);
const bookmarkedProfile = {
  ...folderProfile,
  export: { ...folderProfile.export, localFolderId: bookmarkedFolder },
};
const restoredFile = await folderRuntime.saveInExportFolder(
  folderContext,
  bookmarkedProfile,
  stagedFolderFile,
  'json',
);
assert.equal(restoredFile.uri, 'file://restored/exports/json/2026-10-16.json');
assert.equal(
  bookmarkRestores,
  1,
  'iOS restores OS bookmark before accessing the selected directory',
);
let healthConnectAvailable = true;
/** @type {{accessType:string,recordType:string}[]} */
let healthPermissions = [];
let healthReads = 0;
/** @type {unknown} */ let requestedAndroidHealth;
const androidHealth =
  /** @type {{authorizeHealth:(selected?:string[])=>Promise<void>,healthTypes:(selectable?:boolean)=>Promise<string[]>,healthPage:(query:import('../core/data.js').DataQuery,token:string)=>Promise<import('../core/data.js').DataPage>}} */ (
    await load('../client/health.js', {
      'react-native': { Platform: { OS: 'android' } },
      '@kingstinct/react-native-healthkit': {},
      'react-native-health-connect': {
        initialize: async () => healthConnectAvailable,
        requestPermission: async (/** @type {unknown} */ permissions) => {
          requestedAndroidHealth = permissions;
        },
        getGrantedPermissions: async () => healthPermissions,
        readRecords: async () => {
          healthReads++;
          return { records: [], pageToken: null };
        },
      },
      './health-types.js': healthTypeCatalog,
      '../core/data.js': data,
      './health-series.js': {
        captureHealthSamples: async () => [],
        readHealthCharacteristic: async () => ({}),
      },
      './workout-series.js': { captureWorkout: async () => ({}) },
    })
  );
await androidHealth.authorizeHealth(['native:Steps']);
assert.deepEqual(
  requestedAndroidHealth,
  [{ accessType: 'read', recordType: 'Steps' }],
  'Profile consent must request only selected Android records',
);
await assert.rejects(androidHealth.authorizeHealth([]), /Select.*Health/);
// Run the editor's real handlers through successive selections, including a
// domain reported as authorized when only its first type has OS permission.
const editorSource = await readFile('client/ProfileDataEditor.js', 'utf8');
const editorTree = ts.createSourceFile(
  'ProfileDataEditor.js',
  editorSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JSX,
);
/** @type {string[][]} */
const reviewedHealth = [];
const editorContext = createContext({
  selection: { health: [], time: [], location: [] },
  inline: true,
  locked: false,
  domains: data.domains,
  permissions: { health: 'unknown' },
  requestedHealth: { current: new Set() },
  setRequesting: () => {},
  setAccessMessage: () => {},
  onSelection: async () => {},
  onAuthorize: async (/** @type {string} */ domain, /** @type {string[]} */ selected) => {
    assert.equal(domain, 'health');
    reviewedHealth.push([...selected]);
    return { message: 'Reviewed selected Health types.' };
  },
  showToast: () => assert.fail('The selection handler must not fail.'),
  errorMessage: String,
});
/** @param {import('typescript').Node} node */
function loadEditorHandlers(node) {
  if (ts.isFunctionDeclaration(node) && ['select', 'authorize'].includes(node.name?.text ?? ''))
    runInContext(node.getText(editorTree), editorContext);
  ts.forEachChild(node, loadEditorHandlers);
}
loadEditorHandlers(editorTree);
/** @param {string[]} health */
async function selectHealth(health) {
  const next = { health, time: [], location: [] };
  await editorContext.select(next);
  editorContext.selection = next;
}
await selectHealth(['native:Steps']);
await selectHealth(['native:Steps', 'native:SleepSession']);
editorContext.permissions.health = 'authorized';
await selectHealth(['native:Steps', 'native:SleepSession', 'native:HeartRate']);
await selectHealth([
  'native:Steps',
  'native:SleepSession',
  'native:HeartRate',
  'native:whoop.sleep',
]);
await selectHealth(['native:Steps']);
await selectHealth(['native:Steps', 'native:HeartRate']);
assert.deepEqual(
  reviewedHealth,
  [
    ['native:Steps'],
    ['native:Steps', 'native:SleepSession'],
    ['native:Steps', 'native:SleepSession', 'native:HeartRate'],
  ],
  'Each newly selected native Health type needs consent; reviewed types and WHOOP do not reprompt.',
);
let androidCatalog = false;
const catalogPlatform = { OS: 'ios' };
let foregroundGranted = true;
let usageAuthorization = 'authorized';
let locationTracking = false;
/** @type {import('../core/data.js').DataPage|null} */
let forcedHealthPage = null;
const phone =
  /** @type {{catalog:(owner:string,grants:Record<import('../core/data.js').Domain,boolean>)=>Promise<{locationTracking:boolean,domains:{types:string[],selectableTypes:string[],permission:string}[]}>,readPage:(owner:string,query:import('../core/data.js').DataQuery,profile:import('../core/profiles.js').ExportProfile,forChat?:boolean)=>Promise<import('../core/data.js').DataPage>}} */ (
    await load('../client/data.js', {
      '../core/data-aggregation.js': dataAggregation,
      '../core/data-range.js': dataRange,
      './whoop.js': disconnectedWhoop,
      'expo-location': {
        getForegroundPermissionsAsync: async () => ({ granted: foregroundGranted }),
      },
      'react-native': { Platform: catalogPlatform },
      './location-task.js': { locationStatus: async () => ({ tracking: locationTracking }) },
      '../core/profiles.js': profiles,
      '../core/data.js': data,
      './library.js': library,
      './health.js': {
        healthTypes: async (/** @type {boolean} */ selectable) =>
          androidCatalog
            ? androidHealth.healthTypes(selectable)
            : ['HKQuantityTypeIdentifierStepCount'],
        healthPage: async () => {
          if (forcedHealthPage) return forcedHealthPage;
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
androidCatalog = true;
catalogPlatform.OS = 'android';
const noHealthAccess = await phone.catalog('phone', {
  health: false,
  time: false,
  location: false,
});
assert.equal(
  noHealthAccess.domains[0]?.selectableTypes.length,
  healthTypeCatalog.androidTypes.length,
  'Android must offer Health types before permission; the profile picker must not show 0/0',
);
assert.deepEqual(noHealthAccess.domains[0]?.types, [], 'Selectable types do not grant read access');
const androidQuery = {
  domain: /** @type {const} */ ('health'),
  type: 'Steps',
  source: /** @type {const} */ ('native'),
  start: '2026-10-10T00:00:00.000Z',
  end: '2026-10-11T00:00:00.000Z',
  cursor: '',
  limit: 1,
  format: /** @type {const} */ ('json'),
};
await assert.rejects(androidHealth.healthPage(androidQuery, ''), /not permitted/);
assert.equal(healthReads, 0);
healthPermissions = [{ accessType: 'read', recordType: 'Steps' }];
assert.deepEqual(
  (await phone.catalog('phone', { health: false, time: false, location: false })).domains[0]?.types,
  ['native:Steps'],
);
await androidHealth.healthPage(androidQuery, '');
assert.equal(healthReads, 1);
healthPermissions = [];
await assert.rejects(androidHealth.healthPage(androidQuery, ''), /not permitted/);
assert.equal(healthReads, 1, 'Revoked permission must prevent native reads');
healthConnectAvailable = false;
assert.deepEqual(await androidHealth.healthTypes(true), []);
androidCatalog = false;
catalogPlatform.OS = 'ios';
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
db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(
  'phone',
  JSON.stringify({ health: true, time: false, location: true }),
);
const migrated = storedProfiles.loadProfiles('phone');
assert.ok(migrated);
assert.equal(migrated.profiles[0]?.agentAccess, true);
assert.equal(migrated.profiles[1]?.agentAccess, true);
assert.ok(!('activeId' in migrated));
assert.deepEqual(
  migrated.profiles[1]?.agentPermissions,
  { health: true, time: true, location: true, logs: true },
  'Legacy flags normalize to paired-phone compatibility access',
);
assert.deepEqual(migrated.profiles[0]?.agentPermissions, {
  health: true,
  time: true,
  location: true,
  logs: true,
});
// Selected types determine paired access, independently of legacy permission fields.
const individual = profiles.parseProfileState({
  profiles: [
    {
      ...migrated.profiles[1],
      agentAccess: true,
      agentPermissions: { health: true, time: false, location: false, logs: false },
    },
  ],
});
const individuallyAllowed = individual.profiles[0];
assert.ok(individuallyAllowed);
assert.equal(
  profiles.agentProfileAllows(individuallyAllowed, {
    domain: 'health',
    source: 'native',
    type: 'HKQuantityTypeIdentifierStepCount',
  }),
  true,
);
assert.equal(
  profiles.agentProfileAllows(individuallyAllowed, {
    domain: 'location',
    source: 'native',
    type: 'points',
  }),
  true,
);
assert.equal(
  profiles.agentProfileAllows(individuallyAllowed, {
    domain: 'location',
    source: 'native',
    type: 'unselected',
  }),
  false,
);
assert.equal(profiles.agentLogsAllowed(individuallyAllowed), true);
const individualOff = profiles.parseProfileState({
  profiles: [
    {
      ...individuallyAllowed,
      agentPermissions: { health: false, time: false, location: false, logs: false },
    },
  ],
});
assert.equal(
  individualOff.profiles[0]?.agentAccess,
  true,
  'Legacy denials normalize to paired-phone access',
);
assert.deepEqual(
  individualOff.profiles[0]?.selection,
  individuallyAllowed.selection,
  'Compatibility normalization preserves selections',
);
// Legacy phone-wide flags cannot change selected-type access across restarts.
db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(
  'phone',
  JSON.stringify({ health: false, time: true, location: false }),
);
assert.deepEqual(storedProfiles.loadProfiles('phone'), migrated);
// Another saved partition receives effective compatibility fields without adding selected types.
db.prepare('INSERT OR REPLACE INTO export_profiles VALUES (?,?)').run(
  'unapproved',
  JSON.stringify({
    profiles: [{ ...profiles.parseProfile(legacy, true), id: 'existing', agentAccess: true }],
  }),
);
const unapproved = storedProfiles.loadProfiles('unapproved');
assert.deepEqual(unapproved?.profiles[0]?.agentPermissions, {
  health: true,
  time: true,
  location: true,
  logs: true,
});
storedProfiles.saveProfiles('phone', migrated);
assert.deepEqual(storedProfiles.loadProfiles('phone'), migrated);
assert.deepEqual(migrated.profiles[0]?.selection, {
  health: ['native:HKQuantityTypeIdentifierStepCount'],
  time: [],
  location: ['native:points'],
});
// Cached validation still observes every database change and returns isolated mutable drafts.
const cachedOwner = 'cached-profile-owner';
storedProfiles.saveProfiles(cachedOwner, migrated);
const cachedBaseline = storedProfiles.loadProfiles(cachedOwner);
assert.ok(cachedBaseline);
const callerDraft = storedProfiles.loadProfiles(cachedOwner);
assert.ok(callerDraft);
const callerProfile = callerDraft.profiles[0];
assert.ok(callerProfile);
callerProfile.selection.health.length = 0;
callerProfile.export.destination = 'http';
callerProfile.export.httpUrl = 'https://caller-only.test/export';
callerProfile.schedule.hour = 23;
callerDraft.profiles.pop();
assert.deepEqual(storedProfiles.loadProfiles(cachedOwner), cachedBaseline);
const externalProfile = cachedBaseline.profiles[0];
assert.ok(externalProfile);
externalProfile.selection.location = [];
externalProfile.export.destination = 'http';
externalProfile.export.httpUrl = 'https://saved-external.test/export';
const externalState = profiles.parseProfileState(cachedBaseline);
const externalRaw = JSON.stringify({ ...externalState, agentConsentVersion: 1 });
db.prepare('UPDATE export_profiles SET value=? WHERE owner=?').run(externalRaw, cachedOwner);
assert.deepEqual(storedProfiles.loadProfiles(cachedOwner), externalState);
assert.equal(
  profiles.agentProfileAllows(externalProfile, {
    domain: 'location',
    source: 'native',
    type: 'points',
  }),
  false,
);
storedProfiles.saveProfiles('cached-other-owner', migrated);
assert.deepEqual(storedProfiles.loadProfiles('cached-other-owner'), migrated);
assert.deepEqual(storedProfiles.loadProfiles(cachedOwner), externalState);
db.prepare('DELETE FROM export_profiles WHERE owner=?').run(cachedOwner);
assert.equal(storedProfiles.loadProfiles(cachedOwner), null);
db.prepare('INSERT INTO export_profiles VALUES (?,?)').run(cachedOwner, '{"profiles":[]}');
assert.throws(() => storedProfiles.loadProfiles(cachedOwner), /Invalid saved profiles/);
// A legacy row must migrate even after a validated modern row occupied the cache.
db.prepare('UPDATE export_profiles SET value=? WHERE owner=?').run(
  JSON.stringify({ profiles: [{ ...legacy, agentAccess: false }] }),
  cachedOwner,
);
const migratedAgain = storedProfiles.loadProfiles(cachedOwner);
assert.deepEqual(migratedAgain?.profiles[0]?.selection, migrated.profiles[0]?.selection);
assert.equal(
  JSON.parse(
    String(
      db.prepare('SELECT value FROM export_profiles WHERE owner=?').get(cachedOwner)?.value ?? '',
    ),
  ).agentConsentVersion,
  1,
);
assert.deepEqual(storedProfiles.loadProfiles(cachedOwner), migratedAgain);
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
assert.equal(catalog.locationTracking, false);
locationTracking = true;
assert.equal(
  (await phone.catalog('alice', { health: false, time: false, location: false })).locationTracking,
  true,
);
locationTracking = false;
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
// Aggregate real SQLite pages, including >50 records and an empty intervening day.
for (let index = 0; index < 65; index++)
  library.saveRecord(
    'aggregate-owner',
    data.record('location', 'points', 'expo-location', { timestamp: stamp, value: 2, unit: 'm' }),
  );
library.saveRecord(
  'aggregate-owner',
  data.record('location', 'points', 'expo-location', { timestamp: stamp, value: 100, unit: 'cm' }),
);
library.saveRecord(
  'aggregate-owner',
  data.record('location', 'points', 'expo-location', {
    timestamp: stamp,
    value: 'missing',
    unit: 'm',
  }),
);
library.saveRecord(
  'aggregate-owner',
  data.record('location', 'points', 'expo-location', {
    timestamp: '2026-10-10T08:00:00.000Z',
    value: 4,
    unit: 'm',
  }),
);
const aggregateQuery = {
  ...query,
  end: '2026-10-11T00:00:00.000Z',
  limit: 2,
  aggregation: {
    operation: /** @type {const} */ ('sum'),
    field: 'value',
    groupBy: /** @type {const} */ ('day'),
  },
};
const aggregated = await phone.readPage('aggregate-owner', aggregateQuery, profile);
assert.deepEqual(
  aggregated.records.map((row) => row.native),
  [
    { aggregation: 'sum', groupBy: 'day', field: 'value', unit: 'cm', count: 1, value: 100 },
    { aggregation: 'sum', groupBy: 'day', field: 'value', unit: 'm', count: 65, value: 130 },
  ],
);
assert.equal(aggregated.aggregation?.scannedRecords, 67);
assert.equal(aggregated.aggregation?.skippedRecords, 1);
assert.ok(aggregated.nextCursor);
const aggregateTail = await phone.readPage(
  'aggregate-owner',
  { ...aggregateQuery, cursor: aggregated.nextCursor },
  profile,
);
assert.equal(aggregateTail.nextCursor, null);
assert.deepEqual(
  aggregateTail.records.map((row) => row.native),
  [{ aggregation: 'sum', groupBy: 'day', field: 'value', unit: 'm', count: 1, value: 4 }],
);
await assert.rejects(
  phone.readPage(
    'aggregate-owner',
    {
      ...aggregateQuery,
      cursor: aggregated.nextCursor,
      aggregation: { ...aggregateQuery.aggregation, operation: 'avg' },
    },
    profile,
  ),
  /different/,
);
const intervalQuery = {
  ...aggregateQuery,
  aggregation: {
    ...aggregateQuery.aggregation,
    operation: /** @type {const} */ ('avg'),
    groupBy: /** @type {const} */ ('interval'),
  },
};
const averaged = await phone.readPage('aggregate-owner', intervalQuery, profile);
assert.equal(averaged.records.length, 2);
const averagedMeters = averaged.records[1];
assert.ok(averagedMeters);
assert.equal(/** @type {{value:number}} */ (averagedMeters.native).value, 134 / 66);
await Promise.all(
  /** @type {const} */ (['min', 'max', 'count']).map(async (operation) => {
    const result = await phone.readPage(
      'aggregate-owner',
      { ...intervalQuery, aggregation: { ...intervalQuery.aggregation, operation } },
      profile,
    );
    const last = result.records.at(-1);
    assert.ok(last);
    assert.equal(
      /** @type {{value:number}} */ (last.native).value,
      operation === 'min' ? 2 : operation === 'max' ? 4 : 68,
    );
  }),
);
const blockedAggregation = {
  ...profile,
  agentPermissions: { health: false, time: false, location: false, logs: false },
};
assert.deepEqual(
  (await phone.readPage('aggregate-owner', aggregateQuery, blockedAggregation)).records,
  aggregated.records,
  'Legacy flags do not block selected aggregate reads',
);
await assert.rejects(
  phone.readPage('aggregate-owner', aggregateQuery, {
    ...profile,
    selection: { ...profile.selection, [aggregateQuery.domain]: [] },
  }),
  /disabled/,
);
const capped = dataAggregation.aggregateRecords(aggregateQuery, {
  start: query.start,
  end: query.end,
});
assert.throws(
  () =>
    capped.add(
      Array.from({ length: 10001 }, () =>
        data.record('location', 'points', 'expo-location', { timestamp: stamp, value: 1 }),
      ),
    ),
  /10000/,
);
forcedHealthPage = {
  records: [],
  nextCursor: null,
  warnings: ['Native source failed'],
  capture: 'fixture',
  complete: false,
};
await assert.rejects(
  phone.readPage(
    'alice',
    {
      ...query,
      domain: 'health',
      type: 'HKQuantityTypeIdentifierStepCount',
      aggregation: { operation: 'count', groupBy: 'day' },
    },
    profile,
  ),
  /partial/,
);
forcedHealthPage = null;
const bucketCap = dataAggregation.aggregateRecords(aggregateQuery, {
  start: query.start,
  end: query.end,
});
assert.throws(
  () =>
    bucketCap.add(
      Array.from({ length: 51 }, (_, index) =>
        data.record('location', 'points', 'expo-location', {
          timestamp: stamp,
          value: 1,
          unit: String(index),
        }),
      ),
    ),
  /50.*buckets/,
);
const longQuery = { ...query, start: '2026-09-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z' };
const emptyWindow = await phone.readPage('alice', longQuery, profile);
assert.equal(emptyWindow.records.length, 0);
assert.ok(emptyWindow.nextCursor, 'An empty provider window must continue to the next window');
const lastWindow = await phone.readPage(
  'alice',
  { ...longQuery, cursor: emptyWindow.nextCursor },
  profile,
);
assert.equal(lastWindow.records.length, library.localPage('alice', longQuery, '').records.length);
assert.equal(lastWindow.nextCursor, null);
assert.equal(
  library.earliestLocationDate('alice', ['native:points'], query.end),
  '2026-10-07T08:00:00.000Z',
);
await assert.rejects(
  phone.readPage(
    'alice',
    { ...longQuery, end: '2026-12-01T00:00:00.000Z', cursor: emptyWindow.nextCursor },
    profile,
  ),
  /different query/,
);
assert.deepEqual(
  (
    await phone.readPage(
      'alice',
      { ...longQuery, cursor: emptyWindow.nextCursor },
      { ...profile, agentAccess: false },
    )
  ).records,
  lastWindow.records,
);
await assert.rejects(
  phone.readPage(
    'alice',
    { ...longQuery, cursor: emptyWindow.nextCursor },
    { ...profile, selection: { ...profile.selection, location: [] } },
  ),
  /disabled/,
);
const blocked = {
  ...profile,
  agentPermissions: { health: true, time: true, location: false, logs: false },
};
storedProfiles.saveProfiles('independent', { profiles: [blocked, { ...profile, id: 'other' }] });
const independent = storedProfiles.loadProfiles('independent');
assert.ok(independent);
assert.equal(independent.profiles[0]?.agentPermissions?.location, true);
assert.equal(independent.profiles[1]?.agentPermissions?.location, true);
assert.equal((await phone.readPage('alice', query, blocked)).records.length, 1);
await assert.rejects(
  phone.readPage('alice', query, { ...blocked, selection: { ...blocked.selection, location: [] } }),
  /disabled/,
);
assert.equal(
  (await phone.readPage('alice', query, blocked, false)).records.length,
  1,
  'Agent permissions do not alter owner exports',
);
assert.ok(
  !('agentPermissions' in profiles.parseProfile(blocked)),
  'Portable profiles cannot carry permission grants',
);
assert.throws(() => profiles.parseAgentPermissions({ location: false }), /explicitly/);
const privateProfile = migrated.profiles[1];
assert.ok(privateProfile);
assert.equal((await phone.readPage('alice', query, privateProfile)).records.length, 1);
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
  /disabled/,
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM records WHERE source LIKE 'imported%'").get()?.count,
  2,
  'Legacy data must remain stored',
);
// Approval changes must not reset schedules, pending exports or existing files.
let manualContext = /** @type {{owner:string,deviceId:string}|null} */ (null);
let manualFailures = 0;
let manualError = false;
const exportTask =
  /** @type {{scheduleState:(device:string,profile:import('../core/profiles.js').ExportProfile)=>{progress:import('../core/schedules.js').ScheduleProgress,files:string[],job:unknown,fingerprint:string},exportNow:(context:{owner:string,deviceId:string},profile:import('../core/profiles.js').ExportProfile,progress:(message:string)=>void)=>Promise<{days:number,failedSources:number}>}} */ (
    await load('../client/export-task.js', {
      '../core/data-range.js': dataRange,
      '../core/data.js': data,
      './library.js': { earliestLocationDate: () => null },
      './health-history.js': {
        earliestHealthDate: async () => null,
        requireHealthHistory: async () => {},
      },
      './export-notification-registration.js': { reconcileExportNotificationTask: async () => {} },
      './destinations.js': { requireCloudAuthorization: async () => {} },
      'expo-constants': { default: { expoConfig: {} } },
      'expo-notifications': {},
      'react-native': { Alert: { alert() {} }, Platform: { OS: 'ios' } },
      './session.js': { api: async () => ({}), loadSession: async () => null },
      './qa-runtime.js': { qaEnabled: false },
      '../core/export-files.js': await import('../core/export-files.js'),
      './billing.js': { reserveExport: async () => {}, settleExport: async () => {} },
      '../core/diagnostics.js': diagnostics,
      'expo-background-task': {},
      'expo-task-manager': { defineTask: () => {} },
      './phone-database.js': { phoneDatabase: sqlite.openDatabaseSync },
      '../core/schedules.js': schedules,
      './export-context.js': { loadExportContext: () => manualContext },
      './profiles.js': storedProfiles,
      './calendar.js': { localCalendar },
      './history.js': {
        beginExport: () => 'manual-history',
        recordArtifact: () => {},
        finishExport: () => {},
      },
      './profile-export.js': {
        exportProfileDay: async () => {
          if (manualError) throw new Error('Synthetic export failure');
          return { files: ['manual.json'], count: 0, failedSources: manualFailures };
        },
      },
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
// Toast feedback must distinguish complete, partial and rejected exports.
manualContext = { owner: 'alice', deviceId: 'phone' };
const manualProfile = {
  ...privateProfile,
  export: { ...privateProfile.export, lookbackDays: 1, includeToday: false },
};
storedProfiles.saveProfiles('phone', { ...migrated, profiles: [manualProfile] });
assert.equal((await exportTask.exportNow(manualContext, manualProfile, () => {})).failedSources, 0);
manualFailures = 2;
assert.equal((await exportTask.exportNow(manualContext, manualProfile, () => {})).failedSources, 2);
manualError = true;
await assert.rejects(
  exportTask.exportNow(manualContext, manualProfile, () => {}),
  /Synthetic export failure/,
);
storedProfiles.saveProfiles('phone', migrated);
// Exercise the native boundary: cancellation/denial must precede location access;
// a Settings return reuses only the same owner's pending disclosure.
let disclosureAccepted = false;
let notificationGranted = false;
let backgroundGranted = false;
let channelBlocked = false;
let updatesStarted = false;
const recordingEvents = /** @type {string[]} */ ([]);
const recorder =
  /** @type {{startTracking:(owner:string)=>Promise<boolean|null>,stopTracking:()=>Promise<void>}} */ (
    await load('../client/location-task.js', {
      'react-native': {
        Platform: { OS: 'android' },
        Alert: {
          alert: (
            /** @type {string} */ _title,
            /** @type {string} */ message,
            /** @type {{onPress:()=>void}[]} */ buttons,
          ) => {
            recordingEvents.push('disclosure');
            assert.match(message, /precise location.*closed or not in use/);
            buttons[disclosureAccepted ? 1 : 0]?.onPress();
          },
        },
      },
      'expo-notifications': {
        AndroidImportance: { LOW: 2, NONE: 0 },
        setNotificationChannelAsync: async () => recordingEvents.push('channel'),
        getPermissionsAsync: async () => ({ granted: notificationGranted }),
        requestPermissionsAsync: async () => {
          recordingEvents.push('notification');
          return { granted: notificationGranted };
        },
        getNotificationChannelsAsync: async () =>
          channelBlocked ? [{ id: 'scope:myselfmd-location', importance: 0 }] : [],
      },
      'expo-location': {
        Accuracy: { Highest: 6 },
        requestForegroundPermissionsAsync: async () => {
          recordingEvents.push('foreground');
          return { granted: true };
        },
        getBackgroundPermissionsAsync: async () => ({ granted: backgroundGranted }),
        requestBackgroundPermissionsAsync: async () => {
          recordingEvents.push('background');
          return { granted: backgroundGranted };
        },
        hasStartedLocationUpdatesAsync: async () => updatesStarted,
        startLocationUpdatesAsync: async () => {
          recordingEvents.push('start');
          updatesStarted = true;
        },
        stopLocationUpdatesAsync: async () => {
          updatesStarted = false;
        },
      },
      'expo-task-manager': { defineTask: () => {} },
      './phone-database.js': { phoneDatabase: sqlite.openDatabaseSync },
      '../core/data.js': data,
      './library.js': library,
    })
  );
assert.equal(await recorder.startTracking('alice'), null);
assert.deepEqual(recordingEvents, ['disclosure']);
disclosureAccepted = true;
recordingEvents.length = 0;
await assert.rejects(recorder.startTracking('alice'), /Allow notifications/);
assert.deepEqual(recordingEvents, ['disclosure', 'channel', 'notification']);
assert.equal(updatesStarted, false);
notificationGranted = true;
assert.equal(await recorder.startTracking('alice'), false);
assert.equal(updatesStarted, false);
backgroundGranted = true;
recordingEvents.length = 0;
assert.equal(await recorder.startTracking('alice'), true);
assert.deepEqual(recordingEvents, ['channel', 'foreground', 'start']);
assert.equal(updatesStarted, true);
await recorder.stopTracking();
assert.equal(updatesStarted, false);
channelBlocked = true;
recordingEvents.length = 0;
await assert.rejects(recorder.startTracking('alice'), /notification channel/);
assert.deepEqual(recordingEvents, ['disclosure', 'channel']);
assert.equal(updatesStarted, false);
db.close();
console.log(
  'Native sources: legacy profile migration, import rejection, pre-permission choices, access requests, catalog, local isolation, date filtering, profile approval, independent schedules and manual sharing passed.',
);
