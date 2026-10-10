import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, openSync, closeSync } from 'node:fs';
import { resolve as absolutePath, join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
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
const origin = 'http://127.0.0.1:8798';
const namespace = 'https://previous.example/auth/realms/test';
const secret = randomBytes(32).toString('hex');
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1'));
config.main = absolutePath('worker/index.js');
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
});
writeFileSync(
  join(directory, '.dev.vars'),
  `CLOUD_ENCRYPTION_KEY=${'a'.repeat(64)}\nIMPORT_SECRET=${secret}\n`,
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
    ['dev', '--config', configPath, '--port', '8798', '--persist-to', join(directory, 'state')],
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
  await start();
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
    batch: { id: 'fixture-account', subject: `${namespace}|alice`, tables: [] },
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
  await stop();
  config.vars.MIGRATION_ENABLED = '0';
  await start();
  const alice = await token('alice', 'myselfmd-phone'),
    bob = await token('bob', 'myselfmd-phone'),
    bobDashboard = await token('bob', 'myselfmd-dashboard');
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
  await client.connect(
    new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
      requestInit: { headers: { Authorization: agent } },
    }),
  );
  const names = new Set((await client.listTools()).tools.map((tool) => tool.name));
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
  const profile = Object.assign(
    parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'Worker test',
      selection: { health: ['native:sleep'], time: [], location: [] },
    }),
    { id: randomBytes(16).toString('hex') },
  );
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
    200,
  );
  const page = await client.callTool({ name: 'read_cloud_export', arguments: { exportId: id } });
  assert.ok(!page.isError, JSON.stringify(page));
  const used = z
    .object({ used: z.number() })
    .parse((await request('/api/billing', alice, 'POST', { action: 'sync' })).value).used;
  assert.equal(used, 2);
  const reservations = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      request('/api/billing', alice, 'POST', { action: 'reserve', id: 'concurrent-' + i }),
    ),
  );
  assert.equal(reservations.filter((result) => result.status === 200).length, 3);
  assert.equal(reservations.filter((result) => result.status === 402).length, 3);
  assert.equal((await request('/api/cloud/exports/' + id, bob, 'DELETE')).status, 404);
  await client.close();
  await stop();
  await start();
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
