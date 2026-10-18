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

// An initial identity 401 may rotate tokens, but cannot accept a different account.
cancelled = false;
let candidateOwner = 'https://myself.md/auth/realms/myselfmd|synthetic-other-owner';
let candidateRefreshes = 0;
let rejectAcceptedOnce = false;
context.AuthSession.refreshAsync = async () => {
  candidateRefreshes++;
  return {
    accessToken: `synthetic-candidate-rotated-${candidateRefreshes}`,
    refreshToken: `synthetic-candidate-refresh-${candidateRefreshes}`,
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
  const authorization = new Headers(options.headers).get('Authorization');
  if (authorization === 'Bearer signed-in' || rejectAcceptedOnce) {
    rejectAcceptedOnce = false;
    return Response.json({ error: 'Synthetic initial identity rejection' }, { status: 401 });
  }
  return Response.json({ subject: candidateOwner, account: 'Synthetic account', devices: [] });
};
const recoveryHandler = readFileSync('client/PhoneProvider.js', 'utf8').match(
  /reauthenticateDeletion: async \(provider\) => \{([\s\S]*?)\n    \},\n    run,/,
);
assert.ok(recoveryHandler);
const originalOwner = JSON.parse(persisted).owner;
const pendingDeletion = { owner: originalOwner, deviceId: 'synthetic-pending-phone' };
let confirmedRecoveries = 0;
context.session = visible;
context.pendingAccountCleanup = () => pendingDeletion;
context.finishDeletion = async (
  /** @type {typeof pendingDeletion} */ owner,
  /** @type {ReturnType<typeof session>} */ accepted,
) => {
  assert.equal(owner.owner, accepted.owner);
  assert.equal(accepted.deviceId, owner.deviceId);
  confirmedRecoveries++;
};
const recover = () =>
  vm.runInContext(`(async (provider) => {${recoveryHandler[1]}\n})('apple')`, context);
const provisionalBefore = persisted;
const originalActive = await context.loadSession();
await assert.rejects(recover(), /did not match/);
assert.equal(
  persisted,
  provisionalBefore,
  'A rejected refreshed sign-in cannot replace secure storage.',
);
assert.equal(await context.loadSession(), originalActive);
assert.equal(confirmedRecoveries, 0, 'Wrong-owner sign-in cannot resume deletion.');

candidateOwner = originalOwner;
await recover();
assert.equal(confirmedRecoveries, 1);
assert.equal(JSON.parse(persisted).deviceId, pendingDeletion.deviceId);
const accepted = await context.loadSession();
const acceptedToken = accepted.accessToken;
rejectAcceptedOnce = true;
await context.api(accepted, '/api/devices');
assert.notEqual(accepted.accessToken, acceptedToken);
assert.equal(JSON.parse(persisted).accessToken, accepted.accessToken);

const failedCandidate = await context.signIn('https://myself.md', 'apple');
const beforeFailedSave = persisted;
storageFailure = true;
await assert.rejects(context.saveSession(failedCandidate), /Secure storage unavailable/);
storageFailure = false;
rejectAcceptedOnce = true;
await context.api(failedCandidate, '/api/devices');
assert.equal(
  persisted,
  beforeFailedSave,
  'A failed explicit save keeps later candidate refreshes provisional.',
);
assert.equal(await context.loadSession(), accepted);

const overlapping = await context.signIn('https://myself.md', 'apple');
const secureWrite = context.SecureStore.setItemAsync;
/** @type {()=>void} */ let writeStarted = () => assert.fail('Write gate not initialized');
/** @type {()=>void} */ let releaseWrite = () => assert.fail('Write gate not initialized');
const started = new Promise((resolve) => {
  writeStarted = () => resolve(undefined);
});
const holdWrite = new Promise((resolve) => {
  releaseWrite = () => resolve(undefined);
});
let firstWrite = true;
context.SecureStore.setItemAsync = async (
  /** @type {string} */ key,
  /** @type {string} */ value,
) => {
  if (firstWrite) {
    firstWrite = false;
    writeStarted();
    await holdWrite;
  }
  await secureWrite(key, value);
};
const committing = context.saveSession(overlapping);
await started;
rejectAcceptedOnce = true;
const rotating = context.api(overlapping, '/api/devices');
await new Promise((resolve) => setImmediate(resolve));
releaseWrite();
await Promise.all([committing, rotating]);
assert.equal(JSON.parse(persisted).accessToken, overlapping.accessToken);
assert.equal(JSON.parse(persisted).refreshToken, overlapping.refreshToken);
assert.equal(await context.loadSession(), overlapping);
console.log(
  'PASS provisional OAuth 401 refresh cannot bypass same-owner deletion recovery; accepted, failed and overlapping secure-save token rotations retain their persistence contracts.',
);
