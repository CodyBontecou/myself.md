// Native Sign in with Apple: a phone-issued ID token continues a signed PKCE phone authorization
// through Better Auth's real /sign-in/social, /oauth2/authorize and /oauth2/token endpoints.
// Apple's key server is replaced in-process; every other check is the production configuration.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createIdentity } from '../server/identity.js';
import { exchangeAppleCode, issuedToBundle } from '../server/apple-native.js';

const origin = 'http://127.0.0.1:8787';
const issuer = `${origin}/auth/realms/myselfmd`;
const bundleId = 'com.example.native';
const keys = await generateKeyPair('ES256', { extractable: true });
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: 'fixture-apple',
  alg: 'ES256',
  use: 'sig',
};
const realFetch = globalThis.fetch;
/** Serve Apple's signing keys from the fixture key; refuse any other Apple request.
 * @param {Request|string|URL} input @param {RequestInit} [init] @returns {Promise<Response>} */
const appleKeysFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === 'https://appleid.apple.com/auth/keys') return Response.json({ keys: [jwk] });
  if (url.startsWith('https://appleid.apple.com/'))
    throw new Error(`Unexpected Apple request ${url}`);
  return realFetch(input, init);
};
Object.assign(globalThis, { fetch: appleKeysFetch });
/** @param {number} status @param {Record<string,unknown>} body @returns {typeof fetch} */
const transport = (status, body) => async () => Response.json(body, { status });
/** @param {{sub:string,email:string,nonce?:string|null,aud?:string,iss?:string,ageSeconds?:number}} claims */
async function appleToken({
  sub,
  email,
  nonce,
  aud = bundleId,
  iss = 'https://appleid.apple.com',
  ageSeconds = 0,
}) {
  const now = Math.floor(Date.now() / 1000) - ageSeconds;
  return new SignJWT({
    email,
    email_verified: true,
    ...(nonce === null ? {} : { nonce: createHash('sha256').update(String(nonce)).digest('hex') }),
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'fixture-apple' })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(keys.privateKey);
}

const db = new DatabaseSync(':memory:');
db.exec(readFileSync('worker/identity.sql', 'utf8'));
const secret = randomBytes(32).toString('hex');
const auth = createIdentity(db, {
  issuer,
  secret,
  resource: `${origin}/mcp`,
  githubId: 'fixture-github',
  githubSecret: 'fixture',
  appleId: 'fixture.apple.web',
  appleSecret: 'fixture',
  appleBundleId: bundleId,
  googleId: 'fixture-google',
  googleSecret: 'fixture',
});
const context = await auth.$context;
await Promise.all(
  ['myselfmd-phone', 'myselfmd-dashboard'].map(async (clientId) => {
    await context.adapter.create({
      model: 'oauthClient',
      data: {
        clientId,
        name: 'Fixture client',
        redirectUris: [
          clientId === 'myselfmd-phone' ? 'myselfmd://oauth' : `${origin}/dashboard/callback`,
        ],
        tokenEndpointAuthMethod: 'none',
        applicationType: clientId === 'myselfmd-dashboard' ? 'web' : 'native',
        scopes: ['openid', 'profile', 'email', 'myselfmd', 'offline_access'],
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        skipConsent: true,
        subjectType: 'public',
        requirePKCE: true,
      },
    });
    await context.adapter.create({
      model: 'oauthClientResource',
      data: { clientId, resourceId: `${origin}/mcp`, createdAt: new Date() },
    });
  }),
);
// An account created on the web with GitHub, and one already linked to an Apple subject.
await Promise.all(
  [
    ['github-user', 'shared@example.test', 'github', 'github-subject'],
    ['apple-user', 'apple@example.test', 'apple', 'apple-existing'],
  ].map(async ([id, email, provider, accountId]) => {
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
    await context.adapter.create({
      model: 'account',
      data: {
        providerId: provider,
        accountId,
        userId: id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }),
);

/** Start a phone PKCE authorization exactly as the app does, without a browser.
 * @param {string} [clientId] */
async function startAuthorization(clientId = 'myselfmd-phone') {
  const verifier = randomBytes(32).toString('base64url');
  const redirect =
    clientId === 'myselfmd-phone' ? 'myselfmd://oauth' : `${origin}/dashboard/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirect,
    scope: 'openid profile myselfmd offline_access',
    resource: `${origin}/mcp`,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state: randomBytes(12).toString('base64url'),
  });
  const response = await auth.handler(
    new Request(`${issuer}/oauth2/authorize?${params}`, {
      headers: { Accept: 'application/json' },
    }),
  );
  const body = /** @type {{url?:string}} */ (await response.json());
  assert.ok(body.url, JSON.stringify(body));
  return {
    query: new URL(body.url).search.slice(1),
    verifier,
    state: params.get('state'),
    redirect,
  };
}
let ip = 0;
/** @param {Record<string,unknown>} body */
function signIn(body) {
  return auth.handler(
    new Request(`${issuer}/sign-in/social`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: origin,
        // Distinct clients, so Better Auth's per-IP sign-in limit does not mask the checks.
        'cf-connecting-ip': `10.0.${(++ip >> 8) & 255}.${ip & 255}`,
      },
      body: JSON.stringify(body),
    }),
  );
}
/** Full native sign-in; returns the issued token response and the session's user.
 * @param {string} sub @param {string} email */
async function nativeSignIn(sub, email) {
  const start = await startAuthorization();
  const nonce = randomBytes(24).toString('base64url');
  const response = await signIn({
    provider: 'apple',
    oauth_query: start.query,
    idToken: { token: await appleToken({ sub, email, nonce }), nonce, accessToken: 'apple-access' },
  });
  const body = /** @type {{url?:string,code?:string,message?:string}} */ (await response.json());
  if (!body.url) return { error: body, status: response.status };
  const callback = new URL(body.url);
  assert.equal(callback.protocol, 'myselfmd:');
  assert.equal(callback.searchParams.get('state'), start.state);
  const token = await auth.handler(
    new Request(`${issuer}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'myselfmd-phone',
        code: String(callback.searchParams.get('code')),
        code_verifier: start.verifier,
        redirect_uri: 'myselfmd://oauth',
        resource: `${origin}/mcp`,
      }),
    }),
  );
  const tokens = /** @type {{access_token?:string,refresh_token?:string,id_token?:string}} */ (
    await token.json()
  );
  assert.equal(token.status, 200, JSON.stringify(tokens));
  assert.ok(tokens.access_token && tokens.refresh_token);
  const account = db
    .prepare(
      "SELECT userId, accessToken, idToken FROM account WHERE providerId='apple' AND accountId=?",
    )
    .get(sub);
  return { tokens, account };
}

try {
  // A new Apple user signs up and receives phone tokens without any browser step.
  const created = await nativeSignIn('apple-new', 'new@example.test');
  assert.ok('tokens' in created && created.account, JSON.stringify(created));
  const newUser = String(created.account?.userId);
  assert.ok(created.account?.accessToken && created.account.accessToken !== 'apple-access');
  assert.equal(issuedToBundle(String(created.account?.idToken), bundleId), true);
  // Signing in again keeps the same account.
  const again = await nativeSignIn('apple-new', 'new@example.test');
  assert.equal(again.account?.userId, newUser);
  // An Apple identity already connected on the web resolves to its existing user.
  const linked = await nativeSignIn('apple-existing', 'apple@example.test');
  assert.equal(linked.account?.userId, 'apple-user');
  // A matching email never links a different account implicitly.
  const unlinked = await nativeSignIn('apple-other', 'shared@example.test');
  assert.ok('error' in unlinked && unlinked.status === 401, JSON.stringify(unlinked));
  assert.equal(
    db.prepare("SELECT 1 FROM account WHERE providerId='apple' AND accountId='apple-other'").get(),
    undefined,
  );

  const start = await startAuthorization();
  const nonce = randomBytes(24).toString('base64url');
  /** @param {Record<string,unknown>} idToken @param {string} [query] @param {string} [provider] */
  const attempt = (idToken, query = start.query, provider = 'apple') =>
    signIn({ provider, oauth_query: query, idToken });
  const good = { sub: 'apple-neg', email: 'neg@example.test', nonce };
  // Tokens for the web Services ID, other issuers, stale tokens and wrong nonces are rejected.
  const rejected = await Promise.all(
    [
      { ...good, aud: 'fixture.apple.web' },
      { ...good, iss: 'https://evil.example' },
      { ...good, ageSeconds: 7200 },
      { ...good, nonce: 'a-different-nonce-of-sufficient-length' },
      { ...good, nonce: null },
    ].map(async (claims) => (await attempt({ token: await appleToken(claims), nonce })).status),
  );
  assert.deepEqual(rejected, [401, 401, 401, 401, 401]);
  // A token signed by another key is rejected.
  const forged = await new SignJWT({
    email: good.email,
    nonce: createHash('sha256').update(nonce).digest('hex'),
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'fixture-apple' })
    .setIssuer('https://appleid.apple.com')
    .setAudience(bundleId)
    .setSubject(good.sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign((await generateKeyPair('ES256')).privateKey);
  assert.equal((await attempt({ token: forged, nonce })).status, 401);
  const valid = await appleToken(good);
  // ID tokens only continue a phone authorization, always with a long nonce.
  assert.equal((await attempt({ token: valid })).status, 400);
  assert.equal((await attempt({ token: valid, nonce: 'short' })).status, 400);
  assert.equal((await signIn({ provider: 'apple', idToken: { token: valid, nonce } })).status, 400);
  const dashboard = await startAuthorization('myselfmd-dashboard');
  assert.equal((await attempt({ token: valid, nonce }, dashboard.query)).status, 400);
  // The signed query cannot be altered to another callback.
  const tampered = new URLSearchParams(start.query);
  tampered.set('redirect_uri', 'myselfmd://evil');
  assert.equal((await attempt({ token: valid, nonce }, tampered.toString())).status, 400);
  // Google ID tokens stay disabled without the app's own Google client IDs.
  assert.equal((await attempt({ token: valid, nonce }, start.query, 'google')).status, 404);
  assert.equal(db.prepare("SELECT 1 FROM account WHERE accountId='apple-neg'").get(), undefined);

  // Apple code exchange keeps a revocable token only for the same Apple user.
  const idFor = /** @param {string} sub */ (sub) =>
    `e30.${Buffer.from(JSON.stringify({ sub, aud: bundleId })).toString('base64url')}.sig`;
  assert.deepEqual(
    await exchangeAppleCode(
      { clientId: bundleId, clientSecret: 's', code: 'c', subject: 'u1' },
      transport(200, { access_token: 'at', id_token: idFor('u1') }),
    ),
    { accessToken: 'at' },
  );
  await assert.rejects(
    exchangeAppleCode(
      { clientId: bundleId, clientSecret: 's', code: 'c', subject: 'u1' },
      transport(200, { access_token: 'at', id_token: idFor('u2') }),
    ),
    /could not be confirmed/,
  );
  await assert.rejects(
    exchangeAppleCode(
      { clientId: bundleId, clientSecret: 's', code: 'c', subject: 'u1' },
      transport(400, { error: 'invalid_grant' }),
    ),
    /expired/,
  );
  assert.equal(issuedToBundle(idFor('u1'), 'fixture.apple.web'), false);
  assert.equal(issuedToBundle(null, bundleId), false);
  console.log(
    'Native sign-in: Apple ID token → phone PKCE code → tokens, sign-up, repeat and existing-link users, no implicit email linking, audience/issuer/age/signature/nonce rejection, phone-only and signed-query enforcement, Google disabled, and Apple code exchange passed.',
  );
} finally {
  Object.assign(globalThis, { fetch: realFetch });
  db.close();
}
