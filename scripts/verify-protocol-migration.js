import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { protocolMigrationSql } from '../server/protocol-migration.js';
import { canonicalServiceOrigin } from '../core/hosting.js';
import { readJSONResponse } from '../packages/support-chat/errors.js';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync('worker/identity.sql', 'utf8'));
db.exec(`INSERT INTO user VALUES('owner','Owner','owner@example.test',1,NULL,1,1);
INSERT INTO oauthResource(id,identifier,name,allowedScopes) VALUES('resource','https://myself.md/mcp','myself.md','["qr-connect"]');`);
for (const name of ['phone', 'dashboard', 'mcp']) {
  db.prepare(
    'INSERT INTO oauthClient(id,clientId,redirectUris,scopes,skipConsent,requirePKCE,disabled) VALUES(?,?,?,?,?,?,0)',
  ).run(
    name,
    `qr-${name}`,
    JSON.stringify([name === 'phone' ? 'qrconnect://oauth' : 'https://example.test/callback']),
    '["openid","qr-connect"]',
    name === 'mcp' ? 0 : 1,
    1,
  );
  db.prepare('INSERT INTO oauthClientResource(id,clientId,resourceId) VALUES(?,?,?)').run(
    name,
    `qr-${name}`,
    'https://myself.md/mcp',
  );
}
db.exec(
  `INSERT INTO oauthClient(id,clientId,redirectUris,scopes,skipConsent,requirePKCE,disabled) VALUES('dynamic','dynamic','["http://localhost/callback"]','["qr-connect"]',0,1,0);`,
);
for (let attempt = 0; attempt < 2; attempt++) {
  db.exec(protocolMigrationSql);
  for (const name of ['phone', 'dashboard', 'mcp']) {
    const row = db.prepare('SELECT * FROM oauthClient WHERE clientId=?').get(`myselfmd-${name}`);
    assert.ok(row);
    assert.equal(row.skipConsent, name === 'mcp' ? 0 : 1);
    assert.equal(row.requirePKCE, 1);
    assert.equal(row.disabled, 0);
    assert.deepEqual(JSON.parse(String(row.scopes)), ['openid', 'myselfmd']);
    if (name === 'phone') assert.equal(row.redirectUris, '["myselfmd://oauth"]');
    assert.equal(
      db.prepare('SELECT disabled FROM oauthClient WHERE clientId=?').get(`qr-${name}`)?.disabled,
      1,
    );
  }
  assert.equal(db.prepare('SELECT count(*) AS count FROM user').get()?.count, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM oauthClientResource').get()?.count, 6);
  assert.equal(
    db.prepare('SELECT skipConsent FROM oauthClient WHERE clientId=?').get('dynamic')?.skipConsent,
    0,
  );
}

const owner = 'https://qr-connect-cloud-cody.fly.dev/auth/realms/qr-connect|original-user';
const secure = new Map([
  [
    'qr-connect-session',
    JSON.stringify({
      server: 'https://myself.md',
      issuer: 'https://myself.md/auth/realms/qr-connect',
      resource: 'https://myself.md/mcp',
      accessToken: 'obsolete',
      refreshToken: 'obsolete',
      expires: Date.now() + 300000,
      deviceId: 'existing-phone',
      owner,
      account: 'Owner',
      lastActiveAt: Date.now(),
    }),
  ],
]);
let signedInOwner = owner;
const context = vm.createContext({
  canonicalServiceOrigin,
  readJSONResponse,
  URL,
  Headers,
  AbortController,
  setTimeout,
  clearTimeout,
  saveExportContext: () => {},
  recordDebug: () => {},
  debugOperation: () => 'other',
  WebBrowser: { maybeCompleteAuthSession() {} },
  SecureStore: {
    getItemAsync: async (/** @type {string} */ key) => secure.get(key) ?? null,
    setItemAsync: async (/** @type {string} */ key, /** @type {string} */ value) => {
      secure.set(key, value);
    },
    deleteItemAsync: async (/** @type {string} */ key) => {
      secure.delete(key);
    },
  },
  AuthSession: {
    ResponseType: { Code: 'code' },
    CodeChallengeMethod: { S256: 'S256' },
    AuthRequest: class {
      codeVerifier = 'fixture';
      constructor(/** @type {{redirectUri:string,scopes:string[]}} */ options) {
        assert.equal(options.redirectUri, 'myselfmd://oauth');
        assert.ok(options.scopes.includes('myselfmd'));
      }
      async promptAsync() {
        return { type: 'success', params: { code: 'fixture' } };
      }
    },
    fetchDiscoveryAsync: async () => ({}),
    exchangeCodeAsync: async () => ({
      accessToken: 'fresh',
      refreshToken: 'fresh',
      issuedAt: Date.now() / 1000,
      expiresIn: 300,
    }),
  },
  fetch: async (/** @type {string} */ url) =>
    Response.json(
      url.endsWith('/config')
        ? {
            issuer: 'https://myself.md/auth/realms/myselfmd',
            clientId: 'myselfmd-phone',
            resource: 'https://myself.md/mcp',
          }
        : { subject: signedInOwner, account: 'Owner', devices: [{ id: 'existing-phone' }] },
    ),
});
vm.runInContext(
  readFileSync('client/session.js', 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, ''),
  context,
);
const migrated = await context.loadSession();
assert.equal(migrated.owner, owner);
assert.equal(migrated.deviceId, 'existing-phone');
assert.equal(migrated.requiresSignIn, true);
assert.equal(secure.has('qr-connect-session'), false);
assert.equal(secure.has('myselfmd-session'), true);
await assert.rejects(context.api(migrated, '/api/devices'), /Sign in again/);
const renewed = await context.signIn('https://myself.md', 'github');
assert.equal(renewed.deviceId, 'existing-phone');
assert.equal(renewed.owner, owner);
// Already-renamed sessions from before the hosted storage reset must also reconnect.
vm.runInContext('currentSession = null;', context);
secure.set('myselfmd-session', JSON.stringify({ ...renewed, requiresSignIn: false }));
const resetSession = await context.loadSession();
assert.equal(resetSession.requiresSignIn, true);
assert.equal(resetSession.accessToken, '');
assert.equal(resetSession.refreshToken, '');
signedInOwner = 'https://myself.md/auth/realms/myselfmd|original-user';
assert.equal((await context.signIn('https://myself.md', 'github')).deviceId, '');
// A current canonical account retains a device only after the ownership check succeeds.
vm.runInContext('currentSession = null;', context);
secure.set(
  'myselfmd-session',
  JSON.stringify({ ...renewed, owner: signedInOwner, requiresSignIn: false }),
);
assert.equal((await context.loadSession()).requiresSignIn, false);
assert.equal((await context.signIn('https://myself.md', 'github')).deviceId, 'existing-phone');
signedInOwner = 'other-owner';
assert.equal((await context.signIn('https://myself.md', 'github')).deviceId, '');

const tasks = new Set(['qr-connect-location']);
const location = vm.createContext({
  phoneDatabase: () => ({ execSync() {}, getFirstSync: () => ({ owner }), runSync() {} }),
  TaskManager: {
    defineTask: (/** @type {string} */ task) => {
      assert.equal(task, 'myselfmd-location');
    },
  },
  Location: {
    Accuracy: { Highest: 1 },
    hasStartedLocationUpdatesAsync: async (/** @type {string} */ task) => tasks.has(task),
    stopLocationUpdatesAsync: async (/** @type {string} */ task) => {
      tasks.delete(task);
    },
    startLocationUpdatesAsync: async (/** @type {string} */ task) => {
      tasks.add(task);
    },
  },
});
vm.runInContext(
  readFileSync('client/location-task.js', 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, ''),
  location,
);
await location.migrateLocationTask();
assert.deepEqual([...tasks], ['myselfmd-location']);
await location.migrateLocationTask();
await location.stopTracking();
assert.equal(tasks.size, 0);
console.log(
  'Protocol migration: idempotent OAuth registration, preserved consent/PKCE/identity, private session migration, owned-device reuse and location-task replacement passed.',
);
