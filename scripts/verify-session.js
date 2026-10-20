import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readJSONResponse } from '../packages/support-chat/errors.js';
import { canonicalServiceOrigin } from '../core/hosting.js';
import { CloudStore } from '../server/cloud-store.js';
import { parseProfile } from '../core/profiles.js';

const day = 86400000;
let now = Date.now(),
  storage = '',
  refreshes = 0;
class Clock extends Date {
  static now() {
    return now;
  }
}
const context = vm.createContext({
  canonicalServiceOrigin,
  readJSONResponse,
  Headers,
  recordDebug: () => {},
  debugOperation: () => 'other',
  Date: Clock,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  saveExportContext: () => {},
  WebBrowser: { maybeCompleteAuthSession() {} },
  SecureStore: {
    getItemAsync: async () => storage || null,
    deleteItemAsync: async () => {
      storage = '';
    },
    /** @param {string} _key @param {string} value */
    setItemAsync: async (_key, value) => {
      storage = value;
    },
  },
  AuthSession: {
    fetchDiscoveryAsync: async () => ({}),
    refreshAsync: async () => {
      refreshes++;
      await new Promise((resolve) => setImmediate(resolve));
      return {
        accessToken: 'fresh',
        refreshToken: 'rotated',
        issuedAt: now / 1000,
        expiresIn: 300,
      };
    },
  },
  fetch: async () => Response.json({}),
});
vm.runInContext(
  readFileSync('client/session.js', 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, ''),
  context,
);
const session = {
  server: 'https://example.test',
  issuer: 'https://example.test/auth',
  resource: 'https://example.test/mcp',
  expires: 0,
  refreshToken: 'fixture',
  accessToken: 'old',
  deviceId: 'phone',
  owner: 'owner',
  account: 'owner',
  lastActiveAt: now,
};
const peer = { ...session };
await Promise.all([context.api(session, '/api/devices'), context.api(peer, '/api/devices')]);
assert.equal(refreshes, 1, 'Concurrent copies of the persisted session must share token rotation');
assert.equal(peer.refreshToken, 'rotated');
assert.equal(session.accessToken, 'fresh');
const loaded = await Promise.all([context.loadSession(), context.loadSession()]);
assert.equal(loaded[0], loaded[1], 'Foreground and billing loads share the rotating session');
await context.resumeSession(loaded[0]);
assert.equal((await context.loadSession()).refreshToken, 'rotated');
now += 364 * day;
assert.equal(await context.resumeSession(session), true);
now += 364 * day;
assert.equal(
  await context.resumeSession(session),
  true,
  'Active use survives more than one year since login',
);
const beforeBackground = session.lastActiveAt;
await context.api(session, '/api/devices');
assert.equal(
  session.lastActiveAt,
  beforeBackground,
  'Background API use must not extend foreground activity',
);
now += 365 * day;
await assert.rejects(context.api(session, '/api/devices'), /365 days of inactivity/);
assert.equal(await context.resumeSession(session), false);
assert.equal(storage, '');
await assert.rejects(context.saveSession(session), /signed out/);
storage = JSON.stringify({ ...peer, lastActiveAt: now - 365 * day });
assert.equal(await context.loadSession(), null);
assert.equal(storage, '');
storage = JSON.stringify({ ...peer, lastActiveAt: undefined });
assert.equal(
  (await context.loadSession()).lastActiveAt,
  now,
  'Upgrade starts a window for legacy sessions',
);

// Exercise delivery using an actual cloud validation error, without native I/O.
const cloud = new CloudStore(':memory:', new Uint8Array(32));
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Default',
    selection: { health: ['native:steps'], time: [], location: [] },
    export: { destination: 'cloud' },
  }),
  id: 'profile',
};
let status = 400,
  detail = '';
try {
  cloud.begin('owner', 'phone', profile.id, {
    profile,
    day: '2026-10-08',
    format: 'json',
    manifest: { profileId: 'wrong' },
  });
} catch (error) {
  detail = error instanceof Error ? error.message : '';
}
assert.equal(detail, 'Manifest profile does not match upload.');
context.SecureStore.getItemAsync = async () =>
  JSON.stringify({ server: 'https://example.test', token: 'fixture' });
context.loadProfiles = () => ({ profiles: [profile] });
let renewals = 0;
/** @param {string} url @param {{body:string}} options */
context.fetch = async (url, options) => {
  if (url.endsWith('/api/cloud/credential/renew')) {
    renewals++;
    assert.equal(JSON.parse(options.body).expiresAt, now + 365 * day);
    return Response.json({ expiresAt: now + 365 * day });
  }
  return Response.json({ error: detail }, { status });
};
vm.runInContext(
  readFileSync('client/destinations.js', 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, ''),
  context,
);
await assert.rejects(
  context.deliverExport(
    { deviceId: 'phone', owner: 'owner' },
    profile,
    { size: 1 },
    'json',
    { interval: { day: '2026-10-08' } },
    () => true,
  ),
  (error) => String(error).includes(detail) && !String(error).includes('Reauthorize'),
);
status = 401;
detail = 'Upload authorization expired.';
await assert.rejects(
  context.deliverExport(
    { deviceId: 'phone', owner: 'owner' },
    profile,
    { size: 1 },
    'json',
    { interval: { day: '2026-10-08' } },
    () => true,
  ),
  /Sign in again to resume cloud uploads/,
);
await context.renewCloudAuthorizations(await context.loadSession());
assert.equal(renewals, 3, 'Delivery and foreground activity silently renew existing approvals');
const countBeforeExpiry = renewals;
now += 365 * day;
await assert.rejects(
  context.deliverExport(
    { deviceId: 'phone', owner: 'owner' },
    profile,
    { size: 1 },
    'json',
    { interval: { day: '2026-10-08' } },
    () => true,
  ),
  /Sign in again/,
);
assert.equal(renewals, countBeforeExpiry, 'Expired login must not renew cloud approval');
cloud.db.close();
console.log(
  'Session: shared rotation, rolling foreground inactivity, background isolation, legacy upgrade, expiry and actionable upload errors passed.',
);

/** @returns {{promise:Promise<void>,resolve:()=>void}} */
function deferred() {
  const pending = { resolve() {} };
  /** @type {Promise<void>} */
  const promise = new Promise((done) => {
    pending.resolve = done;
  });
  return { promise, resolve: () => pending.resolve() };
}
/** @param {Partial<typeof session>} [changes] */
function connection(changes = {}) {
  return { ...session, expires: Date.now() + 300000, lastActiveAt: Date.now(), ...changes };
}
function isolatedSession() {
  let value = '';
  /** @type {{owner:string,deviceId:string}|null} */
  let exportContext = null;
  const isolated = vm.createContext({
    canonicalServiceOrigin,
    readJSONResponse,
    Headers,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    recordDebug: () => {},
    debugOperation: () => 'other',
    saveExportContext: (/** @type {{owner:string,deviceId:string}|null} */ next) => {
      exportContext = next;
    },
    WebBrowser: { maybeCompleteAuthSession() {} },
    SecureStore: {
      getItemAsync: async () => value || null,
      deleteItemAsync: async () => {
        value = '';
      },
      setItemAsync: async (/** @type {string} */ _key, /** @type {string} */ next) => {
        value = next;
      },
    },
    AuthSession: {
      fetchDiscoveryAsync: async () => ({}),
      refreshAsync: async () => ({
        accessToken: 'fresh',
        refreshToken: 'rotated',
        issuedAt: Date.now() / 1000,
        expiresIn: 300,
      }),
    },
    fetch: async () => Response.json({}),
  });
  vm.runInContext(
    readFileSync('client/session.js', 'utf8')
      .replace(/^import .*;\n/gm, '')
      .replace(/^export /gm, ''),
    isolated,
  );
  return {
    context: isolated,
    stored: () => (value ? JSON.parse(value) : null),
    exportContext: () => exportContext,
  };
}

// The native write is deliberately held while an earlier React session object is still active.
await Promise.all(
  [false, true].map(async (oldFirst) => {
    const fixture = isolatedSession();
    const previous = connection({ deviceId: '' });
    await fixture.context.saveSession(previous);
    const paired = { ...previous, deviceId: 'paired-phone' };
    const write = fixture.context.SecureStore.setItemAsync;
    const gate = deferred(),
      started = deferred();
    let held = false;
    fixture.context.SecureStore.setItemAsync = async (
      /** @type {string} */ name,
      /** @type {string} */ value,
    ) => {
      if (!held) {
        held = true;
        started.resolve();
        await gate.promise;
      }
      await write(name, value);
    };
    const first = oldFirst
      ? fixture.context.resumeSession(previous)
      : fixture.context.saveSession(paired, previous);
    await started.promise;
    const second = oldFirst
      ? fixture.context.saveSession(paired, previous)
      : fixture.context.resumeSession(previous);
    const outcomes = Promise.allSettled([first, second]);
    gate.resolve();
    const result = await outcomes;
    assert.equal(result[oldFirst ? 1 : 0]?.status, 'fulfilled');
    assert.equal((await fixture.context.loadSession()).deviceId, 'paired-phone');
    assert.equal(fixture.stored().deviceId, 'paired-phone');
    assert.equal(fixture.exportContext()?.deviceId, 'paired-phone');
  }),
);

// A rotation already sent to the provider belongs to pairing's previous OAuth lineage.
{
  const fixture = isolatedSession();
  const previous = connection({ deviceId: '', expires: 0 });
  await fixture.context.saveSession(previous);
  const gate = deferred(),
    started = deferred();
  fixture.context.AuthSession.refreshAsync = async () => {
    started.resolve();
    await gate.promise;
    return {
      accessToken: 'paired-fresh',
      refreshToken: 'paired-rotated',
      issuedAt: Date.now() / 1000,
      expiresIn: 300,
    };
  };
  const refresh = fixture.context.api(previous, '/api/devices');
  await started.promise;
  const paired = { ...previous, deviceId: 'paired-phone' };
  const replacing = fixture.context.saveSession(paired, previous);
  const outcomes = Promise.allSettled([refresh, replacing]);
  gate.resolve();
  assert.equal((await outcomes)[1]?.status, 'fulfilled');
  assert.equal(fixture.stored().deviceId, 'paired-phone');
  assert.equal(fixture.stored().refreshToken, 'paired-rotated');
  assert.equal((await fixture.context.loadSession()).accessToken, 'paired-fresh');
}

// Clear cannot be overtaken by a pending old write, and a stale clear cannot delete a new sign-in.
{
  const fixture = isolatedSession();
  const previous = connection();
  await fixture.context.saveSession(previous);
  const write = fixture.context.SecureStore.setItemAsync;
  const gate = deferred(),
    started = deferred();
  let held = false;
  fixture.context.SecureStore.setItemAsync = async (
    /** @type {string} */ name,
    /** @type {string} */ value,
  ) => {
    if (!held) {
      held = true;
      started.resolve();
      await gate.promise;
    }
    await write(name, value);
  };
  const oldWrite = fixture.context.resumeSession(previous);
  await started.promise;
  const clearing = fixture.context.clearSession(previous);
  const next = connection({
    owner: 'next-owner',
    deviceId: 'next-phone',
    server: 'https://next.example.test',
  });
  const replacing = fixture.context.saveSession(next);
  const outcomes = Promise.allSettled([oldWrite, clearing, replacing]);
  gate.resolve();
  const result = await outcomes;
  assert.equal(result[0]?.status, 'rejected');
  assert.equal(result[1]?.status, 'fulfilled');
  assert.equal(result[2]?.status, 'fulfilled');
  await fixture.context.clearSession(previous);
  assert.equal(fixture.stored().owner, 'next-owner');
  assert.equal((await fixture.context.loadSession()).deviceId, 'next-phone');
}

// A failed replacement keeps the prior saved session usable and does not poison the queue.
{
  const fixture = isolatedSession();
  const previous = connection();
  await fixture.context.saveSession(previous);
  const write = fixture.context.SecureStore.setItemAsync;
  fixture.context.SecureStore.setItemAsync = async () => {
    throw new Error('Synthetic secure failure');
  };
  await assert.rejects(
    fixture.context.saveSession(connection({ deviceId: 'failed-phone' }), previous),
    /secure failure/,
  );
  assert.equal((await fixture.context.loadSession()).deviceId, previous.deviceId);
  assert.equal(fixture.stored().deviceId, previous.deviceId);
  fixture.context.SecureStore.setItemAsync = write;
  await fixture.context.resumeSession(previous);
  await fixture.context.saveSession(connection({ owner: 'next-owner', deviceId: 'next-phone' }));
  assert.equal(fixture.stored().deviceId, 'next-phone');
}

// A late foreground effect result must not clear or renew the replacement session.
{
  const source = readFileSync('client/PhoneProvider.js', 'utf8');
  const effect = source.match(
    /useEffect\(\(\) => \{\n    if \(!session \|\| deletionPending\) return;\n    let observing[\s\S]*?\n  \}, \[session, deletionPending\]\);/,
  )?.[0];
  assert.ok(effect, 'Exercise the real foreground session effect.');
  const gate = deferred();
  let changes = 0,
    foregroundRenewals = 0;
  const lifecycle = { cleanup() {} };
  const foreground = vm.createContext({
    session: connection(),
    deletionPending: false,
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    useEffect: (/** @type {()=>()=>void} */ action) => {
      lifecycle.cleanup = action();
    },
    resumeSession: async () => {
      await gate.promise;
      return false;
    },
    cancelExports: () => {
      changes++;
    },
    clearAccountAllowance: () => {
      changes++;
    },
    setSession: () => {
      changes++;
    },
    setError: () => {
      changes++;
    },
    errorMessage: String,
    renewCloudAuthorizations: () => {
      foregroundRenewals++;
    },
    setInterval: () => 1,
    clearInterval: () => {},
  });
  vm.runInContext(effect, foreground);
  lifecycle.cleanup();
  gate.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(changes, 0);
  assert.equal(foregroundRenewals, 0);
  foreground.deletionPending = true;
  foreground.resumeSession = () => assert.fail('Deletion recovery cannot renew normal activity.');
  vm.runInContext(effect, foreground);
}
// A failed pairing write must retain a refresh token already consumed by the provider.
{
  const fixture = isolatedSession();
  const previous = connection({ deviceId: '', expires: 0 });
  await fixture.context.saveSession(previous);
  const gate = deferred(),
    started = deferred();
  fixture.context.AuthSession.refreshAsync = async () => {
    started.resolve();
    await gate.promise;
    return {
      accessToken: 'rollback-fresh',
      refreshToken: 'rollback-rotated',
      issuedAt: Date.now() / 1000,
      expiresIn: 300,
    };
  };
  const refresh = fixture.context.api(previous, '/api/devices');
  await started.promise;
  const write = fixture.context.SecureStore.setItemAsync;
  let failedWrite = false;
  fixture.context.SecureStore.setItemAsync = async (
    /** @type {string} */ name,
    /** @type {string} */ value,
  ) => {
    if (!failedWrite) {
      failedWrite = true;
      throw new Error('Synthetic paired secure failure');
    }
    await write(name, value);
  };
  const replacing = fixture.context.saveSession(
    { ...previous, deviceId: 'failed-phone' },
    previous,
  );
  const outcomes = Promise.allSettled([refresh, replacing]);
  gate.resolve();
  assert.equal((await outcomes)[1]?.status, 'rejected');
  assert.equal((await fixture.context.loadSession()).deviceId, '');
  assert.equal((await fixture.context.loadSession()).refreshToken, 'rollback-rotated');
  assert.equal(
    fixture.stored().refreshToken,
    'rollback-rotated',
    'Recovered native storage must retain the rotated rollback credentials.',
  );
  assert.equal(fixture.stored().deviceId, '');
  fixture.context.SecureStore.setItemAsync = write;
  await fixture.context.resumeSession(previous);
  assert.equal(fixture.stored().refreshToken, 'rollback-rotated');
}

// A new OAuth token family must not inherit an older account session's late rotation.
{
  const fixture = isolatedSession();
  const previous = connection({ expires: 0 });
  await fixture.context.saveSession(previous);
  const gate = deferred(),
    started = deferred();
  fixture.context.AuthSession.refreshAsync = async () => {
    started.resolve();
    await gate.promise;
    return {
      accessToken: 'retired-fresh',
      refreshToken: 'retired-rotated',
      issuedAt: Date.now() / 1000,
      expiresIn: 300,
    };
  };
  const oldRefresh = fixture.context.api(previous, '/api/devices').then(
    () => 'saved',
    () => 'rejected',
  );
  await started.promise;
  const next = connection({ accessToken: 'new-login', refreshToken: 'new-login-refresh' });
  await fixture.context.saveSession(next);
  gate.resolve();
  assert.equal(await oldRefresh, 'rejected');
  assert.equal(fixture.stored().accessToken, 'new-login');
  assert.equal(fixture.stored().refreshToken, 'new-login-refresh');
}

// Initial native reads may resolve after sign-out and a new sign-in; they cannot publish the old owner.
{
  const fixture = isolatedSession();
  const previous = connection();
  const gate = deferred(),
    started = deferred();
  fixture.context.SecureStore.getItemAsync = async () => {
    started.resolve();
    await gate.promise;
    return JSON.stringify(previous);
  };
  const loading = fixture.context.loadSession();
  await started.promise;
  await fixture.context.clearSession();
  await fixture.context.saveSession(
    connection({ owner: 'loaded-next-owner', deviceId: 'loaded-next-phone' }),
  );
  gate.resolve();
  assert.equal((await loading).owner, 'loaded-next-owner');
  assert.equal(fixture.exportContext()?.deviceId, 'loaded-next-phone');
}

console.log(
  'Session replacement: both write orders, paired token rotation, clear/new-owner isolation, secure failure recovery and stale foreground effect passed.',
);

// A response that outlives local account cleanup cannot recreate erased diagnostics.
await Promise.all(
  [false, true].map(async (failed) => {
    const fixture = isolatedSession();
    const previous = connection();
    await fixture.context.saveSession(previous);
    const gate = deferred(),
      started = deferred();
    let diagnostics = 0;
    fixture.context.recordDebug = () => {
      diagnostics++;
    };
    await fixture.context.api(previous, '/api/active-response');
    assert.equal(diagnostics, 1, 'Active-account diagnostics remain enabled');
    diagnostics = 0;
    fixture.context.fetch = async (/** @type {string} */ url) => {
      if (url.endsWith('/api/late-response')) {
        started.resolve();
        await gate.promise;
        return Response.json(failed ? { error: 'Synthetic delayed failure' } : { ok: true }, {
          status: failed ? 503 : 200,
        });
      }
      return Response.json({});
    };
    const response = fixture.context.api(previous, '/api/late-response').catch(() => undefined);
    await started.promise;
    await fixture.context.clearSession(previous);
    gate.resolve();
    await response;
    assert.equal(diagnostics, 0, 'Retired account responses must not restore erased diagnostics');
  }),
);

// A failed native credential erase must remain retryable without retiring a newer login.
await Promise.all(
  ['myselfmd-session', 'qr-connect-session'].map(async (failedKey) => {
    const fixture = isolatedSession();
    const previous = connection();
    await fixture.context.saveSession(previous);
    const remove = fixture.context.SecureStore.deleteItemAsync;
    let fail = true,
      legacyPresent = true,
      attempts = 0;
    fixture.context.SecureStore.deleteItemAsync = async (/** @type {string} */ key) => {
      attempts++;
      if (fail && key === failedKey) {
        fail = false;
        throw new Error('Synthetic secure erase failure');
      }
      if (key === 'qr-connect-session') legacyPresent = false;
      await remove();
    };
    await assert.rejects(fixture.context.clearSession(previous), /secure erase failure/);
    const beforeRetry = attempts;
    await fixture.context.clearSession(previous);
    assert.ok(attempts > beforeRetry, 'Retry must perform the failed native erase');
    assert.equal(fixture.stored(), null);
    assert.equal(legacyPresent, false);
    const afterSuccess = attempts;
    await fixture.context.clearSession(previous);
    assert.equal(attempts, afterSuccess, 'Completed erase stays idempotent');
  }),
);
{
  const fixture = isolatedSession();
  const previous = connection();
  await fixture.context.saveSession(previous);
  const remove = fixture.context.SecureStore.deleteItemAsync;
  fixture.context.SecureStore.deleteItemAsync = async () => {
    throw new Error('Synthetic erase failure');
  };
  await assert.rejects(fixture.context.clearSession(previous), /erase failure/);
  fixture.context.SecureStore.deleteItemAsync = remove;
  const next = connection({
    owner: 'next-owner',
    deviceId: 'next-device',
    accessToken: 'next-token',
  });
  const saving = fixture.context.saveSession(next);
  const staleRetry = fixture.context.clearSession(previous);
  await Promise.all([saving, staleRetry]);
  assert.equal(
    fixture.stored().owner,
    next.owner,
    'A queued newer login wins over an old erase retry',
  );
  await fixture.context.clearSession(previous);
  assert.equal(fixture.stored().accessToken, next.accessToken);
}
{
  const fixture = isolatedSession();
  const previous = connection();
  await fixture.context.saveSession(previous);
  const remove = fixture.context.SecureStore.deleteItemAsync;
  let fail = true;
  fixture.context.SecureStore.deleteItemAsync = async () => {
    if (fail) {
      fail = false;
      throw new Error('Synthetic erase failure');
    }
    await remove();
  };
  await assert.rejects(fixture.context.clearSession(previous), /erase failure/);
  assert.equal(
    await fixture.context.loadSession(),
    null,
    'A same-runtime load retries credential erasure before it can restore a retired account',
  );
  assert.equal(fixture.stored(), null);
}
{
  const fixture = isolatedSession();
  const previous = connection();
  await fixture.context.saveSession(previous);
  const remove = fixture.context.SecureStore.deleteItemAsync;
  fixture.context.SecureStore.deleteItemAsync = async () => {
    throw new Error('Synthetic erase failure');
  };
  await assert.rejects(fixture.context.clearSession(previous), /erase failure/);
  fixture.context.SecureStore.setItemAsync = async () => {
    throw new Error('Synthetic replacement failure');
  };
  await assert.rejects(
    fixture.context.saveSession(connection({ owner: 'unaccepted-owner' })),
    /replacement failure/,
  );
  fixture.context.SecureStore.deleteItemAsync = remove;
  await fixture.context.clearSession(previous);
  assert.equal(
    fixture.stored(),
    null,
    'An unsuccessful replacement cannot discard the original erase intent',
  );
  assert.equal(await fixture.context.loadSession(), null);
}
