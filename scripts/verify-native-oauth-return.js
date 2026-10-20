import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createIdentity } from '../server/identity.js';
import { z } from 'zod';

// Only the external Apple token/profile boundary is fictional. Exercise the real
// signed authorization, stored provider state, callback hooks, PKCE and ownership.
const origin = 'https://native-return.test';
const issuer = `${origin}/auth/realms/myselfmd`;
const secret = randomBytes(32).toString('hex');
const db = new DatabaseSync(':memory:');
db.exec(readFileSync('worker/identity.sql', 'utf8'));
db.exec(readFileSync('worker/migrations/reviewer-access.sql', 'utf8'));
const auth = createIdentity(db, {
  issuer,
  secret,
  resource: `${origin}/mcp`,
  githubId: 'fixture',
  githubSecret: 'fixture',
  appleId: 'fixture',
  appleSecret: 'fixture',
});
const context = await auth.$context;
await context.adapter.create({
  model: 'oauthClient',
  data: {
    clientId: 'myselfmd-phone',
    name: 'Fixture phone',
    redirectUris: ['myselfmd://oauth'],
    tokenEndpointAuthMethod: 'none',
    applicationType: 'native',
    scopes: ['openid', 'profile', 'myselfmd', 'offline_access'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    skipConsent: true,
    subjectType: 'public',
    requirePKCE: true,
  },
});
await context.adapter.create({
  model: 'oauthClientResource',
  data: {
    clientId: 'myselfmd-phone',
    resourceId: `${origin}/mcp`,
    createdAt: new Date(),
  },
});
const provider = context.socialProviders.find((p) => p.id === 'apple');
assert.ok(provider);
provider.requiresIdTokenNonce = false;
provider.validateAuthorizationCode = async () => ({
  accessToken: 'fixture-provider-token',
  scopes: ['email'],
});
provider.getUserInfo = async () => ({
  user: { name: 'Fixture', email: 'same@example.test', emailVerified: true },
  data: { sub: 'apple-id' },
});
provider.accountSubject = () => 'apple-id';
/** @param {string} id @param {string} email */
async function createUser(id, email) {
  await context.adapter.create({
    model: 'user',
    forceAllowId: true,
    data: {
      id,
      name: 'Fixture',
      email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}
await createUser('existing', 'same@example.test');
await createUser('browser-owner', 'browser@example.test');
await context.adapter.create({
  model: 'account',
  data: {
    providerId: 'github',
    accountId: 'existing-github',
    userId: 'existing',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});
const browserSession = await context.internalAdapter.createSession('browser-owner');
assert.ok(browserSession);
const browserCookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(browserSession.token + '.' + createHmac('sha256', secret).update(browserSession.token).digest('base64'))}`;
let requestNumber = 0;
/** @param {string} path @param {Record<string, unknown>|null} [body] @param {string} [cookie] */
function request(path, body = null, cookie = '') {
  return auth.handler(
    new Request(issuer + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: origin,
        Accept: 'text/html',
        'cf-connecting-ip': `192.0.2.${++requestNumber}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
/** @param {Response} response */
function destination(response) {
  const value = response.headers.get('location');
  assert.ok(value, `Expected redirect, got ${response.status}`);
  return new URL(value);
}
let attemptNumber = 0;
async function startNative() {
  const verifier = randomBytes(32).toString('base64url');
  const state = `native-state-${++attemptNumber}`;
  const query = new URLSearchParams({
    client_id: 'myselfmd-phone',
    redirect_uri: 'myselfmd://oauth',
    response_type: 'code',
    scope: 'openid profile myselfmd offline_access',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: `${origin}/mcp`,
    prompt: 'select_account',
    kc_idp_hint: 'apple',
  });
  const login = destination(await request(`/oauth2/authorize?${query}`, null, browserCookie));
  assert.equal(login.pathname, '/login');
  assert.equal(login.searchParams.get('kc_idp_hint'), 'apple');
  assert.equal(login.searchParams.get('state'), state);
  const signedQuery = login.search.slice(1);
  const social = await request(
    '/sign-in/social',
    {
      provider: 'apple',
      oauth_query: signedQuery,
      callbackURL: `${origin}/dashboard`,
      newUserCallbackURL: `${origin}/dashboard`,
      errorCallbackURL: `${origin}/dashboard`,
    },
    browserCookie,
  );
  assert.equal(social.status, 200, await social.clone().text());
  const apple = new URL(z.object({ url: z.string() }).parse(await social.json()).url);
  const providerState = apple.searchParams.get('state');
  assert.ok(providerState);
  const cookie = social.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { state, verifier, signedQuery, providerState, cookie: `${browserCookie}; ${cookie}` };
}
/** @param {Awaited<ReturnType<typeof startNative>>} attempt @param {'GET'|'POST'} method @param {string} [error] */
async function complete(attempt, method, error = '') {
  const params = {
    state: attempt.providerState,
    ...(error ? { error } : { code: 'fixture-code' }),
  };
  const response =
    method === 'GET'
      ? await request(`/callback/apple?${new URLSearchParams(params)}`, null, attempt.cookie)
      : await request('/callback/apple', params, attempt.cookie);
  if (method === 'GET') return response;
  const canonical = destination(response);
  assert.equal(canonical.pathname, `${new URL(issuer).pathname}/callback/apple`);
  return request(`/callback/apple${canonical.search}`, null, attempt.cookie);
}
/** @param {URL} url @param {string} state */
function nativeDestination(url, state) {
  assert.equal(
    url.protocol,
    'myselfmd:',
    'Provider success/error must finish the app request, never a separate dashboard login',
  );
  assert.equal(url.host, 'oauth');
  assert.equal(url.searchParams.get('state'), state);
}
// Exercise both a fresh cookie and a rolling session that emits Set-Cookie on
// authorization. That refresh must not trigger the provider's sign-in continuation.
await startNative();
const browserAge = 2 * 86400000;
db.prepare('UPDATE session SET createdAt=?, updatedAt=?, expiresAt=? WHERE id=?').run(
  browserSession.createdAt.getTime() - browserAge,
  browserSession.updatedAt.getTime() - browserAge,
  browserSession.expiresAt.getTime() - browserAge,
  browserSession.id,
);
const conflict = await startNative();
const conflictURL = destination(await complete(conflict, 'POST'));
nativeDestination(conflictURL, conflict.state);
assert.equal(conflictURL.searchParams.get('error'), 'account_not_linked');
assert.equal(
  db.prepare("SELECT count(*) AS n FROM account WHERE providerId='apple'").get()?.n,
  0,
  'Matching email and an existing browser session must not link or move an account',
);
const cancelled = await startNative();
const cancelledURL = destination(await complete(cancelled, 'POST', 'access_denied'));
nativeDestination(cancelledURL, cancelled.state);
assert.equal(cancelledURL.searchParams.get('error'), 'access_denied');
const replaced = await startNative();
replaced.cookie = browserCookie;
const replacedURL = destination(await complete(replaced, 'GET'));
nativeDestination(replacedURL, replaced.state);
assert.equal(replacedURL.searchParams.get('error'), 'state_mismatch');
const tampered = await request('/sign-in/social', {
  provider: 'apple',
  oauth_query: conflict.signedQuery.replace(conflict.state, 'tampered'),
});
assert.equal(tampered.status, 400);
await context.adapter.create({
  model: 'account',
  data: {
    providerId: 'apple',
    accountId: 'apple-id',
    userId: 'existing',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});
/** @param {'GET'|'POST'} method */
async function verifySuccess(method) {
  const attempt = await startNative();
  const url = destination(await complete(attempt, method));
  nativeDestination(url, attempt.state);
  const code = url.searchParams.get('code');
  assert.ok(code);
  const token = await auth.handler(
    new Request(`${issuer}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'myselfmd-phone',
        code,
        redirect_uri: 'myselfmd://oauth',
        code_verifier: attempt.verifier,
      }),
    }),
  );
  assert.equal(token.status, 200, await token.clone().text());
  const credentials = z.object({ access_token: z.string() }).parse(await token.json());
  const userinfo = await auth.handler(
    new Request(`${issuer}/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${credentials.access_token}` },
    }),
  );
  assert.equal(userinfo.status, 200);
  assert.equal(
    z.object({ sub: z.string() }).parse(await userinfo.json()).sub,
    'existing',
    'An existing browser session must not replace the Apple identity',
  );
}
await verifySuccess('GET');
await verifySuccess('POST');
const replayed = await startNative();
await complete(replayed, 'POST', 'access_denied');
const replayedURL = destination(await complete(replayed, 'POST'));
nativeDestination(replayedURL, replayed.state);
assert.equal(replayedURL.searchParams.get('error'), 'state_mismatch');
assert.equal(replayedURL.searchParams.has('code'), false);
const missing = await startNative();
db.prepare('DELETE FROM verification WHERE identifier=?').run(
  `auth-state:${missing.providerState}`,
);
const missingURL = destination(await complete(missing, 'GET'));
nativeDestination(missingURL, missing.state);
assert.equal(missingURL.searchParams.get('error'), 'state_mismatch');
assert.equal(missingURL.searchParams.has('code'), false);
const unbound = destination(
  await request(
    `/callback/apple?state=${missing.providerState}&code=fixture-code`,
    null,
    browserCookie,
  ),
);
assert.equal(unbound.pathname, `${new URL(issuer).pathname}/error`);
const unrelated = destination(
  await request(`/callback/apple?state=unrelated-state&code=fixture-code`, null, missing.cookie),
);
assert.equal(unrelated.pathname, `${new URL(issuer).pathname}/error`);
const recoveryName = context.createAuthCookie('native_oauth_return').name;
const recoveryValue = JSON.stringify({
  provider: 'apple',
  providerState: missing.providerState,
  state: missing.state,
  expires: Date.now() - 1,
});
const expiredCookie = `${recoveryName}=${encodeURIComponent(recoveryValue + '.' + createHmac('sha256', secret).update(recoveryValue).digest('base64'))}`;
const expired = destination(
  await request(
    `/callback/apple?state=${missing.providerState}&code=fixture-code`,
    null,
    expiredCookie,
  ),
);
assert.equal(expired.pathname, `${new URL(issuer).pathname}/error`);
const tamperedRecovery = destination(
  await request(
    `/callback/apple?state=${missing.providerState}&code=fixture-code`,
    null,
    missing.cookie.replace('native-state-', 'tampered-state-'),
  ),
);
assert.equal(tamperedRecovery.pathname, `${new URL(issuer).pathname}/error`);
// If the plugin cannot recover its continuation, the fallback cannot strand the
// authentication sheet in Files or issue a code for an unrelated web login.
const fallback = await startNative();
const row = db
  .prepare('SELECT value FROM verification WHERE identifier=?')
  .get(`auth-state:${fallback.providerState}`);
assert.ok(row);
const saved = JSON.parse(String(row.value));
delete saved.serverContext;
db.prepare('UPDATE verification SET value=? WHERE identifier=?').run(
  JSON.stringify(saved),
  `auth-state:${fallback.providerState}`,
);
const fallbackURL = destination(await complete(fallback, 'POST'));
nativeDestination(fallbackURL, fallback.state);
assert.equal(fallbackURL.searchParams.has('code'), false);
console.log(
  'PASS native Apple POST/GET callbacks, PKCE exchange, account conflicts, browser-account isolation, replaced state, cancellation and safe fallback. No live provider credentials used.',
);
db.close();
