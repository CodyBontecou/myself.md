import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import { publicErrorMessage } from '../core/public-errors.js';
import { errorJSON } from '../packages/support-chat/errors.js';

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
let pendingOAuth = '';
let socialError = '';
let socialRequests = 0;
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
      return Response.json({
        issuer: 'https://identity.example/realm',
        clientId: 'myselfmd-dashboard',
      });
    if (url === 'https://identity.example/realm/sign-in/social') {
      socialRequests++;
      const body = JSON.parse(String(options.body));
      assert.equal(body.oauth_query, pendingOAuth);
      assert.ok(['apple', 'github', 'google'].includes(body.provider));
      if (socialError) return Response.json({ error: socialError }, { status: 401 });
      return Response.json({
        url:
          body.provider === 'google'
            ? 'https://accounts.google.com/o/oauth2/v2/auth'
            : body.provider === 'apple'
              ? 'https://appleid.apple.com/auth/authorize'
              : 'https://github.com/login/oauth/authorize',
      });
    }
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
  /** @type {{initializeSession:()=>Promise<boolean>,signIn:(provider:'apple'|'github'|'google')=>Promise<void>,hasSession:()=>boolean}} */ (
    exports.exports
  );
await session.initializeSession();
/** @param {'apple'|'github'|'google'} provider */
async function verifyProvider(provider) {
  const expectedReturn = location.pathname === '/claim' ? '/claim' : '/dashboard';
  await session.signIn(provider);
  assert.equal(destination.searchParams.get('kc_idp_hint'), provider);
  assert.equal(destination.searchParams.get('scope'), 'openid profile email myselfmd');
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
await verifyProvider('google');
await verifyProvider('apple');
await verifyProvider('github');
location.pathname = '/login';
location.search = '';
await verifyProvider('github');
assert.equal(returnedTo, '/dashboard');
assert.equal(exchangeCount, 4);
location.pathname = '/claim';
location.search = '';
await verifyProvider('google');
await verifyProvider('apple');
assert.equal(exchangeCount, 6);
location.pathname = '/login';
pendingOAuth = new URLSearchParams({
  client_id: 'agent-fixture',
  redirect_uri: 'http://127.0.0.1:8765/callback',
  state: 'agent-state',
  code_challenge: 'agent-challenge',
  code_challenge_method: 'S256',
  sig: 'fixture-signature',
  exp: 'fixture-expiry',
}).toString();
location.search = `?${pendingOAuth}`;
await session.signIn('github');
assert.equal(destination.hostname, 'github.com');
await session.signIn('google');
assert.equal(destination.hostname, 'accounts.google.com');
assert.equal(storage.has('myselfmd-dashboard-login'), false);
assert.equal(exchangeCount, 6);
pendingOAuth = new URLSearchParams({
  client_id: 'myselfmd-phone',
  redirect_uri: 'myselfmd://oauth',
  state: 'phone-state',
  code_challenge: 'phone-challenge',
  code_challenge_method: 'S256',
  resource: 'https://workspace.example/mcp',
  sig: 'fixture-signature',
  exp: 'fixture-expiry',
}).toString();
location.search = `?${pendingOAuth}`;
await session.signIn('google');
assert.equal(destination.hostname, 'accounts.google.com');
assert.equal(storage.has('myselfmd-dashboard-login'), false);
assert.equal(exchangeCount, 6, 'Phone login must retain its own native token exchange');
// A provider already chosen on the phone continues automatically on the web page.
/** @param {'apple'|'github'|'google'} provider */
async function verifyAutomaticProvider(provider) {
  const query = new URLSearchParams(pendingOAuth);
  query.set('kc_idp_hint', provider);
  pendingOAuth = query.toString();
  location.search = `?${pendingOAuth}`;
  destination = new URL('https://workspace.example/login');
  const before = socialRequests;
  await Promise.all([session.initializeSession(), session.initializeSession()]);
  assert.equal(
    socialRequests,
    before + 1,
    'Repeated initialization must not start competing provider flows',
  );
  assert.notEqual(
    destination.hostname,
    'workspace.example',
    'Selected native provider must start without a second web click',
  );
  assert.equal(storage.has('myselfmd-dashboard-login'), false);
}
await verifyAutomaticProvider('apple');
await verifyAutomaticProvider('github');
await verifyAutomaticProvider('google');
assert.equal(exchangeCount, 6, 'Automatic continuation must preserve the native exchange');
/** @param {string} provider */
async function verifyIgnoredHint(provider) {
  const query = new URLSearchParams(pendingOAuth);
  query.set('kc_idp_hint', provider);
  location.search = `?${query}`;
  const before = socialRequests;
  await session.initializeSession();
  assert.equal(socialRequests, before, 'Unsupported hints keep the provider picker');
}
await verifyIgnoredHint('reviewer');
await verifyIgnoredHint('unknown');
const unsigned = new URLSearchParams(pendingOAuth);
unsigned.delete('sig');
location.search = `?${unsigned}`;
const beforeUnsigned = socialRequests;
await session.initializeSession();
assert.equal(socialRequests, beforeUnsigned, 'Unsigned hints must not start automatically');
location.search = `?${pendingOAuth}`;
const failedContinuation = new URLSearchParams(pendingOAuth);
failedContinuation.set('state', 'rejected-continuation');
pendingOAuth = failedContinuation.toString();
location.search = `?${pendingOAuth}`;
socialError = 'invalid_signature';
await assert.rejects(session.initializeSession());
const failedContinuationRequests = socialRequests;
assert.equal(await session.initializeSession(), false);
assert.equal(socialRequests, failedContinuationRequests, 'A failed automatic flow must not loop');
await assert.rejects(session.signIn('google'));
assert.equal(
  socialRequests,
  failedContinuationRequests + 1,
  'The picker must allow an explicit retry',
);
socialError = 'invalid_signature';
const previousDestination = destination.href;
await assert.rejects(session.signIn('google'), (reason) => {
  assert.ok(reason instanceof Error || (reason && typeof reason === 'object'));
  const text = publicErrorMessage(errorJSON(reason));
  assert.match(text, /sign-in link.*expired or could not be verified/i);
  assert.match(text, /app or assistant that started sign-in/i);
  assert.doesNotMatch(text, /invalid_signature/);
  return true;
});
assert.equal(destination.href, previousDestination, 'Failed login must not redirect to dashboard');
assert.equal(storage.has('myselfmd-dashboard-login'), false);
assert.equal(exchangeCount, 6);
socialError = '';
location.pathname = '/claim';
location.search = '';
await session.signIn('github');
location.pathname = '/dashboard/callback';
location.search = '?code=fixture&state=wrong';
await assert.rejects(session.initializeSession(), /could not be verified/);
assert.equal(exchangeCount, 6);
console.log(
  'Dashboard OAuth: Apple/GitHub/Google redirects, PKCE exchange, callback state and single-use attempts passed.',
);
