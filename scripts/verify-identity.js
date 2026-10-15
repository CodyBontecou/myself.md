import { chatgptMcpPath, chatgptToolNames } from '../server/chatgpt-tools.js';
import { parseProfile } from '../core/profiles.js';
import { Buffer } from 'node:buffer';
import { hashPassword } from 'better-auth/crypto';
import { reviewerUserId, reviewerEmail } from '../server/reviewer.js';
import { seedReviewerFixtures } from '../server/reviewer-fixtures.js';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { PairingStore } from '../server/pairing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { accountTokenKey } from '../server/store-subscriptions.js';
import { exportRows } from '../server/migration-rows.js';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  openSync,
  closeSync,
  readdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHmac, createHash, randomBytes } from 'node:crypto';
import { generateKeyPair, exportPKCS8, createRemoteJWKSet, jwtVerify } from 'jose';
import { createIdentity } from '../server/identity.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { createServer, request as requestHTTP } from 'node:http';

const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const address = reservation.address();
assert.ok(address && typeof address !== 'string');
const port = String(address.port);
await new Promise((done) => reservation.close(done));
const origin = `http://127.0.0.1:${port}`;
let callbackReferrer = false;
const callbackServer = createServer((request, response) => {
  callbackReferrer ||= Boolean(request.headers.referer);
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end('OAuth callback received');
});
callbackServer.listen(0, '127.0.0.1');
await once(callbackServer, 'listening');
const callbackAddress = callbackServer.address();
assert.ok(callbackAddress && typeof callbackAddress !== 'string');
const callbackURL = `http://127.0.0.1:${callbackAddress.port}/callback`;
const issuer = `${origin}/auth/realms/myselfmd`;
const secret = randomBytes(32).toString('hex');
const directory = mkdtempSync(resolve('.local/identity-test-'));
const log = join(directory, 'runtime.log');
const output = openSync(log, 'a');
const configPath = join(directory, 'wrangler.json');
const db = new DatabaseSync(':memory:');
db.exec(readFileSync('worker/identity.sql', 'utf8'));
db.exec(readFileSync('worker/migrations/reviewer-access.sql', 'utf8'));
const reviewerPassword = randomBytes(24).toString('base64url');
db.prepare('INSERT INTO user VALUES (?,?,?,?,?,?,?)').run(
  reviewerUserId,
  'Fictional reviewer',
  reviewerEmail,
  1,
  null,
  Date.now(),
  Date.now(),
);
db.prepare(
  'INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',
).run(
  'reviewer-credential',
  reviewerUserId,
  'credential',
  reviewerUserId,
  await hashPassword(reviewerPassword),
  Date.now(),
  Date.now(),
);
db.prepare('INSERT INTO reviewer_access VALUES (?,1,0)').run(reviewerUserId);
const auth = createIdentity(db, {
  issuer,
  secret,
  resource: `${origin}/mcp`,
  resources: [`${origin}/mcp`, `${origin}${chatgptMcpPath}`],
  googleId: 'fixture-google',
  googleSecret: 'fixture',
  githubId: 'fixture-github',
  githubSecret: 'fixture',
  appleId: 'fixture.apple',
  appleSecret: 'fixture',
  reviewerEnabled: true,
});
const context = await auth.$context;
await assert.rejects(
  () =>
    context.internalAdapter.createAccount({
      userId: reviewerUserId,
      providerId: 'google',
      accountId: 'forbidden-social-link',
    }),
  /cannot connect social/,
);
const forbiddenSignup = await auth.handler(
  new Request(`${issuer}/sign-up/email`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'unexpected@example.test',
      name: 'Unexpected',
      password: reviewerPassword,
    }),
  }),
);
assert.equal(forbiddenSignup.ok, false);
assert.equal(
  db.prepare('SELECT id FROM user WHERE email=?').get('unexpected@example.test'),
  undefined,
);
await context.adapter.create({
  model: 'user',
  forceAllowId: true,
  data: {
    id: 'original-user-id',
    name: 'Fixture',
    email: 'fixture@example.test',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});
await context.adapter.create({
  model: 'account',
  data: {
    providerId: 'github',
    accountId: 'original-provider-id',
    userId: 'original-user-id',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});
await Promise.all(
  ['myselfmd-phone', 'myselfmd-dashboard', 'myselfmd-mcp'].map(async (clientId) => {
    await context.adapter.create({
      model: 'oauthClient',
      data: {
        clientId,
        name: 'Fixture client',
        redirectUris: [
          clientId === 'myselfmd-phone'
            ? 'myselfmd://oauth'
            : clientId === 'myselfmd-mcp'
              ? callbackURL
              : `${origin}/dashboard/callback`,
        ],
        postLogoutRedirectUris: [`${origin}/dashboard`],
        tokenEndpointAuthMethod: 'none',
        applicationType: clientId === 'myselfmd-dashboard' ? 'web' : 'native',
        scopes: ['openid', 'profile', 'email', 'myselfmd', 'offline_access'],
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        skipConsent: clientId !== 'myselfmd-mcp',
        enableEndSession: true,
        subjectType: 'public',
        requirePKCE: true,
      },
    });
    await context.adapter.create({
      model: 'oauthClientResource',
      data: { clientId, resourceId: `${origin}/mcp`, createdAt: new Date() },
    });
    if (clientId === 'myselfmd-mcp') {
      await context.adapter.create({
        model: 'oauthClientResource',
        data: { clientId, resourceId: `${origin}${chatgptMcpPath}`, createdAt: new Date() },
      });
    }
  }),
);
const session = await context.internalAdapter.createSession('original-user-id');
assert.ok(session);
const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(session.token + '.' + createHmac('sha256', secret).update(session.token).digest('base64'))}`;
const logoutSession = await context.internalAdapter.createSession('original-user-id');
assert.ok(logoutSession);
const logoutCookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(logoutSession.token + '.' + createHmac('sha256', secret).update(logoutSession.token).digest('base64'))}`;
const seed = [
  'user',
  'account',
  'session',
  'oauthResource',
  'oauthClient',
  'oauthClientResource',
  'reviewer_access',
].flatMap((table) =>
  db
    .prepare(`SELECT * FROM "${table}"`)
    .all()
    .map(
      (row) =>
        `INSERT INTO "${table}" (${Object.keys(row)
          .map((key) => `"${key}"`)
          .join(',')}) VALUES (${Object.values(row)
          .map((value) =>
            value === null
              ? 'NULL'
              : typeof value === 'number'
                ? value
                : `'${String(value).replaceAll("'", "''")}'`,
          )
          .join(',')});`,
    ),
);
const seedPath = join(directory, 'seed.sql');
writeFileSync(seedPath, seed.join('\n'), { mode: 0o600 });
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1'));
config.main = resolve('worker/index.js');
config.assets.directory = resolve('dashboard/dist');
config.routes = [];
Object.assign(config.vars, {
  PUBLIC_URL: origin,
  PUBLIC_URL_ALIASES: '',
  OAUTH_ISSUER: issuer,
  ACCOUNT_NAMESPACE: 'https://old.example/realm',
  ALLOW_HTTP_DEV: '1',
  IDENTITY_ENABLED: '1',
  MIGRATION_ENABLED: '1',
  REVIEWER_LOGIN_ENABLED: '1',
});
writeFileSync(configPath, JSON.stringify(config));
const appleKey = await exportPKCS8(
  (await generateKeyPair('ES256', { extractable: true })).privateKey,
);
writeFileSync(
  join(directory, '.dev.vars'),
  Object.entries({
    CLOUD_ENCRYPTION_KEY: 'a'.repeat(64),
    IMPORT_SECRET: secret,
    IDENTITY_SECRET: secret,
    GOOGLE_AUTH_CLIENT_ID: 'fixture-google',
    GOOGLE_AUTH_CLIENT_SECRET: 'fixture',
    GITHUB_AUTH_CLIENT_ID: 'fixture-github',
    GITHUB_AUTH_CLIENT_SECRET: 'fixture',
    APPLE_AUTH_CLIENT_ID: 'fixture.apple',
    APPLE_AUTH_TEAM_ID: 'FIXTURE123',
    APPLE_AUTH_KEY_ID: 'FIXTURE123',
    APPLE_AUTH_PRIVATE_KEY: appleKey,
  })
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n'),
  { mode: 0o600 },
);
/** @type {import('node:child_process').ChildProcess|null} */ let child = null;
const client = new Client({ name: 'identity-fixture', version: '1' });
let passed = false;
/** @param {string[]} args */
async function cli(args) {
  const command = spawn(resolve('node_modules/.bin/wrangler'), args, {
    stdio: ['ignore', output, output],
  });
  const [code] = await once(command, 'exit');
  assert.equal(code, 0, readFileSync(log, 'utf8'));
}
/** @param {number} attempts @returns {Promise<void>} */
async function ready(attempts) {
  try {
    if ((await fetch(`${origin}/health`)).ok) return;
  } catch {}
  if (!attempts) throw new Error(readFileSync(log, 'utf8'));
  await new Promise((done) => setTimeout(done, 100));
  return ready(attempts - 1);
}
/** @param {string} path @param {Record<string,string>} body @param {string} [sessionCookie] @param {string} [sourceIP] */
function post(path, body, sessionCookie = '', sourceIP = '') {
  return fetch(issuer + path, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: origin,
      ...(sourceIP ? { 'cf-connecting-ip': sourceIP } : {}),
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: new URLSearchParams(body),
  });
}
/** @param {string} path @param {string} sessionCookie @param {string} [body] @param {string} [requestOrigin] @returns {Promise<{status:number|undefined,headers:import('node:http').IncomingHttpHeaders,text:string}>} */
function browserRequest(path, sessionCookie, body, requestOrigin = origin) {
  return new Promise((resolveRequest, reject) => {
    const request = requestHTTP(
      issuer + path,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Cookie: sessionCookie,
          Origin: requestOrigin,
          Accept: 'text/html',
          'Sec-Fetch-Mode': 'navigate',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          text += chunk;
        });
        response.on('end', () =>
          resolveRequest({ status: response.statusCode, headers: response.headers, text }),
        );
        response.on('error', reject);
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}
/** @param {string} clientId @param {boolean} loggedIn @param {string} [scope] @param {string} [resource] @param {string} [sessionCookie] */
async function authorize(
  clientId,
  loggedIn,
  scope = 'openid profile email myselfmd offline_access',
  resource = `${origin}/mcp`,
  sessionCookie = cookie,
) {
  const verifier = randomBytes(32).toString('base64url');
  const redirect =
    clientId === 'myselfmd-phone'
      ? 'myselfmd://oauth'
      : clientId === 'myselfmd-mcp'
        ? callbackURL
        : `${origin}/dashboard/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirect,
    scope,
    resource,
    ...(resource.endsWith(chatgptMcpPath) ? { prompt: 'consent' } : {}),
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state: 'fixture-state',
  });
  const response = await fetch(`${issuer}/protocol/openid-connect/auth?${params}`, {
    redirect: 'manual',
    headers: {
      Accept: 'text/html',
      'Sec-Fetch-Mode': 'navigate',
      ...(loggedIn ? { Cookie: sessionCookie } : {}),
    },
  });
  assert.equal(response.status, 302, await response.clone().text());
  return { response, verifier, redirect };
}
try {
  await cli([
    'd1',
    'execute',
    'myself-md-identity',
    '--local',
    '--config',
    configPath,
    '--persist-to',
    join(directory, 'state'),
    '--file',
    resolve('worker/identity.sql'),
  ]);
  await cli([
    'd1',
    'execute',
    'myself-md-identity',
    '--local',
    '--config',
    configPath,
    '--persist-to',
    join(directory, 'state'),
    '--file',
    resolve('worker/migrations/reviewer-access.sql'),
  ]);
  await cli([
    'd1',
    'execute',
    'myself-md-identity',
    '--local',
    '--config',
    configPath,
    '--persist-to',
    join(directory, 'state'),
    '--file',
    seedPath,
  ]);
  await cli([
    'd1',
    'execute',
    'myself-md-directory',
    '--local',
    '--config',
    configPath,
    '--persist-to',
    join(directory, 'state'),
    '--file',
    resolve('worker/directory.sql'),
  ]);
  child = spawn(
    resolve('node_modules/.bin/wrangler'),
    ['dev', '--config', configPath, '--port', port, '--persist-to', join(directory, 'state')],
    { stdio: ['ignore', output, output] },
  );
  await ready(200);
  // Cloud deletion fixtures need the same verified lifetime entitlement as real uploads.
  const fixtureSubject = 'https://old.example/realm|original-user-id';
  // Concurrent cold requests must not inherit unfinished identity I/O from a different request.
  const protectedResource = await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`);
  const resourceDiscovery = z
    .object({ scopes_supported: z.array(z.string()) })
    .parse(await protectedResource.json());
  assert.deepEqual(resourceDiscovery.scopes_supported, ['myselfmd', 'offline_access']);
  const coldConsent = await fetch(`${issuer}/consent?scope=myselfmd`, {
    signal: AbortSignal.timeout(6000),
  });
  assert.equal(coldConsent.status, 200);
  assert.match(await coldConsent.text(), /Connect this application/);
  await Promise.all(
    [
      ['/.well-known/openid-configuration', 'GET', 200],
      ['/.well-known/oauth-authorization-server', 'GET', 200],
      ['/jwks', 'GET', 200],
      ['/protocol/openid-connect/certs', 'GET', 200],
      [`/connected-accounts?subject=${encodeURIComponent(fixtureSubject)}`, 'GET', 200],
      [`/connected-accounts?subject=${encodeURIComponent(fixtureSubject)}`, 'POST', 401],
    ].map(async ([path, method, status]) => {
      const response = await fetch(issuer + path, {
        method: String(method),
        headers: { Origin: origin },
        ...(method === 'POST' ? { body: 'action=link&provider=google' } : {}),
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(response.status, status);
      await response.body?.cancel();
    }),
  );

  const grant = await fetch(`${origin}/__migration`, {
    method: 'POST',
    headers: { Authorization: `Migration ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'account',
      name: fixtureSubject,
      batch: {
        id: 'identity-lifetime-fixture',
        subject: fixtureSubject,
        tables: [
          {
            name: 'billing_grants',
            columns: ['source', 'reference', 'subject', 'created'],
            rows: [['fixture', 'identity-lifetime', fixtureSubject, Date.now()]],
          },
          {
            name: 'cloud_subscriptions',
            columns: [
              'store',
              'id',
              'subject',
              'product',
              'plan',
              'period',
              'status',
              'expires',
              'auto_renew',
              'linked',
              'verified',
            ],
            rows: [
              [
                'android',
                'deletion-cloud-fixture',
                fixtureSubject,
                'myself_md_cloud_1gb',
                'cloud_1gb',
                'monthly',
                'expired',
                Date.now() - 90 * 86400000,
                0,
                null,
                Date.now(),
              ],
            ],
          },
          {
            name: 'cloud_notices',
            columns: [
              'subject',
              'id',
              'kind',
              'details',
              'push',
              'email',
              'attempts',
              'error',
              'channel',
              'failed',
              'created',
            ],
            rows: [
              [
                fixtureSubject,
                'completed-deletion-fixture',
                'lapse-0',
                JSON.stringify({ deleteAt: Date.now(), bytesToDelete: 0, plan: null }),
                1,
                1,
                1,
                null,
                null,
                null,
                Date.now(),
              ],
            ],
          },
        ],
      },
    }),
  });
  assert.equal(grant.status, 200, await grant.clone().text());
  const reviewerSubject = `https://old.example/realm|${reviewerUserId}`;
  const fixtureBilling = new BillingStore(':memory:');
  const fixturePairing = new PairingStore(':memory:');
  const fixtureCloud = new CloudStore(':memory:', Buffer.from('a'.repeat(64), 'hex'), null, (s) =>
    fixtureBilling.cloudEntitlement(s),
  );
  const fixtureHistory = new HistoryStore(':memory:', fixtureCloud);
  let reviewerFixture;
  try {
    await assert.rejects(
      () =>
        seedReviewerFixtures(
          {
            billing: fixtureBilling,
            pairing: fixturePairing,
            cloud: fixtureCloud,
            history: fixtureHistory,
          },
          fixtureSubject,
          '2026-10-13',
        ),
      /reserved reviewer/,
    );
    reviewerFixture = await seedReviewerFixtures(
      {
        billing: fixtureBilling,
        pairing: fixturePairing,
        cloud: fixtureCloud,
        history: fixtureHistory,
      },
      reviewerSubject,
      '2026-10-13',
    );
    assert.equal(reviewerFixture.exports, 6);
    assert.equal(reviewerFixture.sharedExports, 4);
    assert.equal(
      (
        await seedReviewerFixtures(
          {
            billing: fixtureBilling,
            pairing: fixturePairing,
            cloud: fixtureCloud,
            history: fixtureHistory,
          },
          reviewerSubject,
          '2026-10-13',
        )
      ).exports,
      6,
    );
    const reviewerEvents = fixtureHistory.list(reviewerSubject, null).events;
    assert.equal(reviewerEvents.length, 6);
    assert.ok(reviewerEvents.every((event) => event.artifacts.length === 1));
    const tables = [
      exportRows(fixturePairing.db, ['devices'], 'devices', 0),
      exportRows(fixtureBilling.db, ['billing_grants'], 'billing_grants', 0),
      exportRows(fixtureCloud.db, ['exports'], 'exports', 0),
      exportRows(fixtureCloud.db, ['cloud_access'], 'cloud_access', 0),
      exportRows(fixtureHistory.db, ['activity'], 'activity', 0),
    ].map(({ name, columns, rows }) => ({ name, columns, rows }));
    const imported = await fetch(`${origin}/__migration`, {
      method: 'POST',
      headers: { Authorization: `Migration ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'account',
        name: reviewerSubject,
        batch: { id: 'reviewer-fixture-v1', subject: reviewerSubject, tables },
      }),
    });
    assert.equal(imported.status, 200, await imported.text());
  } finally {
    fixtureHistory.db.close();
    fixtureCloud.db.close();
    fixturePairing.db.close();
    fixtureBilling.db.close();
  }
  child.kill('SIGTERM');
  await once(child, 'exit');
  config.vars.MIGRATION_ENABLED = '0';
  writeFileSync(configPath, JSON.stringify(config));
  child = spawn(
    resolve('node_modules/.bin/wrangler'),
    ['dev', '--config', configPath, '--port', port, '--persist-to', join(directory, 'state')],
    { stdio: ['ignore', output, output] },
  );
  await ready(200);
  assert.equal((await fetch(`${origin}/__migration`)).status, 404);
  const discovery = z
    .object({ issuer: z.string(), grant_types_supported: z.array(z.string()) })
    .parse(
      await fetch(`${issuer}/.well-known/openid-configuration`).then((response) => response.json()),
    );
  assert.equal(discovery.issuer, issuer);
  assert.ok(discovery.grant_types_supported.includes('refresh_token'));
  const standardDiscovery = await fetch(
    `${origin}/.well-known/oauth-authorization-server${new URL(issuer).pathname}`,
    { signal: AbortSignal.timeout(6000), redirect: 'manual' },
  );
  assert.equal(standardDiscovery.status, 200);
  assert.equal(
    z.object({ issuer: z.string() }).parse(await standardDiscovery.json()).issuer,
    issuer,
  );
  const logoutPage = await browserRequest('/protocol/openid-connect/logout', logoutCookie);
  assert.equal(logoutPage.status, 200, logoutPage.text);
  assert.match(logoutPage.text, /oauth2\/end-session\/confirm/);
  const confirmationCookie = (logoutPage.headers['set-cookie'] ?? [])
    .map((value) => value.split(';')[0])
    .join('; ');
  const foreignLogout = await browserRequest(
    '/oauth2/end-session/confirm',
    `${logoutCookie}; ${confirmationCookie}`,
    'action=confirm',
    'https://other.example.test',
  );
  assert.equal(foreignLogout.status, 403, foreignLogout.text);
  const logoutResult = await browserRequest(
    '/oauth2/end-session/confirm',
    `${logoutCookie}; ${confirmationCookie}`,
    'action=confirm',
  );
  assert.equal(logoutResult.status, 200, logoutResult.text);
  assert.match(logoutResult.text, /Logged out/);
  const loggedOutSession = await fetch(`${issuer}/get-session`, {
    headers: { Cookie: logoutCookie },
  });
  assert.equal(await loggedOutSession.json(), null);
  const login = await authorize('myselfmd-phone', false);
  await Promise.all(
    [
      { error: 'account_not_linked', title: 'Connect your sign-in method' },
      { error: 'state_mismatch', title: 'Start a new sign-in attempt' },
      { error: '<script>alert(1)</script>', title: 'Sign-in could not finish' },
    ].map(async ({ error, title }) => {
      const failure = await fetch(
        `${issuer}/error?${new URLSearchParams({ error, redirect_uri: 'https://evil.example', state: 'stale-state' })}`,
      );
      assert.equal(failure.status, 200);
      assert.equal(failure.headers.get('cache-control'), 'no-store');
      const html = await failure.text();
      assert.ok(html.includes(`<h1>${title}</h1>`));
      assert.match(html, /href="\/login">Try sign-in again/);
      assert.doesNotMatch(html, /evil\.example|stale-state|<script>/);
      const nonce = html.match(/<style nonce="([^"]+)"/)?.[1];
      assert.ok(nonce);
      assert.ok(
        failure.headers.get('content-security-policy')?.includes(`style-src 'nonce-${nonce}'`),
      );
    }),
  );
  assert.equal((await fetch(`${issuer}/error`, { method: 'POST' })).status, 405);
  const loginURL = new URL(login.response.headers.get('location') ?? '');
  assert.equal(loginURL.pathname, '/login');
  assert.equal(
    Number(loginURL.searchParams.get('exp')) -
      Math.floor(Number(loginURL.searchParams.get('ba_iat')) / 1000),
    15 * 60,
  );
  const loginPage = await fetch(loginURL);
  assert.match(await loginPage.text(), /id="root"/);
  // The shared /login UI continues the signed phone/MCP request through the social API.
  const social = await fetch(`${issuer}/sign-in/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      provider: 'github',
      oauth_query: loginURL.search.slice(1),
      callbackURL: `${origin}/dashboard`,
    }),
  });
  assert.equal(social.status, 200);
  const socialResult = z.object({ url: z.string() }).parse(await social.json());
  assert.equal(new URL(socialResult.url).hostname, 'github.com');
  const tamperedSocial = await fetch(`${issuer}/sign-in/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      provider: 'github',
      oauth_query: loginURL.search.slice(1).replace('fixture-state', 'tampered'),
      callbackURL: `${origin}/dashboard`,
    }),
  });
  assert.equal(tamperedSocial.status, 400);
  const githubURL = new URL(socialResult.url);
  assert.equal(githubURL.hostname, 'github.com');
  assert.equal(githubURL.searchParams.get('redirect_uri'), `${issuer}/broker/github/endpoint`);
  const apple = await post('/login', { provider: 'apple', oauth_query: loginURL.search.slice(1) });
  assert.equal(apple.status, 302, await apple.clone().text());
  const appleURL = new URL(apple.headers.get('location') ?? '');
  assert.equal(appleURL.hostname, 'appleid.apple.com');
  assert.equal(appleURL.searchParams.get('redirect_uri'), `${issuer}/broker/apple/endpoint`);
  assert.match(apple.headers.get('set-cookie') ?? '', /SameSite=None/i);
  // Isolate Google's redirect assertion from the earlier provider rate-limit bucket.
  const google = await post(
    '/login',
    {
      provider: 'google',
      oauth_query: loginURL.search.slice(1),
    },
    '',
    '192.0.2.3',
  );
  assert.equal(google.status, 302, await google.clone().text());
  const googleURL = new URL(google.headers.get('location') ?? '');
  assert.equal(googleURL.hostname, 'accounts.google.com');
  assert.equal(googleURL.searchParams.get('client_id'), 'fixture-google');
  assert.equal(googleURL.searchParams.get('redirect_uri'), `${issuer}/broker/google/endpoint`);
  assert.deepEqual(
    new Set(googleURL.searchParams.get('scope')?.split(' ')),
    new Set(['openid', 'profile', 'email']),
  );
  assert.equal(googleURL.searchParams.get('include_granted_scopes'), null);
  assert.equal(googleURL.searchParams.get('prompt'), 'select_account');
  assert.ok(googleURL.searchParams.get('state'));
  const unsupportedProvider = await post('/login', {
    provider: 'unknown',
    oauth_query: loginURL.search.slice(1),
  });
  assert.equal(unsupportedProvider.status, 400);
  const googleCallback = await fetch(
    `${issuer}/broker/google/endpoint?code=fixture&state=invalid`,
    { redirect: 'manual' },
  );
  assert.notEqual(googleCallback.status, 404);
  assert.equal((await auth.$context).options.account?.accountLinking?.enabled, true);
  const loginsUrl = `${issuer}/connected-accounts?subject=${encodeURIComponent(fixtureSubject)}`;
  const connectedPage = await fetch(loginsUrl, { headers: { Cookie: cookie } });
  assert.equal(connectedPage.status, 200);
  assert.match(await connectedPage.text(), /GitHub<\/span><span class="connected">/);
  const missingSession = await fetch(loginsUrl, {
    method: 'POST',
    headers: { Origin: origin },
    body: 'action=link&provider=google',
  });
  assert.equal(missingSession.status, 401);
  const blockedOrigin = await fetch(loginsUrl, {
    method: 'POST',
    headers: { Origin: 'https://attacker.test', Cookie: cookie },
    body: 'action=link&provider=google',
  });
  assert.equal(blockedOrigin.status, 403);
  const connectGoogle = await fetch(loginsUrl, {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'CF-Connecting-IP': '192.0.2.81' },
    body: 'action=link&provider=google',
    redirect: 'manual',
  });
  assert.equal(connectGoogle.status, 302, await connectGoogle.clone().text());
  assert.equal(
    new URL(connectGoogle.headers.get('location') ?? '').hostname,
    'accounts.google.com',
  );
  // Internal linking endpoints stay inaccessible: only the owner browser form can initiate.
  assert.equal(
    (
      await fetch(`${issuer}/link-social`, {
        method: 'POST',
        headers: { Origin: origin, Cookie: cookie },
        body: '{}',
      })
    ).status,
    404,
  );
  const phone = await authorize('myselfmd-phone', true);
  const code = new URL(phone.response.headers.get('location') ?? '').searchParams.get('code');
  assert.ok(code);
  const exchange = {
    grant_type: 'authorization_code',
    client_id: 'myselfmd-phone',
    code,
    redirect_uri: phone.redirect,
    code_verifier: phone.verifier,
    resource: `${origin}/mcp`,
  };
  const tokenResponse = await post('/protocol/openid-connect/token', exchange);
  assert.equal(tokenResponse.status, 200, await tokenResponse.clone().text());
  const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string() });
  const tokens = tokenSchema.parse(await tokenResponse.json());
  assert.ok(tokens.refresh_token);
  const certs = await fetch(`${issuer}/protocol/openid-connect/certs`);
  assert.equal(certs.status, 200, await certs.clone().text());
  const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
  const claims = (await jwtVerify(tokens.access_token, jwks, { issuer, audience: `${origin}/mcp` }))
    .payload;
  assert.equal(claims.sub, 'original-user-id');
  const reviewerStart = await authorize('myselfmd-mcp', false, 'myselfmd offline_access');
  const reviewerQuery = new URL(reviewerStart.response.headers.get('location') ?? '').search.slice(
    1,
  );
  assert.equal(
    (
      await browserRequest(
        '/reviewer-login',
        '',
        new URLSearchParams({
          username: 'reviewer',
          password: reviewerPassword,
          oauth_query: reviewerQuery,
        }).toString(),
        'https://attacker.test',
      )
    ).status,
    403,
  );
  assert.equal(
    (await post('/reviewer-login', { username: 'reviewer', password: 'wrong-reviewer-password' }))
      .status,
    401,
  );
  assert.equal(
    (
      await fetch(`${issuer}/sign-up/email`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'public@example.test',
          password: reviewerPassword,
          name: 'Public',
        }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${issuer}/sign-in/email`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'fixture@example.test', password: reviewerPassword }),
      })
    ).status,
    401,
  );
  const reviewerLogin = await browserRequest(
    '/reviewer-login',
    '',
    new URLSearchParams({
      username: 'reviewer',
      password: reviewerPassword,
      oauth_query: reviewerQuery,
    }).toString(),
  );
  assert.equal(reviewerLogin.status, 302, reviewerLogin.text);
  const reviewerCookie = (reviewerLogin.headers['set-cookie'] ?? [])
    .map((value) => value.split(';')[0])
    .join('; ');
  const reviewerConsentURL = new URL(String(reviewerLogin.headers.location));
  assert.equal(reviewerConsentURL.pathname, '/auth/realms/myselfmd/consent');
  const reviewerConsent = await browserRequest(
    '/consent',
    reviewerCookie,
    new URLSearchParams({
      accept: 'true',
      oauth_query: reviewerConsentURL.search.slice(1),
    }).toString(),
  );
  assert.equal(reviewerConsent.status, 302, reviewerConsent.text);
  const reviewerCode = new URL(String(reviewerConsent.headers.location)).searchParams.get('code');
  assert.ok(reviewerCode);
  const reviewerTokens = tokenSchema.parse(
    await (
      await post('/oauth2/token', {
        grant_type: 'authorization_code',
        client_id: 'myselfmd-mcp',
        code: reviewerCode,
        redirect_uri: reviewerStart.redirect,
        code_verifier: reviewerStart.verifier,
        resource: `${origin}/mcp`,
      })
    ).json(),
  );
  assert.equal(
    (await jwtVerify(reviewerTokens.access_token, jwks, { issuer, audience: `${origin}/mcp` }))
      .payload.sub,
    reviewerUserId,
  );
  assert.equal(
    (
      await browserRequest(
        `/connected-accounts?subject=${encodeURIComponent(reviewerSubject)}`,
        reviewerCookie,
      )
    ).status,
    403,
  );
  let reviewerFileId = '';
  const reviewerClient = new Client({ name: 'reviewer-fixture', version: '1' });
  try {
    await reviewerClient.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${reviewerTokens.access_token}` } },
      }),
    );
    const unscopedProfile = await reviewerClient.callTool({
      name: 'get_account_profile',
      arguments: {},
    });
    assert.notEqual(
      unscopedProfile.isError,
      true,
      'An MCP-only token must not fail the account profile tool.',
    );
    assert.deepEqual(unscopedProfile.structuredContent, { name: null, email: null, picture: null });
    const listed = await reviewerClient.callTool({ name: 'list_cloud_exports', arguments: {} });
    assert.ok(Array.isArray(listed.content));
    const text = listed.content[0];
    assert.ok(text && text.type === 'text');
    const files = z.array(z.object({ id: z.string() })).parse(JSON.parse(text.text));
    assert.equal(files.length, 4);
    const fileId = files[0]?.id;
    assert.ok(fileId);
    const page = await reviewerClient.callTool({
      name: 'read_cloud_export',
      arguments: { exportId: fileId, limit: 50 },
    });
    assert.notEqual(page.isError, true);
    assert.ok(Array.isArray(page.content));
    const pageText = page.content[0];
    assert.ok(pageText && pageText.type === 'text');
    const fixturePage = z
      .object({
        records: z.array(
          z.object({ source: z.string(), native: z.object({ fictional: z.literal(true) }) }),
        ),
        nextCursor: z.string(),
      })
      .parse(JSON.parse(pageText.text));
    assert.equal(fixturePage.records.length, 50);
    assert.equal(fixturePage.nextCursor, '50');
    assert.ok(fixturePage.records.every((record) => record.source === 'reviewer-fixture'));
    const linking = await reviewerClient.callTool({ name: 'get_account_logins', arguments: {} });
    assert.ok(
      z
        .object({ providers: z.array(z.object({ available: z.boolean() })) })
        .parse(linking.structuredContent)
        .providers.every((provider) => !provider.available),
    );
    assert.equal(
      (
        await reviewerClient.callTool({
          name: 'request_account_link',
          arguments: { provider: 'google' },
        })
      ).isError,
      true,
    );
    reviewerFileId = fileId;
  } finally {
    await reviewerClient.close();
  }

  const restrictedResource = `${origin}${chatgptMcpPath}`;
  const restrictedMetadata = await fetch(
    `${origin}/.well-known/oauth-protected-resource${chatgptMcpPath}`,
  );
  assert.equal(restrictedMetadata.status, 200);
  assert.equal(
    z.object({ resource: z.string() }).parse(await restrictedMetadata.json()).resource,
    restrictedResource,
  );
  assert.equal(
    (
      await fetch(restrictedResource, {
        headers: { Authorization: `Bearer ${reviewerTokens.access_token}` },
      })
    ).status,
    401,
  );
  const restrictedStart = await authorize(
    'myselfmd-mcp',
    true,
    'myselfmd offline_access',
    restrictedResource,
    reviewerCookie,
  );
  const restrictedConsentURL = new URL(restrictedStart.response.headers.get('location') ?? '');
  assert.equal(
    restrictedConsentURL.searchParams.get('error'),
    null,
    restrictedConsentURL.searchParams.get('error_description') ?? 'OAuth authorization failed',
  );
  assert.equal(
    restrictedConsentURL.pathname,
    '/auth/realms/myselfmd/consent',
    restrictedConsentURL.pathname,
  );
  const restrictedConsent = await browserRequest(
    '/consent',
    reviewerCookie,
    new URLSearchParams({
      accept: 'true',
      oauth_query: new URL(restrictedStart.response.headers.get('location') ?? '').search.slice(1),
    }).toString(),
  );
  assert.equal(restrictedConsent.status, 302, restrictedConsent.text);
  const restrictedTokens = tokenSchema.parse(
    await (
      await post('/oauth2/token', {
        grant_type: 'authorization_code',
        client_id: 'myselfmd-mcp',
        code: new URL(String(restrictedConsent.headers.location)).searchParams.get('code') ?? '',
        redirect_uri: restrictedStart.redirect,
        code_verifier: restrictedStart.verifier,
        resource: restrictedResource,
      })
    ).json(),
  );
  assert.equal(
    (
      await fetch(`${origin}/api/dashboard`, {
        headers: { Authorization: `Bearer ${restrictedTokens.access_token}` },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(`${origin}/mcp`, {
        headers: { Authorization: `Bearer ${restrictedTokens.access_token}` },
      })
    ).status,
    401,
  );
  const restrictedClient = new Client({ name: 'chatgpt-resource-fixture', version: '1' });
  try {
    await restrictedClient.connect(
      new StreamableHTTPClientTransport(new URL(restrictedResource), {
        requestInit: { headers: { Authorization: `Bearer ${restrictedTokens.access_token}` } },
      }),
    );
    const restrictedTools = await restrictedClient.listTools();
    assert.deepEqual(
      new Set(restrictedTools.tools.map((tool) => tool.name)),
      new Set(chatgptToolNames),
    );
    for (const name of [
      'get_phone_debug_logs',
      'get_lifetime_access',
      'send_support_message',
      'delete_account',
    ]) {
      // Sequential calls prove removed registrations are not merely hidden from discovery.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await assert.rejects(() => restrictedClient.callTool({ name, arguments: {} }), /not found/);
    }
    const documentation = await restrictedClient.callTool({
      name: 'get_public_documentation',
      arguments: {},
    });
    assert.notEqual(documentation.isError, true);
    assert.ok(
      documentation.content.some(
        (value) => value.type === 'text' && value.text.includes('https://myself.md/mcp/chatgpt'),
      ),
    );
    assert.ok(
      !documentation.content.some(
        (value) => value.type === 'text' && /\$\d|timemd\.app|planned US price/.test(value.text),
      ),
    );
    const restrictedList = await restrictedClient.callTool({
      name: 'list_cloud_exports',
      arguments: {},
    });
    const text = restrictedList.content.find((value) => value.type === 'text');
    assert.ok(text && text.type === 'text');
    assert.equal(JSON.parse(text.text).length, 4);
    assert.equal(
      (
        await restrictedClient.callTool({
          name: 'read_cloud_export',
          arguments: { exportId: reviewerFileId, limit: 1 },
        })
      ).isError,
      undefined,
    );
  } finally {
    await restrictedClient.close();
  }
  console.log(
    'PASS ChatGPT resource audience isolation, shared data reads, safe docs, and executable exclusion of diagnostics/commerce/support/deletion tools.',
  );
  assert.equal(claims.client_id, 'myselfmd-phone');
  const expectedProfile = { name: 'Fixture', email: 'fixture@example.test', picture: null };
  const profileResponse = await fetch(`${origin}/api/account-profile`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  assert.equal(profileResponse.status, 200, await profileResponse.clone().text());
  assert.deepEqual(await profileResponse.json(), expectedProfile);
  const devices = await fetch(`${origin}/api/devices`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  assert.equal(devices.status, 200, await devices.clone().text());
  assert.equal(
    z.object({ subject: z.string() }).parse(await devices.json()).subject,
    'https://old.example/realm|original-user-id',
  );
  const wrongRefresh = await post('/protocol/openid-connect/token', {
    grant_type: 'refresh_token',
    client_id: 'myselfmd-dashboard',
    refresh_token: tokens.refresh_token,
    resource: `${origin}/mcp`,
  });
  assert.equal(wrongRefresh.status, 400);
  const refresh = await post('/protocol/openid-connect/token', {
    grant_type: 'refresh_token',
    client_id: 'myselfmd-phone',
    refresh_token: tokens.refresh_token,
    resource: `${origin}/mcp`,
  });
  assert.equal(refresh.status, 200, await refresh.clone().text());
  const retryRefresh = await post('/protocol/openid-connect/token', {
    grant_type: 'refresh_token',
    client_id: 'myselfmd-phone',
    refresh_token: tokens.refresh_token,
    resource: `${origin}/mcp`,
  });
  assert.equal(retryRefresh.status, 200, await retryRefresh.clone().text());
  assert.deepEqual(await retryRefresh.json(), await refresh.clone().json());
  let mcp = await authorize('myselfmd-mcp', true);
  const consentURL = new URL(mcp.response.headers.get('location') ?? '');
  assert.equal(consentURL.pathname, '/auth/realms/myselfmd/consent');
  const consentPage = await fetch(consentURL);
  assert.equal(consentPage.headers.get('referrer-policy'), 'same-origin');
  assert.ok(
    consentPage.headers.get('content-security-policy')?.includes(new URL(mcp.redirect).origin),
  );
  const consentHTML = await consentPage.text();
  const styleNonce = consentHTML.match(/<style nonce="([^"]+)">/)?.[1];
  assert.ok(styleNonce);
  assert.ok(
    consentPage.headers.get('content-security-policy')?.includes(`style-src 'nonce-${styleNonce}'`),
  );
  const invalidCallback = new URL(consentURL);
  invalidCallback.searchParams.set('redirect_uri', 'https://untrusted.example/callback');
  assert.ok(
    !(await fetch(invalidCallback)).headers
      .get('content-security-policy')
      ?.includes('untrusted.example'),
  );
  await Promise.all(
    ['null', 'https://untrusted.example'].map(async (requestOrigin) => {
      const denied = await fetch(`${issuer}/consent`, {
        method: 'POST',
        headers: { Origin: requestOrigin, Cookie: cookie },
        body: new URLSearchParams({ accept: 'true', oauth_query: consentURL.search.slice(1) }),
      });
      assert.equal(denied.status, 403);
    }),
  );
  let mcpCode;
  if (process.argv.includes('--browser')) {
    // Negative password cases intentionally consume the production limiter. Start the
    // separate browser scenario with a fresh local rate window, without weakening it.
    child.kill('SIGTERM');
    await once(child, 'exit');
    await cli([
      'd1',
      'execute',
      'myself-md-identity',
      '--local',
      '--config',
      configPath,
      '--persist-to',
      join(directory, 'state'),
      '--command',
      'DELETE FROM rateLimit;',
    ]);
    child = spawn(
      resolve('node_modules/.bin/wrangler'),
      ['dev', '--config', configPath, '--port', port, '--persist-to', join(directory, 'state')],
      { stdio: ['ignore', output, output] },
    );
    await ready(200);
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    try {
      const reviewerBrowser = await browser.newContext();
      const reviewerTab = await reviewerBrowser.newPage();
      await reviewerTab.goto(`${origin}/login`);
      await reviewerTab.getByRole('button', { name: 'Reviewer sign-in', exact: true }).click();
      await reviewerTab.waitForURL((url) => url.pathname.endsWith('/reviewer-login'));
      await reviewerTab.getByLabel('Username').fill('reviewer');
      await reviewerTab.getByLabel('Password').fill(reviewerPassword);
      await reviewerTab.getByRole('button', { name: 'Sign in as reviewer', exact: true }).click();
      await reviewerTab
        .waitForURL(
          (url) => url.pathname === '/dashboard' || url.pathname === '/dashboard/callback',
        )
        .catch(async (error) => {
          console.error(
            'Reviewer browser:',
            new URL(reviewerTab.url()).pathname,
            await reviewerTab.locator('body').innerText(),
          );
          throw error;
        });
      await reviewerTab
        .locator('header')
        .getByLabel('6 files: Stored export files', { exact: true })
        .waitFor({ state: 'visible' });
      assert.ok(
        (await reviewerTab.context().cookies()).some((value) =>
          value.name.includes('session_token'),
        ),
      );
      await reviewerBrowser.close();
      const browserContext = await browser.newContext();
      const [cookieName, ...cookieValue] = cookie.split('=');
      assert.ok(cookieName);
      await browserContext.addCookies([
        { name: cookieName, value: cookieValue.join('='), url: origin },
      ]);
      const tab = await browserContext.newPage();
      const callbackOrigin = new URL(mcp.redirect).origin;
      await tab.goto(consentURL.href);
      assert.equal(
        await tab.evaluate('getComputedStyle(document.querySelector("main")).borderRadius'),
        '20px',
      );
      await [320, 390].reduce(async (previous, width) => {
        await previous;
        await tab.setViewportSize({ width, height: 844 });
        assert.ok(
          await tab.evaluate('document.documentElement.scrollWidth <= innerWidth'),
          `Consent must fit a ${width}px viewport.`,
        );
        assert.ok(await tab.getByRole('button', { name: 'Allow access', exact: true }).isVisible());
      }, Promise.resolve());
      await tab.setViewportSize({ width: 1280, height: 800 });
      await tab.getByRole('button', { name: 'Cancel', exact: true }).click();
      await tab.waitForURL((url) => url.origin === callbackOrigin && url.searchParams.has('error'));
      assert.equal(new URL(tab.url()).searchParams.get('error'), 'access_denied');
      assert.equal(new URL(tab.url()).searchParams.get('code'), null);
      mcp = await authorize('myselfmd-mcp', true);
      await tab.goto(mcp.response.headers.get('location') ?? '');
      await tab.getByRole('button', { name: 'Allow access', exact: true }).click();
      await tab.waitForURL((url) => url.origin === callbackOrigin && url.searchParams.has('code'));
      mcpCode = new URL(tab.url()).searchParams.get('code');
      assert.equal(new URL(tab.url()).searchParams.get('state'), 'fixture-state');
      assert.equal(callbackReferrer, false);
      await tab.route(
        (url) => url.hostname === 'accounts.google.com',
        (route) =>
          route.fulfill({ contentType: 'text/html', body: 'Google authentication received' }),
      );
      await tab.goto(loginsUrl);
      assert.equal(
        await tab.evaluate('getComputedStyle(document.querySelector(".provider-row")).display'),
        'flex',
      );
      await tab.setViewportSize({ width: 320, height: 844 });
      assert.ok(await tab.evaluate('document.documentElement.scrollWidth <= innerWidth'));
      await tab.emulateMedia({ colorScheme: 'dark' });
      assert.ok(await tab.getByRole('button', { name: 'Connect Google', exact: true }).isVisible());
      await tab.emulateMedia({ colorScheme: 'light' });
      await tab.setViewportSize({ width: 1280, height: 800 });
      assert.ok(
        await tab
          .getByRole('listitem')
          .filter({ hasText: 'GitHub' })
          .getByText('Connected')
          .isVisible(),
      );
      await tab.getByRole('button', { name: 'Connect Google', exact: true }).click();
      await tab.waitForURL((url) => url.hostname === 'accounts.google.com');
      console.log(
        'Browser account linking verified: connected inventory and owner form/provider handoff.',
      );
      // The legacy login form also redirects to an external social provider.
      await tab.route(
        (url) => url.hostname === 'github.com',
        (route) => route.fulfill({ contentType: 'text/html', body: 'Social provider received' }),
      );
      const browserLogin = await authorize('myselfmd-phone', false);
      const browserLoginURL = new URL(browserLogin.response.headers.get('location') ?? '');
      await browserContext.clearCookies();
      // Isolate this fixture from the earlier social API rate-limit bucket in local workerd.
      await browserContext.setExtraHTTPHeaders({ 'cf-connecting-ip': '192.0.2.2' });
      await tab.goto(`${issuer}/login${browserLoginURL.search}`);
      assert.equal(await tab.locator('.sign-in-form svg').count(), 3);
      assert.equal(
        await tab.evaluate('getComputedStyle(document.querySelector("main")).borderRadius'),
        '20px',
      );
      await tab.setViewportSize({ width: 320, height: 844 });
      await tab.emulateMedia({ colorScheme: 'dark' });
      assert.ok(await tab.evaluate('document.documentElement.scrollWidth <= innerWidth'));
      await tab.emulateMedia({ colorScheme: 'light' });
      await tab.setViewportSize({ width: 1280, height: 800 });
      await tab.getByRole('button', { name: 'Continue with GitHub', exact: true }).click();
      await tab.waitForURL((url) => url.hostname === 'github.com');
      console.log('Browser OAuth verified: cancel, accept, external callback and social sign-in.');
      const errorScreenshots = resolve('.local/sign-in-error-ui');
      mkdirSync(errorScreenshots, { recursive: true });
      await Promise.all(
        ['account_not_linked', 'state_mismatch'].map(async (error) => {
          const errorTab = await browserContext.newPage();
          await errorTab.setViewportSize({ width: 1280, height: 800 });
          await errorTab.goto(`${issuer}/error?error=${error}`);
          await errorTab.screenshot({ path: join(errorScreenshots, `${error}-light.png`) });
          await errorTab.setViewportSize({ width: 320, height: 844 });
          await errorTab.emulateMedia({ colorScheme: 'dark' });
          assert.ok(await errorTab.evaluate('document.documentElement.scrollWidth <= innerWidth'));
          await errorTab.screenshot({ path: join(errorScreenshots, `${error}-dark-mobile.png`) });
          await errorTab.getByRole('link', { name: 'Try sign-in again', exact: true }).click();
          await errorTab.waitForURL(`${origin}/login`);
          assert.equal(
            await errorTab
              .getByRole('button', { name: 'Continue with Google', exact: true })
              .count(),
            1,
          );
          await errorTab.close();
        }),
      );
      console.log('Browser sign-in errors verified: guidance, mobile dark layout and fresh retry.');
    } finally {
      await browser.close();
    }
  } else {
    const accept = await post(
      '/consent',
      { accept: 'true', oauth_query: consentURL.search.slice(1) },
      cookie,
    );
    assert.equal(accept.status, 302, await accept.clone().text());
    mcpCode = new URL(accept.headers.get('location') ?? '').searchParams.get('code');
  }
  assert.ok(mcpCode);
  const mcpTokensResponse = await post('/protocol/openid-connect/token', {
    grant_type: 'authorization_code',
    client_id: 'myselfmd-mcp',
    code: mcpCode,
    redirect_uri: mcp.redirect,
    code_verifier: mcp.verifier,
    resource: `${origin}/mcp`,
  });
  assert.equal(mcpTokensResponse.status, 200, await mcpTokensResponse.clone().text());
  const mcpTokens = tokenSchema.parse(await mcpTokensResponse.json());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${mcpTokens.access_token}` } },
    }),
  );
  assert.equal(
    (await client.callTool({ name: 'read_cloud_export', arguments: { exportId: reviewerFileId } }))
      .isError,
    true,
  );
  const accountProfile = await client.callTool({ name: 'get_account_profile', arguments: {} });
  assert.equal(accountProfile.isError, undefined);
  assert.deepEqual(accountProfile.structuredContent, expectedProfile);
  const logins = await client.callTool({ name: 'get_account_logins', arguments: {} });
  assert.equal(logins.isError, undefined);
  const linkedLogins = z
    .object({
      subject: z.string(),
      providers: z.array(z.object({ provider: z.string(), connected: z.boolean() })),
      handoff: z.object({ url: z.string() }),
    })
    .parse(logins.structuredContent);
  assert.equal(linkedLogins.subject, fixtureSubject);
  assert.ok(linkedLogins.providers.some((item) => item.provider === 'github' && item.connected));
  const linking = await client.callTool({
    name: 'request_account_link',
    arguments: { provider: 'google' },
  });
  assert.equal(linking.isError, undefined);
  assert.equal(
    z.object({ status: z.string() }).parse(linking.structuredContent).status,
    'awaiting_user',
  );
  assert.equal(
    (await client.callTool({ name: 'request_account_link', arguments: { provider: 'password' } }))
      .isError,
    true,
  );
  const loginsResponse = await fetch(`${origin}/api/account-logins`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  assert.equal(loginsResponse.status, 200);
  assert.equal(
    z.object({ subject: z.string() }).parse(await loginsResponse.json()).subject,
    fixtureSubject,
  );
  assert.equal((await fetch(`${origin}/api/account-logins`)).status, 401);
  const allowance = await client.callTool({ name: 'get_lifetime_access', arguments: {} });
  assert.equal(allowance.isError, undefined);
  assert.equal(
    (
      await fetch(`${origin}/api/billing`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mcpTokens.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'sync' }),
      })
    ).status,
    403,
  );
  const revoke = await post('/oauth2/revoke', {
    client_id: 'myselfmd-phone',
    token: tokenSchema.parse(await refresh.json()).refresh_token,
  });
  assert.equal(revoke.status, 200);
  assert.equal((await post('/protocol/openid-connect/token', exchange)).status, 400);
  assert.equal(
    (
      await post('/oauth2/token', {
        grant_type: 'refresh_token',
        client_id: 'myselfmd-phone',
        refresh_token: tokens.refresh_token,
      })
    ).status,
    400,
  );
  assert.equal(
    (await fetch(`${issuer}/admin/oauth2/create-client`, { method: 'POST' })).status,
    404,
  );
  const registered = await fetch(`${issuer}/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      client_name: 'Fixture agent',
      redirect_uris: ['https://chatgpt.com/connector_platform/oauth_redirect'],
      token_endpoint_auth_method: 'none',
      scope: 'myselfmd',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_id: 'myselfmd-phone',
      skip_consent: true,
    }),
  });
  assert.equal(registered.status, 400, await registered.clone().text());
  const safeRegistration = await fetch(`${issuer}/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      client_name: 'Fixture agent',
      redirect_uris: ['https://chatgpt.com/connector_platform/oauth_redirect'],
      token_endpoint_auth_method: 'none',
      scope: 'myselfmd',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  assert.equal(safeRegistration.status, 201, await safeRegistration.clone().text());
  const registration = z
    .object({ client_id: z.string(), skip_consent: z.boolean().optional() })
    .parse(await safeRegistration.json());
  assert.notEqual(registration.client_id, 'myselfmd-phone');
  assert.notEqual(registration.skip_consent, true);
  const unsupported = await fetch(`${issuer}/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ redirect_uris: ['https://untrusted.example/callback'] }),
  });
  assert.equal(unsupported.status, 400);
  const vercelRegistration = await fetch(`${issuer}/oauth2/register`, {
    method: 'POST',
    // Keep these additional OAuth requests outside the existing fixture's rate-limit bucket.
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'CF-Connecting-IP': '192.0.2.90',
    },
    body: JSON.stringify({
      client_name: 'Vercel Connect fixture',
      redirect_uris: ['https://connect.vercel.com/callback'],
      token_endpoint_auth_method: 'none',
      scope: 'myselfmd offline_access',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  assert.equal(vercelRegistration.status, 201, await vercelRegistration.clone().text());
  const vercelClient = z
    .object({ client_id: z.string(), skip_consent: z.boolean().optional() })
    .parse(await vercelRegistration.json());
  assert.notEqual(vercelClient.skip_consent, true);
  const vercelAuthorization = await fetch(
    `${issuer}/oauth2/authorize?${new URLSearchParams({
      client_id: vercelClient.client_id,
      response_type: 'code',
      redirect_uri: 'https://connect.vercel.com/callback',
      scope: 'myselfmd offline_access',
      resource: `${origin}/mcp`,
      code_challenge: createHash('sha256').update(randomBytes(32)).digest('base64url'),
      code_challenge_method: 'S256',
      state: 'vercel-fixture-state',
    })}`,
    {
      redirect: 'manual',
      headers: {
        Cookie: cookie,
        Accept: 'text/html',
        'Sec-Fetch-Mode': 'navigate',
        'CF-Connecting-IP': '192.0.2.90',
      },
    },
  );
  assert.equal(vercelAuthorization.status, 302, await vercelAuthorization.clone().text());
  assert.equal(
    new URL(vercelAuthorization.headers.get('Location') ?? '').pathname,
    `${new URL(issuer).pathname}/consent`,
  );
  const zapierRegistration = await fetch(`${issuer}/oauth2/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'CF-Connecting-IP': '192.0.2.91',
    },
    body: JSON.stringify({
      client_name: 'Zapier origin fixture',
      // A representative callback on the origin observed from Zapier's live registration.
      redirect_uris: ['https://zapier.com/oauth/callback'],
      token_endpoint_auth_method: 'client_secret_basic',
      scope: 'myselfmd offline_access',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  assert.equal(zapierRegistration.status, 201, await zapierRegistration.clone().text());
  const zapierClient = z
    .object({ client_id: z.string(), skip_consent: z.boolean().optional() })
    .parse(await zapierRegistration.json());
  assert.notEqual(zapierClient.skip_consent, true);
  const zapierAuthorization = await fetch(
    `${issuer}/oauth2/authorize?${new URLSearchParams({
      client_id: zapierClient.client_id,
      response_type: 'code',
      redirect_uri: 'https://zapier.com/oauth/callback',
      scope: 'myselfmd offline_access',
      resource: `${origin}/mcp`,
      code_challenge: createHash('sha256').update(randomBytes(32)).digest('base64url'),
      code_challenge_method: 'S256',
      state: 'zapier-fixture-state',
    })}`,
    {
      redirect: 'manual',
      headers: {
        Cookie: cookie,
        Accept: 'text/html',
        'Sec-Fetch-Mode': 'navigate',
        'CF-Connecting-IP': '192.0.2.91',
      },
    },
  );
  assert.equal(zapierAuthorization.status, 302, await zapierAuthorization.clone().text());
  assert.equal(
    new URL(zapierAuthorization.headers.get('Location') ?? '').pathname,
    `${new URL(issuer).pathname}/consent`,
  );
  const smitheryRegistration = await fetch(`${issuer}/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      client_name: 'Smithery fixture',
      redirect_uris: ['https://connect.smithery.ai/oauth/callback'],
      token_endpoint_auth_method: 'none',
      scope: 'myselfmd',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  assert.equal(smitheryRegistration.status, 201, await smitheryRegistration.clone().text());
  const smitheryClient = z
    .object({ client_id: z.string() })
    .parse(await smitheryRegistration.json());
  const smitheryQuery = new URLSearchParams({
    client_id: smitheryClient.client_id,
    response_type: 'code',
    redirect_uri: 'https://connect.smithery.ai/oauth/callback',
    scope: 'myselfmd',
    resource: `${origin}/mcp`,
    code_challenge: createHash('sha256').update(randomBytes(32)).digest('base64url'),
    code_challenge_method: 'S256',
    state: 'smithery-fixture-state',
  });
  const smitheryAuthorization = await fetch(
    `${issuer}/protocol/openid-connect/auth?${smitheryQuery}`,
    {
      redirect: 'manual',
      headers: { Cookie: cookie, Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' },
    },
  );
  assert.equal(smitheryAuthorization.status, 302, await smitheryAuthorization.clone().text());
  assert.equal(
    new URL(smitheryAuthorization.headers.get('Location') ?? '').pathname,
    `${new URL(issuer).pathname}/consent`,
  );
  const directBrowserAuthorization = await fetch(`${issuer}/oauth2/authorize?${smitheryQuery}`, {
    redirect: 'manual',
    headers: { Cookie: cookie, Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' },
  });
  assert.equal(
    directBrowserAuthorization.status,
    302,
    await directBrowserAuthorization.clone().text(),
  );
  assert.equal(
    new URL(directBrowserAuthorization.headers.get('Location') ?? '').pathname,
    `${new URL(issuer).pathname}/consent`,
  );
  const glamaRegistration = await fetch(`${issuer}/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      client_name: 'Glama callback fixture',
      redirect_uris: ['https://glama.ai/oauth/callback', 'http://localhost:6749/oauth/callback'],
      token_endpoint_auth_method: 'client_secret_basic',
      scope: 'myselfmd',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  assert.equal(glamaRegistration.status, 201, await glamaRegistration.clone().text());
  const glamaClient = z
    .object({ application_type: z.string() })
    .parse(await glamaRegistration.json());
  assert.equal(glamaClient.application_type, 'native');
  const declaredWebRegistration = await fetch(`${issuer}/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      application_type: 'web',
      redirect_uris: ['https://glama.ai/oauth/callback', 'http://localhost:6749/oauth/callback'],
    }),
  });
  assert.equal(declaredWebRegistration.status, 400);
  await Promise.all(
    [
      'http://connect.vercel.com/callback',
      'https://connect.vercel.com/other',
      'https://connect.vercel.com/callback?forward=elsewhere',
      'https://connect.vercel.com:444/callback',
      'https://connect.vercel.com.evil.example/callback',
      'https://user:secret@connect.vercel.com/callback',
      'https://connect.vercel.com/callback#fragment',
      'http://zapier.com/oauth/callback',
      'https://zapier.com:444/oauth/callback',
      'https://zapier.com.evil.example/oauth/callback',
      'https://user:secret@zapier.com/oauth/callback',
      'https://zapier.com/oauth/callback#fragment',
      'http://connect.smithery.ai/oauth/callback',
      'https://connect.smithery.ai/other',
      'https://connect.smithery.ai/oauth/callback?forward=elsewhere',
      'https://connect.smithery.ai:444/oauth/callback',
      'https://connect.smithery.ai.evil.example/oauth/callback',
      'https://user:secret@connect.smithery.ai/oauth/callback',
      'http://glama.ai/oauth/callback',
      'https://glama.ai:444/oauth/callback',
      'https://glama.ai.evil.example/oauth/callback',
      'https://user:secret@glama.ai/oauth/callback',
      'https://glama.ai/oauth/callback#fragment',
    ].map(async (redirect) => {
      const rejected = await fetch(`${issuer}/oauth2/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ redirect_uris: [redirect] }),
      });
      assert.equal(rejected.status, 400, `Unexpected directory callback acceptance: ${redirect}`);
    }),
  );
  // Deletion runs through the real hosted HTTP and MCP adapters, using only fixture accounts.
  assert.equal((await fetch(`${origin}/delete-account`)).status, 200);
  const handoff = await client.callTool({ name: 'request_account_deletion', arguments: {} });
  assert.equal(handoff.isError, undefined);
  const subject = 'https://old.example/realm|original-user-id';
  const authHeaders = {
    Authorization: `Bearer ${tokens.access_token}`,
    'Content-Type': 'application/json',
  };
  async function ownerRequest(
    /** @type {string} */ path,
    /** @type {string} */ method = 'GET',
    /** @type {unknown} */ body = undefined,
  ) {
    return fetch(origin + path, {
      method,
      headers: authHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const deletionPurchaseAccount = z
    .object({ appAccountToken: z.string().uuid() })
    .parse(await (await ownerRequest('/api/cloud/purchase-account')).json());
  const pairing = await client.callTool({ name: 'create_phone_pairing', arguments: {} });
  const pairingUrl = z
    .object({ pairingUrl: z.string() })
    .parse(pairing.structuredContent).pairingUrl;
  const deviceResponse = await ownerRequest('/api/claim', 'POST', {
    ticket: new URL(pairingUrl).hash.slice(1),
    name: 'Deletion fixture phone',
  });
  assert.equal(deviceResponse.status, 200, await deviceResponse.clone().text());
  const deviceId = z.object({ id: z.string() }).parse(await deviceResponse.json()).id;
  const profile = {
    ...parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'Deletion fixture',
      selection: { health: ['native:sleep'], time: [], location: [] },
    }),
    id: 'deletion-fixture',
  };
  const credential = await ownerRequest('/api/cloud/credential', 'POST', { deviceId, profile });
  assert.equal(credential.status, 200);
  const upload = z.object({ token: z.string() }).parse(await credential.json()).token;
  assert.equal(
    (
      await ownerRequest('/api/billing', 'POST', {
        action: 'reserve',
        id: 'delete-export',
        scope: { profileId: profile.id, days: ['2026-10-08'], formats: ['jsonl'] },
      })
    ).status,
    200,
  );
  const uploadResponse = await fetch(`${origin}/api/cloud/uploads`, {
    method: 'POST',
    headers: { Authorization: `Upload ${upload}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile,
      day: '2026-10-08',
      format: 'jsonl',
      manifest: { profileId: profile.id, recordCount: 1, billingOperationId: 'delete-export' },
    }),
  });
  assert.equal(uploadResponse.status, 200, await uploadResponse.clone().text());
  const exportId = z.object({ id: z.string() }).parse(await uploadResponse.json()).id;
  assert.equal(
    (
      await fetch(`${origin}/api/cloud/uploads/${exportId}`, {
        method: 'PUT',
        headers: { Authorization: `Upload ${upload}` },
        body:
          JSON.stringify({
            domain: 'health',
            type: 'sleep',
            source: 'healthkit',
            start: null,
            end: null,
            native: { synthetic: true },
          }) + '\n',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${origin}/api/account`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${mcpTokens.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject, confirmation: 'DELETE' }),
      })
    ).status,
    403,
  );
  assert.equal(
    (await ownerRequest('/api/account', 'DELETE', { subject, confirmation: 'delete' })).status,
    400,
  );
  assert.equal(
    (
      await ownerRequest('/api/account', 'DELETE', {
        subject: 'other-account',
        confirmation: 'DELETE',
      })
    ).status,
    400,
  );
  const unconfirmedDelete = await client.callTool({
    name: 'delete_account',
    arguments: { subject, confirmation: 'delete' },
  });
  assert.equal(unconfirmedDelete.isError, true);
  const wrongAccountDelete = await client.callTool({
    name: 'delete_account',
    arguments: { subject: 'other-account', confirmation: 'DELETE' },
  });
  assert.equal(wrongAccountDelete.isError, true);
  const [removed, concurrentRemoval, agentRemoval] = await Promise.all([
    ownerRequest('/api/account', 'DELETE', { subject, confirmation: 'DELETE' }),
    ownerRequest('/api/account', 'DELETE', { subject, confirmation: 'DELETE' }),
    client.callTool({ name: 'delete_account', arguments: { subject, confirmation: 'DELETE' } }),
  ]);
  assert.ok(removed);
  assert.equal(concurrentRemoval?.status, 200);
  assert.equal(agentRemoval?.isError, undefined);
  assert.equal(
    z.object({ state: z.string() }).parse(agentRemoval?.structuredContent).state,
    'completed',
  );
  assert.equal(removed.status, 200, await removed.clone().text());
  const deletion = z
    .object({ state: z.literal('completed'), statusUrl: z.string() })
    .parse(await removed.json());
  assert.equal((await ownerRequest('/api/devices')).status, 410);
  assert.equal(
    (await ownerRequest('/api/account', 'DELETE', { subject, confirmation: 'DELETE' })).status,
    200,
  );
  assert.equal((await fetch(`${origin}/qr/${new URL(pairingUrl).hash.slice(1)}`)).status, 410);
  assert.equal(
    (
      await fetch(`${origin}/api/cloud/uploads`, {
        method: 'POST',
        headers: { Authorization: `Upload ${upload}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    410,
  );
  const receipt = new URL(deletion.statusUrl).searchParams.get('receipt');
  const receiptResponse = await fetch(`${origin}/api/account-deletion/${receipt}`);
  assert.deepEqual(await receiptResponse.json(), { state: 'completed', error: null });
  assert.equal(
    (await fetch(`${origin}/api/account-deletion/${randomBytes(32).toString('base64url')}`)).status,
    410,
  );
  const deletionTool = await client.callTool({ name: 'get_account_deletion', arguments: {} });
  assert.equal(
    z.object({ state: z.string() }).parse(deletionTool.structuredContent).state,
    'completed',
  );
  assert.equal(
    (
      await post('/oauth2/token', {
        grant_type: 'refresh_token',
        client_id: 'myselfmd-mcp',
        refresh_token: mcpTokens.refresh_token,
      })
    ).status,
    400,
  );
  assert.equal(
    (await authorize('myselfmd-phone', true)).response.headers
      .get('location')
      ?.startsWith(origin + '/login'),
    true,
  );
  console.log(
    'PASS account deletion: owner confirmation, agent handoff, R2 cleanup, stale-token denial, credential revocation, receipt isolation, identity/session/refresh removal and safe retries.',
  );
  console.log(
    'PASS Cloudflare identity: Apple/GitHub/Google callback URLs, signed login state, preserved subjects, native PKCE, code replay denial, refresh isolation, consent, MCP and first-party authorization.',
  );
  child.kill('SIGTERM');
  await once(child, 'exit');
  // Inspect the stopped real workerd SQLite stores, not a second cleanup implementation.
  let tombstoneFound = false;
  let billingPartitions = 0;
  const ownerKey = accountTokenKey(deletionPurchaseAccount.appAccountToken);
  for (const entry of readdirSync(join(directory, 'state'), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith('.sqlite')) continue;
    const persisted = new DatabaseSync(join(entry.parentPath, entry.name), { readOnly: true });
    try {
      if (
        !persisted
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cloud_subscriptions'")
          .get()
      )
        continue;
      billingPartitions++;
      for (const table of [
        'cloud_subscriptions',
        'cloud_lapses',
        'cloud_notices',
        'cloud_revocations',
      ])
        assert.equal(
          Number(
            persisted.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE subject=?`).get(subject)
              ?.count,
          ),
          0,
          `Account deletion clears ${table} in every partition`,
        );
      const owner = persisted.prepare('SELECT subject FROM cloud_owners WHERE key=?').get(ownerKey);
      if (owner) {
        assert.equal(
          owner.subject,
          'deleted',
          'Global Purchase ownership is tombstoned without retaining the account',
        );
        tombstoneFound = true;
      }
    } finally {
      persisted.close();
    }
  }
  assert.ok(billingPartitions > 0);
  assert.ok(tombstoneFound, 'Account deletion preserves its Purchase ownership tombstone');
  const tombstone = new BillingStore(':memory:');
  try {
    tombstone.bindOwner(ownerKey, 'deleted');
    assert.throws(
      () => tombstone.bindOwner(ownerKey, 'another-account'),
      /another.*account/,
      'Deleted ownership cannot be reclaimed by a new account',
    );
  } finally {
    tombstone.db.close();
  }
  await cli([
    'd1',
    'execute',
    'myself-md-identity',
    '--local',
    '--config',
    configPath,
    '--persist-to',
    join(directory, 'state'),
    '--command',
    `UPDATE reviewer_access SET enabled=0 WHERE user_id='${reviewerUserId}'; DELETE FROM session WHERE userId='${reviewerUserId}'; DELETE FROM oauthAccessToken WHERE userId='${reviewerUserId}'; DELETE FROM oauthRefreshToken WHERE userId='${reviewerUserId}';`,
  ]);
  child = spawn(
    resolve('node_modules/.bin/wrangler'),
    ['dev', '--config', configPath, '--port', port, '--persist-to', join(directory, 'state')],
    { stdio: ['ignore', output, output] },
  );
  await ready(200);
  assert.equal(
    (
      await fetch(`${origin}/api/account-profile`, {
        headers: { Authorization: `Bearer ${reviewerTokens.access_token}` },
      })
    ).status,
    401,
  );
  assert.equal(
    (await post('/reviewer-login', { username: 'reviewer', password: reviewerPassword })).status,
    404,
  );
  assert.equal(
    (
      await post('/oauth2/token', {
        grant_type: 'refresh_token',
        client_id: 'myselfmd-mcp',
        refresh_token: reviewerTokens.refresh_token,
        resource: `${origin}/mcp`,
      })
    ).status,
    400,
  );
  console.log(
    'PASS restricted reviewer password/OAuth sign-in, fictional fixtures, safe retries, cross-account denial, disabled signup/linking and immediate issued-token revocation.',
  );
  passed = true;
} finally {
  await client.close();
  await new Promise((done) => callbackServer.close(done));
  if (child) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
  closeSync(output);
  db.close();
  if (passed) rmSync(directory, { recursive: true, force: true });
}
