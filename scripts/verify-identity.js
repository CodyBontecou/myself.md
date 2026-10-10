import { parseProfile } from '../core/profiles.js';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, openSync, closeSync } from 'node:fs';
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
const auth = createIdentity(db, {
  issuer,
  secret,
  resource: `${origin}/mcp`,
  googleId: 'fixture-google',
  googleSecret: 'fixture',
  githubId: 'fixture-github',
  githubSecret: 'fixture',
  appleId: 'fixture.apple',
  appleSecret: 'fixture',
});
const context = await auth.$context;
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
        scopes: ['openid', 'profile', 'myselfmd', 'offline_access'],
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
  MIGRATION_ENABLED: '0',
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
/** @param {string} path @param {string} sessionCookie @param {string} [body] @returns {Promise<{status:number|undefined,headers:import('node:http').IncomingHttpHeaders,text:string}>} */
function browserRequest(path, sessionCookie, body) {
  return new Promise((resolveRequest, reject) => {
    const request = requestHTTP(
      issuer + path,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Cookie: sessionCookie,
          Origin: origin,
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
/** @param {string} clientId @param {boolean} loggedIn */
async function authorize(clientId, loggedIn) {
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
    scope: 'openid profile myselfmd offline_access',
    resource: `${origin}/mcp`,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state: 'fixture-state',
  });
  const response = await fetch(`${issuer}/protocol/openid-connect/auth?${params}`, {
    redirect: 'manual',
    headers: {
      Accept: 'text/html',
      'Sec-Fetch-Mode': 'navigate',
      ...(loggedIn ? { Cookie: cookie } : {}),
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
  const discovery = z
    .object({ issuer: z.string(), grant_types_supported: z.array(z.string()) })
    .parse(
      await fetch(`${issuer}/.well-known/openid-configuration`).then((response) => response.json()),
    );
  assert.equal(discovery.issuer, issuer);
  assert.ok(discovery.grant_types_supported.includes('refresh_token'));
  const logoutPage = await browserRequest('/protocol/openid-connect/logout', logoutCookie);
  assert.equal(logoutPage.status, 200, logoutPage.text);
  assert.match(logoutPage.text, /oauth2\/end-session\/confirm/);
  const confirmationCookie = (logoutPage.headers['set-cookie'] ?? [])
    .map((value) => value.split(';')[0])
    .join('; ');
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
  const loginURL = new URL(login.response.headers.get('location') ?? '');
  assert.equal(loginURL.pathname, '/login');
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
  assert.equal((await auth.$context).options.account?.accountLinking?.enabled, false);
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
  assert.equal(claims.client_id, 'myselfmd-phone');
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
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    try {
      const browserContext = await browser.newContext();
      const [cookieName, ...cookieValue] = cookie.split('=');
      assert.ok(cookieName);
      await browserContext.addCookies([
        { name: cookieName, value: cookieValue.join('='), url: origin },
      ]);
      const tab = await browserContext.newPage();
      const callbackOrigin = new URL(mcp.redirect).origin;
      await tab.goto(consentURL.href);
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
      await tab.getByRole('button', { name: 'Continue with GitHub', exact: true }).click();
      await tab.waitForURL((url) => url.hostname === 'github.com');
      console.log('Browser OAuth verified: cancel, accept, external callback and social sign-in.');
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
