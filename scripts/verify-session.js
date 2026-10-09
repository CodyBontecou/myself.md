import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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
  fetch: async () => ({ ok: true, json: async () => ({}) }),
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
now += 29 * day;
assert.equal(await context.resumeSession(session), true);
now += 29 * day;
assert.equal(
  await context.resumeSession(session),
  true,
  'Active use survives more than 30 days since login',
);
const beforeBackground = session.lastActiveAt;
await context.api(session, '/api/devices');
assert.equal(
  session.lastActiveAt,
  beforeBackground,
  'Background API use must not extend foreground activity',
);
now += 30 * day;
await assert.rejects(context.api(session, '/api/devices'), /30 days of inactivity/);
assert.equal(await context.resumeSession(session), false);
assert.equal(storage, '');
await assert.rejects(context.saveSession(session), /signed out/);
storage = JSON.stringify({ ...peer, lastActiveAt: now - 30 * day });
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
    assert.equal(JSON.parse(options.body).expiresAt, now + 30 * day);
    return { ok: true, json: async () => ({ expiresAt: now + 30 * day }) };
  }
  return { ok: false, status, json: async () => ({ error: detail }) };
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
now += 30 * day;
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
