import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { parseProfile } from '../core/profiles.js';

// A real MCP client and production HTTP server, with an isolated phone adapter.
// Only the adapter and local identity issuer are synthetic. Never publish tokens.
const directory = mkdtempSync(join(tmpdir(), 'launch-agent-'));
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'launch-fixture';
const identity = createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});
identity.listen(0, '127.0.0.1');
await once(identity, 'listening');
const identityAddress = identity.address();
assert.ok(identityAddress && typeof identityAddress !== 'string');
const issuer = `http://127.0.0.1:${identityAddress.port}/realms/demo`;
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const address = reservation.address();
assert.ok(address && typeof address !== 'string');
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${address.port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  env: {
    PATH: process.env.PATH,
    DATA_DIR: directory,
    CLOUD_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    PUBLIC_URL: origin,
    OAUTH_ISSUER: issuer,
    ACCOUNT_NAMESPACE: issuer,
    ALLOW_HTTP_DEV: '1',
    AUTH_PROXY: '0',
    HOST: '127.0.0.1',
    PORT: String(address.port),
  },
  stdio: 'ignore',
});
const client = new Client({ name: 'launch-demo-agent', version: '1' });
/** @param {string} azp */
const token = (azp) =>
  new SignJWT({ scope: 'myselfmd', azp })
    .setProtectedHeader({ alg: 'RS256', kid: 'launch-fixture' })
    .setIssuer(issuer)
    .setAudience(`${origin}/mcp`)
    .setSubject('launch-owner')
    .setExpirationTime('5m')
    .sign(privateKey);
const phoneToken = await token('myselfmd-phone');
const agentToken = await token('launch-demo-agent');
/** @param {string} path @param {unknown} body */
async function phone(path, body) {
  const response = await fetch(origin + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${phoneToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  return value;
}
/** Sequential readiness probes, bounded to five seconds. @param {number} [attempt] @returns {Promise<void>} */
async function ready(attempt = 0) {
  try {
    if ((await fetch(`${origin}/health`)).ok) return;
  } catch {}
  if (attempt === 100) throw new Error('Launch server did not start');
  await new Promise((resolve) => setTimeout(resolve, 50));
  await ready(attempt + 1);
}
const rowSchema = z
  .object({
    native: z
      .object({
        count: z.number().optional(),
        app: z.string().optional(),
        minutes: z.number().optional(),
      })
      .passthrough(),
  })
  .passthrough();
try {
  await ready();
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${agentToken}` } },
    }),
  );
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'query_phone_data'));
  const pairing = z
    .object({ pairingUrl: z.string() })
    .parse(
      (await client.callTool({ name: 'create_phone_pairing', arguments: {} })).structuredContent,
    );
  const { id: deviceId } = z.object({ id: z.string() }).parse(
    await phone('/api/claim', {
      ticket: new URL(pairing.pairingUrl).hash.slice(1),
      name: 'Demo iPhone',
    }),
  );
  const profile = {
    ...parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'My first export for AI',
      selection: {
        health: ['native:HKQuantityTypeIdentifierStepCount'],
        time: ['native:applications'],
        location: [],
      },
      export: { formats: ['json', 'jsonl'], lookbackDays: 7 },
    }),
    id: 'launch-profile',
    agentAccess: false,
  };
  const catalog = {
    locationTracking: false,
    profiles: [profile],
    domains: ['health', 'time', 'location'].map((domain) => {
      const types =
        domain === 'health'
          ? profile.selection.health
          : domain === 'time'
            ? profile.selection.time
            : [];
      return {
        domain,
        enabled: domain !== 'location',
        selectableTypes: types,
        availableTypes: types,
        types,
        notes: [],
      };
    }),
  };
  await phone(`/api/phones/${deviceId}/poll`, catalog);
  const healthQuery = {
    deviceId,
    profileId: profile.id,
    domain: 'health',
    type: 'HKQuantityTypeIdentifierStepCount',
    start: '2026-10-06T00:00:00.000Z',
    end: '2026-10-13T00:00:00.000Z',
  };
  assert.equal(
    (await client.callTool({ name: 'query_phone_data', arguments: healthQuery })).isError,
    true,
  );
  // Owner-side fixture approval, published by the phone identity, not the agent.
  profile.agentAccess = true;
  await phone(`/api/phones/${deviceId}/poll`, catalog);
  const discovered = await client.callTool({
    name: 'get_phone_data_catalog',
    arguments: { deviceId },
  });
  assert.ok(!discovered.isError);
  /** @param {Record<string, unknown>} query @param {import('../core/data.js').DataRecord[]} records */
  async function queryData(query, records) {
    const queued = await client.callTool({ name: 'query_phone_data', arguments: query });
    assert.ok(!queued.isError, JSON.stringify(queued));
    const { requestId } = z.object({ requestId: z.string() }).parse(queued.structuredContent);
    const dispatch = z
      .object({ request: z.object({ id: z.string() }) })
      .parse(await phone(`/api/phones/${deviceId}/poll`, catalog));
    assert.equal(dispatch.request.id, requestId);
    await phone(`/api/phones/${deviceId}/result`, {
      id: requestId,
      page: {
        records,
        nextCursor: null,
        warnings: [],
        capture: 'synthetic-launch-demo',
        complete: true,
      },
    });
    const completed = await client.callTool({
      name: 'get_phone_request',
      arguments: { requestId },
    });
    const result = z
      .object({
        status: z.literal('complete'),
        result: z.object({ page: z.object({ records: z.array(rowSchema) }) }),
      })
      .parse(completed.structuredContent);
    assert.deepEqual(result.result.page.records, records);
    return {
      tool: 'query_phone_data',
      query,
      requestId,
      status: result.status,
      records: result.result.page.records,
    };
  }
  const counts = [7210, 8640, 9100, 7820, 10450, 12080, 9680];
  const steps = await queryData(
    healthQuery,
    counts.map((count, index) => ({
      domain: 'health',
      type: healthQuery.type,
      source: 'healthkit',
      start: `2026-10-${String(index + 6).padStart(2, '0')}T00:00:00.000Z`,
      end: null,
      native: { count, unit: 'count', synthetic: true },
    })),
  );
  const apps = await queryData(
    { ...healthQuery, domain: 'time', type: 'applications' },
    [
      { app: 'Safari', minutes: 184 },
      { app: 'Messages', minutes: 96 },
      { app: 'Instagram', minutes: 72 },
    ].map((native) => ({
      domain: 'time',
      type: 'applications',
      source: 'screen-time',
      start: healthQuery.start,
      end: healthQuery.end,
      native: { ...native, synthetic: true },
    })),
  );
  const totalSteps = steps.records.reduce((sum, row) => sum + (row.native.count ?? 0), 0);
  const appMinutes = apps.records.reduce((sum, row) => sum + (row.native.minutes ?? 0), 0);
  const transcript = {
    capturedAt: new Date().toISOString(),
    connection: 'MCP Streamable HTTP · authenticated',
    fixture: 'Local production server · synthetic phone adapter and test identity issuer',
    profile: profile.name,
    selected: ['Step count', 'App usage'],
    approvedBy: 'Phone owner fixture',
    deniedBeforeApproval: true,
    queries: [steps, apps],
    summary: {
      totalSteps,
      dailyAverage: Math.round(totalSteps / 7),
      appMinutes,
      topApp: apps.records[0]?.native.app,
      topAppMinutes: apps.records[0]?.native.minutes,
      counts,
    },
  };
  writeFileSync(
    'launch-video/public/agent-transcript.json',
    JSON.stringify(transcript, null, 2) + '\n',
  );
  console.log(
    `Authenticated, paired, approved, queried: ${totalSteps} steps; ${appMinutes} app minutes. Transcript saved.`,
  );
} finally {
  await client.close();
  child.kill();
  if (child.exitCode === null) await once(child, 'exit');
  await new Promise((resolve) => identity.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
