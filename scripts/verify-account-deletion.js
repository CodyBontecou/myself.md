import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext, runInContext } from 'node:vm';
import { revokeAppleToken } from '../server/apple-revocation.js';
import { parseProfile } from '../core/profiles.js';
import { readJSONResponse } from '../packages/support-chat/errors.js';

const grant = {
  clientId: 'fixture.apple',
  clientSecret: 'fixture-secret',
  token: 'fixture-refresh',
  hint: /** @type {const} */ ('refresh_token'),
};
await revokeAppleToken(grant, async (url, options) => {
  assert.equal(url, 'https://appleid.apple.com/auth/revoke');
  assert.equal(options?.method, 'POST');
  const form = new URLSearchParams(String(options?.body));
  assert.equal(form.get('token'), grant.token);
  assert.equal(form.get('client_secret'), grant.clientSecret);
  assert.equal(form.get('token_type_hint'), 'refresh_token');
  return new Response(null, { status: 200 });
});
await assert.rejects(
  revokeAppleToken(grant, async () => new Response(null, { status: 503 })),
  /revocation could not complete/,
);
await assert.rejects(
  revokeAppleToken(grant, async () => {
    throw new Error('Offline fixture');
  }),
  /Offline fixture/,
);

const db = new DatabaseSync(':memory:');
// Existing cleanup markers predate phase support and already authorize local cleanup.
db.exec('CREATE TABLE account_cleanup(id INTEGER PRIMARY KEY,owner TEXT,device TEXT)');
db.exec(
  `CREATE TABLE records(owner TEXT); CREATE TABLE settings(owner TEXT); CREATE TABLE export_profiles(owner TEXT); CREATE TABLE profile_schedules(device TEXT); CREATE TABLE activity_history(owner TEXT,device TEXT,value TEXT);`,
);
db.exec(
  'CREATE TABLE debug_content(owner TEXT,device TEXT); CREATE TABLE debug_log(owner TEXT,device TEXT); CREATE TABLE debug_sharing(owner TEXT,device TEXT); CREATE TABLE profile_log_consent(owner TEXT,device TEXT); CREATE TABLE export_folders(owner TEXT,device TEXT)',
);
for (const table of [
  'debug_log',
  'debug_sharing',
  'debug_content',
  'profile_log_consent',
  'export_folders',
]) {
  db.prepare(`INSERT INTO ${table} VALUES(?,?)`).run('alice', 'phone-a');
  db.prepare(`INSERT INTO ${table} VALUES(?,?)`).run('bob', 'phone-b');
}
for (const table of ['records', 'settings', 'export_profiles'])
  for (const owner of ['alice', 'phone-a', 'bob', 'phone-b'])
    db.prepare(`INSERT INTO ${table} VALUES(?)`).run(owner);
for (const device of ['phone-a', 'phone-b'])
  db.prepare('INSERT INTO profile_schedules VALUES(?)').run(device);
const files = new Set([
  'file:///document/exports/phone-a/current',
  'file:///cache/exports/phone-a/current',
  'file:///document/old-file.json',
  'file:///external/user-owned.json',
  'file:///document/exports/phone-b/current',
]);
db.prepare('INSERT INTO activity_history VALUES(?,?,?)').run(
  'alice',
  'phone-a',
  JSON.stringify({
    artifacts: [
      { uri: 'file:///document/old-file.json' },
      { uri: 'file:///external/user-owned.json' },
    ],
  }),
);
db.prepare('INSERT INTO activity_history VALUES(?,?,?)').run('bob', 'phone-b', '{"artifacts":[]}');
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Fixture',
    selection: { health: [], time: [], location: [] },
    export: { folderName: 'exports' },
  }),
  id: 'current',
};
let failFile = true;
const credentials = new Set(['phone-a|current', 'phone-b|current']);
let nativeCleared = false;
class Entry {
  /** @param {...(string|{uri:string})} parts */
  constructor(...parts) {
    this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  }
  get exists() {
    return files.has(this.uri);
  }
  delete() {
    if (failFile) throw new Error('Filesystem unavailable');
    files.delete(this.uri);
  }
}
const sqlite = {
  openDatabaseSync: () => ({
    execSync: (/** @type {string} */ sql) => db.exec(sql),
    getFirstSync: (
      /** @type {string} */ sql,
      /** @type {import('node:sqlite').SQLInputValue[]} */ ...values
    ) => db.prepare(sql).get(...values) ?? null,
    getAllSync: (
      /** @type {string} */ sql,
      /** @type {import('node:sqlite').SQLInputValue[]} */ ...values
    ) => db.prepare(sql).all(...values),
    runSync: (
      /** @type {string} */ sql,
      /** @type {import('node:sqlite').SQLInputValue[]} */ ...values
    ) => db.prepare(sql).run(...values),
    withTransactionSync: (/** @type {()=>void} */ action) => {
      db.exec('BEGIN');
      try {
        action();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  }),
};
const forgottenWhoop = /** @type {string[]} */ ([]);
/** @type {Record<string,Record<string,unknown>>} */
const mocks = {
  './whoop.js': {
    forgetWhoop: async (/** @type {string} */ owner) => {
      forgottenWhoop.push(owner);
    },
  },
  './phone-database.js': { phoneDatabase: sqlite.openDatabaseSync },
  'expo-file-system': {
    Directory: Entry,
    File: Entry,
    Paths: { document: { uri: 'file:///document' }, cache: { uri: 'file:///cache' } },
  },
  './profiles.js': { loadProfiles: () => ({ profiles: [profile] }) },
  './billing.js': {
    clearAccountAllowance: () => {},
    clearNativePurchase: async () => {
      nativeCleared = true;
    },
  },
  './destinations.js': {
    forgetDestinationCredentials: async (
      /** @type {string} */ device,
      /** @type {string} */ id,
    ) => {
      credentials.delete(`${device}|${id}`);
    },
  },
};
const module = new SourceTextModule(
  await readFile(new URL('../client/account-deletion.js', import.meta.url), 'utf8'),
);
await module.link((name) => {
  const values = mocks[name];
  assert.ok(values);
  return new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  });
});
await module.evaluate();
const cleanup =
  /** @type {{deleteLocalAccount:(session:{owner:string,deviceId:string})=>Promise<void>}} */ (
    module.namespace
  ).deleteLocalAccount;
const session = {
  server: 'https://fixture.test',
  issuer: '',
  resource: '',
  accessToken: '',
  refreshToken: '',
  expires: 0,
  owner: 'alice',
  account: 'Alice',
  deviceId: 'phone-a',
};
await assert.rejects(cleanup(session), /Filesystem unavailable/);
assert.equal(db.prepare("SELECT count(*) n FROM records WHERE owner='alice'").get()?.n, 1);
assert.equal(db.prepare('SELECT owner FROM account_cleanup').get()?.owner, 'alice');
failFile = false;
await cleanup(session);
await cleanup(session);
assert.equal(
  db.prepare("SELECT count(*) n FROM records WHERE owner='alice' OR owner='phone-a'").get()?.n,
  0,
);
assert.equal(db.prepare("SELECT count(*) n FROM records WHERE owner='bob'").get()?.n, 1);
assert.equal(db.prepare("SELECT count(*) n FROM activity_history WHERE owner='alice'").get()?.n, 0);
assert.equal(db.prepare("SELECT count(*) n FROM activity_history WHERE owner='bob'").get()?.n, 1);
for (const table of [
  'debug_log',
  'debug_sharing',
  'debug_content',
  'profile_log_consent',
  'export_folders',
]) {
  assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE owner='alice'`).get()?.n, 0);
  assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE owner='bob'`).get()?.n, 1);
}
assert.deepEqual(
  files,
  new Set(['file:///document/exports/phone-b/current', 'file:///external/user-owned.json']),
);
assert.deepEqual([...credentials], ['phone-b|current']);
assert.equal(nativeCleared, true);
assert.ok(
  forgottenWhoop.includes(session.owner),
  'Account deletion erases account-scoped WHOOP credentials',
);
assert.equal(db.prepare('SELECT owner FROM account_cleanup').get()?.owner, 'alice');
const finishCleanup = /** @type {{completeAccountCleanup:()=>void}} */ (module.namespace)
  .completeAccountCleanup;
finishCleanup();
assert.equal(db.prepare('SELECT 1 FROM account_cleanup').get(), undefined);
/** @typedef {{owner:string,deviceId:string}} AccountOwner */
/** @typedef {{state:import('../core/account-deletion.js').DeletionState,subject:string,notice:string,error:null}} Status */
const deletion = /** @type {{
  finishAccountDeletion:(owner:AccountOwner,operations:{request:(method:'GET'|'DELETE')=>Promise<Status>,stop:()=>Promise<void>,clear:()=>Promise<void>})=>Promise<Status|null>,
  pendingAccountCleanup:()=>({owner:string,deviceId:string,phase:string}|null),
  completeAccountCleanup:()=>void
}} */ (module.namespace);
const contextModule = new SourceTextModule(
  await readFile(new URL('../client/export-context.js', import.meta.url), 'utf8'),
);
await contextModule.link(
  () =>
    new SyntheticModule(['phoneDatabase'], function () {
      this.setExport('phoneDatabase', sqlite.openDatabaseSync);
    }),
);
await contextModule.evaluate();
const exportContext =
  /** @type {{saveExportContext:(owner:AccountOwner|null)=>void,loadExportContext:()=>AccountOwner|null}} */ (
    contextModule.namespace
  );
const status = (/** @type {import('../core/account-deletion.js').DeletionState} */ state) => ({
  state,
  subject: session.owner,
  notice: 'Fixture',
  error: null,
});
const first = () => db.prepare("SELECT count(*) n FROM records WHERE owner='alice'").get()?.n;
const seed = () => db.prepare('INSERT INTO records(owner) VALUES(?)').run('alice');
const reject = () =>
  Object.assign(new Error('Owner request rejected'), { name: 'HTTPError', status: 403 });
let cleared = 0;
seed();
exportContext.saveExportContext(session);
await assert.rejects(
  deletion.finishAccountDeletion(session, {
    stop: async () => {
      assert.equal(deletion.pendingAccountCleanup()?.phase, 'uncertain');
      // A session/refresh completion arriving after the intent cannot restore exports.
      assert.equal(exportContext.loadExportContext(), null);
      exportContext.saveExportContext(session);
      assert.equal(exportContext.loadExportContext(), null);
    },
    request: async (method) => {
      assert.equal(method, 'DELETE');
      throw new Error('Response lost after remote deletion');
    },
    clear: async () => {
      cleared++;
    },
  }),
  /Response lost/,
);
assert.equal(first(), 1);
assert.equal(cleared, 0);
assert.equal(deletion.pendingAccountCleanup()?.phase, 'uncertain');
await assert.rejects(
  deletion.finishAccountDeletion(session, {
    stop: async () => {},
    request: async () => {
      throw Object.assign(new Error('Credentials expired after uncertain deletion'), {
        name: 'HTTPError',
        status: 401,
      });
    },
    clear: async () => assert.fail('An uncertain earlier request is not a cleanup confirmation.'),
  }),
  /Credentials expired/,
);
assert.equal(deletion.pendingAccountCleanup()?.phase, 'uncertain');
assert.equal(first(), 1);
await assert.rejects(
  deletion.finishAccountDeletion(
    { ...session, owner: 'bob' },
    {
      stop: async () => assert.fail('Another account cannot resume the intent.'),
      request: async () => assert.fail('Another account cannot send a request.'),
      clear: async () => assert.fail('Another account cannot erase local data.'),
    },
  ),
  /pending account deletion/,
);
// Reload the actual helper against the same durable database, as after a cold start.
const restarted = new SourceTextModule(
  await readFile(new URL('../client/account-deletion.js', import.meta.url), 'utf8'),
);
await restarted.link((name) => {
  const values = mocks[name];
  assert.ok(values);
  return new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  });
});
await restarted.evaluate();
const recovery = /** @type {typeof deletion} */ (restarted.namespace);
assert.equal(recovery.pendingAccountCleanup()?.phase, 'uncertain');
assert.equal(exportContext.loadExportContext(), null);
const recovered = await recovery.finishAccountDeletion(session, {
  stop: async () => {},
  request: async (method) => {
    assert.equal(method, 'GET');
    return status('completed');
  },
  clear: async () => {
    cleared++;
  },
});
assert.equal(recovered?.state, 'completed');
assert.equal(first(), 0);
assert.equal(cleared, 1);
assert.equal(deletion.pendingAccountCleanup(), null);
seed();
await assert.rejects(
  deletion.finishAccountDeletion(session, {
    stop: async () => {},
    request: async () => {
      throw reject();
    },
    clear: async () => assert.fail('Explicit rejection must preserve the local account.'),
  }),
  /rejected/,
);
assert.equal(deletion.pendingAccountCleanup(), null);
assert.equal(first(), 1);
exportContext.saveExportContext(session);
assert.deepEqual(exportContext.loadExportContext(), {
  owner: session.owner,
  deviceId: session.deviceId,
});
await assert.rejects(
  deletion.finishAccountDeletion(session, {
    stop: async () => {},
    request: async () => status('active'),
    clear: async () => assert.fail('An active response is not deletion acceptance.'),
  }),
  /could not start/,
);
assert.equal(deletion.pendingAccountCleanup(), null);
assert.equal(first(), 1);
await assert.rejects(
  deletion.finishAccountDeletion(session, {
    stop: async () => {
      throw new Error('Stop failed');
    },
    request: async () => assert.fail('Do not request deletion until recording/exports stop.'),
    clear: async () => assert.fail('Stopping failed before remote confirmation.'),
  }),
  /Stop failed/,
);
assert.equal(deletion.pendingAccountCleanup()?.phase, 'uncertain');
/** @type {string[]} */
const methods = [];
await assert.rejects(
  deletion.finishAccountDeletion(session, {
    stop: async () => {},
    request: async (method) => {
      methods.push(method);
      return status(method === 'GET' ? 'active' : 'running');
    },
    clear: async () => {
      throw new Error('SecureStore unavailable');
    },
  }),
  /SecureStore unavailable/,
);
assert.deepEqual(methods, ['GET', 'DELETE']);
assert.equal(deletion.pendingAccountCleanup()?.phase, 'confirmed');
assert.equal(first(), 0);
await deletion.finishAccountDeletion(session, {
  stop: async () => {},
  request: async () => assert.fail('Confirmed cleanup must work after authentication expires.'),
  clear: async () => {
    cleared++;
  },
});
assert.equal(deletion.pendingAccountCleanup(), null);

// Drive the real provider delegate and startup callback, keeping native APIs synthetic.
const provider = await readFile(new URL('../client/PhoneProvider.js', import.meta.url), 'utf8');
const delegate = provider.match(
  /async function finishDeletion\(owner, current\) \{([\s\S]*?)\n  }\n  const connected/,
);
const startup = provider.match(/\.then\((async \(loaded\) => \{[\s\S]*?)\n      \}\)/);
assert.ok(delegate);
assert.ok(startup);
/** @type {string[]} */
const calls = [];
let blocked = false;
let transportLost = true;
const boundary = createContext({
  ...deletion,
  ...exportContext,
  readJSONResponse,
  setDeletionPending: (/** @type {boolean} */ value) => {
    blocked = value;
  },
  setDeletionStatusUrl: () => {},
  setAccountRevision: () => {},
  clearAccountAllowance: () => {},
  reset: () => {},
  setSession: (/** @type {unknown} */ value) => {
    calls.push(value ? 'session' : 'cleared');
  },
  stopAccountExports: async () => {
    calls.push('exports');
  },
  stopTracking: async () => {
    calls.push('tracking');
  },
  api: async () => {
    calls.push('delete');
    if (transportLost) throw new Error('Lost provider response');
    return status('running');
  },
  clearSession: async () => {
    calls.push('secure-clear');
  },
  fetch: async () => {
    calls.push('status');
    return Response.json(status('completed'));
  },
  AbortController,
  setTimeout,
  clearTimeout,
  completeProfilePairing: () => assert.fail('Pending deletion cannot adopt profiles.'),
  migrateLocationTask: () => assert.fail('Pending deletion cannot resume recording.'),
});
runInContext(`async function finishDeletion(owner,current) {${delegate[1]}\n}`, boundary);
boundary.session = session;
seed();
await assert.rejects(
  runInContext('finishDeletion(session,session)', boundary),
  /Lost provider response/,
);
assert.equal(blocked, true);
assert.equal(first(), 1);
assert.deepEqual(calls, ['exports', 'tracking', 'delete']);
transportLost = false;
await runInContext(`(${startup[1]}\n})(session)`, boundary);
assert.equal(first(), 0);
assert.equal(blocked, false);
assert.deepEqual(calls, [
  'exports',
  'tracking',
  'delete',
  'session',
  'exports',
  'tracking',
  'status',
  'secure-clear',
  'cleared',
]);
assert.equal(exportContext.loadExportContext(), null);
const reauthenticate = provider.match(
  /reauthenticateDeletion: async \(provider\) => \{([\s\S]*?)\n    \},\n    run,/,
);
assert.ok(reauthenticate);
runInContext(`async function reauthenticateDeletion(provider) {${reauthenticate[1]}\n}`, boundary);
seed();
await assert.rejects(
  deletion.finishAccountDeletion(session, {
    stop: async () => {
      throw new Error('Keep an uncertain request for reauthentication.');
    },
    request: async () => assert.fail('Stopping failed before the request.'),
    clear: async () => assert.fail('Keep local data while uncertain.'),
  }),
  /uncertain request/,
);
let savedSession = session;
boundary.saveSession = async () =>
  assert.fail('Cancelled or wrong-owner sign-in cannot replace credentials.');
boundary.signIn = async () => {
  throw new Error('Sign-in cancelled');
};
await assert.rejects(runInContext("reauthenticateDeletion('apple')", boundary), /cancelled/);
assert.equal(deletion.pendingAccountCleanup()?.phase, 'uncertain');
assert.equal(savedSession, session);
assert.equal(first(), 1);
boundary.signIn = async () => ({ ...session, owner: 'bob' });
await assert.rejects(runInContext("reauthenticateDeletion('apple')", boundary), /did not match/);
assert.equal(deletion.pendingAccountCleanup()?.phase, 'uncertain');
assert.equal(savedSession, session);
assert.equal(first(), 1);
boundary.signIn = async () => ({
  ...session,
  deviceId: '',
  accessToken: 'synthetic-new-owner-token',
});
boundary.saveSession = async () => {
  throw new Error('Secure session save failed');
};
await assert.rejects(runInContext("reauthenticateDeletion('apple')", boundary), /save failed/);
assert.equal(deletion.pendingAccountCleanup()?.phase, 'uncertain');
assert.equal(savedSession, session);
assert.equal(first(), 1);
boundary.saveSession = async (/** @type {typeof session} */ next) => {
  assert.equal(next.owner, session.owner);
  assert.equal(next.deviceId, session.deviceId);
  savedSession = next;
};
boundary.fetch = async () => Response.json(status('active'));
boundary.api = async (/** @type {typeof session} */ current) => {
  assert.equal(current, savedSession);
  assert.equal(current.accessToken, 'synthetic-new-owner-token');
  return status('running');
};
await runInContext("reauthenticateDeletion('apple')", boundary);
assert.equal(deletion.pendingAccountCleanup(), null);
assert.equal(first(), 0);
const deletionAction = provider.match(
  /deleteAccount: async \(\) => \{([\s\S]*?)\n    \},\n    \/\*\* @param/,
);
const runAction = provider.match(
  /async function run\(action\) \{([\s\S]*?)\n  }\n  function reset/,
);
assert.ok(deletionAction);
assert.ok(runAction);
/** @type {{title:string,message:string,buttons:{text:string,onPress?:()=>void}[]}} */
let deletionAlert = { title: '', message: '', buttons: [] };
let displayError = '';
let opened = '';
const receiptUrl = `${session.server}/delete-account?receipt=${'a'.repeat(43)}`;
let alertResult = {
  ...status('failed'),
  statusUrl: receiptUrl,
  error: 'Storage cleanup retries automatically.',
};
boundary.finishDeletion = async () => alertResult;
boundary.Alert = {
  alert: (
    /** @type {string} */ title,
    /** @type {string} */ message,
    /** @type {typeof deletionAlert.buttons} */ buttons,
  ) => {
    deletionAlert = { title, message, buttons };
  },
};
boundary.Linking = {
  openURL: async (/** @type {string} */ url) => {
    opened = url;
  },
};
boundary.URL = URL;
boundary.errorMessage = String;
boundary.setBusy = () => {};
boundary.setError = (/** @type {string} */ value) => {
  displayError = value;
};
runInContext(`async function run(action) {${runAction[1]}\n}`, boundary);
let handoff = Promise.resolve();
const handle = boundary.run;
boundary.run = (/** @type {()=>Promise<void>} */ action) => {
  handoff = handle(action);
  return handoff;
};
runInContext(`async function deleteAccount() {${deletionAction[1]}\n}`, boundary);
await runInContext('deleteAccount()', boundary);
assert.equal(deletionAlert.title, 'Account deletion started');
assert.equal(deletionAlert.buttons[0]?.text, 'Done');
deletionAlert.buttons.find((button) => button.text === 'Check deletion status')?.onPress?.();
await handoff;
assert.equal(opened, receiptUrl);
assert.equal(displayError, '');
assert.equal(alertResult.state, 'failed', 'Opening a receipt does not complete cloud deletion.');
opened = '';
boundary.Linking.openURL = async () => {
  throw new Error('Browser handoff failed');
};
deletionAlert.buttons.find((button) => button.text === 'Check deletion status')?.onPress?.();
await handoff;
assert.match(displayError, /Browser handoff failed/);
assert.equal(opened, '');
alertResult = {
  ...alertResult,
  statusUrl: `https://other.example/delete-account?receipt=${'a'.repeat(43)}`,
};
await runInContext('deleteAccount()', boundary);
deletionAlert.buttons.find((button) => button.text === 'Check deletion status')?.onPress?.();
await handoff;
assert.match(displayError, /status link is invalid/);
boundary.finishDeletion = async () => null;
await runInContext('deleteAccount()', boundary);
assert.equal(deletionAlert.title, 'Phone cleanup complete');
assert.deepEqual(
  Array.from(deletionAlert.buttons, (button) => button.text),
  ['Done'],
);
db.close();
console.log(
  'PASS account deletion boundaries: Apple revocation, durable uncertain intent and restart recovery, late export-context denial, rejection/ownership preservation, confirmed cleanup after credential expiry, actual provider/startup ordering, local data/artifact/credential cleanup and external-file/other-account preservation.',
);
