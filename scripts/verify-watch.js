import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { recordChunk, fileHeader, fileFooter } from '../core/export-files.js';
import { watchRecordFixtures } from './watch-fixtures.js';

const directory = mkdtempSync(join(tmpdir(), 'myself-watch-'));
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'watch-fixture';
const identity = createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});
identity.listen(0, '127.0.0.1');
await once(identity, 'listening');
const identityAddress = identity.address();
assert.ok(identityAddress && typeof identityAddress !== 'string');
const issuer = `http://127.0.0.1:${identityAddress.port}/realms/fixture`;
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address();
assert.ok(address && typeof address !== 'string');
const serverPort = address.port;
const origin = `http://127.0.0.1:${address.port}`;
await new Promise((resolve) => listener.close(resolve));
let startup = '';
function startServer() {
  const processHandle = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      DATA_DIR: directory,
      CLOUD_ENCRYPTION_KEY: 'b'.repeat(64),
      PUBLIC_URL: origin,
      PUBLIC_URL_ALIASES: '',
      OAUTH_ISSUER: issuer,
      ACCOUNT_NAMESPACE: issuer,
      ALLOW_HTTP_DEV: '1',
      AUTH_PROXY: '0',
      PORT: String(serverPort),
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processHandle.stdout.on('data', (value) => {
    startup += value;
  });
  processHandle.stderr.on('data', (value) => {
    startup += value;
  });
  return processHandle;
}
let child = startServer();
const jobSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    interval: z.unknown().nullable(),
    recordCount: z.number().nullable(),
  })
  .passthrough();
const configuredSchema = z.object({
  deviceId: z.string(),
  revision: z.string(),
  expiresAt: z.number(),
  token: z.string(),
  profile: z.unknown(),
});
/** @param {string} subject @param {string} client */
async function token(subject, client) {
  return new SignJWT({ scope: 'myselfmd', azp: client })
    .setProtectedHeader({ alg: 'RS256', kid: 'watch-fixture' })
    .setIssuer(issuer)
    .setAudience(`${origin}/mcp`)
    .setSubject(subject)
    .setExpirationTime('5m')
    .sign(privateKey);
}
const alice = await token('alice', 'myselfmd-phone'),
  bob = await token('bob', 'myselfmd-phone'),
  chat = await token('alice', 'watch-fixture-agent');
/** @param {string} path @param {string|null} authorization @param {unknown} [body] @param {string} [method] */
async function request(path, authorization, body, method = 'POST') {
  const response = await fetch(origin + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, value: /** @type {unknown} */ (await response.json()) };
}
const agentClient = new Client({ name: 'watch-fixture-agent', version: '1' });
const watchId = randomUUID();
let watchToken = '';
/** @param {unknown} body */
const runtime = (body) => request('/api/watch/runtime', `Watch ${watchToken}`, body);
const end = new Date(),
  start = new Date(end);
start.setUTCHours(0, 0, 0, 0);
const interval = {
  start: start.toISOString(),
  end: end.toISOString(),
  day: start.toISOString().slice(0, 10),
  timezone: 'UTC',
};
const summary = {
  steps: 1234,
  observedAt: end.toISOString(),
  day: interval.day,
  timezone: 'UTC',
  earliestAvailable: start.toISOString(),
  permissionRequested: true,
};
async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      // Startup polling is sequential; each attempt depends on the preceding failure.
      // oxlint-disable-next-line eslint/no-await-in-loop
      if ((await request('/health', null, undefined, 'GET')).status === 200) break;
    } catch {}
    if (attempt === 99) throw new Error(`Fixture server failed to start: ${startup}`);
    // oxlint-disable-next-line eslint/no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
try {
  await waitForServer();
  await agentClient.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${chat}` } },
    }),
  );
  const pairing = await agentClient.callTool({ name: 'create_phone_pairing', arguments: {} });
  const pairingUrl = z
    .object({ pairingUrl: z.string() })
    .parse(pairing.structuredContent).pairingUrl;
  const ticket = new URL(pairingUrl).hash.slice(1);
  const claimed = await request('/api/claim', `Bearer ${alice}`, {
    ticket,
    name: 'Watch fixture phone',
  });
  const phoneId = z.object({ id: z.string() }).parse(claimed.value).id;
  const settings = {
    action: 'configure',
    deviceId: watchId,
    parentDeviceId: phoneId,
    name: 'Watch steps',
    endpoint: 'https://example.test/private/upload?key=private',
    agentAccess: false,
  };
  assert.equal((await request('/api/watches', `Bearer ${chat}`, settings)).status, 403);
  assert.equal((await request('/api/watches', `Bearer ${bob}`, settings)).status, 404);
  const setup = await request('/api/watches', `Bearer ${alice}`, settings);
  assert.equal(setup.status, 200);
  const configured = configuredSchema.parse(setup.value);
  watchToken = configured.token;
  assert.notEqual(configured.deviceId, phoneId);
  assert.equal(
    (await request('/api/billing', `Watch ${watchToken}`, { action: 'sync' })).status,
    401,
  );
  assert.equal(
    (await request('/api/watches', `Watch ${watchToken}`, { action: 'list' })).status,
    401,
  );
  assert.equal((await runtime({ action: 'poll', summary })).status, 200);
  const privateView = await agentClient.callTool({
    name: 'get_watch_state',
    arguments: { deviceId: watchId },
  });
  const privateResult = z
    .object({
      result: z.object({
        agentAccess: z.literal(false),
        summary: z.unknown().optional(),
        destination: z.string(),
      }),
    })
    .parse(privateView.structuredContent).result;
  assert.equal(privateResult.summary, undefined);
  assert.equal(privateResult.destination, 'example.test');
  assert.equal(
    (
      await agentClient.callTool({
        name: 'request_watch_export',
        arguments: { deviceId: watchId, requestId: randomUUID() },
      })
    ).isError,
    true,
  );
  const ownerView = await request('/api/watches', `Bearer ${alice}`, {
    action: 'get',
    deviceId: watchId,
  });
  assert.equal(
    z.object({ summary: z.object({ steps: z.null() }) }).parse(ownerView.value).summary.steps,
    null,
    'Private metrics must not be uploaded to the account service.',
  );
  assert.equal(
    (
      await runtime({
        action: 'enqueue',
        requestId: randomUUID(),
        interval: { ...interval, timezone: 'not-a-zone' },
      })
    ).status,
    400,
  );
  const id = randomUUID();
  assert.equal((await runtime({ action: 'enqueue', requestId: id, interval })).status, 200);
  assert.equal(
    jobSchema.parse((await runtime({ action: 'enqueue', requestId: id, interval })).value).id,
    id,
  );
  assert.equal(
    (
      await runtime({
        action: 'settle',
        requestId: id,
        status: 'completed',
        httpStatus: 200,
        recordCount: 2,
        bytes: 100,
        partial: false,
        error: null,
      })
    ).status,
    409,
  );
  assert.equal((await runtime({ action: 'awaiting_user', requestId: id })).status, 200);
  const begun = await runtime({ action: 'start', requestId: id, interval });
  assert.equal(begun.status, 200);
  assert.equal(z.object({ job: jobSchema }).parse(begun.value).job.status, 'running');
  assert.equal(
    (await runtime({ action: 'start', requestId: id, interval })).status,
    200,
    'Restart resumes the same reservation.',
  );
  assert.equal(
    (
      await runtime({
        action: 'start',
        requestId: id,
        interval: { ...interval, end: new Date(end.getTime() - 1000).toISOString() },
      })
    ).status,
    409,
  );
  const bytes =
    fileHeader('json') +
    watchRecordFixtures.map((row, index) => recordChunk('json', row, index)).join('') +
    fileFooter('json', { schema: 'myself.md.export.v1', recordCount: 2, interval });
  assert.equal(JSON.parse(bytes).records[0].native.quantity, 0);
  const result = {
    action: 'settle',
    requestId: id,
    status: 'completed',
    httpStatus: 200,
    recordCount: 2,
    bytes: Buffer.byteLength(bytes),
    partial: false,
    error: null,
  };
  assert.equal((await runtime({ ...result, httpStatus: 302 })).status, 400);
  assert.equal(jobSchema.parse((await runtime(result)).value).status, 'completed');
  assert.equal(jobSchema.parse((await runtime(result)).value).status, 'completed');
  const allowance = await request('/api/billing', `Bearer ${alice}`, { action: 'sync' });
  assert.equal(
    z.object({ used: z.number() }).parse(allowance.value).used,
    1,
    'Acknowledgment retry must not double count.',
  );
  const rotated = configuredSchema.parse(
    (await request('/api/watches', `Bearer ${alice}`, { ...settings, agentAccess: true })).value,
  );
  assert.equal((await runtime({ action: 'poll' })).status, 401);
  watchToken = rotated.token;
  await runtime({ action: 'poll', summary });
  const sharedView = await agentClient.callTool({
    name: 'get_watch_state',
    arguments: { deviceId: watchId },
  });
  assert.equal(
    z
      .object({ result: z.object({ summary: z.object({ steps: z.number() }) }) })
      .parse(sharedView.structuredContent).result.summary.steps,
    1234,
  );
  assert.ok(!JSON.stringify(sharedView).includes('private/upload'));
  assert.ok(!JSON.stringify(sharedView).includes(watchToken));
  const agentId = randomUUID();
  const agentRequest = await agentClient.callTool({
    name: 'request_watch_export',
    arguments: { deviceId: watchId, requestId: agentId },
  });
  assert.equal(
    z.object({ result: jobSchema }).parse(agentRequest.structuredContent).result.status,
    'accepted',
  );
  assert.equal(
    (await runtime({ action: 'enqueue', requestId: agentId, interval })).status,
    200,
    'Native execution must be able to pick up an agent request.',
  );
  assert.equal((await runtime({ action: 'start', requestId: agentId, interval })).status, 200);
  await runtime({ ...result, requestId: agentId, partial: true });
  const cancelId = randomUUID();
  await runtime({ action: 'enqueue', requestId: cancelId, interval });
  assert.equal((await runtime({ action: 'start', requestId: cancelId, interval })).status, 200);
  assert.equal(
    (
      await request('/api/watches', `Bearer ${alice}`, {
        action: 'cancel',
        deviceId: watchId,
        requestId: cancelId,
      })
    ).status,
    200,
  );
  assert.equal(
    jobSchema.parse((await runtime({ action: 'start', requestId: cancelId, interval })).value)
      .status,
    'cancelled',
  );
  const failedId = randomUUID();
  await runtime({ action: 'enqueue', requestId: failedId, interval });
  await runtime({ action: 'start', requestId: failedId, interval });
  await runtime({
    ...result,
    requestId: failedId,
    status: 'failed',
    httpStatus: 401,
    error: 'Destination rejected the export.',
  });
  const afterFailure = await request('/api/billing', `Bearer ${alice}`, { action: 'sync' });
  assert.equal(
    z.object({ used: z.number(), reserved: z.number() }).parse(afterFailure.value).used,
    2,
  );
  assert.equal(z.object({ reserved: z.number() }).parse(afterFailure.value).reserved, 0);
  const restartedId = randomUUID();
  await runtime({ action: 'enqueue', requestId: restartedId, interval });
  child.kill();
  await once(child, 'exit');
  child = startServer();
  await waitForServer();
  const recovered = await runtime({ action: 'poll' });
  assert.ok(
    z
      .object({ jobs: z.array(jobSchema) })
      .parse(recovered.value)
      .jobs.some((job) => job.id === restartedId && job.status === 'accepted'),
  );
  assert.equal((await runtime({ action: 'start', requestId: restartedId, interval })).status, 200);
  assert.equal((await runtime({ ...result, requestId: restartedId })).status, 200);

  const stored = readFileSync(join(directory, 'watch.sqlite'));
  assert.ok(!stored.includes(Buffer.from('private/upload')));
  assert.ok(!stored.includes(Buffer.from(watchToken)));
  const other = await request('/api/watches', `Bearer ${bob}`, {
    action: 'get',
    deviceId: watchId,
  });
  assert.equal(other.status, 404);
  const activeId = randomUUID();
  await runtime({ action: 'enqueue', requestId: activeId, interval });
  assert.equal((await runtime({ action: 'start', requestId: activeId, interval })).status, 200);
  await request(`/api/devices/${phoneId}`, `Bearer ${alice}`, undefined, 'DELETE');
  const released = await request('/api/billing', `Bearer ${alice}`, { action: 'sync' });
  assert.equal(z.object({ reserved: z.number() }).parse(released.value).reserved, 0);
  assert.equal(
    (await runtime({ action: 'poll' })).status,
    403,
    'Disconnecting the parent must revoke watch authority.',
  );
  console.log(
    'PASS watch HTTP/MCP authorization, private metrics, device identity, frozen exports, retries, consent, delivery acknowledgment, billing, process restart and revocation',
  );
} finally {
  await agentClient.close().catch(() => {});
  child.kill();
  await once(child, 'exit').catch(() => {});
  await new Promise((resolve) => identity.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
