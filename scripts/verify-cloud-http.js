import { createMyselfClient } from '../dashboard/public-client.js';
import { registerPublicTools } from '../dashboard/webmcp.js';
import { exportSchemas } from '../core/export-schemas.js';
import { r2Fixture } from './r2-fixture.js';
import { BillingStore } from '../server/billing-store.js';
import { z } from 'zod';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { parseHistoryEvent, exportEvent, addArtifact } from '../core/history.js';
import { parseProfile } from '../core/profiles.js';
import { privacyPolicy } from '../core/privacy.js';
import { chromium } from 'playwright';
const queryId = (/** @type {unknown} */ value) =>
  z.object({ requestId: z.string() }).parse(value).requestId;
const r2 = process.argv.includes('--r2') ? await r2Fixture() : null;
const directory = mkdtempSync(join(tmpdir(), 'cloud-http-'));
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'fixture';
const identity = createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});
identity.listen(0, '127.0.0.1');
await once(identity, 'listening');
const identityAddress = identity.address();
assert.ok(identityAddress && typeof identityAddress !== 'string');
const issuer = `http://127.0.0.1:${identityAddress.port}/realms/test`;
const accountNamespace = 'https://previous.example/auth/realms/test';
const billingFixture = new BillingStore(join(directory, 'billing.sqlite'));
billingFixture.unlock(`${accountNamespace}|alice`, {
  store: 'ios',
  id: 'http-fixture-paid',
  proof: 'fixture-only',
});
const migrationTicket = billingFixture.createClaim({
  source: 'iso.me:ios:iap',
  reference: 'migration-fixture',
});
billingFixture.db.close();
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const address = reservation.address();
assert.ok(address && typeof address !== 'string');
const port = address.port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    ...r2?.env,
    DATA_DIR: directory,
    CLOUD_ENCRYPTION_KEY: 'a'.repeat(64),
    PUBLIC_URL: origin,
    PUBLIC_URL_ALIASES: 'https://legacy.example',
    OAUTH_ISSUER: issuer,
    ACCOUNT_NAMESPACE: accountNamespace,
    ALLOW_HTTP_DEV: '1',
    AUTH_PROXY: '0',
    IOS_APP_ID: '67KC823C9A.com.myself.md',
    HOST: '127.0.0.1',
    PORT: String(port),
  },
  stdio: 'ignore',
});
const client = new Client({ name: 'synthetic-cloud-test', version: '1' });
const accessClient = new Client({ name: 'synthetic-access-test', version: '1' });
/** @param {string} subject @param {string} azp @param {string} [audience] */
async function token(subject, azp, audience = `${origin}/mcp`) {
  return new SignJWT({ scope: 'myselfmd', azp })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime('5m')
    .sign(privateKey);
}
const phoneToken = await token('alice', 'myselfmd-phone'),
  chatToken = await token('alice', 'fixture-chat'),
  bobToken = await token('bob', 'myselfmd-phone'),
  bobAgentToken = await token('bob', 'fixture-bob-agent'),
  dashboardToken = await token('alice', 'myselfmd-dashboard'),
  bobDashboardToken = await token('bob', 'myselfmd-dashboard');
/** @param {string} path @param {string|null} bearer @param {string} [method] @param {unknown} [body] */
async function request(path, bearer, method = 'GET', body) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, value: await response.json() };
}
/** Node's fetch normalizes Host; use an actual HTTP request for virtual-host verification.
 * @param {string} path @param {string} host @returns {Promise<Response>} */
function fetchHost(path, host) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(new URL(path, origin), { headers: { Host: host } }, (incoming) => {
      let body = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (/** @type {string} */ chunk) => {
        body += chunk;
      });
      incoming.on('error', reject);
      incoming.on('end', () => resolve(new Response(body, { status: incoming.statusCode ?? 500 })));
    });
    outgoing.on('error', reject);
    outgoing.setTimeout(5000, () => outgoing.destroy(new Error('Host verification timed out.')));
    outgoing.end();
  });
}
const dashboardSchema = z.object({
  exports: z.array(z.object({ id: z.string() })),
  profiles: z.array(z.object({ shared: z.boolean() })),
  agents: z.array(z.object({ client: z.string(), blocked: z.boolean() })),
});
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      // Each health poll follows the previous startup attempt.
      // oxlint-disable-next-line eslint/no-await-in-loop
      if ((await request('/health', null)).status === 200) break;
    } catch {}
    if (attempt === 99) throw new Error('Fixture service did not start.');
    // Wait for the child server to bind its port.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal((await fetch(`${origin}/claim`)).status, 200);
  assert.equal(
    (await request('/api/migration/claim', null, 'POST', { ticket: migrationTicket })).status,
    401,
  );
  assert.equal(
    (await request('/api/migration/claim', chatToken, 'POST', { ticket: migrationTicket })).status,
    403,
  );
  assert.equal(
    (await request('/api/migration/claim', bobDashboardToken, 'POST', { ticket: migrationTicket }))
      .status,
    200,
  );
  assert.equal(
    (await request('/api/migration/claim', dashboardToken, 'POST', { ticket: migrationTicket }))
      .status,
    409,
  );
  const migrated = await request('/api/billing', bobToken, 'POST', { action: 'sync' });
  assert.equal(migrated.status, 200);
  assert.equal(z.object({ unlocked: z.boolean() }).parse(migrated.value).unlocked, true);
  assert.equal((await request('/api/cloud/exports', null)).status, 401);
  const dashboardPage = await fetch(`${origin}/dashboard`);
  assert.equal(dashboardPage.status, 200);
  assert.ok(
    dashboardPage.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"),
  );
  const dashboardHtml = await dashboardPage.text();
  assert.ok(dashboardHtml.includes('Your data, on your terms'));
  assert.ok(!dashboardHtml.includes('__STYLE_NONCE__'));
  const nonce = dashboardHtml.match(/name="style-nonce" content="([^"]+)"/)?.[1];
  assert.ok(nonce);
  assert.ok(dashboardPage.headers.get('content-security-policy')?.includes(`'nonce-${nonce}'`));
  assert.equal((await fetch(`${origin}/dashboard/app.js`)).status, 200);
  assert.equal((await fetch(`${origin}/dashboard/callback`)).status, 200);
  assert.equal(
    z.object({ clientId: z.string() }).parse((await request('/dashboard/config', null)).value)
      .clientId,
    'myselfmd-dashboard',
  );
  assert.equal((await request('/api/dashboard', null)).status, 401);
  assert.equal((await request('/api/dashboard', phoneToken)).status, 403);
  assert.equal((await request('/api/dashboard', chatToken)).status, 403);

  const association = await request('/.well-known/apple-app-site-association', null);
  assert.equal(association.status, 200);
  assert.deepEqual(association.value, {
    applinks: {
      details: [
        {
          appIDs: ['67KC823C9A.com.myself.md'],
          components: [{ '/': '/pair' }],
        },
      ],
    },
  });
  const landing = await fetch(`${origin}/pair`);
  assert.equal(landing.status, 200);
  assert.ok((await landing.text()).includes('Open in myself.md'));
  const home = await fetch(origin, { redirect: 'manual' });
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes('datasets and example exports'));
  assert.equal((await fetch(`${origin}/demo`)).status, 200);
  assert.equal((await fetch(`${origin}/demo/`)).status, 200);
  const browser = await chromium.launch({ headless: true });
  try {
    await Promise.all(
      ['/privacy', '/privacy/', '/support', '/support/'].map(async (path) => {
        const page = await browser.newPage();
        const response = await page.goto(`${origin}${path}`);
        assert.equal(response?.status(), 200);
        await page
          .getByRole('heading', {
            name: path.startsWith('/privacy') ? privacyPolicy.title : 'Contact',
            exact: true,
          })
          .waitFor();
        assert.equal(
          await page
            .getByRole('link', { name: privacyPolicy.supportEmail, exact: true })
            .getAttribute('href'),
          `mailto:${privacyPolicy.supportEmail}`,
        );
        assert.equal(
          await page
            .getByRole('link', { name: 'GitHub issues (public)', exact: true })
            .getAttribute('href'),
          privacyPolicy.issuesUrl,
        );
        await page.close();
      }),
    );
    const catalogPage = await browser.newPage();
    await catalogPage.goto(`${origin}/docs`);
    await catalogPage.getByRole('link', { name: 'Datasets', exact: true }).click();
    await catalogPage.getByRole('heading', { name: 'Datasets', exact: true }).waitFor();
    assert.equal(await catalogPage.getByRole('tablist', { name: 'Video tutorials' }).count(), 0);
    await catalogPage.goto(origin);
    await catalogPage.getByRole('heading', { name: 'File over app. Yours to keep.' }).waitFor();
    await catalogPage.close();
  } finally {
    await browser.close();
  }
  const appStoreBadge = await fetch(`${origin}/dashboard/store-badges/app-store.svg`);
  assert.equal(appStoreBadge.status, 200);
  assert.match(appStoreBadge.headers.get('content-type') ?? '', /image\/svg\+xml/);
  assert.match(await appStoreBadge.text(), /<svg/);
  const playBadge = await fetch(`${origin}/dashboard/store-badges/google-play.png`);
  assert.equal(playBadge.status, 200);
  assert.match(playBadge.headers.get('content-type') ?? '', /image\/png/);
  assert.deepEqual(
    new Uint8Array(await playBadge.arrayBuffer()).slice(0, 8),
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  assert.equal((await fetch(`${origin}/login`)).status, 200);
  assert.equal((await fetch(`${origin}/datasets`)).status, 200);
  assert.equal((await fetch(`${origin}/datasets/`)).status, 200);
  await Promise.all(
    ['health', 'screen-time', 'location', 'all'].flatMap((dataset) =>
      ['', '/'].map(async (suffix) => {
        const documentation = await fetch(`${origin}/datasets/${dataset}${suffix}`);
        assert.equal(documentation.status, 200);
        assert.match(documentation.headers.get('content-type') ?? '', /text\/html/);
      }),
    ),
  );
  const hosts = /** @type {[string, string][]} */ ([
    ['legacy.example', 'https://legacy.example'],
    ['untrusted.example', origin],
  ]);
  await Promise.all(
    hosts.map(async ([host, expected]) => {
      // Exercise actual Host routing, including rejection of host-derived metadata injection.
      const config = await fetchHost('/config', host);
      assert.deepEqual(await config.json(), {
        issuer,
        clientId: 'myselfmd-phone',
        resource: `${expected}/mcp`,
      });
      const metadata = await fetchHost('/.well-known/oauth-protected-resource/mcp', host);
      assert.equal(
        z.object({ resource: z.string() }).parse(await metadata.json()).resource,
        `${expected}/mcp`,
      );
    }),
  );
  const legacyToken = await token('alice', 'myselfmd-phone', 'https://legacy.example/mcp');
  const legacyIdentity = await request('/api/devices', legacyToken);
  assert.equal(legacyIdentity.status, 200);
  assert.equal(
    z.object({ subject: z.string() }).parse(legacyIdentity.value).subject,
    `${accountNamespace}|alice`,
  );
  const previousIssuerToken = await new SignJWT({ scope: 'myselfmd', azp: 'myselfmd-phone' })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(accountNamespace)
    .setAudience(`${origin}/mcp`)
    .setSubject('alice')
    .setExpirationTime('5m')
    .sign(privateKey);
  assert.equal((await request('/api/devices', previousIssuerToken)).status, 401);
  const unrelatedToken = await token('alice', 'myselfmd-phone', 'https://untrusted.example/mcp');
  assert.equal((await request('/api/devices', unrelatedToken)).status, 401);
  const favicon = await fetch(`${origin}/dashboard/favicon.svg`);
  assert.equal(favicon.status, 200);
  assert.ok(favicon.headers.get('content-type')?.startsWith('image/svg+xml'));
  assert.ok((await favicon.text()).includes('<svg'));
  const metadata = await request('/.well-known/oauth-protected-resource/mcp', null);
  assert.equal(z.object({ resource: z.string() }).parse(metadata.value).resource, `${origin}/mcp`);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${chatToken}` } },
    }),
  );
  // Verify the standalone CLI bundle against the same authenticated service, not a stub.
  /** @param {string[]} args @param {string} [input] */
  async function runCli(args, input = '') {
    const cliProcess = spawn(process.execPath, ['dashboard/dist/myself.mjs', ...args], {
      env: { ...process.env, MYSELF_URL: origin, MYSELF_TOKEN: chatToken },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    cliProcess.stdout.on('data', (chunk) => {
      output += chunk;
    });
    cliProcess.stderr.on('data', (chunk) => {
      output += chunk;
    });
    cliProcess.stdin.end(input);
    const [code] = await once(cliProcess, 'close');
    assert.equal(code, 0, output);
    return JSON.parse(output);
  }
  assert.equal((await runCli(['health'])).ok, true);
  assert.ok(
    (await runCli(['tools'])).tools.some(
      (/** @type {{name:string}} */ tool) => tool.name === 'get_privacy_policy',
    ),
  );
  assert.ok((await runCli(['call', 'get_privacy_policy'], '{}')).content.length > 0);
  await Promise.all(
    ['/health', '/config', '/dashboard/config', '/.well-known/oauth-protected-resource/mcp'].map(
      async (path) => {
        const versioned = await fetch(`${origin}/v1${path}`);
        assert.equal(versioned.status, 200);
        assert.equal(versioned.headers.get('ratelimit-limit'), '120');
        assert.deepEqual(await versioned.json(), (await request(path, null)).value);
      },
    ),
  );
  assert.equal((await fetch(`${origin}/v1/mcp`)).status, 404);
  const tools = await client.listTools();
  assert.ok(tools.tools.some((t) => t.name === 'read_cloud_export'));
  assert.ok(tools.tools.some((t) => t.name === 'list_export_schemas'));
  const schemaResult = await client.callTool({ name: 'list_export_schemas', arguments: {} });
  assert.equal(schemaResult.isError, undefined);
  const schemaContent = schemaResult.content;
  assert.ok(Array.isArray(schemaContent));
  const schemaText = schemaContent[0];
  assert.ok(schemaText && schemaText.type === 'text');
  assert.deepEqual(JSON.parse(schemaText.text), exportSchemas());
  const unsupportedProfile = await client.callTool({
    name: 'create_phone_export_profile',
    arguments: {
      profile: {
        schema: 'myself.md.profile.v1',
        name: 'Unsupported',
        selection: { health: [], time: [], location: [] },
        export: { schema: 'myself.md.export.v2' },
      },
    },
  });
  assert.equal(unsupportedProfile.isError, true);
  const pinnedProfile = await client.callTool({
    name: 'create_phone_export_profile',
    arguments: {
      profile: {
        schema: 'myself.md.profile.v1',
        name: 'Pinned',
        selection: { health: [], time: [], location: [] },
        export: { schema: 'myself.md.export.v1' },
      },
    },
  });
  assert.equal(pinnedProfile.isError, undefined);
  const pinnedContent = pinnedProfile.content;
  assert.ok(Array.isArray(pinnedContent));
  const pinnedText = pinnedContent.find((item) => item.type === 'text');
  assert.ok(pinnedText?.type === 'text');
  assert.equal(JSON.parse(pinnedText.text).profile.export.schema, 'myself.md.export.v1');

  assert.ok(tools.tools.some((t) => t.name === 'get_lifetime_access'));
  assert.ok(tools.tools.some((t) => t.name === 'get_privacy_policy'));
  const policyResult = await client.callTool({ name: 'get_privacy_policy', arguments: {} });
  assert.equal(policyResult.isError, undefined);
  assert.deepEqual(policyResult.structuredContent, privacyPolicy);
  assert.equal(
    (await client.callTool({ name: 'get_privacy_policy', arguments: { subject: 'bob' } })).isError,
    true,
  );
  const accessSchema = z.object({
    allowance: z.object({
      unlocked: z.boolean(),
      used: z.number(),
      complimentary: z.boolean().optional(),
    }),
    handoff: z.object({
      status: z.string(),
      accountLink: z.string(),
      requiresUser: z.boolean(),
      steps: z.array(z.object({ title: z.string(), body: z.string() })),
    }),
  });
  const paidAccess = accessSchema.parse(
    (await client.callTool({ name: 'get_lifetime_access', arguments: {} })).structuredContent,
  );
  assert.equal(paidAccess.allowance.unlocked, true);
  assert.equal(paidAccess.handoff.status, 'completed');
  assert.equal(paidAccess.handoff.requiresUser, false);
  const newBuyerToken = await token('new-buyer', 'fixture-chat');
  await accessClient.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${newBuyerToken}` } },
    }),
  );
  const pendingAccess = accessSchema.parse(
    (await accessClient.callTool({ name: 'get_lifetime_access', arguments: {} })).structuredContent,
  );
  assert.equal(pendingAccess.allowance.unlocked, false);
  assert.equal(pendingAccess.allowance.used, 0);
  assert.equal(pendingAccess.handoff.status, 'awaiting_user');
  assert.equal(pendingAccess.handoff.requiresUser, true);
  assert.equal(pendingAccess.handoff.accountLink, 'myselfmd://account');
  assert.equal(pendingAccess.handoff.steps.length, 3);
  assert.ok(
    (await accessClient.callTool({ name: 'get_lifetime_access', arguments: { subject: 'alice' } }))
      .isError,
  );
  const accessTicketStore = new BillingStore(join(directory, 'billing.sqlite'));
  const accessTicket = accessTicketStore.createClaim({
    source: 'health.md:ios:iap',
    reference: 'mcp-access-fixture',
  });
  accessTicketStore.db.close();
  assert.equal(
    (await request('/api/migration/claim', newBuyerToken, 'POST', { ticket: accessTicket })).status,
    403,
  );
  const newBuyerDashboardToken = await token('new-buyer', 'myselfmd-dashboard');
  assert.equal(
    (
      await request('/api/migration/claim', newBuyerDashboardToken, 'POST', {
        ticket: accessTicket,
      })
    ).status,
    200,
  );
  const claimedAccess = accessSchema.parse(
    (await accessClient.callTool({ name: 'get_lifetime_access', arguments: {} })).structuredContent,
  );
  assert.equal(claimedAccess.allowance.complimentary, true);
  assert.equal(claimedAccess.allowance.used, 0);
  assert.equal(claimedAccess.handoff.status, 'completed');
  assert.equal(claimedAccess.handoff.requiresUser, false);
  const pairing = await client.callTool({ name: 'create_phone_pairing', arguments: {} });
  const pairingUrl = /** @type {{pairingUrl:string}} */ (pairing.structuredContent).pairingUrl;
  const claimed = await request('/api/claim', phoneToken, 'POST', {
    ticket: new URL(pairingUrl).hash.slice(1),
    name: 'Synthetic phone',
  });
  assert.equal(claimed.status, 200);
  const deviceId = z.object({ id: z.string() }).parse(claimed.value).id;
  const profile = {
    ...parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'Synthetic',
      selection: { health: ['native:sleep'], time: [], location: [] },
    }),
    id: 'synthetic',
  };
  assert.equal(
    (await request('/api/cloud/credential', bobToken, 'POST', { deviceId, profile })).status,
    404,
  );
  assert.equal(
    (await request('/api/cloud/credential', chatToken, 'POST', { deviceId, profile })).status,
    403,
  );
  const credential = await request('/api/cloud/credential', phoneToken, 'POST', {
    deviceId,
    profile,
  });
  assert.equal(credential.status, 200);
  const renewal = {
    deviceId,
    profileId: profile.id,
    token: z.object({ token: z.string() }).parse(credential.value).token,
    expiresAt: Date.now() + 30 * 86400000,
  };
  assert.equal(
    (await request('/api/cloud/credential/renew', bobToken, 'POST', renewal)).status,
    404,
  );
  assert.equal(
    (await request('/api/cloud/credential/renew', chatToken, 'POST', renewal)).status,
    403,
  );
  assert.equal(
    (await request('/api/cloud/credential/renew', dashboardToken, 'POST', renewal)).status,
    403,
  );
  assert.equal(
    (
      await request('/api/cloud/credential/renew', phoneToken, 'POST', {
        ...renewal,
        profileId: 'wrong',
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('/api/cloud/credential/renew', phoneToken, 'POST', renewal)).status,
    200,
  );
  assert.equal(
    (await request('/api/billing', chatToken, 'POST', { action: 'reserve', id: 'denied' })).status,
    403,
  );
  const operationId = 'http-profile-export';
  assert.equal(
    (
      await request('/api/billing', phoneToken, 'POST', {
        action: 'reserve',
        id: operationId,
        scope: { profileId: profile.id, days: ['2026-10-07', '2026-10-08'], formats: ['jsonl'] },
      })
    ).status,
    200,
  );
  const begin = await fetch(`${origin}/api/cloud/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Upload ${z.object({ token: z.string() }).parse(credential.value).token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      profile,
      day: '2026-10-08',
      format: 'jsonl',
      manifest: { profileId: profile.id, recordCount: 1, billingOperationId: operationId },
    }),
  });
  assert.equal(begin.status, 200);
  const { id } = z.object({ id: z.string() }).parse(await begin.json());
  const record = {
    domain: 'health',
    type: 'sleep',
    source: 'healthkit',
    start: null,
    end: null,
    native: { synthetic: true },
    timeSeries: {
      samples: [
        {
          timestamp: '2026-10-08T00:00:00.000Z',
          value: 72,
          unit: 'count/min',
          metadata: { arbitrary: ['kept', 1] },
        },
        { timestamp: '2026-10-08T00:00:00.000Z', value: 72, unit: 'count/min' },
        { timestamp: null, value: { unknown: [0, false] } },
      ],
    },
  };
  if (r2) {
    r2.state.failPut = true;
    const failed = await fetch(`${origin}/api/cloud/uploads/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Upload ${z.object({ token: z.string() }).parse(credential.value).token}`,
      },
      body: JSON.stringify(record) + '\n',
    });
    assert.equal(failed.status, 503);
    assert.equal(
      dashboardSchema.parse((await request('/api/dashboard', dashboardToken)).value).exports.length,
      0,
    );
    const bill = new BillingStore(join(directory, 'billing.sqlite'));
    assert.equal(
      bill.db.prepare('SELECT state FROM billing_uses WHERE id=?').get(operationId)?.state,
      'reserved',
    );
    bill.db.close();
    r2.state.failPut = false;
  }
  const committed = await fetch(`${origin}/api/cloud/uploads/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Upload ${z.object({ token: z.string() }).parse(credential.value).token}`,
    },
    body: JSON.stringify(record) + '\n',
  });
  assert.equal(committed.status, 200);
  if (r2) {
    assert.equal(r2.files.size, 1);
    assert.ok([...r2.files.values()].every((bytes) => !bytes.includes(JSON.stringify(record))));
  }
  const dashboard = dashboardSchema.parse((await request('/api/dashboard', dashboardToken)).value);
  assert.equal(dashboard.exports.length, 1);
  assert.equal(dashboard.profiles.length, 1);
  assert.equal(dashboard.profiles[0]?.shared, false);
  assert.equal(dashboard.agents[0]?.client, 'fixture-chat');
  assert.equal(
    dashboardSchema.parse((await request('/api/dashboard', bobDashboardToken)).value).exports
      .length,
    0,
  );
  assert.equal((await request('/api/dashboard/explore', null, 'POST', {})).status, 401);
  assert.equal((await request('/api/dashboard/explore', phoneToken, 'POST', {})).status, 403);
  assert.equal((await request('/api/dashboard/explore', chatToken, 'POST', {})).status, 403);
  assert.equal((await request('/api/dashboard/explore', dashboardToken, 'POST', {})).status, 200);
  assert.equal(
    (await request('/api/dashboard/explore', dashboardToken, 'POST', { timezone: 'invalid' }))
      .status,
    400,
  );
  assert.equal(
    (await request('/api/dashboard/explore', bobDashboardToken, 'POST', { exportIds: [id] }))
      .status,
    404,
  );
  const detailPath = `/api/dashboard/record?export=${id}&index=0`;
  assert.equal((await request(detailPath, bobDashboardToken)).status, 404);
  assert.equal((await request(detailPath, chatToken)).status, 403);
  assert.deepEqual(
    z.object({ record: z.unknown() }).parse((await request(detailPath, dashboardToken)).value)
      .record,
    record,
  );
  const recordsPath = `/api/dashboard/exports/${id}`;
  assert.deepEqual(
    z
      .object({ records: z.array(z.unknown()) })
      .parse((await request(recordsPath, dashboardToken)).value).records,
    [record],
  );
  assert.equal((await request(recordsPath, bobDashboardToken)).status, 404);
  assert.equal((await request(recordsPath, chatToken)).status, 403);
  assert.equal((await request(recordsPath + '?offset=-1', dashboardToken)).status, 400);
  assert.equal((await request(recordsPath, bobDashboardToken, 'DELETE')).status, 404);
  assert.equal(
    (await request('/api/cloud/credential', dashboardToken, 'POST', { deviceId, profile })).status,
    403,
  );

  const multiple = await fetch(`${origin}/api/cloud/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Upload ${z.object({ token: z.string() }).parse(credential.value).token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      profile,
      day: '2026-10-07',
      format: 'jsonl',
      manifest: { profileId: profile.id, recordCount: 55, billingOperationId: operationId },
    }),
  });
  const multipleId = z.object({ id: z.string() }).parse(await multiple.json()).id;
  const multipleCommit = await fetch(`${origin}/api/cloud/uploads/${multipleId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Upload ${z.object({ token: z.string() }).parse(credential.value).token}`,
    },
    body:
      Array.from({ length: 55 }, (_value, i) =>
        JSON.stringify({ ...record, native: { sample: i } }),
      ).join('\n') + '\n',
  });
  assert.equal(multipleCommit.status, 200);
  const pageSchema = z.object({ records: z.array(z.unknown()), nextCursor: z.string().nullable() });
  const firstPage = pageSchema.parse(
    (await request(`/api/dashboard/exports/${multipleId}`, dashboardToken)).value,
  );
  assert.equal(firstPage.records.length, 50);
  assert.equal(firstPage.nextCursor, '50');
  const lastPage = pageSchema.parse(
    (await request(`/api/dashboard/exports/${multipleId}?offset=50`, dashboardToken)).value,
  );
  assert.equal(lastPage.records.length, 5);
  assert.equal(lastPage.nextCursor, null);
  await request(`/api/dashboard/exports/${multipleId}`, dashboardToken, 'DELETE');
  const denied = await client.callTool({ name: 'read_cloud_export', arguments: { exportId: id } });
  assert.equal(denied.isError, true);
  assert.equal(
    (await request('/api/cloud/access', phoneToken, 'PUT', { deviceId, profile, shared: true }))
      .status,
    200,
  );
  if (r2) {
    const bill = new BillingStore(join(directory, 'billing.sqlite'));
    const before = bill.snapshot(`${accountNamespace}|alice`);
    r2.state.failGet = true;
    assert.ok(
      (await client.callTool({ name: 'read_cloud_export', arguments: { exportId: id } })).isError,
    );
    const after = bill.snapshot(`${accountNamespace}|alice`);
    assert.equal(after.used, before.used);
    assert.equal(after.reserved, before.reserved);
    r2.state.failGet = false;
    bill.db.close();
  }
  const result = await client.callTool({ name: 'read_cloud_export', arguments: { exportId: id } });
  assert.ok(!result.isError);
  assert.ok(JSON.stringify(result).includes('synthetic'));
  const historyPath = `/api/history?deviceId=${deviceId}`;
  assert.equal((await request(historyPath, bobToken)).status, 404);
  assert.equal((await request(historyPath, chatToken)).status, 403);
  const cloudHistory = await request(historyPath, phoneToken);
  assert.equal(cloudHistory.status, 200);
  const historyEvents = z
    .object({ events: z.array(z.unknown()) })
    .parse(cloudHistory.value)
    .events.map(parseHistoryEvent);
  assert.equal(historyEvents.length, r2 ? 3 : 2);
  assert.ok(
    historyEvents.some(
      (event) =>
        event.status === 'complete' && event.relatedId === id && event.client === 'fixture-chat',
    ),
  );
  assert.ok(!JSON.stringify(cloudHistory.value).includes('"native":'));
  const catalog = {
    profiles: [{ ...profile, agentAccess: true }],
    domains: ['health', 'time', 'location'].map((domain) => ({
      domain,
      enabled: domain === 'health',
      selectableTypes:
        domain === 'health'
          ? ['native:sleep']
          : domain === 'time'
            ? ['native:applications', 'native:websites']
            : ['native:points'],
      permission: domain === 'health' ? 'system-managed' : 'required',
      permissionHandoff: `myselfmd://data/${domain}`,
      availableTypes: domain === 'health' ? ['native:sleep'] : [],
      types: domain === 'health' ? ['native:sleep'] : [],
      notes: [],
    })),
  };
  assert.equal(
    (await request(`/api/phones/${deviceId}/poll`, phoneToken, 'POST', catalog)).status,
    200,
  );
  const diagnosticsPath = `/api/phones/${deviceId}/diagnostics`;
  const debugReport = {
    schema: 'myself.md.debug.v1',
    content: { records: false, credentials: true, urls: true },
    generatedAt: Date.now(),
    revision: 1,
    shared: true,
    platform: 'ios',
    entries: [
      {
        time: Date.now(),
        operation: 'connection',
        outcome: 'failed',
        error: 'fixture raw server failure',
        credentials: { Authorization: 'Bearer fixture-log-credential' },
        url: 'https://fixture.test/private',
        durationMs: 12,
        httpStatus: 503,
      },
    ],
  };
  assert.equal(
    z
      .object({ report: z.unknown() })
      .parse(
        (await client.callTool({ name: 'get_phone_debug_logs', arguments: { deviceId } }))
          .structuredContent,
      ).report,
    null,
  );
  assert.equal((await request(diagnosticsPath, chatToken, 'POST', debugReport)).status, 403);
  assert.equal((await request(diagnosticsPath, dashboardToken, 'POST', debugReport)).status, 403);
  assert.equal((await request(diagnosticsPath, bobToken, 'POST', debugReport)).status, 404);
  assert.equal((await request(diagnosticsPath, phoneToken, 'POST', debugReport)).status, 200);
  assert.deepEqual(
    z
      .object({ report: z.unknown() })
      .parse(
        (await client.callTool({ name: 'get_phone_debug_logs', arguments: { deviceId } }))
          .structuredContent,
      ).report,
    debugReport,
  );
  assert.equal(
    (
      await request(diagnosticsPath, phoneToken, 'POST', {
        ...debugReport,
        shared: false,
        revision: 2,
        entries: [],
      })
    ).status,
    200,
  );
  assert.equal(
    z
      .object({ report: z.unknown() })
      .parse(
        (await client.callTool({ name: 'get_phone_debug_logs', arguments: { deviceId } }))
          .structuredContent,
      ).report,
    null,
  );
  assert.equal(
    (
      await client.callTool({
        name: 'query_phone_data',
        arguments: {
          deviceId,
          profileId: profile.id,
          domain: 'health',
          type: 'sleep',
          source: 'imported',
          start: '2026-10-08T00:00:00.000Z',
          end: '2026-10-09T00:00:00.000Z',
        },
      })
    ).isError,
    true,
  );
  const discovery = await client.callTool({
    name: 'get_phone_data_catalog',
    arguments: { deviceId },
  });
  const discovered = z
    .object({
      catalog: z.object({
        domains: z.array(
          z.object({
            domain: z.string(),
            selectableTypes: z.array(z.string()),
            types: z.array(z.string()),
            permission: z.string(),
            permissionHandoff: z.string(),
          }),
        ),
      }),
    })
    .parse(discovery.structuredContent);
  assert.deepEqual(
    discovered.catalog.domains.find((domain) => domain.domain === 'time')?.selectableTypes,
    ['native:applications', 'native:websites'],
  );
  assert.equal(
    discovered.catalog.domains.find((domain) => domain.domain === 'location')?.permissionHandoff,
    'myselfmd://data/location',
  );
  assert.deepEqual(
    discovered.catalog.domains.find((domain) => domain.domain === 'time')?.types,
    [],
  );
  const deniedUsage = await client.callTool({
    name: 'query_phone_data',
    arguments: {
      deviceId,
      profileId: profile.id,
      domain: 'time',
      type: 'applications',
      start: '2026-10-08T00:00:00.000Z',
      end: '2026-10-09T00:00:00.000Z',
    },
  });
  assert.equal(deniedUsage.isError, true, 'Discovery of selectable types never grants read access');
  // Agents choose independently among approved profiles; selection in another profile never grants access.
  const secondary = { ...profile, id: 'secondary', name: 'Secondary', agentAccess: true };
  const privateProfile = { ...profile, id: 'private', name: 'Private', agentAccess: false };
  const excluded = {
    ...profile,
    id: 'excluded',
    name: 'Excluded',
    agentAccess: true,
    selection: { health: [], time: [], location: [] },
  };
  const multiCatalog = {
    ...catalog,
    profiles: [...catalog.profiles, secondary, privateProfile, excluded],
  };
  const pollPhone = async (/** @type {typeof multiCatalog} */ value) => {
    const response = await request(`/api/phones/${deviceId}/poll`, phoneToken, 'POST', value);
    assert.equal(response.status, 200);
    return response;
  };
  const queryProfile = (/** @type {string} */ profileId) =>
    client.callTool({
      name: 'query_phone_data',
      arguments: {
        deviceId,
        profileId,
        domain: 'health',
        type: 'sleep',
        start: '2026-10-08T00:00:00.000Z',
        end: '2026-10-09T00:00:00.000Z',
      },
    });
  await pollPhone(multiCatalog);
  for (const deniedResponse of await Promise.all(
    ['private', 'excluded', 'missing'].map(queryProfile),
  ))
    assert.equal(deniedResponse.isError, true);
  const handoff = await client.callTool({
    name: 'request_phone_profile_agent_access',
    arguments: { deviceId, profileId: 'private', enabled: true },
  });
  const approval = z
    .object({
      status: z.string(),
      agentAccess: z.boolean(),
      handoff: z.object({ deepLink: z.string() }),
    })
    .parse(handoff.structuredContent);
  assert.equal(approval.status, 'awaiting_user');
  assert.equal(approval.agentAccess, false);
  assert.equal(approval.handoff.deepLink, 'myselfmd://profiles/private');
  assert.equal(
    (await queryProfile('private')).isError,
    true,
    'An agent handoff cannot approve its own access',
  );
  assert.equal(
    (
      await client.callTool({
        name: 'request_phone_profile_agent_access',
        arguments: { deviceId, profileId: 'missing', enabled: true },
      })
    ).isError,
    true,
  );
  const grantedCatalog = {
    ...multiCatalog,
    profiles: multiCatalog.profiles.map((p) => Object.assign({}, p, { agentAccess: true })),
  };
  await pollPhone(grantedCatalog);
  const approved = await client.callTool({
    name: 'request_phone_profile_agent_access',
    arguments: { deviceId, profileId: 'private', enabled: true },
  });
  assert.equal(
    z.object({ status: z.string() }).parse(approved.structuredContent).status,
    'completed',
  );
  const newlyApproved = await queryProfile('private');
  assert.ok(!newlyApproved.isError);
  await client.callTool({
    name: 'forget_phone_request',
    arguments: { requestId: queryId(newlyApproved.structuredContent) },
  });
  await pollPhone(multiCatalog);
  // The first profile is unrelated to an explicitly chosen second profile.
  const chosen = await queryProfile('secondary');
  assert.ok(!chosen.isError);
  const chosenId = queryId(chosen.structuredContent);
  await pollPhone(multiCatalog);
  assert.equal(
    (
      await request(`/api/phones/${deviceId}/result`, phoneToken, 'POST', {
        id: chosenId,
        page: {
          records: [record],
          nextCursor: null,
          warnings: [],
          capture: 'synthetic',
          complete: false,
        },
      })
    ).status,
    200,
  );
  const retained = await client.callTool({
    name: 'get_phone_request',
    arguments: { requestId: chosenId },
  });
  assert.equal(
    z.object({ status: z.string() }).parse(retained.structuredContent).status,
    'complete',
  );
  const retainedPage = z
    .object({
      result: z.object({
        page: z.object({ records: z.array(z.unknown()), complete: z.boolean() }),
      }),
    })
    .parse(retained.structuredContent).result.page;
  assert.deepEqual(retainedPage.records, [record]);
  assert.equal(retainedPage.complete, false);
  const runningId = queryId((await queryProfile('secondary')).structuredContent);
  await pollPhone(multiCatalog);
  const queuedId = queryId((await queryProfile('secondary')).structuredContent);
  const unaffectedId = queryId((await queryProfile(profile.id)).structuredContent);
  await pollPhone({
    ...multiCatalog,
    profiles: multiCatalog.profiles.map((p) =>
      Object.assign({}, p, { agentAccess: p.id === 'secondary' ? false : p.agentAccess }),
    ),
  });
  const revokedQueries = await Promise.all(
    [chosenId, runningId, queuedId].map((revokedId) =>
      client.callTool({ name: 'get_phone_request', arguments: { requestId: revokedId } }),
    ),
  );
  for (const revokedResponse of revokedQueries)
    assert.equal(
      revokedResponse.isError,
      true,
      'Revocation discards queued, running and retained responses',
    );
  const partialHistory = z
    .object({ event: z.object({ status: z.string() }) })
    .parse((await request(`/api/dashboard/history/entry?id=${chosenId}`, dashboardToken)).value);
  assert.equal(
    partialHistory.event.status,
    'partial',
    'Revocation preserves the completed partial-capture audit outcome',
  );
  assert.equal(
    (
      await request(`/api/phones/${deviceId}/result`, phoneToken, 'POST', {
        id: runningId,
        page: { records: [record], nextCursor: null, warnings: [], capture: 'synthetic' },
      })
    ).status,
    404,
    'Late responses cannot resurrect revoked work',
  );
  assert.ok(
    !(await client.callTool({ name: 'get_phone_request', arguments: { requestId: unaffectedId } }))
      .isError,
    'Another approved profile remains usable',
  );
  await client.callTool({ name: 'forget_phone_request', arguments: { requestId: unaffectedId } });
  await pollPhone(multiCatalog);
  const removedId = queryId((await queryProfile('secondary')).structuredContent);
  await pollPhone({
    ...multiCatalog,
    profiles: multiCatalog.profiles.filter((p) => p.id !== 'secondary'),
  });
  assert.equal(
    (await client.callTool({ name: 'get_phone_request', arguments: { requestId: removedId } }))
      .isError,
    true,
  );
  await pollPhone(multiCatalog);
  const editedId = queryId((await queryProfile('secondary')).structuredContent);
  await pollPhone({
    ...multiCatalog,
    profiles: multiCatalog.profiles.map((p) =>
      p.id === 'secondary' ? Object.assign({}, p, { selection: excluded.selection }) : p,
    ),
  });
  assert.equal(
    (await client.callTool({ name: 'get_phone_request', arguments: { requestId: editedId } }))
      .isError,
    true,
  );
  await request(`/api/phones/${deviceId}/poll`, phoneToken, 'POST', catalog);
  await Promise.all(
    ['/docs', '/docs/reference', '/v1/docs', '/v1/docs/reference'].map(async (path) => {
      const page = await fetch(origin + path);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /class="docs-page"/);
      const markdown = await fetch(origin + path, { headers: { Accept: 'text/markdown' } });
      assert.equal(markdown.status, 200);
      assert.match(
        await markdown.text(),
        path.endsWith('/reference') ? /Idempotency-Key/ : /# Get started/,
      );
    }),
  );
  const documentation = await client.callTool({ name: 'get_public_documentation', arguments: {} });
  assert.match(JSON.stringify(documentation), /# Get started/);
  assert.match(JSON.stringify(documentation), /Idempotency-Key/);
  const publicSdk = createMyselfClient({ origin });
  const sdk = createMyselfClient({ origin, token: chatToken });
  const firstCatalog = z
    .object({
      items: z.array(z.object({ slug: z.string() })),
      nextCursor: z.string(),
      hasMore: z.literal(true),
    })
    .parse(await publicSdk.datasets({ limit: 1 }));
  assert.equal(firstCatalog.items.length, 1);
  const secondCatalog = z
    .object({ items: z.array(z.object({ slug: z.string() })) })
    .parse(await publicSdk.datasets({ limit: 1, cursor: firstCatalog.nextCursor }));
  assert.notEqual(firstCatalog.items[0]?.slug, secondCatalog.items[0]?.slug);
  assert.equal((await fetch(origin + '/v1/dataset-catalog?cursor=invalid')).status, 400);
  /** @type {import('../dashboard/webmcp.js').BrowserTool[]} */
  const browserTools = [];
  await registerPublicTools(
    {
      registerTool: (tool) => {
        browserTools.push(tool);
      },
    },
    publicSdk,
  );
  assert.equal(browserTools.length, 2);
  assert.ok(
    String(
      z.object({ markdown: z.string() }).parse(await browserTools[0]?.execute({})).markdown,
    ).includes('OAuth'),
  );
  assert.deepEqual(
    await browserTools[1]?.execute({ limit: 1 }),
    await publicSdk.datasets({ limit: 1 }),
  );
  await assert.rejects(async () => browserTools[1]?.execute({ limit: 0 }));
  await assert.rejects(async () => browserTools[0]?.execute({ token: 'forbidden' }));
  const restInput = {
    deviceId,
    profileId: profile.id,
    domain: 'health',
    type: 'sleep',
    source: 'native',
    start: '2026-10-08T00:00:00.000Z',
    end: '2026-10-09T00:00:00.000Z',
  };
  const restJob = z
    .object({ requestId: z.string(), status: z.literal('queued') })
    .parse(await sdk.query(restInput, 'fixture-retry'));
  const retryBilling = new BillingStore(join(directory, 'billing.sqlite'));
  const beforeRetry = retryBilling.snapshot(`${accountNamespace}|alice`);
  const restRetry = z
    .object({ requestId: z.string() })
    .parse(await sdk.query(restInput, 'fixture-retry'));
  assert.equal(restRetry.requestId, restJob.requestId);
  const afterRetry = retryBilling.snapshot(`${accountNamespace}|alice`);
  assert.equal(afterRetry.used, beforeRetry.used);
  assert.equal(afterRetry.reserved, beforeRetry.reserved);
  retryBilling.db.close();
  await assert.rejects(() => sdk.query({ ...restInput, limit: 1 }, 'fixture-retry'), /422/);
  await assert.rejects(
    () => createMyselfClient({ origin, token: phoneToken }).query(restInput, 'phone-rejected'),
    /403/,
  );
  await assert.rejects(() => publicSdk.query(restInput, 'unauthorized'), /OAuth/);
  await assert.rejects(
    () => createMyselfClient({ origin, token: bobAgentToken }).request(restJob.requestId),
    /422/,
  );
  const restQueued = z
    .object({ status: z.literal('queued') })
    .parse(await sdk.request(restJob.requestId));
  assert.equal(restQueued.status, 'queued');
  await request(`/api/phones/${deviceId}/poll`, phoneToken, 'POST', catalog);
  await request(`/api/phones/${deviceId}/result`, phoneToken, 'POST', {
    id: restJob.requestId,
    page: { records: [record], nextCursor: null, warnings: [], capture: 'synthetic' },
  });
  assert.equal(
    z.object({ status: z.literal('complete') }).parse(await sdk.request(restJob.requestId)).status,
    'complete',
  );
  assert.equal(
    z.object({ requestId: z.string() }).parse(await sdk.query(restInput, 'fixture-retry'))
      .requestId,
    restJob.requestId,
  );
  await request(`/api/phones/${deviceId}/poll`, phoneToken, 'POST', {
    ...catalog,
    domains: catalog.domains.map((domain) => ({ ...domain, enabled: false, types: [] })),
  });
  await assert.rejects(() => sdk.query(restInput, 'fixture-retry'), /422/);
  await request(`/api/phones/${deviceId}/poll`, phoneToken, 'POST', catalog);
  await client.callTool({
    name: 'forget_phone_request',
    arguments: { requestId: restJob.requestId },
  });
  await assert.rejects(() => sdk.query(restInput, 'fixture-retry'), /422/);
  const queried = await client.callTool({
    name: 'query_phone_data',
    arguments: {
      deviceId,
      profileId: profile.id,
      domain: 'health',
      type: 'sleep',
      source: 'native',
      start: '2026-10-08T00:00:00.000Z',
      end: '2026-10-09T00:00:00.000Z',
    },
  });
  assert.ok(!queried.isError);
  const requestId = z.object({ requestId: z.string() }).parse(queried.structuredContent).requestId;
  await request(`/api/phones/${deviceId}/poll`, phoneToken, 'POST', catalog);
  assert.equal(
    (
      await request(`/api/phones/${deviceId}/result`, phoneToken, 'POST', {
        id: requestId,
        page: { records: [record], nextCursor: null, warnings: [], capture: 'synthetic' },
      })
    ).status,
    200,
  );
  const readHistory = async () =>
    z
      .object({ events: z.array(z.unknown()) })
      .parse((await request(historyPath, phoneToken)).value)
      .events.map(parseHistoryEvent);
  const ready = (await readHistory()).find((event) => event.id === requestId);
  assert.ok(ready);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.recordCount, 1);
  await client.callTool({ name: 'get_phone_request', arguments: { requestId } });
  assert.equal((await readHistory()).find((event) => event.id === requestId)?.status, 'complete');
  const pendingQuery = await client.callTool({
    name: 'query_phone_data',
    arguments: {
      deviceId,
      profileId: profile.id,
      domain: 'health',
      type: 'sleep',
      source: 'native',
      start: '2026-10-08T00:00:00.000Z',
      end: '2026-10-09T00:00:00.000Z',
    },
  });
  const pendingId = z
    .object({ requestId: z.string() })
    .parse(pendingQuery.structuredContent).requestId;
  await request('/api/dashboard/agents', dashboardToken, 'PUT', {
    client: 'fixture-chat',
    blocked: true,
  });
  await assert.rejects(
    client.callTool({ name: 'get_phone_debug_logs', arguments: { deviceId } }),
    /blocked/,
  );
  await request('/api/dashboard/agents', dashboardToken, 'PUT', {
    client: 'fixture-chat',
    blocked: false,
  });
  assert.equal(
    (await client.callTool({ name: 'get_phone_request', arguments: { requestId: pendingId } }))
      .isError,
    true,
  );
  assert.equal((await readHistory()).find((event) => event.id === pendingId)?.status, 'cancelled');
  // Consent changes discard retained response data, while preserving the successful audit.
  await request(`/api/phones/${deviceId}/poll`, phoneToken, 'POST', {
    ...catalog,
    domains: catalog.domains.map((domain) =>
      Object.assign({}, domain, { enabled: false, types: [] }),
    ),
  });
  assert.equal((await readHistory()).find((event) => event.id === requestId)?.status, 'complete');
  assert.equal((await request(`/api/cloud/exports/${id}`, bobToken, 'DELETE')).status, 404);
  const stamp = new Date().toISOString();
  const synced = {
    ...addArtifact(
      exportEvent({
        id: 'phone-export',
        profile,
        actor: 'schedule',
        interval: { start: stamp, end: stamp },
        stamp,
        timezone: 'UTC',
      }),
      {
        day: stamp.slice(0, 10),
        name: 'history.json',
        format: 'json',
        recordCount: 2,
        bytes: 42,
        uri: 'file:///private/history.json',
        cloudId: id,
        checksum: null,
        partial: true,
      },
      stamp,
    ),
    status: 'partial',
  };
  const syncBody = { deviceId, events: [synced] };
  assert.equal((await request('/api/history', dashboardToken, 'POST', syncBody)).status, 403);
  assert.equal((await request('/api/history', bobToken, 'POST', syncBody)).status, 404);
  assert.equal((await request('/api/history', phoneToken, 'POST', syncBody)).status, 200);
  const exportHistory = await client.callTool({
    name: 'list_phone_export_history',
    arguments: { deviceId },
  });
  assert.ok(!exportHistory.isError);
  const agentHistory = z
    .object({ events: z.array(z.unknown()), hasMore: z.boolean() })
    .parse(exportHistory.structuredContent);
  assert.ok(agentHistory.events.map(parseHistoryEvent).some((event) => event.id === synced.id));
  assert.ok(!JSON.stringify(exportHistory).includes('file:///private'));
  const diagnosis = await client.callTool({
    name: 'diagnose_phone_export',
    arguments: { deviceId, eventId: synced.id },
  });
  assert.ok(!diagnosis.isError);
  const report = z
    .object({
      diagnostics: z.object({
        outcome: z.string(),
        actions: z.array(z.object({ deepLink: z.string() })),
      }),
    })
    .parse(diagnosis.structuredContent);
  assert.equal(report.diagnostics.outcome, 'partial');
  assert.ok(
    report.diagnostics.actions.some(
      (action) => action.deepLink === 'myselfmd://profiles/synthetic',
    ),
  );
  assert.ok(
    (
      await client.callTool({
        name: 'diagnose_phone_export',
        arguments: { deviceId, eventId: requestId },
      })
    ).isError,
  );
  const secondPairing = await client.callTool({ name: 'create_phone_pairing', arguments: {} });
  const secondUrl = z
    .object({ pairingUrl: z.string() })
    .parse(secondPairing.structuredContent).pairingUrl;
  const secondDevice = z.object({ id: z.string() }).parse(
    (
      await request('/api/claim', phoneToken, 'POST', {
        ticket: new URL(secondUrl).hash.slice(1),
        name: 'Other phone',
      })
    ).value,
  ).id;
  assert.ok(
    (
      await client.callTool({
        name: 'diagnose_phone_export',
        arguments: { deviceId: secondDevice, eventId: synced.id },
      })
    ).isError,
  );
  assert.equal((await request(`/api/devices/${secondDevice}`, phoneToken, 'DELETE')).status, 200);
  const otherAgent = new Client({ name: 'other-account-diagnostics', version: '1' });
  try {
    await otherAgent.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        requestInit: {
          headers: { Authorization: `Bearer ${await token('bob', 'diagnostics-chat')}` },
        },
      }),
    );
    assert.ok(
      (await otherAgent.callTool({ name: 'list_phone_export_history', arguments: { deviceId } }))
        .isError,
    );
    assert.ok(
      (
        await otherAgent.callTool({
          name: 'diagnose_phone_export',
          arguments: { deviceId, eventId: synced.id },
        })
      ).isError,
    );
    assert.ok(
      (
        await otherAgent.callTool({
          name: 'request_phone_profile_agent_access',
          arguments: { deviceId, profileId: profile.id, enabled: true },
        })
      ).isError,
    );
    assert.ok(
      (
        await otherAgent.callTool({
          name: 'query_phone_data',
          arguments: {
            deviceId,
            profileId: profile.id,
            domain: 'health',
            type: 'sleep',
            start: '2026-10-08T00:00:00.000Z',
            end: '2026-10-09T00:00:00.000Z',
          },
        })
      ).isError,
    );
  } finally {
    await otherAgent.close();
  }
  assert.equal(
    (
      await request('/api/history', phoneToken, 'POST', {
        deviceId,
        events: [{ ...synced, kind: 'access', actor: 'agent' }],
      })
    ).status,
    400,
  );
  assert.equal((await request('/api/dashboard/history', null)).status, 401);
  assert.equal((await request('/api/dashboard/history', phoneToken)).status, 403);
  assert.equal((await request('/api/dashboard/history?offset=-1', dashboardToken)).status, 400);
  const audit = z
    .object({ events: z.array(z.unknown()) })
    .parse((await request('/api/dashboard/history', dashboardToken)).value)
    .events.map(parseHistoryEvent);
  assert.equal(audit.find((e) => e.id === synced.id)?.status, 'partial');
  assert.equal(audit.find((e) => e.id === synced.id)?.artifacts[0]?.uri, null);
  const entryPath = '/api/dashboard/history/entry?id=phone-export';
  assert.equal((await request(entryPath, bobDashboardToken)).status, 404);
  assert.equal((await request(entryPath, dashboardToken)).status, 200);
  assert.equal(
    z
      .object({ events: z.array(z.unknown()) })
      .parse((await request('/api/dashboard/history', bobDashboardToken)).value).events.length,
    0,
  );
  assert.equal(
    (
      await request('/api/history', phoneToken, 'POST', {
        deviceId,
        events: [
          {
            ...synced,
            status: 'running',
            updatedAt: new Date(Date.parse(stamp) - 1000).toISOString(),
          },
        ],
      })
    ).status,
    200,
  );
  assert.equal(
    parseHistoryEvent(
      z.object({ event: z.unknown() }).parse((await request(entryPath, dashboardToken)).value)
        .event,
    ).status,
    'partial',
  );
  assert.equal((await request(`/api/devices/${deviceId}`, phoneToken, 'DELETE')).status, 200);
  assert.equal((await request(entryPath, dashboardToken)).status, 200);
  const revoked = await fetch(`${origin}/api/cloud/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Upload ${z.object({ token: z.string() }).parse(credential.value).token}`,
    },
    body: '{}',
  });
  assert.equal(revoked.status, 404);
  // Cloud permissions remain manageable after disconnect and preserve the phone selection.
  assert.equal(
    (
      await request('/api/dashboard/permissions', bobDashboardToken, 'PUT', {
        deviceId,
        profileId: profile.id,
        shared: false,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request('/api/dashboard/permissions', dashboardToken, 'PUT', {
        deviceId,
        profileId: profile.id,
        shared: false,
      })
    ).status,
    200,
  );
  assert.equal(
    (await client.callTool({ name: 'read_cloud_export', arguments: { exportId: id } })).isError,
    true,
  );
  const restored = await request('/api/dashboard/permissions', dashboardToken, 'PUT', {
    deviceId,
    profileId: profile.id,
    shared: true,
  });
  assert.deepEqual(
    z.object({ selection: z.unknown() }).parse(restored.value).selection,
    profile.selection,
  );
  assert.ok(
    !(await client.callTool({ name: 'read_cloud_export', arguments: { exportId: id } })).isError,
  );
  assert.equal(
    (
      await request('/api/dashboard/agents', bobDashboardToken, 'PUT', {
        client: 'fixture-chat',
        blocked: true,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request('/api/dashboard/agents', dashboardToken, 'PUT', {
        client: 'fixture-chat',
        blocked: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${origin}/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chatToken}` },
      })
    ).status,
    403,
  );
  assert.equal(
    dashboardSchema.parse((await request('/api/dashboard', dashboardToken)).value).agents[0]
      ?.blocked,
    true,
  );
  assert.equal(
    (
      await request('/api/dashboard/agents', dashboardToken, 'PUT', {
        client: 'fixture-chat',
        blocked: false,
      })
    ).status,
    200,
  );
  assert.ok(!(await client.callTool({ name: 'list_cloud_exports', arguments: {} })).isError);
  if (r2) {
    r2.state.failDelete = true;
    assert.equal((await request(recordsPath, dashboardToken, 'DELETE')).status, 503);
    r2.state.failDelete = false;
    assert.equal((await request(recordsPath, dashboardToken)).status, 200);
  }
  assert.equal((await request(recordsPath, dashboardToken, 'DELETE')).status, 200);
  assert.equal((await request(recordsPath, dashboardToken)).status, 404);
  if (r2) assert.equal(r2.files.size, 0);
  assert.equal(
    dashboardSchema.parse((await request('/api/dashboard', dashboardToken)).value).exports.length,
    0,
  );
  const publicReads = await Promise.all(
    Array.from({ length: 125 }, () => fetch(`${origin}/v1/health`)),
  );
  const rejectedRead = publicReads.find((response) => response.status === 429);
  assert.ok(rejectedRead, 'Public read limit must be enforced.');
  assert.ok(Number(rejectedRead.headers.get('retry-after')) > 0);
  assert.equal(
    typeof z.object({ error: z.string() }).parse(await rejectedRead.json()).error,
    'string',
  );
  assert.equal((await fetch(`${origin}/mcp`)).status, 401);
  assert.ok(!(await client.callTool({ name: 'get_privacy_policy', arguments: {} })).isError);
  console.log(
    'HTTP/MCP: paginated public catalog, SDK/browser tool calls, authenticated REST jobs, idempotent retries without duplicate billing, revoked-grant and cross-account denials, OAuth resource metadata, real SDK transport, lifetime-access handoff and verified claim completion, tenant isolation, upload-only credentials, explicit cloud sharing device revocation, dashboard client/tenant isolation, owner reads/deletion, profile sharing and agent blocking passed.',
  );
} finally {
  await accessClient.close();
  await client.close();
  child.kill('SIGTERM');
  await once(child, 'exit');
  await new Promise((resolve) => identity.close(resolve));
  if (r2) await new Promise((resolve) => r2.server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
