import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createPairingUrl, createPairingDeepLink, parsePairingQr } from '../core/index.js';
// Exercise the actual UI handler with native/network boundaries replaced.
const app = readFileSync('client/PhoneProvider.js', 'utf8');
const ticket = 'a'.repeat(43);
const server = 'https://qr-connect-cloud-cody.fly.dev';
const links = [createPairingUrl(server, ticket), createPairingDeepLink(server, ticket)];
for (const link of links) assert.deepEqual(parsePairingQr(link), { server, ticket });
assert.throws(() => parsePairingQr('qrconnect://pair?url=%ZZ'));
assert.throws(() =>
  parsePairingQr('qrconnect://pair?url=https%3A%2F%2Fexample.com%2Fpair%23short'),
);
const receive = app.match(/    const receive = \(url\) => \{[\s\S]*?\n    \};/)?.[0];
assert.ok(receive);
let incomingPairing;
let linkError = '';
const linkContext = vm.createContext({
  parsePairingQr,
  router: { push: () => {} },
  profileFromLink: () => {},
  setIncoming: () => {},
  /** @param {unknown} value */
  setPairing: (value) => {
    incomingPairing = value;
  },
  locked: { current: false },
  /** @param {string} value */
  setError: (value) => {
    linkError = value;
  },
});
vm.runInContext(receive + '\nglobalThis.receive = receive;', linkContext);
for (const link of links) {
  linkContext.receive(link);
  assert.deepEqual(incomingPairing, { server, ticket });
  assert.equal(linkContext.locked.current, true);
}
linkContext.receive('qrconnect://oauth?code=fixture');
assert.equal(linkError, '');
const disconnect = app.match(/  async function disconnect\(\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(disconnect, 'Disconnect handler must be available to the regression harness.');
for (const failure of ['server', 'location', 'pending', 'account']) {
  let cleared = false;
  let allowanceCleared = false;
  let revocations = 0;
  let screen = 'connected';
  const context = vm.createContext({
    session: { deviceId: failure === 'account' ? '' : 'old-phone' },
    clearAccountAllowance: () => {
      allowanceCleared = true;
    },
    stopTracking: async () => {
      if (failure === 'location') throw new Error('Native shutdown failed');
    },
    revokeDevice: async () => {
      revocations += 1;
      if (failure === 'pending') return new Promise(() => {});
      throw new Error('Old server unavailable');
    },
    clearSession: async () => {
      cleared = true;
    },
    /** @param {unknown} session */
    setSession: (session) => {
      if (session === null) screen = 'scanner';
    },
    reset: () => {},
    cancelExports: () => {},
    Alert: { alert: () => {} },
  });
  // The UI must return without awaiting remote or native cleanup.
  // oxlint-disable-next-line eslint/no-await-in-loop
  await vm.runInContext(disconnect + '\ndisconnect()', context);
  assert.ok(cleared && screen === 'scanner', `${failure} must not block local sign-out`);
  assert.ok(allowanceCleared, `${failure} must clear account access on sign-out`);
  if (failure === 'account') assert.equal(revocations, 0);
}
const source = readFileSync('client/session.js', 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
let storage = 'old-session';
/** @type {((value:unknown)=>void)|undefined} */
let refresh;
const context = vm.createContext({
  URL,
  Headers,
  recordDebug: () => {},
  debugOperation: () => 'other',
  AbortController,
  setTimeout,
  clearTimeout,
  saveExportContext: () => {},
  WebBrowser: { maybeCompleteAuthSession: () => {} },
  SecureStore: {
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
    refreshAsync: () =>
      new Promise((resolve) => {
        refresh = resolve;
      }),
  },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
});
vm.runInContext(source, context);
const session = {
  expires: 0,
  refreshToken: 'fixture',
  accessToken: 'expired',
  deviceId: 'old',
  server: 'https://old.example',
  issuer: 'https://old.example/issuer',
  resource: 'https://old.example/mcp',
};
const pending = context.api(session, '/api/devices');
await new Promise((resolve) => setImmediate(resolve));
assert.ok(refresh);
await context.clearSession(session);
refresh({ accessToken: 'refreshed', refreshToken: 'fixture', issuedAt: 1, expiresIn: 300 });
await assert.rejects(pending, /signed out/);
assert.equal(storage, '');
await assert.rejects(context.api(session, '/api/devices'), /signed out/);
await assert.rejects(context.saveSession(session), /signed out/);
/** @type {(()=>void)|undefined} */
let timeout;
/** @param {()=>void} callback @param {number} duration */
context.setTimeout = (callback, duration) => {
  assert.equal(duration, 10000);
  timeout = callback;
  return 1;
};
context.clearTimeout = () => {};
/** @param {string} _url @param {{signal:AbortSignal}} options */
context.fetch = async (_url, { signal }) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
const revoke = context.revokeDevice(session);
assert.ok(timeout);
timeout();
await assert.rejects(revoke, /aborted/);
assert.equal(storage, '');
console.log(
  'Disconnect: failed/pending cleanup returns to scanner; stale refresh cannot restore a session; revocation times out.',
);
