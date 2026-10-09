import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';

const source = await build({
  entryPoints: ['dashboard/session.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
});
const storage = new Map();
const location = {
  origin: 'https://workspace.example',
  pathname: '/dashboard',
  search: '?view=explorer',
  assign: (/** @type {URL} */ url) => {
    destination = new URL(url);
  },
};
let destination = new URL(location.origin);
const exports = { exports: {} };
let exchangeCount = 0;
let returnedTo = '';
const context = {
  module: exports,
  crypto: webcrypto,
  btoa,
  URL,
  URLSearchParams,
  TextEncoder,
  Uint8Array,
  Date,
  Map,
  Set,
  structuredClone,
  location,
  sessionStorage: {
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => storage.set(key, value),
    getItem: (/** @type {string} */ key) => storage.get(key) ?? null,
    removeItem: (/** @type {string} */ key) => storage.delete(key),
  },
  history: {
    replaceState: (
      /** @type {unknown} */ _state,
      /** @type {string} */ _title,
      /** @type {string} */ path,
    ) => {
      returnedTo = String(path);
    },
  },
  window: { dispatchEvent: () => {} },
  Event,
  fetch: async (/** @type {string} */ url, /** @type {RequestInit} */ options) => {
    if (url === '/dashboard/config')
      return Response.json({ issuer: 'https://identity.example/realm', clientId: 'qr-dashboard' });
    assert.equal(url, 'https://identity.example/realm/protocol/openid-connect/token');
    const body = new URLSearchParams(String(options.body));
    assert.equal(body.get('grant_type'), 'authorization_code');
    const digest = await webcrypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(body.get('code_verifier') ?? ''),
    );
    assert.equal(
      Buffer.from(digest).toString('base64url'),
      destination.searchParams.get('code_challenge'),
    );
    exchangeCount++;
    return Response.json({ access_token: 'fixture', expires_in: 300 });
  },
};
assert.ok(source.outputFiles[0]);
runInNewContext(source.outputFiles[0].text, context);
const session =
  /** @type {{initializeSession:()=>Promise<boolean>,signIn:(provider:'apple'|'github')=>Promise<void>,hasSession:()=>boolean}} */ (
    exports.exports
  );
await session.initializeSession();
/** @param {'apple'|'github'} provider */
async function verifyProvider(provider) {
  const expectedReturn = location.pathname === '/claim' ? '/claim' : '/dashboard';
  await session.signIn(provider);
  assert.equal(destination.searchParams.get('kc_idp_hint'), provider);
  assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
  const state = destination.searchParams.get('state');
  location.pathname = '/dashboard/callback';
  location.search = `?code=fixture&state=${state}`;
  assert.equal(await session.initializeSession(), true);
  assert.equal(session.hasSession(), true);
  if (expectedReturn === '/claim') assert.equal(returnedTo, '/claim');
  // A callback cannot reuse a consumed login attempt.
  await assert.rejects(session.initializeSession(), /could not be verified/);
  location.pathname = '/dashboard';
}
await verifyProvider('apple');
await verifyProvider('github');
location.pathname = '/login';
location.search = '';
await verifyProvider('github');
assert.equal(returnedTo, '/dashboard');
assert.equal(exchangeCount, 3);
location.pathname = '/claim';
location.search = '';
await verifyProvider('apple');
assert.equal(exchangeCount, 4);
await session.signIn('github');
location.pathname = '/dashboard/callback';
location.search = '?code=fixture&state=wrong';
await assert.rejects(session.initializeSession(), /could not be verified/);
assert.equal(exchangeCount, 4);
console.log(
  'Dashboard OAuth: Apple/GitHub redirects, PKCE exchange, callback state and single-use attempts passed.',
);
