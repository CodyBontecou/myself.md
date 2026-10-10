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
