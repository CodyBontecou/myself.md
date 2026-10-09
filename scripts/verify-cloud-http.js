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
/** @param {string} subject @param {string} azp @param {string} [audience] */
async function token(subject, azp, audience = `${origin}/mcp`) {
  return new SignJWT({ scope: 'qr-connect', azp })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime('5m')
    .sign(privateKey);
}
const phoneToken = await token('alice', 'qr-phone'),
  chatToken = await token('alice', 'fixture-chat'),
  bobToken = await token('bob', 'qr-phone'),
  dashboardToken = await token('alice', 'qr-dashboard'),
  bobDashboardToken = await token('bob', 'qr-dashboard');
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
  assert.equal((await request('/api/cloud/exports', null)).status, 401);
  const dashboardPage = await fetch(`${origin}/dashboard`);
  assert.equal(dashboardPage.status, 200);
  assert.ok(
    dashboardPage.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"),
  );
  const dashboardHtml = await dashboardPage.text();
  assert.ok(dashboardHtml.includes('Stored data'));
  assert.ok(!dashboardHtml.includes('__STYLE_NONCE__'));
  const nonce = dashboardHtml.match(/name="style-nonce" content="([^"]+)"/)?.[1];
  assert.ok(nonce);
  assert.ok(dashboardPage.headers.get('content-security-policy')?.includes(`'nonce-${nonce}'`));
  assert.equal((await fetch(`${origin}/dashboard/app.js`)).status, 200);
  assert.equal((await fetch(`${origin}/dashboard/callback`)).status, 200);
  assert.equal(
    z.object({ clientId: z.string() }).parse((await request('/dashboard/config', null)).value)
      .clientId,
    'qr-dashboard',
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
  assert.equal(home.status, 302);
  assert.equal(home.headers.get('location'), '/dashboard');
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
        clientId: 'qr-phone',
        resource: `${expected}/mcp`,
      });
      const metadata = await fetchHost('/.well-known/oauth-protected-resource/mcp', host);
      assert.equal(
        z.object({ resource: z.string() }).parse(await metadata.json()).resource,
        `${expected}/mcp`,
      );
    }),
  );
  const legacyToken = await token('alice', 'qr-phone', 'https://legacy.example/mcp');
  const legacyIdentity = await request('/api/devices', legacyToken);
  assert.equal(legacyIdentity.status, 200);
  assert.equal(
    z.object({ subject: z.string() }).parse(legacyIdentity.value).subject,
    `${accountNamespace}|alice`,
  );
  const previousIssuerToken = await new SignJWT({ scope: 'qr-connect', azp: 'qr-phone' })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(accountNamespace)
    .setAudience(`${origin}/mcp`)
    .setSubject('alice')
    .setExpirationTime('5m')
    .sign(privateKey);
  assert.equal((await request('/api/devices', previousIssuerToken)).status, 401);
  const unrelatedToken = await token('alice', 'qr-phone', 'https://untrusted.example/mcp');
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
  const tools = await client.listTools();
  assert.ok(tools.tools.some((t) => t.name === 'read_cloud_export'));
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
      schema: 'qr-connect.profile.v1',
      name: 'Synthetic',
      selection: { health: ['imported:sleep'], time: [], location: [] },
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
      manifest: { profileId: profile.id, recordCount: 1 },
    }),
  });
  assert.equal(begin.status, 200);
  const { id } = z.object({ id: z.string() }).parse(await begin.json());
  const record = {
    domain: 'health',
    type: 'sleep',
    source: 'imported:test',
    start: null,
    end: null,
    native: { synthetic: true },
  };
  const committed = await fetch(`${origin}/api/cloud/uploads/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Upload ${z.object({ token: z.string() }).parse(credential.value).token}`,
    },
    body: JSON.stringify(record) + '\n',
  });
  assert.equal(committed.status, 200);
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
      manifest: { profileId: profile.id, recordCount: 55 },
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
  assert.equal(historyEvents.length, 2);
  assert.ok(
    historyEvents.some(
      (event) =>
        event.status === 'complete' && event.relatedId === id && event.client === 'fixture-chat',
    ),
  );
  assert.ok(!JSON.stringify(cloudHistory.value).includes('native'));
  const catalog = {
    activeProfileId: profile.id,
    profiles: [profile],
    domains: ['health', 'time', 'location'].map((domain) => ({
      domain,
      enabled: domain === 'health',
      availableTypes: domain === 'health' ? ['imported:sleep'] : [],
      types: domain === 'health' ? ['imported:sleep'] : [],
      notes: [],
    })),
  };
  assert.equal(
    (await request(`/api/phones/${deviceId}/poll`, phoneToken, 'POST', catalog)).status,
    200,
  );
  const queried = await client.callTool({
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
      source: 'imported',
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
  assert.equal((await request(recordsPath, dashboardToken, 'DELETE')).status, 200);
  assert.equal((await request(recordsPath, dashboardToken)).status, 404);
  assert.equal(
    dashboardSchema.parse((await request('/api/dashboard', dashboardToken)).value).exports.length,
    0,
  );
  console.log(
    'HTTP/MCP: OAuth resource metadata, real SDK transport, tenant isolation, upload-only credentials, explicit cloud sharing device revocation, dashboard client/tenant isolation, owner reads/deletion, profile sharing and agent blocking passed.',
  );
} finally {
  await client.close();
  child.kill('SIGTERM');
  await once(child, 'exit');
  await new Promise((resolve) => identity.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
