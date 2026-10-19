import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { canonicalServiceOrigin } from '../core/hosting.js';
import { readJSONResponse } from '../packages/support-chat/errors.js';
let stored = '';
let owner = 'owner-a';
let devices = [{ id: 'retained-phone' }];
let cancelled = false;
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
        return cancelled
          ? { type: 'cancel' }
          : { type: 'success', params: { code: 'fixture-code' } };
      }
    },
    exchangeCodeAsync: async () => ({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      issuedAt: Date.now() / 1000,
      expiresIn: 300,
    }),
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
owner = 'owner-b';
await assert.rejects(context.reauthenticateSession(renewed, 'apple'), /same account/);
assert.equal(stored, snapshot, 'Wrong-account sign-in cannot replace the paired partition');
owner = 'owner-a';
devices = [];
await assert.rejects(context.reauthenticateSession(renewed, 'apple'), /connected phone/);
assert.equal(stored, snapshot, 'A removed device must not silently adopt a new partition');
devices = [{ id: 'retained-phone' }];
cancelled = true;
await assert.rejects(context.reauthenticateSession(renewed, 'apple'), /cancelled/);
assert.equal(stored, snapshot, 'Cancelled OS authentication preserves the existing connection');
console.log(
  'Same-owner reauthentication preserves server/device and fresh tokens; wrong owner, removed device and cancellation preserve the original connection.',
);
