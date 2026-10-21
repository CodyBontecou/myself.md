import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { canonicalServiceOrigin } from '../core/hosting.js';
import { readJSONResponse } from '../packages/support-chat/errors.js';
let stored = '';
let owner = 'owner-a';
let devices = [{ id: 'retained-phone' }];
let cancelled = false;
let providerError = '';
let exchanges = 0;
const context = vm.createContext({
  canonicalServiceOrigin,
  readJSONResponse,
  Headers,
  URL,
  Date,
  setTimeout,
  clearTimeout,
  recordDebug: () => {},
  debugOperation: () => 'other',
  saveExportContext: () => {},
  WebBrowser: { maybeCompleteAuthSession() {} },
  SecureStore: {
    getItemAsync: async () => stored || null,
    /** @param {string} _key @param {string} value */
    setItemAsync: async (_key, value) => {
      stored = value;
    },
    deleteItemAsync: async () => {
      stored = '';
    },
  },
  AuthSession: {
    ResponseType: { Code: 'code' },
    CodeChallengeMethod: { S256: 'S256' },
    fetchDiscoveryAsync: async () => ({}),
    AuthRequest: class {
      codeVerifier = 'fixture-verifier';
      async promptAsync() {
        if (providerError) return { type: 'error', params: { error: providerError } };
        return cancelled
          ? { type: 'cancel' }
          : { type: 'success', params: { code: 'fixture-code' } };
      }
    },
    exchangeCodeAsync: async () => {
      exchanges++;
      return {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        issuedAt: Date.now() / 1000,
        expiresIn: 300,
      };
    },
  },
  /** @param {string} url */
  fetch: async (url) =>
    Response.json(
      String(url).endsWith('/config')
        ? {
            issuer: 'https://qa.test/auth',
            clientId: 'myselfmd-phone',
            resource: 'https://qa.test/mcp',
          }
        : { account: owner, subject: owner, devices },
    ),
});
vm.runInContext(
  readFileSync('client/session.js', 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, ''),
  context,
);
const previous = {
  server: 'https://qa.test',
  issuer: 'https://qa.test/auth',
  resource: 'https://qa.test/mcp',
  accessToken: 'expired',
  refreshToken: 'revoked',
  expires: 0,
  owner,
  account: owner,
  deviceId: 'retained-phone',
  lastActiveAt: Date.now(),
};
await context.saveSession(previous);
assert.equal(
  typeof context.reauthenticateSession,
  'function',
  'An expired grant needs an owner-preserving sign-in operation',
);
const renewed = await context.reauthenticateSession(previous, 'apple');
assert.equal(renewed.deviceId, 'retained-phone');
assert.equal(renewed.owner, previous.owner);
assert.equal(renewed.server, previous.server, 'Recovery must use the existing self-hosted server');
assert.equal(
  (await context.loadSession()).refreshToken,
  'new-refresh',
  'Fresh OAuth credentials must not be overwritten by the expired lineage',
);
const snapshot = stored;
/** @param {string} code @param {RegExp} message */
async function verifyProviderError(code, message) {
  providerError = code;
  const before = exchanges;
  await assert.rejects(context.reauthenticateSession(renewed, 'apple'), message);
  assert.equal(exchanges, before, 'Provider errors cannot exchange or accept an account');
  assert.equal(stored, snapshot, 'Provider errors preserve the paired account');
}
await verifyProviderError('account_not_linked', /not connected.*original method/);
await verifyProviderError('account_already_linked_to_different_user', /belongs to another account/);
await verifyProviderError('state_mismatch', /expired or was replaced/);
await verifyProviderError('access_denied', /cancelled/);
providerError = '';
owner = 'owner-b';
await assert.rejects(context.reauthenticateSession(renewed, 'apple'), /different account/);
assert.equal(stored, snapshot, 'Wrong-account sign-in cannot replace the paired partition');
owner = 'owner-a';
devices = [];
await assert.rejects(context.reauthenticateSession(renewed, 'apple'), /connected phone/);
assert.equal(stored, snapshot, 'A removed device must not silently adopt a new partition');
devices = [{ id: 'retained-phone' }];
cancelled = true;
await assert.rejects(context.reauthenticateSession(renewed, 'apple'), /cancelled/);
assert.equal(stored, snapshot, 'Cancelled OS authentication preserves the existing connection');
// Exercise the actual provider actions: purchase verification must not reject an
// already accepted identity and prevent the recovery screen from navigating.
const providerSource = readFileSync('client/PhoneProvider.js', 'utf8');
const providerTree = ts.createSourceFile(
  'PhoneProvider.js',
  providerSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JSX,
);
/** @param {'reauthenticateAccount'|'signInAccount'} name */
async function verifyBillingFailure(name) {
  let accepted = null;
  const warnings = /** @type {string[]} */ ([]);
  const state = vm.createContext({
    session: previous,
    process: { env: {} },
    reauthenticateSession: async () => renewed,
    signIn: async () => renewed,
    saveSession: async () => {},
    clearAccountAllowance: () => {},
    setSession: (/** @type {unknown} */ next) => {
      accepted = next;
    },
    setError: (/** @type {string} */ warning) => warnings.push(warning),
    errorMessage: String,
    syncBilling: async () => {
      throw new Error('Sandbox purchases cannot unlock production access.');
    },
  });
  let action = '';
  /** @param {import('typescript').Node} node */
  function find(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(providerTree) === name)
      action = node.initializer.getText(providerTree);
    ts.forEachChild(node, find);
  }
  find(providerTree);
  assert.ok(action);
  await assert.doesNotReject(
    vm.runInContext(`(${action})('apple')`, state),
    'A purchase-check failure cannot reject a completed sign-in or block its navigation',
  );
  assert.equal(accepted, renewed);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /Signed in.*purchase access/i);
  assert.match(warnings[0] ?? '', /Sandbox purchases cannot unlock production access/);
}
await verifyBillingFailure('reauthenticateAccount');
await verifyBillingFailure('signInAccount');
console.log(
  'Same-owner reauthentication preserves server/device and fresh tokens; wrong owner, removed device and cancellation preserve the original connection.',
);
