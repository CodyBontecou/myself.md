import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readJSONResponse } from '../packages/support-chat/errors.js';

let refreshes = 0;
/** @type {string[]} */
const tokens = [];
let status = 401;
const context = vm.createContext({
  Headers,
  readJSONResponse,
  recordDebug: () => {},
  debugOperation: () => 'support',
  saveExportContext: () => {},
  WebBrowser: { maybeCompleteAuthSession() {} },
  SecureStore: { setItemAsync: async () => {} },
  AuthSession: {
    fetchDiscoveryAsync: async () => ({}),
    refreshAsync: async () => {
      refreshes++;
      await new Promise((resolve) => setImmediate(resolve));
      return {
        accessToken: 'fresh',
        refreshToken: 'rotated',
        issuedAt: Date.now() / 1000,
        expiresIn: 300,
      };
    },
  },
  /** @param {string} _url @param {RequestInit} options */
  fetch: async (_url, options) => {
    const token = new Headers(options.headers).get('Authorization') ?? '';
    tokens.push(token);
    return status === 401 && token === 'Bearer fresh'
      ? Response.json({ conversations: [] })
      : Response.json({ error: 'OAuth sign-in required or token expired.' }, { status });
  },
});
vm.runInContext(
  readFileSync('client/session.js', 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, ''),
  context,
);
const session = () => ({
  server: 'https://fixture.test',
  issuer: 'https://fixture.test/auth',
  resource: 'https://fixture.test/mcp',
  accessToken: 'old',
  refreshToken: 'fixture',
  expires: Date.now() + 300000,
  deviceId: '',
  account: 'fixture',
  owner: 'fixture',
  lastActiveAt: Date.now(),
});
const current = session();
await Promise.all([context.api(current, '/api/support/v1'), context.api(current, '/api/devices')]);
assert.equal(refreshes, 1, 'Concurrent server-rejected tokens must share one refresh');
assert.equal(tokens.filter((token) => token === 'Bearer fresh').length, 2);
assert.equal(current.refreshToken, 'rotated');
status = 403;
const before = refreshes;
await assert.rejects(
  context.api(session(), '/api/support/v1'),
  (error) =>
    typeof error === 'object' && error !== null && 'status' in error && error.status === 403,
);
assert.equal(refreshes, before, 'Permission failures must not refresh login');
status = 401;
const missing = session();
missing.refreshToken = '';
await assert.rejects(context.api(missing, '/api/support/v1'), /OAuth sign-in/);
assert.equal(refreshes, before, 'Missing refresh token cannot silently sign in');
context.fetch = async () => Response.json({ error: 'Still unauthorized' }, { status: 401 });
await assert.rejects(context.api(session(), '/api/support/v1'), /Still unauthorized/);
assert.equal(refreshes, before + 1, 'An unsuccessful refresh is retried only once');
console.log(
  'PASS session 401 recovery, concurrent refresh, permission isolation, missing credentials and bounded retry. No live credentials used.',
);

// Drive the real browser-return -> token exchange -> account read -> UI commit path.
const signInHandler = readFileSync('client/PhoneProvider.js', 'utf8').match(
  /    signInAccount: async \(provider\) => \{[\s\S]*?\n    \},/,
)?.[0];
assert.ok(signInHandler);
let persisted = '';
let visible = null;
let billingFailure = false;
let storageFailure = false;
let cancelled = false;
let exchanges = 0;
let billingCalls = 0;
let clearedAllowance = 0;
context.process = { env: {} };
context.URL = URL;
context.canonicalServiceOrigin = (/** @type {string} */ value) => value;
context.AuthSession.ResponseType = { Code: 'code' };
context.AuthSession.CodeChallengeMethod = { S256: 'S256' };
context.AuthSession.AuthRequest = class {
  codeVerifier = 'fixture-verifier';
  constructor(/** @type {{redirectUri:string,usePKCE:boolean}} */ options) {
    assert.equal(options.redirectUri, 'myselfmd://oauth');
    assert.equal(options.usePKCE, true);
  }
  async promptAsync() {
    return cancelled ? { type: 'cancel' } : { type: 'success', params: { code: 'fixture-code' } };
  }
};
context.AuthSession.exchangeCodeAsync = async (
  /** @type {{code:string,extraParams:{code_verifier:string}}} */ options,
) => {
  assert.equal(options.code, 'fixture-code');
  assert.equal(options.extraParams.code_verifier, 'fixture-verifier');
  exchanges++;
  return {
    accessToken: 'signed-in',
    refreshToken: 'signed-in-refresh',
    issuedAt: Date.now() / 1000,
    expiresIn: 300,
  };
};
context.fetch = async (/** @type {string} */ url, /** @type {RequestInit} */ options) => {
  if (url.endsWith('/config'))
    return Response.json({
      issuer: 'https://myself.md/auth/realms/myselfmd',
      resource: 'https://myself.md/mcp',
      clientId: 'myselfmd-phone',
    });
  assert.equal(url, 'https://myself.md/api/devices');
  assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer signed-in');
  return Response.json({
    subject: 'https://myself.md/auth/realms/myselfmd|fixture-owner',
    account: 'Fixture account',
    devices: [],
  });
};
context.SecureStore.setItemAsync = async (
  /** @type {string} */ _key,
  /** @type {string} */ value,
) => {
  if (storageFailure) throw new Error('Secure storage unavailable');
  persisted = value;
};
context.setSession = (/** @type {unknown} */ value) => {
  visible = value;
};
context.clearAccountAllowance = () => {
  clearedAllowance++;
};
context.syncBilling = async () => {
  billingCalls++;
  if (billingFailure) throw new Error('Billing unavailable');
};
const login = () => vm.runInContext(`({${signInHandler}}).signInAccount('google')`, context);
billingFailure = true;
await assert.rejects(login(), /Billing unavailable/);
assert.ok(persisted, 'Successful OAuth must persist even when billing fails');
assert.equal(JSON.parse(persisted).accessToken, 'signed-in');
assert.equal(visible, await context.loadSession(), 'Browser return must show the saved account');
assert.equal(clearedAllowance, 1, 'Previous account allowance cannot survive account sign-in');
billingFailure = false;
await login();
assert.equal(billingCalls, 2, 'Billing remains retryable after successful authentication');
const lastVisible = visible;
const lastPersisted = persisted;
storageFailure = true;
await assert.rejects(login(), /Secure storage unavailable/);
assert.equal(visible, lastVisible, 'A failed session write must not claim successful sign-in');
assert.equal(persisted, lastPersisted);
assert.equal(billingCalls, 2);
assert.equal(clearedAllowance, 2);
storageFailure = false;
cancelled = true;
const beforeCancel = exchanges;
await assert.rejects(login(), /cancelled/);
assert.equal(exchanges, beforeCancel, 'Cancelled browser handoffs cannot exchange a token');
assert.equal(visible, lastVisible);
assert.equal(persisted, lastPersisted);
console.log(
  'PASS phone OAuth return persists authentication independently of billing, secure storage failure and cancellation.',
);
