import { verifyAnalytics } from './verify-analytics.js';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { verifyBlogHTTP, verifyBlogMCP } from './verify-blog.js';
import { verifyDatasetHTTP, verifyDatasetMCP } from './verify-dataset-pages.js';
import { reviewToolMetadata } from './mcp-review-metadata.js';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, openSync, closeSync } from 'node:fs';
import { resolve as absolutePath, join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { parseProfile } from '../core/profiles.js';
const directory = mkdtempSync(absolutePath('.local/worker-test-'));
const configPath = join(directory, 'wrangler.json');
const logPath = join(directory, 'runtime.log');
const output = openSync(logPath, 'a');
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'fixture';
const identity = createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});
identity.listen(0, '127.0.0.1');
await once(identity, 'listening');
const address = identity.address();
assert.ok(address && typeof address !== 'string');
const issuer = `http://127.0.0.1:${address.port}/auth/realms/myselfmd`;
const portProbe = createServer();
portProbe.listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const workerAddress = portProbe.address();
assert.ok(workerAddress && typeof workerAddress !== 'string');
const workerPort = workerAddress.port;
await new Promise((closed) => portProbe.close(closed));
const origin = `http://127.0.0.1:${workerPort}`;
const namespace = 'https://previous.example/auth/realms/test';
/** @param {string} value */
const analyticsKey = (value) =>
  createHmac('sha256', 'analytics-fixture-secret-not-production')
    .update(`analytics:v1:${value}`)
    .digest('hex');
const secret = randomBytes(32).toString('hex');
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1'));
config.main = absolutePath('worker/index.js');
config.alias['node-fetch'] = absolutePath('worker/node-fetch.js');
config.assets.directory = absolutePath('dashboard/dist');
Object.assign(config.vars, {
  PUBLIC_URL: origin,
  PUBLIC_URL_ALIASES: 'https://legacy.example',
  OAUTH_ISSUER: issuer,
  ACCOUNT_NAMESPACE: namespace,
  AUTH_ORIGIN: origin,
  IOS_APP_ID: '67KC823C9A.com.myself.md',
  ALLOW_HTTP_DEV: '1',
  MIGRATION_ENABLED: '1',
  IDENTITY_ENABLED: '0',
  ANALYTICS_OPERATORS: `${namespace}|analytics-operator`,
  ANALYTICS_OPERATOR_GITHUB_ID: 'analytics-owner-github',
  ANALYTICS_INTERNAL_SUBJECTS: `${namespace}|analytics-qa`,
  ANALYTICS_INTERNAL_KEYS: [analyticsKey(`anonymous:${'f'.repeat(32)}`)].join(','),
  ANALYTICS_INTERNAL_ANONYMOUS_IDS: 'b'.repeat(32),
});
writeFileSync(
  join(directory, '.dev.vars'),
  `IDENTITY_SECRET=analytics-fixture-secret-not-production\nCLOUD_ENCRYPTION_KEY=${'a'.repeat(64)}\nIMPORT_SECRET=${secret}\n`,
  { mode: 0o600 },
);
/** @type {import('node:child_process').ChildProcess|null} */
let child = null;
const client = new Client({ name: 'worker-fixture', version: '1' });
/** @param {string[]} args */
async function cli(args) {
  const process = spawn(absolutePath('node_modules/.bin/wrangler'), args, {
    stdio: ['ignore', output, output],
  });
  const [code] = await once(process, 'exit');
  assert.equal(code, 0, readFileSync(logPath, 'utf8'));
}
/** @param {string} path @param {string|null} bearer @param {string} [method] @param {unknown} [body] */
async function request(path, bearer, method = 'GET', body) {
  const response = await fetch(origin + path, {
    method,
    headers: { ...(bearer ? { Authorization: bearer } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, value: /** @type {unknown} */ (await response.json()) };
}
async function start() {
  writeFileSync(configPath, JSON.stringify(config));
  child = spawn(
    absolutePath('node_modules/.bin/wrangler'),
    [
      'dev',
      '--config',
      configPath,
      '--port',
      String(workerPort),
      '--persist-to',
      join(directory, 'state'),
    ],
    { stdio: ['ignore', output, output] },
  );
  await ready(120);
}
/** @param {number} attempts @returns {Promise<void>} */
async function ready(attempts) {
  try {
    if ((await request('/health', null)).status === 200) return;
  } catch {}
  if (!attempts) throw new Error(readFileSync(logPath, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 100));
  return ready(attempts - 1);
}
async function stop() {
  if (child) {
    child.kill('SIGTERM');
    await once(child, 'exit');
    child = null;
  }
}
/** @param {string} subject @param {string} clientId */
async function token(subject, clientId) {
  return (
    'Bearer ' +
    (await new SignJWT({ scope: 'myselfmd', azp: clientId })
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
      .setIssuer(issuer)
      .setAudience(`${origin}/mcp`)
      .setSubject(subject)
      .setExpirationTime('10m')
      .sign(privateKey))
  );
}
/** @param {unknown} body */
async function migrate(body) {
  const result = await request('/__migration', `Migration ${secret}`, 'POST', body);
  assert.equal(result.status, 200, JSON.stringify(result.value));
}
/** @param {string} value */
const hash = (value) => createHash('sha256').update(value).digest('hex');
try {
  writeFileSync(configPath, JSON.stringify(config));
  await cli([
    'd1',
    'execute',
    'myself-md-directory',
    '--config',
    configPath,
    '--local',
    '--persist-to',
    join(directory, 'state'),
    '--file',
    absolutePath('worker/directory.sql'),
  ]);
  await cli([
    'd1',
    'execute',
    'myself-md-analytics',
    '--config',
    configPath,
    '--local',
    '--persist-to',
    join(directory, 'state'),
    '--file',
    absolutePath('worker/analytics-migrations/0001_events.sql'),
  ]);
  await cli([
    'd1',
    'execute',
    'myself-md-identity',
    '--config',
    configPath,
    '--local',
    '--persist-to',
    join(directory, 'state'),
    '--file',
    absolutePath('worker/identity.sql'),
  ]);
  await cli([
    'd1',
    'execute',
    'myself-md-identity',
    '--config',
    configPath,
    '--local',
    '--persist-to',
    join(directory, 'state'),
    '--command',
    `INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('analytics-user','Fixture','analytics@example.invalid',1,'${new Date(Date.now() - 30000).toISOString()}','${new Date().toISOString()}'),('analytics-github-owner','Fixture owner','analytics-owner@example.invalid',1,'2020-01-01','2020-01-01'); INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES('analytics-owner-link','analytics-owner-github','github','analytics-github-owner','2020-01-01','2020-01-01')`,
  ]);
  const retentionStart =
    Date.parse(new Date().toISOString().slice(0, 10)) - 8 * 86400000 + 43200000;
  await cli([
    'd1',
    'execute',
    'myself-md-analytics',
    '--config',
    configPath,
    '--local',
    '--persist-to',
    join(directory, 'state'),
    '--command',
    `INSERT INTO analytics_events VALUES('retention-first','retention-fixture','retention-fixture','export_completed',${retentionStart},${Date.now()},'ios',NULL,0),('retention-return','retention-fixture','retention-fixture','app_opened',${retentionStart + 7 * 86400000},${Date.now()},'ios',NULL,0),('qa-retention-first',NULL,'${analyticsKey(`anonymous:${'f'.repeat(32)}`)}','export_completed',${retentionStart},${Date.now()},'ios',NULL,0),('qa-retention-return',NULL,'${analyticsKey(`anonymous:${'f'.repeat(32)}`)}','app_opened',${retentionStart + 7 * 86400000},${Date.now()},'ios',NULL,0),('reviewer-history','${analyticsKey(`account:${namespace}|myselfmd-directory-reviewer-v1`)}','reviewer-history','app_opened',${Date.now() - 1000},${Date.now()},'ios',NULL,0)`,
  ]);
  await start();
  const showcaseHome = await fetch(origin + '/');
  assert.ok(showcaseHome.headers.get('Content-Security-Policy')?.includes("media-src 'self'"));
  await showcaseHome.arrayBuffer();
  const showcasePath = '/dashboard/showcase/selection.mp4';
  const mediaRange = await fetch(origin + showcasePath, { headers: { Range: 'bytes=0-63' } });
  const mediaBytes = readFileSync('dashboard/dist/showcase/selection.mp4');
  // A server may ignore Range and deliver the complete representation (HTTP 200).
  // A partial response must retain its 206 status and exact byte metadata.
  if (mediaRange.status === 206) {
    assert.equal(mediaRange.headers.get('Content-Range'), `bytes 0-63/${mediaBytes.length}`);
    assert.equal(mediaRange.headers.get('Content-Length'), '64');
    assert.deepEqual(Buffer.from(await mediaRange.arrayBuffer()), mediaBytes.subarray(0, 64));
  } else {
    assert.equal(mediaRange.status, 200);
    assert.equal(mediaRange.headers.get('Content-Range'), null);
    assert.equal(mediaRange.headers.get('Content-Length'), String(mediaBytes.length));
    assert.deepEqual(Buffer.from(await mediaRange.arrayBuffer()), mediaBytes);
  }
  const mediaHead = await fetch(origin + showcasePath, { method: 'HEAD' });
  assert.equal(mediaHead.status, 200);
  const headLength = mediaHead.headers.get('Content-Length');
  if (headLength !== null) assert.equal(headLength, String(mediaBytes.length));
  assert.ok(mediaHead.headers.get('Content-Type')?.startsWith('video/mp4'));
  assert.equal((await mediaHead.arrayBuffer()).byteLength, 0);

  assert.equal((await request('/__migration', 'Migration invalid', 'POST', {})).status, 404);
  const ticket = randomBytes(32).toString('base64url');
  const purchase = hash('iso.me:ios:iap|fixture-purchase');
  await migrate({
    action: 'purchase',
    name: purchase,
    batch: {
      id: 'fixture-claim',
      subject: 'unclaimed-fixture',
      tables: [
        {
          name: 'billing_claims',
          columns: ['ticket', 'source', 'reference', 'expires', 'subject'],
          rows: [[hash(ticket), 'iso.me:ios:iap', 'fixture-purchase', Date.now() + 900000, null]],
        },
      ],
    },
  });
  await migrate({
    action: 'ticket',
    name: 'claim',
    ticket: { hash: hash(ticket), subject: null, purchase, expires: Date.now() + 900000 },
  });
  await migrate({
    action: 'account',
    name: `${namespace}|alice`,
    batch: {
      id: 'fixture-account',
      subject: `${namespace}|alice`,
      tables: [
        {
          name: 'billing_grants',
          columns: ['source', 'reference', 'subject', 'created'],
          rows: [['fixture', 'worker-lifetime', `${namespace}|alice`, Date.now()]],
        },
      ],
    },
  });
  await migrate({
    action: 'grant_time',
    name: `${namespace}|time-buyer`,
    payment: 'pi_fixtureTime',
  });
  await migrate({
    action: 'grant_time',
    name: `${namespace}|time-buyer`,
    payment: 'pi_fixtureTime',
  });
  assert.equal(
    (
      await request('/__migration', `Migration ${secret}`, 'POST', {
        action: 'grant_time',
        name: `${namespace}|other-time-buyer`,
        payment: 'pi_fixtureTime',
      })
    ).status,
    409,
  );
  await migrate({
    action: 'account',
    name: `${namespace}|cloud-tier`,
    batch: {
      id: 'cloud-tier-fixture',
      subject: `${namespace}|cloud-tier`,
      tables: [
        {
          name: 'billing_grants',
          columns: ['source', 'reference', 'subject', 'created'],
          rows: [],
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
              'worker-cloud-tier',
              `${namespace}|cloud-tier`,
              'myself_md_cloud_100gb',
              'cloud_100gb',
              'yearly',
              'grace',
              Date.now() + 86400000,
              1,
              null,
              Date.now(),
            ],
          ],
        },
      ],
    },
  });
  await stop();
  config.vars.MIGRATION_ENABLED = '0';
  await start();
  const alice = await token('alice', 'myselfmd-phone'),
    bob = await token('bob', 'myselfmd-phone'),
    bobDashboard = await token('bob', 'myselfmd-dashboard'),
    aliceDashboard = await token('alice', 'myselfmd-dashboard');
  const agent = await token('alice', 'fixture-agent');
  const timeBuyer = await token('time-buyer', 'myselfmd-phone');
  assert.equal(
    z
      .object({ unlocked: z.boolean() })
      .parse((await request('/api/billing', timeBuyer, 'POST', { action: 'sync' })).value).unlocked,
    true,
  );
  assert.equal((await request('/__migration', `Migration ${secret}`, 'POST', {})).status, 404);
  assert.equal((await request('/api/devices', null)).status, 401);
  assert.equal((await fetch(origin + '/dashboard')).status, 200);
  assert.equal(
    (await request('/api/migration/claim', bobDashboard, 'POST', { ticket })).status,
    200,
  );
  assert.equal((await request('/api/migration/claim', alice, 'POST', { ticket })).status, 409);
  assert.equal((await request('/api/billing', agent, 'POST', { action: 'sync' })).status, 403);
  const purchaseInput = {
    store: 'android',
    proof: 'synthetic',
    productId: 'myself_md_cloud_100gb',
  };
  const unpaid = await token('unpaid', 'myselfmd-phone');
  const invalidSubscription = await request(
    '/api/cloud/subscription',
    unpaid,
    'POST',
    purchaseInput,
  );
  assert.ok(
    invalidSubscription.status >= 400 && invalidSubscription.status !== 402,
    'No Lifetime prerequisite; unverified proof cannot grant access',
  );
  assert.equal(
    (await request('/api/cloud/subscription', agent, 'POST', purchaseInput)).status,
    403,
  );
  assert.equal((await request('/api/cloud/purchase-account', agent)).status, 403);
  const purchaseAccount = z.object({ appAccountToken: z.string().uuid() });
  const accountId = purchaseAccount.parse(
    (await request('/api/cloud/purchase-account', alice)).value,
  );
  assert.deepEqual(
    purchaseAccount.parse((await request('/api/cloud/purchase-account', alice)).value),
    accountId,
  );
  assert.notEqual(
    purchaseAccount.parse((await request('/api/cloud/purchase-account', bob)).value)
      .appAccountToken,
    accountId.appAccountToken,
  );
  assert.equal((await request('/api/store/google/notifications', null, 'POST', {})).status, 401);
  assert.equal((await request('/api/store/apple/notifications', null, 'GET')).status, 405);
  const tierToken = await token('cloud-tier', 'myselfmd-phone');
  z.object({
    plan: z.literal('cloud_100gb'),
    limitBytes: z.literal(100_000_000_000),
    subscription: z.object({ status: z.literal('grace') }),
    plans: z.array(z.unknown()).length(1),
    handoff: z.object({
      appLink: z.literal('myselfmd://cloud-storage'),
      requiresUser: z.literal(true),
    }),
  }).parse((await request('/api/cloud/status', tierToken)).value);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
      requestInit: { headers: { Authorization: agent } },
    }),
  );
  await verifyAnalytics({ request, token, mcp: client, origin });
  await verifyBlogHTTP(origin);
  await verifyDatasetHTTP(origin);
  await verifyDatasetMCP(client);
  await verifyBlogMCP(client);
  const reviewedTools = reviewToolMetadata((await client.listTools()).tools);
  console.log(
    'MCP_REVIEW_METADATA ' + JSON.stringify({ runtime: 'workerd-fixture', tools: reviewedTools }),
  );
  const names = new Set(reviewedTools.map((tool) => tool.name));
  for (const name of [
    'get_lifetime_access',
    'create_phone_pairing',
    'read_cloud_export',
    'query_phone_data',
  ])
    assert.ok(names.has(name), name);
  const pairingResult = await client.callTool({ name: 'create_phone_pairing', arguments: {} });
  assert.ok(!pairingResult.isError, JSON.stringify(pairingResult.content));
  const pairing = z
    .object({ pairingUrl: z.string(), pairingId: z.string() })
    .parse(pairingResult.structuredContent);
  const pairingTicket = new URL(pairing.pairingUrl).hash.slice(1);
  assert.equal((await fetch(origin + '/qr/' + pairingTicket)).status, 200);
  assert.deepEqual((await request('/api/pairing-status/' + pairingTicket, null)).value, {
    status: 'pending',
  });
  assert.equal((await request('/api/pairing-status/invalid', null)).status, 400);
  assert.deepEqual((await request('/api/pairing-status/' + 'x'.repeat(43), null)).value, {
    status: 'expired',
  });
  assert.equal(
    (await request('/api/claim', bob, 'POST', { ticket: pairingTicket, name: 'Wrong account' }))
      .status,
    403,
  );
  const device = z
    .object({ id: z.string() })
    .parse(
      (await request('/api/claim', alice, 'POST', { ticket: pairingTicket, name: 'Fixture phone' }))
        .value,
    ).id;
  assert.deepEqual((await request('/api/pairing-status/' + pairingTicket, null)).value, {
    status: 'connected',
  });
  const profile = Object.assign(
    parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'Worker test',
      selection: { health: ['native:sleep'], time: [], location: [] },
    }),
    { id: randomBytes(16).toString('hex') },
  );
  const scheduleRegistration = {
    deviceId: device,
    token: null,
    timeZone: 'Europe/Berlin',
    profiles: [
      {
        profileId: profile.id,
        enabledAt: new Date().toISOString(),
        schedule: profile.schedule,
        lastCompleted: null,
        lastRefresh: null,
      },
    ],
  };
  assert.equal(
    (await request('/api/export-schedules', bob, 'POST', scheduleRegistration)).status,
    404,
  );
  assert.equal(
    (await request('/api/export-schedules', agent, 'POST', scheduleRegistration)).status,
    403,
  );
  assert.equal(
    (await request('/api/export-schedules', alice, 'POST', scheduleRegistration)).status,
    200,
  );
  const scheduleChange = await client.callTool({
    name: 'set_phone_export_schedule_enabled',
    arguments: {
      deviceId: device,
      profileId: profile.id,
      enabled: false,
      requestId: 'worker-schedule-request',
    },
  });
  assert.ok(!scheduleChange.isError, JSON.stringify(scheduleChange.content));
  const scheduled = z
    .object({ requests: z.array(z.object({ requestId: z.string(), state: z.string() })) })
    .parse((await request('/api/export-schedules', alice, 'POST', scheduleRegistration)).value);
  assert.equal(scheduled.requests[0]?.state, 'awaiting-user');
  const scheduleOutcome = {
    deviceId: device,
    requestId: 'worker-schedule-request',
    state: 'cancelled',
  };
  assert.equal((await request('/api/export-schedules', bob, 'PUT', scheduleOutcome)).status, 404);
  assert.equal((await request('/api/export-schedules', alice, 'PUT', scheduleOutcome)).status, 200);
  const scheduleRead = await client.callTool({ name: 'get_phone_export_schedules', arguments: {} });
  assert.ok(!scheduleRead.isError, JSON.stringify(scheduleRead.content));
  const uploadToken = z
    .object({ token: z.string() })
    .parse(
      (await request('/api/cloud/credential', alice, 'POST', { deviceId: device, profile })).value,
    ).token;
  const renewal = {
    deviceId: device,
    profileId: profile.id,
    token: uploadToken,
    expiresAt: Date.now() + 30 * 86400000,
  };
  assert.equal((await request('/api/cloud/credential/renew', alice, 'POST', renewal)).status, 200);
  assert.equal((await request('/api/cloud/credential/renew', bob, 'POST', renewal)).status, 404);
  assert.equal(
    (
      await request('/api/billing', alice, 'POST', {
        action: 'reserve',
        id: 'cloud-fixture',
        scope: { profileId: profile.id, days: ['2026-10-08'], formats: ['jsonl'] },
      })
    ).status,
    200,
  );
  const id = z.object({ id: z.string() }).parse(
    (
      await request('/api/cloud/uploads', `Upload ${uploadToken}`, 'POST', {
        profile,
        day: '2026-10-08',
        format: 'jsonl',
        manifest: { profileId: profile.id, recordCount: 1, billingOperationId: 'cloud-fixture' },
      })
    ).value,
  ).id;
  const bytes =
    JSON.stringify({
      domain: 'health',
      type: 'sleep',
      source: 'healthkit',
      start: null,
      end: null,
      native: { synthetic: true },
    }) + '\n';
  assert.equal(
    (
      await fetch(origin + '/api/cloud/uploads/' + id, {
        method: 'PUT',
        headers: { Authorization: `Upload ${uploadToken}` },
        body: bytes,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request('/api/cloud/access', alice, 'PUT', { deviceId: device, profile, shared: true }))
      .status,
    410,
  );
  const status = await request('/api/cloud/status', alice);
  assert.equal(z.object({ retentionDays: z.null() }).parse(status.value).retentionDays, null);
  assert.equal(
    z.object({ limitBytes: z.number(), usedBytes: z.number() }).parse(status.value).limitBytes,
    100_000_000,
  );
  assert.equal(z.object({ usedBytes: z.number() }).parse(status.value).usedBytes, bytes.length);
  assert.deepEqual(
    (await client.callTool({ name: 'get_cloud_storage', arguments: {} })).structuredContent,
    status.value,
  );
  assert.equal(
    (
      await request(`/api/phones/${device}/poll`, alice, 'POST', {
        profileSync: { base: null },
        profiles: [{ ...profile, agentAccess: true }],
        domains: ['health', 'time', 'location'].map((domain) => ({
          domain,
          enabled: domain === 'health',
          types: domain === 'health' ? ['native:sleep'] : [],
          availableTypes: domain === 'health' ? ['native:sleep'] : [],
          notes: [],
        })),
      })
    ).status,
    200,
  );
  const page = await client.callTool({ name: 'read_cloud_export', arguments: { exportId: id } });
  assert.ok(!page.isError, JSON.stringify(page));
  const used = z
    .object({ used: z.number() })
    .parse((await request('/api/billing', alice, 'POST', { action: 'sync' })).value).used;
  assert.equal(used, 2);
  const profileInventory = await client.callTool({
    name: 'manage_phone_profiles',
    arguments: { action: 'list', deviceId: device },
  });
  assert.ok(!profileInventory.isError);
  const sync = /** @type {import('../server/profile-sync.js').SyncedProfiles} */ (
    JSON.parse(
      /** @type {string} */ (profileInventory.content?.find((c) => c.type === 'text')?.text),
    )
  );
  const edited = structuredClone(sync.state.profiles[0]);
  assert.ok(edited);
  const privacyQuery = {
    deviceId: device,
    profileId: edited.id,
    domain: 'health',
    type: 'sleep',
    start: '2026-10-08T00:00:00.000Z',
    end: '2026-10-09T00:00:00.000Z',
    requestKey: 'worker-privacy-retry',
  };
  const privacyQueued = await client.callTool({
    name: 'query_phone_data',
    arguments: privacyQuery,
  });
  assert.ok(!privacyQueued.isError);
  const privacyId = z
    .object({ requestId: z.string() })
    .parse(
      JSON.parse(privacyQueued.content.find((item) => item.type === 'text')?.text ?? '{}'),
    ).requestId;
  assert.equal(
    (
      await request(`/api/phones/${device}/poll`, alice, 'POST', {
        profiles: sync.state.profiles,
        profileSync: { base: sync.state },
        domains: ['health', 'time', 'location'].map((domain) => ({
          domain,
          enabled: domain === 'health',
          types: domain === 'health' ? ['native:sleep'] : [],
          availableTypes: domain === 'health' ? ['native:sleep'] : [],
          notes: [],
        })),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/phones/${device}/result`, alice, 'POST', {
        id: privacyId,
        page: {
          records: [JSON.parse(bytes)],
          nextCursor: null,
          warnings: [],
          capture: 'synthetic',
        },
      })
    ).status,
    200,
  );
  assert.ok(
    !(await client.callTool({ name: 'get_phone_request', arguments: { requestId: privacyId } }))
      .isError,
  );
  edited.export.lookbackDays = 14;
  edited.agentPermissions = {
    health: false,
    time: false,
    location: false,
    logs: edited.agentPermissions?.logs === true,
  };
  const webSave = await request('/api/dashboard/profiles', aliceDashboard, 'PUT', {
    deviceId: device,
    profileId: edited.id,
    profile: edited,
    revision: sync.revision,
  });
  assert.equal(webSave.status, 200, JSON.stringify(webSave.value));
  assert.equal(
    (await client.callTool({ name: 'get_phone_request', arguments: { requestId: privacyId } }))
      .isError,
    true,
    'Worker dashboard denial removes retained records before the phone acknowledges',
  );
  assert.equal(
    (await client.callTool({ name: 'query_phone_data', arguments: privacyQuery })).isError,
    true,
  );
  assert.equal(
    (
      await client.callTool({
        name: 'query_phone_data',
        arguments: { ...privacyQuery, requestKey: 'worker-privacy-fresh-denied' },
      })
    ).isError,
    true,
  );
  assert.equal(
    (await client.callTool({ name: 'read_cloud_export', arguments: { exportId: id } })).isError,
    true,
    'Stored exports also deny immediately before acknowledgment',
  );
  assert.equal(
    (
      await request('/api/dashboard/profiles', aliceDashboard, 'PUT', {
        deviceId: device,
        profileId: edited.id,
        profile: { ...edited, agentPermissions: sync.state.profiles[0]?.agentPermissions },
        revision: sync.revision + 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (await client.callTool({ name: 'get_phone_request', arguments: { requestId: privacyId } }))
      .isError,
    true,
    'Worker regrant cannot resurrect a deleted response',
  );
  assert.equal(
    (await client.callTool({ name: 'query_phone_data', arguments: privacyQuery })).isError,
    true,
    'Worker exact retry cannot redispatch a revoked original',
  );
  assert.equal(
    (
      await request('/api/dashboard/profiles', bobDashboard, 'PUT', {
        deviceId: device,
        profileId: edited.id,
        profile: edited,
        revision: sync.revision,
      })
    ).status,
    404,
  );
  const syncedCatalog = {
    profiles: [edited],
    profileSync: { base: sync.state },
    domains: ['health', 'time', 'location'].map((domain) => ({
      domain,
      enabled: domain === 'health',
      types: domain === 'health' ? ['native:sleep'] : [],
      availableTypes: domain === 'health' ? ['native:sleep'] : [],
      notes: [],
    })),
  };
  const acknowledged = await request(`/api/phones/${device}/poll`, alice, 'POST', syncedCatalog);
  assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.value));
  const profileView =
    /** @type {{profiles:{profile?:import('../core/profiles.js').ExportProfile,revision:number,confirmedRevision:number}[]}} */ (
      (await request('/api/dashboard', aliceDashboard)).value
    );
  assert.equal(profileView.profiles[0]?.profile?.export.lookbackDays, 14);
  assert.equal(profileView.profiles[0]?.revision, profileView.profiles[0]?.confirmedRevision);

  const reservations = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      request('/api/billing', alice, 'POST', { action: 'reserve', id: 'concurrent-' + i }),
    ),
  );
  assert.equal(reservations.filter((result) => result.status === 200).length, 6);
  assert.equal(reservations.filter((result) => result.status === 402).length, 0);
  assert.equal((await request('/api/cloud/exports/' + id, bob, 'DELETE')).status, 404);
  await client.close();
  await stop();
  await start();
  assert.equal(
    /** @type {{profiles:{profile:import('../core/profiles.js').ExportProfile}[]}} */ (
      (await request('/api/dashboard', aliceDashboard)).value
    ).profiles[0]?.profile.export.lookbackDays,
    14,
    'Synchronized configuration survives Worker restart',
  );
  const restoredSchedules = z
    .object({
      schedules: z.array(z.object({ deviceId: z.string() })),
      requests: z.array(z.object({ state: z.string() })),
    })
    .parse((await request('/api/export-schedules', alice)).value);
  assert.equal(restoredSchedules.schedules[0]?.deviceId, device);
  assert.equal(restoredSchedules.requests[0]?.state, 'cancelled');
  assert.equal(
    z
      .array(z.object({ id: z.string() }))
      .parse((await request('/api/cloud/exports', alice)).value)[0]?.id,
    id,
  );
  assert.equal((await request('/api/cloud/exports/' + id, alice, 'DELETE')).status, 200);
  console.log(
    'Workers: real workerd HTTP/MCP, account isolation, migration claims, R2 bindings, shared quotas, concurrent reservations and restart persistence passed.',
  );
} catch (error) {
  await new Promise((done) => setTimeout(done, 300));
  console.error(readFileSync(logPath, 'utf8'));
  throw error;
} finally {
  await client.close().catch(() => {});
  await stop();
  await new Promise((resolve) => identity.close(resolve));
  closeSync(output);
  rmSync(directory, { recursive: true, force: true });
}
