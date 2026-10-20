import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule, createContext, runInContext } from 'node:vm';
import * as policy from '../core/profiles.js';
import * as hosting from '../core/hosting.js';

/** @typedef {{owner:string,deviceId:string,server:string,issuer:string}} PairingIdentity */
/** @typedef {{loadProfiles:(owner:string)=>import('../core/profiles.js').ProfileState|null,saveProfiles:(owner:string,state:import('../core/profiles.js').ProfileState)=>void,prepareProfilePairing:(session:PairingIdentity)=>void,completeProfilePairing:(session:PairingIdentity)=>void}} ProfileStorage */
/** @typedef {PairingIdentity & {server:string,issuer:string,resource:string,accessToken:string,refreshToken:string,expires:number,account:string,lastActiveAt:number}} SavedSession */
/** @typedef {{loadSession:()=>Promise<SavedSession|null>,saveSession:(session:SavedSession)=>Promise<void>,clearSession:(session?:SavedSession)=>Promise<void>}} SessionStorage */

const db = new DatabaseSync(':memory:');
/** @type {RegExp|null} */
let failSql = null;
const storage = {
  execSync: (/** @type {string} */ sql) => db.exec(sql),
  /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
  getFirstSync: (sql, ...args) => db.prepare(sql).get(...args) ?? null,
  /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
  runSync: (sql, ...args) => {
    if (failSql?.test(sql)) throw new Error('Synthetic transaction fault.');
    return db.prepare(sql).run(...args);
  },
  /** @param {()=>void} action */
  withTransactionSync(action) {
    db.exec('BEGIN');
    try {
      action();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};
const qa = {
  qaEnabled: false,
  qaSession: { deviceId: 'unused-qa' },
  qaSnapshot: () => null,
  updateQa: () => assert.fail('Normal pairing must not touch QA fixtures.'),
};
/** @param {string} path @param {Record<string,object>} imports */
async function load(path, imports) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'));
  await module.link((name) => {
    const values = imports[name];
    assert.ok(values, `Unexpected import: ${name}`);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
const profiles = /** @type {ProfileStorage} */ (
  await load('../client/profiles.js', {
    './library.js': { loadGrants: () => ({ health: false, time: false, location: false }) },
    './phone-database.js': { phoneDatabase: () => storage },
    './qa-runtime.js': qa,
    '../core/profiles.js': policy,
    '../core/hosting.js': hosting,
  })
);
const agentProfiles =
  /** @type {{loadAgentProfiles:(session:{owner:string,deviceId:string})=>import('../core/profiles.js').ProfileState|null,saveAgentProfiles:(session:{owner:string,deviceId:string},state:import('../core/profiles.js').ProfileState)=>void}} */ (
    await load('../client/profile-logs.js', {
      './profiles.js': profiles,
      './debug-log.js': { debugSharing: () => ({ shared: false }), setDebugSharing: () => {} },
      './phone-database.js': { phoneDatabase: () => storage },
      './qa-runtime.js': qa,
      '../core/profiles.js': policy,
    })
  );
const localSession = { server: '', issuer: '', owner: 'local-device', deviceId: 'local-device' };
const account = {
  server: 'https://synthetic.invalid',
  issuer: 'https://synthetic.invalid/auth/realms/myselfmd',
  owner: 'owner-a',
  deviceId: '',
};
const configured = policy.parseProfileState({
  profiles: [
    {
      ...policy.parseProfile({
        schema: 'myself.md.profile.v1',
        name: 'My first export',
        selection: { health: [], time: [], location: ['native:points'] },
        export: { destination: 'local', lookbackDays: 1, includeToday: true },
      }),
      id: 'onboarding-profile',
      agentAccess: false,
      agentPermissions: { health: false, time: false, location: false, logs: false },
    },
  ],
});
agentProfiles.saveAgentProfiles(localSession, configured);
const provider = await readFile(new URL('../client/PhoneProvider.js', import.meta.url), 'utf8');
const selector = provider.match(/const dataSession = (.*);/)?.[1];
const confirm = provider.match(/  async function confirm\(\) \{[\s\S]*?\n  \}/)?.[0];
const disconnect = provider.match(/  async function disconnect\(\) \{[\s\S]*?\n  \}/)?.[0];
const startup = provider.match(
  /loadSession\(\)\s*\.then\((async \(loaded\) => \{[\s\S]*?\n      \})\)/,
)?.[1];
assert.ok(
  selector && confirm && startup && disconnect,
  'Exercise the actual pairing, startup and displayed-partition boundaries.',
);
/** @type {Record<string, unknown>} */
let savedSession = {};
const context = createContext({
  ...profiles,
  session: account,
  pairing: { ticket: 'synthetic-ticket' },
  localSession,
  api: async () => ({ id: 'paired-a' }),
  Platform: { OS: 'ios' },
  saveSession: async (/** @type {Record<string,unknown>} */ value) => {
    savedSession = value;
  },
  setSession: (/** @type {Record<string,unknown>} */ value) => {
    context.session = value;
  },
  reset: () => {},
  router: { dismissTo: () => {} },
  syncBilling: async () => {},
});
/** @returns {{owner:string,deviceId:string}} */
function displayedSession() {
  context.value = {
    connected: Boolean(context.session?.deviceId && !context.session.requiresSignIn),
    session: context.session,
  };
  return runInContext(selector ?? assert.fail('Missing displayed-partition selection.'), context);
}
assert.equal(
  agentProfiles.loadAgentProfiles(displayedSession())?.profiles[0]?.name,
  'My first export',
);
await runInContext(`(${confirm.replace('async function confirm', 'async function')})()`, context);
const shown = agentProfiles.loadAgentProfiles(displayedSession());
assert.equal(
  shown?.profiles[0]?.name,
  'My first export',
  'First pairing must preserve the profile saved before pairing instead of initializing Default.',
);
assert.deepEqual(JSON.parse(JSON.stringify(shown)), configured);
assert.equal(savedSession.deviceId, 'paired-a');
assert.equal(
  profiles.loadProfiles('local-device'),
  null,
  'Another account must not inherit consumed local setup.',
);
assert.deepEqual(JSON.parse(JSON.stringify(profiles.loadProfiles('paired-a'))), configured);

const paired = { ...account, deviceId: 'paired-a' };
const permissionsOff = { health: false, time: false, location: false, logs: false };
/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));
/** @param {import('../core/profiles.js').ProfileState} value */
const privateState = (value) =>
  policy.parseProfileState({
    profiles: value.profiles.map((profile) => ({
      ...profile,
      agentAccess: false,
      agentPermissions: permissionsOff,
    })),
  });
const rich = policy.parseProfileState({
  profiles: [
    {
      ...policy.parseProfile({
        schema: 'myself.md.profile.v1',
        name: 'Local configured folder',
        selection: {
          health: ['native:steps', 'native:sleep'],
          time: ['native:applications'],
          location: ['native:points'],
        },
        export: {
          destination: 'local',
          schema: 'myself.md.export.v1',
          formats: ['json', 'jsonl'],
          localFolderId: 'local-folder',
          lookbackDays: 14,
          includeToday: true,
          folderName: 'Configured Exports',
          filenameTemplate: 'phone-{year}-{month}-{day}',
          formatFolders: true,
          writeMode: 'new_file',
        },
        schedule: {
          frequency: 'custom',
          unit: 'month',
          interval: 2,
          anchorDate: '2026-10-01',
          hour: 17,
          minute: 23,
          weekday: 4,
          todayRefresh: true,
          refreshHours: 6,
        },
      }),
      id: 'folder-profile',
      agentAccess: true,
      agentPermissions: { health: true, time: true, location: true, logs: true },
    },
    {
      ...policy.parseProfile({
        schema: 'myself.md.profile.v1',
        name: 'HTTPS configuration',
        selection: { health: [], time: ['native:websites'], location: [] },
        export: {
          destination: 'http',
          httpUrl: 'https://destination.synthetic.invalid/exports',
          formats: ['jsonl'],
          lookbackDays: 3,
          writeMode: 'append',
        },
        schedule: { frequency: 'weekly', weekday: 6, hour: 9, minute: 45 },
      }),
      id: 'http-profile',
      agentAccess: true,
      agentPermissions: { health: false, time: true, location: false, logs: true },
    },
    {
      ...policy.parseProfile({
        schema: 'myself.md.profile.v1',
        name: 'Cloud configuration',
        selection: { health: ['native:heart_rate'], time: [], location: [] },
        export: { destination: 'cloud', lookbackDays: 30 },
      }),
      id: 'cloud-profile',
      agentAccess: true,
      agentPermissions: { health: true, time: false, location: false, logs: false },
    },
  ],
});

function resetProfiles() {
  failSql = null;
  db.exec(
    'DELETE FROM export_profiles; DELETE FROM profile_pairing; DELETE FROM profile_connections; DELETE FROM profile_log_consent',
  );
}
function intent() {
  return db.prepare('SELECT owner,device FROM profile_pairing WHERE id=1').get() ?? null;
}
/** @param {string} owner */
const savedProfiles = (owner) => plain(profiles.loadProfiles(owner));
function profileRows() {
  return plain(db.prepare('SELECT owner,value FROM export_profiles ORDER BY owner').all());
}

resetProfiles();
for (const invalid of [
  { ...account, owner: '', deviceId: 'paired-a' },
  { ...account, owner: 'local-device', deviceId: 'paired-a' },
  { ...account, owner: 'owner-a', deviceId: '' },
  { ...account, owner: 'owner-a', deviceId: 'local-device' },
]) {
  assert.throws(() => profiles.prepareProfilePairing(invalid), /signed-in paired phone/);
  assert.equal(intent(), null, 'An invalid identity cannot create a handoff intent.');
}
profiles.prepareProfilePairing(paired);
assert.equal(intent(), null, 'No local configuration means no migration intent.');
profiles.completeProfilePairing(paired);
assert.equal(profiles.loadProfiles(paired.deviceId), null);

profiles.saveProfiles('local-device', rich);
const beforePrepare = profileRows();
profiles.prepareProfilePairing(paired);
assert.deepEqual(
  profileRows(),
  beforePrepare,
  'Preparing records intent without moving configuration.',
);
assert.deepEqual(plain(intent()), { owner: paired.owner, device: paired.deviceId });
for (const foreign of [
  { ...account, owner: 'owner-b', deviceId: paired.deviceId },
  { ...account, owner: paired.owner, deviceId: 'paired-b' },
  { ...account, owner: 'owner-b', deviceId: 'paired-b' },
]) {
  profiles.completeProfilePairing(foreign);
  assert.deepEqual(profileRows(), beforePrepare, 'A different owner/device cannot consume setup.');
  assert.deepEqual(plain(intent()), { owner: paired.owner, device: paired.deviceId });
}

// These stores deliberately share the database. Only profile configuration may move.
db.exec(`CREATE TABLE records (id INTEGER PRIMARY KEY, owner TEXT, value TEXT);
CREATE TABLE export_folders (owner TEXT, device TEXT, id TEXT, name TEXT, uri TEXT, bookmark TEXT, PRIMARY KEY(owner,device,id));
CREATE TABLE profile_schedules (device TEXT, profile TEXT, value TEXT, PRIMARY KEY(device,profile));`);
db.prepare('INSERT INTO records VALUES (1,?,?)').run('local-device', 'synthetic-source-record');
db.prepare('INSERT INTO export_folders VALUES (?,?,?,?,?,?)').run(
  'local-device',
  'local-device',
  'local-folder',
  'Synthetic folder',
  'file:///synthetic-private-folder',
  'synthetic-os-bookmark',
);
db.prepare('INSERT INTO profile_schedules VALUES (?,?,?)').run(
  'local-device',
  'folder-profile',
  'synthetic-opted-in-progress',
);
const unrelated = () => ({
  records: plain(db.prepare('SELECT * FROM records').all()),
  folders: plain(db.prepare('SELECT * FROM export_folders').all()),
  automaticProgress: plain(db.prepare('SELECT * FROM profile_schedules').all()),
});
const beforeUnrelated = unrelated();
profiles.completeProfilePairing(paired);
assert.deepEqual(
  savedProfiles(paired.deviceId),
  privateState(rich),
  'All profile IDs and portable settings survive; every grant becomes false.',
);
assert.equal(profiles.loadProfiles('local-device'), null, 'The original setup is consumed once.');
assert.equal(intent(), null, 'Completion consumes its intent.');
assert.deepEqual(
  unrelated(),
  beforeUnrelated,
  'Records, folder grants and automatic-export opt-in do not move.',
);
const completedRows = profileRows();
profiles.completeProfilePairing(paired);
assert.deepEqual(profileRows(), completedRows, 'Repeated completion is idempotent.');
const later = { ...account, owner: 'owner-b', deviceId: 'paired-b' };
profiles.prepareProfilePairing(later);
profiles.completeProfilePairing(later);
assert.equal(
  profiles.loadProfiles(later.deviceId),
  null,
  'A later account cannot receive a second copy.',
);
assert.equal(intent(), null);

const folders =
  /** @type {{exportFolderStatus:(session:PairingIdentity,profile:import('../core/profiles.js').ExportProfile)=>{status:string}}} */ (
    await load('../client/export-folder.js', {
      '../core/export-files.js': {
        appendExportContent: () => assert.fail('Pairing must not write files.'),
      },
      'expo-file-system': { Directory: class {}, File: class {}, FileMode: {}, Paths: {} },
      'react-native': { Platform: { OS: 'ios' } },
      expo: { requireOptionalNativeModule: () => null },
      './phone-database.js': { phoneDatabase: () => storage },
      './qa-runtime.js': qa,
    })
  );
const folderProfile = profiles.loadProfiles(paired.deviceId)?.profiles[0];
assert.ok(folderProfile);
assert.equal(folderProfile.export.localFolderId, 'local-folder');
assert.equal(
  folders.exportFolderStatus(paired, folderProfile).status,
  'needs_selection',
  'Retaining a folder ID does not transfer its OS grant into another scope.',
);
assert.equal(folders.exportFolderStatus(localSession, folderProfile).status, 'selected');

resetProfiles();
profiles.saveProfiles('local-device', configured);
profiles.saveProfiles(paired.deviceId, rich);
const existingRows = profileRows();
assert.throws(() => profiles.prepareProfilePairing(paired), /already has profiles/);
assert.deepEqual(profileRows(), existingRows, 'Prepare never overwrites an existing target.');
assert.equal(intent(), null);

resetProfiles();
profiles.saveProfiles('local-device', configured);
profiles.prepareProfilePairing(paired);
profiles.saveProfiles(paired.deviceId, rich);
const racedRows = profileRows();
assert.throws(() => profiles.completeProfilePairing(paired), /already has profiles/);
assert.deepEqual(profileRows(), racedRows, 'A target created after prepare is never overwritten.');
assert.deepEqual(plain(intent()), { owner: paired.owner, device: paired.deviceId });

for (const fault of [/DELETE FROM export_profiles/, /DELETE FROM profile_pairing/]) {
  resetProfiles();
  profiles.saveProfiles('local-device', rich);
  profiles.prepareProfilePairing(paired);
  const beforeFault = profileRows();
  failSql = fault;
  assert.throws(() => profiles.completeProfilePairing(paired), /Synthetic transaction fault/);
  failSql = null;
  assert.deepEqual(
    profileRows(),
    beforeFault,
    'Failure after target insertion rolls the entire move back.',
  );
  assert.deepEqual(plain(intent()), { owner: paired.owner, device: paired.deviceId });
  assert.deepEqual(unrelated(), beforeUnrelated);
  profiles.completeProfilePairing(paired);
  assert.deepEqual(
    savedProfiles(paired.deviceId),
    privateState(rich),
    'A rolled-back move can safely retry.',
  );
}

const fullSession = {
  ...paired,
  issuer: 'https://synthetic.invalid/auth/realms/myselfmd',
  resource: 'https://synthetic.invalid/mcp',
  accessToken: 'synthetic-access-token',
  refreshToken: 'synthetic-refresh-token',
  expires: Date.now() + 3600000,
  account: 'synthetic-account',
  lastActiveAt: Date.now(),
};
/** Load the real session module with only native/network boundaries replaced.
 * @param {Map<string,string>} secure
 * @param {boolean} [failSave] */
async function sessions(secure, failSave = false) {
  return /** @type {SessionStorage} */ (
    await load('../client/session.js', {
      '../packages/support-chat/errors.js': {
        readJSONResponse: () => assert.fail('No network response is expected.'),
      },
      './export-context.js': { saveExportContext: () => {} },
      './debug-log.js': { recordDebug: () => {} },
      '../core/debug-log.js': { debugOperation: () => {} },
      '../core/hosting.js': { canonicalServiceOrigin: (/** @type {string} */ server) => server },
      './profiles.js': profiles,
      'expo-auth-session': {},
      'expo-secure-store': {
        AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'synthetic-device-only',
        getItemAsync: async (/** @type {string} */ key) => secure.get(key) ?? null,
        setItemAsync: async (/** @type {string} */ key, /** @type {string} */ value) => {
          if (failSave) throw new Error('Synthetic SecureStore failure.');
          secure.set(key, value);
        },
        deleteItemAsync: async (/** @type {string} */ key) => {
          secure.delete(key);
        },
      },
      'expo-web-browser': { maybeCompleteAuthSession: () => {} },
    })
  );
}

resetProfiles();
profiles.saveProfiles('local-device', rich);
profiles.prepareProfilePairing(paired);
const secure = new Map([['synthetic-destination-secret', 'opaque-existing-credential']]);
const saving = await sessions(secure);
await saving.saveSession(fullSession);
assert.deepEqual(
  savedProfiles('local-device'),
  rich,
  'Secure persistence alone has not consumed setup.',
);
assert.equal(profiles.loadProfiles(paired.deviceId), null);
const recovered = await sessions(secure);
const recoveredSession = await recovered.loadSession();
assert.equal(recoveredSession?.deviceId, paired.deviceId);
assert.equal(
  profiles.loadProfiles(paired.deviceId),
  null,
  'Reading secure tokens does not bypass pending account cleanup.',
);
let displayedOnStartup = false;
const startupContext = createContext({
  ...profiles,
  loaded: recoveredSession,
  pendingAccountCleanup: () => null,
  setSession: (/** @type {SavedSession|null} */ value) => {
    assert.equal(value?.deviceId, paired.deviceId);
    assert.deepEqual(
      savedProfiles(paired.deviceId),
      privateState(rich),
      'Startup completes configuration before exposing the paired session.',
    );
    displayedOnStartup = true;
  },
  migrateLocationTask: async () => {},
});
await runInContext(`(${startup})(loaded)`, startupContext);
assert.equal(displayedOnStartup, true);
assert.deepEqual(
  savedProfiles(paired.deviceId),
  privateState(rich),
  'Restart finishes the saved-session handoff at the real provider boundary.',
);
assert.equal(profiles.loadProfiles('local-device'), null);
assert.equal(intent(), null);
assert.equal(secure.get('synthetic-destination-secret'), 'opaque-existing-credential');
assert.deepEqual(
  new Set(secure.keys()),
  new Set(['myselfmd-session', 'synthetic-destination-secret']),
  'Pairing never copies destination credentials.',
);

resetProfiles();
profiles.saveProfiles('local-device', rich);
profiles.prepareProfilePairing(paired);
/** @type {string[]} */
const cleanupCalls = [];
const cleanupContext = createContext({
  ...profiles,
  loaded: fullSession,
  pendingAccountCleanup: () => paired,
  completeProfilePairing: () =>
    assert.fail('Pending deletion must take priority over setup adoption.'),
  finishDeletion: async (/** @type {unknown} */ owner, /** @type {unknown} */ session) => {
    assert.equal(owner, paired);
    assert.equal(session, fullSession);
    cleanupCalls.push('deletion');
  },
  setSession: (/** @type {unknown} */ value) => {
    assert.equal(value, fullSession);
    cleanupCalls.push('display');
  },
  setAccountRevision: (/** @type {(value:number)=>number} */ update) => {
    assert.equal(update(0), 1);
  },
  migrateLocationTask: () => assert.fail('Deleted sessions must not start source migration.'),
});
await runInContext(`(${startup})(loaded)`, cleanupContext);
assert.deepEqual(cleanupCalls, ['display', 'deletion']);
assert.deepEqual(
  savedProfiles('local-device'),
  rich,
  'The startup branch never adopts setup ahead of pending deletion.',
);
assert.equal(profiles.loadProfiles(paired.deviceId), null);

resetProfiles();
profiles.saveProfiles('local-device', rich);
/** @type {Map<string,string>} */
const failedSecure = new Map();
const failedSessions = await sessions(failedSecure, true);
let displayedAfterFailure = false;
const failedContext = createContext({
  ...profiles,
  session: { ...fullSession, deviceId: '' },
  pairing: { ticket: 'synthetic-ticket' },
  api: async () => ({ id: paired.deviceId }),
  Platform: { OS: 'android' },
  saveSession: failedSessions.saveSession,
  setSession: () => {
    displayedAfterFailure = true;
  },
  reset: () => {},
  router: { dismissTo: () => {} },
  syncBilling: async () => {},
});
await assert.rejects(
  () =>
    runInContext(
      `(${confirm.replace('async function confirm', 'async function')})()`,
      failedContext,
    ),
  /Synthetic SecureStore failure/,
);
assert.equal(displayedAfterFailure, false, 'An unsaved session is never displayed as paired.');
assert.equal(failedSecure.has('myselfmd-session'), false);
assert.deepEqual(savedProfiles('local-device'), rich, 'SecureStore failure keeps all local setup.');
assert.equal(profiles.loadProfiles(paired.deviceId), null);
assert.deepEqual(plain(intent()), { owner: paired.owner, device: paired.deviceId });
assert.equal(await failedSessions.loadSession(), null);
assert.deepEqual(unrelated(), beforeUnrelated);

// Reproduce the physical disconnect/re-pair symptom through the real provider confirmation.
resetProfiles();
profiles.saveProfiles(paired.deviceId, rich);
profiles.completeProfilePairing(paired);
const priorSecure = new Map([['myselfmd-session', JSON.stringify(fullSession)]]);
const priorSessions = await sessions(priorSecure);
const priorSession = await priorSessions.loadSession();
const disconnectContext = createContext({
  session: priorSession,
  cancelExports: () => {},
  clearSession: priorSessions.clearSession,
  setSession: () => {},
  clearAccountAllowance: () => {},
  reset: () => {},
  stopTracking: async () => {},
  revokeDevice: async () => {},
  showToast: () => assert.fail('Disconnect should succeed.'),
});
await runInContext(
  `(${disconnect.replace('async function disconnect', 'async function')})()`,
  disconnectContext,
);
assert.equal(await priorSessions.loadSession(), null, 'Disconnect clears the real secure session.');
const reconnectContext = createContext({
  ...profiles,
  session: { ...fullSession, deviceId: '' },
  pairing: { ticket: 'synthetic-reconnect-ticket' },
  api: async () => ({ id: 'reconnected-a' }),
  Platform: { OS: 'ios' },
  saveSession: async () => {},
  setSession: (/** @type {SavedSession} */ value) => {
    assert.deepEqual(
      savedProfiles(value.deviceId),
      privateState(rich),
      'Re-pairing the same account must show its saved profiles before mounting the new partition.',
    );
  },
  reset: () => {},
  router: { dismissTo: () => {} },
  syncBilling: async () => {},
});
await runInContext(
  `(${confirm.replace('async function confirm', 'async function')})()`,
  reconnectContext,
);

assert.deepEqual(
  savedProfiles(paired.deviceId),
  rich,
  'Recovery leaves the old partition untouched.',
);
assert.deepEqual(
  unrelated(),
  beforeUnrelated,
  'Recovery never transfers source records, folder grants or schedule progress.',
);
const reconnected = { ...account, owner: paired.owner, deviceId: 'reconnected-a' };
profiles.saveProfiles(reconnected.deviceId, rich);
profiles.completeProfilePairing(reconnected);
assert.deepEqual(
  savedProfiles(reconnected.deviceId),
  rich,
  'Ordinary startup preserves consent for an unchanged registration.',
);

// A supplied subject does not establish identity across actual issuers or services.
for (const differentScope of [
  { issuer: 'https://other.synthetic.invalid/auth/realms/myselfmd' },
  { server: 'https://other.synthetic.invalid' },
]) {
  const other = {
    ...paired,
    ...differentScope,
    deviceId: `scoped-${Object.keys(differentScope)[0]}`,
  };
  profiles.completeProfilePairing(other);
  assert.equal(
    savedProfiles(other.deviceId),
    null,
    'Equal subjects across services cannot recover configuration.',
  );
  assert.throws(
    () => profiles.completeProfilePairing({ ...paired, ...differentScope }),
    /another account/,
  );
}
// The explicit anonymous handoff is bound to the service which requested it too.
profiles.saveProfiles('local-device', configured);
profiles.prepareProfilePairing({ ...paired, deviceId: 'scope-pending' });
const pendingRows = profileRows();
for (const differentScope of [
  { issuer: 'https://other.synthetic.invalid/auth/realms/myselfmd' },
  { server: 'https://other.synthetic.invalid' },
]) {
  profiles.completeProfilePairing({ ...paired, deviceId: 'scope-pending', ...differentScope });
  assert.deepEqual(profileRows(), pendingRows);
  assert.ok(intent(), 'A different service cannot consume the pending handoff.');
}
db.exec("DELETE FROM profile_pairing; DELETE FROM export_profiles WHERE owner='local-device'");

// Switching accounts (including another issuer) cannot inherit a remembered partition.
for (const owner of ['owner-b', 'https://other.synthetic.invalid|owner-a']) {
  const other = { ...account, owner, deviceId: `${owner}-phone` };
  profiles.completeProfilePairing(other);
  assert.equal(savedProfiles(other.deviceId), null);
  profiles.saveProfiles(other.deviceId, configured);
}
const returned = { ...account, owner: paired.owner, deviceId: 'returned-a' };
profiles.prepareProfilePairing(returned);
profiles.completeProfilePairing(returned);
assert.deepEqual(
  savedProfiles(returned.deviceId),
  privateState(rich),
  'Returning after another account still restores only the original owner’s configuration.',
);

profiles.saveProfiles('local-device', configured);
const withLocal = { ...account, owner: paired.owner, deviceId: 'returned-with-local-a' };
profiles.prepareProfilePairing(withLocal);
profiles.completeProfilePairing(withLocal);
assert.deepEqual(savedProfiles(withLocal.deviceId), privateState(rich));
assert.deepEqual(
  savedProfiles('local-device'),
  configured,
  'Returning accounts do not consume unrelated signed-out setup.',
);
assert.equal(intent(), null);
// Existing target configuration is authoritative, even if a prior registration was remembered.
profiles.completeProfilePairing({
  ...account,
  owner: paired.owner,
  deviceId: reconnected.deviceId,
});
assert.deepEqual(savedProfiles(reconnected.deviceId), rich);
assert.throws(
  () =>
    profiles.completeProfilePairing({
      ...account,
      owner: 'owner-foreign',
      deviceId: reconnected.deviceId,
    }),
  /another account/,
);
assert.deepEqual(savedProfiles(reconnected.deviceId), rich);
assert.throws(
  () =>
    profiles.completeProfilePairing({
      ...account,
      owner: 'owner-foreign',
      deviceId: paired.deviceId,
    }),
  /another account/,
  'Old registration ownership remains bound after reconnecting.',
);

resetProfiles();
profiles.saveProfiles('legacy-scope-phone', rich);
db.prepare('INSERT INTO profile_connections (owner,device) VALUES (?,?)').run(
  paired.owner,
  'legacy-scope-phone',
);
profiles.completeProfilePairing(paired);
assert.equal(
  savedProfiles(paired.deviceId),
  null,
  'Unscoped old associations cannot recover configuration.',
);
profiles.saveProfiles('local-device', configured);
db.prepare('INSERT INTO profile_pairing (id,owner,device) VALUES (1,?,?)').run(
  paired.owner,
  paired.deviceId,
);
profiles.completeProfilePairing(paired);
assert.ok(intent(), 'Unscoped old intents cannot consume anonymous configuration.');
assert.equal(savedProfiles(paired.deviceId), null);

resetProfiles();
profiles.saveProfiles(paired.deviceId, rich);
db.prepare('INSERT INTO profile_connections (owner,device) VALUES (?,?)').run(
  paired.owner,
  paired.deviceId,
);
profiles.completeProfilePairing(paired);
assert.deepEqual(
  savedProfiles(paired.deviceId),
  rich,
  'Verified unchanged-registration startup preserves existing configuration during scope migration.',
);
assert.notEqual(
  db.prepare('SELECT scope FROM profile_connections WHERE device=?').get(paired.deviceId)?.scope,
  '',
);

resetProfiles();
profiles.saveProfiles('unbound-old-phone', rich);
profiles.completeProfilePairing(paired);
assert.equal(
  savedProfiles(paired.deviceId),
  null,
  'Legacy orphaned partitions are never guessed to belong to a signed-in account.',
);
assert.deepEqual(savedProfiles('unbound-old-phone'), rich);

for (const fault of [/INSERT OR REPLACE INTO profile_connections/, /DELETE FROM profile_pairing/]) {
  resetProfiles();
  profiles.saveProfiles(paired.deviceId, rich);
  profiles.completeProfilePairing(paired);
  profiles.saveProfiles('local-device', configured);
  profiles.prepareProfilePairing(returned);
  const rows = profileRows();
  failSql = fault;
  assert.throws(() => profiles.completeProfilePairing(returned), /Synthetic transaction fault/);
  failSql = null;
  assert.deepEqual(profileRows(), rows, 'A recovery failure rolls back the copied configuration.');
  assert.equal(
    db.prepare('SELECT device FROM profile_connections WHERE owner=?').get(paired.owner)?.device,
    paired.deviceId,
  );
  profiles.completeProfilePairing(returned);
  assert.deepEqual(savedProfiles(returned.deviceId), privateState(rich));
  assert.deepEqual(savedProfiles('local-device'), configured);
}

console.log(
  'Profile pairing: actual confirmation and restart recovery preserve configuration once; private grants, owner/device isolation, existing targets, native folder/credential handoffs and transactional failures verified.',
);
db.close();
