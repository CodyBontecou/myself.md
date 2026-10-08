import { z } from 'zod';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { parseHistoryEvent } from '../core/history.js';
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
    OAUTH_ISSUER: issuer,
    ALLOW_HTTP_DEV: '1',
    AUTH_PROXY: '0',
    IOS_APP_ID: '67KC823C9A.com.codybontecou.sharedjsapp',
    HOST: '127.0.0.1',
    PORT: String(port),
  },
  stdio: 'ignore',
});
const client = new Client({ name: 'synthetic-cloud-test', version: '1' });
/** @param {string} subject @param {string} azp */
async function token(subject, azp) {
  return new SignJWT({ scope: 'qr-connect', azp })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(issuer)
    .setAudience(`${origin}/mcp`)
    .setSubject(subject)
    .setExpirationTime('5m')
    .sign(privateKey);
}
const phoneToken = await token('alice', 'qr-phone'),
  chatToken = await token('alice', 'fixture-chat'),
  bobToken = await token('bob', 'qr-phone');
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
  const association = await request('/.well-known/apple-app-site-association', null);
  assert.equal(association.status, 200);
  assert.deepEqual(association.value, {
    applinks: {
      details: [
        {
          appIDs: ['67KC823C9A.com.codybontecou.sharedjsapp'],
          components: [{ '/': '/pair' }],
        },
      ],
    },
  });
  const landing = await fetch(`${origin}/pair`);
  assert.equal(landing.status, 200);
  assert.ok((await landing.text()).includes('Open in QR Connect'));
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
  // Consent changes discard retained response data, while preserving the successful audit.
  await request(`/api/phones/${deviceId}/poll`, phoneToken, 'POST', {
    ...catalog,
    domains: catalog.domains.map((domain) =>
      Object.assign({}, domain, { enabled: false, types: [] }),
    ),
  });
  assert.equal((await readHistory()).find((event) => event.id === requestId)?.status, 'complete');
  assert.equal((await request(`/api/cloud/exports/${id}`, bobToken, 'DELETE')).status, 404);
  assert.equal((await request(`/api/devices/${deviceId}`, phoneToken, 'DELETE')).status, 200);
  const revoked = await fetch(`${origin}/api/cloud/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Upload ${z.object({ token: z.string() }).parse(credential.value).token}`,
    },
    body: '{}',
  });
  assert.equal(revoked.status, 404);
  console.log(
    'HTTP/MCP: OAuth resource metadata, real SDK transport, tenant isolation, upload-only credentials, explicit cloud sharing and device revocation passed.',
  );
} finally {
  await client.close();
  child.kill('SIGTERM');
  await once(child, 'exit');
  await new Promise((resolve) => identity.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
