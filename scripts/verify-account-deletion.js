import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { revokeAppleToken } from '../server/apple-revocation.js';
import { parseProfile } from '../core/profiles.js';

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
db.exec(
  `CREATE TABLE records(owner TEXT); CREATE TABLE settings(owner TEXT); CREATE TABLE export_profiles(owner TEXT); CREATE TABLE profile_schedules(device TEXT); CREATE TABLE activity_history(owner TEXT,device TEXT,value TEXT);`,
);
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
/** @type {Record<string,Record<string,unknown>>} */
const mocks = {
  'expo-sqlite': sqlite,
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
assert.deepEqual(
  files,
  new Set(['file:///document/exports/phone-b/current', 'file:///external/user-owned.json']),
);
assert.deepEqual([...credentials], ['phone-b|current']);
assert.equal(nativeCleared, true);
assert.equal(db.prepare('SELECT owner FROM account_cleanup').get()?.owner, 'alice');
const finishCleanup = /** @type {{completeAccountCleanup:()=>void}} */ (module.namespace)
  .completeAccountCleanup;
finishCleanup();
assert.equal(db.prepare('SELECT 1 FROM account_cleanup').get(), undefined);
db.close();
console.log(
  'PASS account deletion boundaries: Apple revocation request/failures, local data and artifact removal, credential cleanup, retry after filesystem failure, other-account and external-file preservation.',
);
