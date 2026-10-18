import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { parseProfile } from '../core/profiles.js';
import { createDataService } from '../server/data-service.js';
import { BillingStore } from '../server/billing-store.js';
import { CloudStore } from '../server/cloud-store.js';
import { HistoryStore } from '../server/history-store.js';
import { DurableMap } from '../worker/queues.js';

const subject = 'location-capture-owner';
const deviceId = randomUUID();
const otherDeviceId = randomUUID();
const billing = new BillingStore(':memory:');
const codec = new CloudStore(':memory:', randomBytes(32));
const history = new HistoryStore(':memory:', { seal: (value) => value, open: (value) => value });
/** @type {Map<string,import('../server/data-service.js').Phone>} */
const phones = new Map();
/** @type {Client[]} */
const clients = [];
/** @returns {Map<string,import('../server/location-capture.js').LocationCapture>} */
function recoverCaptures() {
  return new DurableMap(
    codec.db,
    codec,
    'location-capture-verification',
    /** @param {import('../server/location-capture.js').LocationCapture} value */ (value) => value,
    (value) => value,
  );
}
let captures = recoverCaptures();
function dataService() {
  return createDataService({
    cloud: { syncAgentPermissions: () => {} },
    billing,
    history,
    phones,
    captures,
    refreshEntitlement: async () => {},
    devices: (owner) =>
      owner === subject
        ? [deviceId, otherDeviceId].map((id) => ({ id, name: 'Fixture phone', created: 0 }))
        : [],
  });
}
let service = dataService();
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Private fixture',
    selection: { health: [], time: [], location: [] },
  }),
  id: 'private',
  agentAccess: false,
  agentPermissions: { health: false, time: false, location: false, logs: false },
};
const catalog = {
  profiles: [profile],
  domains: ['health', 'time', 'location'].map((domain) => ({
    domain,
    enabled: false,
    availableTypes: [],
    types: [],
    notes: [],
  })),
};
const resultSchema = z
  .object({
    requestId: z.uuid(),
    deviceId: z.uuid(),
    status: z.enum([
      'accepted',
      'awaiting_user',
      'running',
      'completed',
      'failed',
      'cancelled',
      'expired',
    ]),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    capturedAt: z.iso.datetime().optional(),
    recordCount: z.literal(1).optional(),
    canCancel: z.boolean().optional(),
    ownerHandoff: z.object({ deepLink: z.literal('myselfmd://data/location') }).passthrough(),
  })
  .passthrough();
/** @param {{device?:string,dispatch?:boolean,capable?:boolean}} [options] */
function poll({ device = deviceId, dispatch = true, capable = true } = {}) {
  return z
    .object({
      locationCapture: z
        .object({ requestId: z.uuid(), expiresAt: z.iso.datetime() })
        .nullable()
        .optional(),
    })
    .passthrough()
    .parse(
      service.phoneApi(`/api/phones/${device}/poll`, 'POST', subject, {
        ...catalog,
        dispatch,
        ...(capable ? { locationCapture: { version: 1 } } : {}),
      }),
    );
}
/** @param {string} owner @param {string} agent */
async function connect(owner, agent) {
  const current = service;
  const handler = createMcpHandler(() => {
    const mcp = new McpServer({ name: 'location-capture-test', version: '1' });
    current.registerDataTools(mcp, owner, agent);
    return mcp;
  });
  const client = new Client({ name: 'location-capture-test', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    }),
  );
  clients.push(client);
  return client;
}
/** @param {Client} client @param {Record<string,unknown>} args */
function tool(client, args) {
  return client.callTool({ name: 'request_phone_location_capture', arguments: args });
}
/** @param {Client} client @param {string} requestId @param {'request'|'status'|'cancel'} [action] */
async function capture(client, requestId, action = 'request') {
  const result = await tool(client, { action, deviceId, requestId });
  assert.ok(!result.isError, JSON.stringify(result));
  const value = resultSchema.parse(result.structuredContent);
  const json = JSON.stringify(value);
  for (const forbidden of ['latitude', 'longitude', 'coordinates', 'records'])
    assert.ok(!json.includes(forbidden), `Capture outcomes must omit ${forbidden}`);
  return value;
}
/** @param {string} requestId @param {Record<string,unknown>} body @param {string} [owner] @param {string} [device] */
function report(requestId, body, owner = subject, device = deviceId) {
  return service.phoneApi(`/api/phones/${device}/location-capture`, 'POST', owner, {
    requestId,
    ...body,
  });
}
/** @param {string} requestId */
function dispatchCapture(requestId) {
  assert.equal(poll().locationCapture?.requestId, requestId);
}

try {
  const owner = await connect(subject, 'agent-one');
  const sibling = await connect(subject, 'agent-two');
  const other = await connect('other-owner', 'agent-one');
  assert.ok(
    (await owner.listTools()).tools.some(
      (entry) => entry.name === 'request_phone_location_capture',
    ),
    'The capture workflow must be discoverable through the real MCP SDK',
  );
  const unsupportedId = randomUUID();
  poll({ capable: false });
  assert.equal((await tool(owner, { deviceId, requestId: unsupportedId })).isError, true);
  assert.equal(captures.size, 0, 'An old phone cannot accept undispatchable work');
  poll();
  const phone = phones.get(deviceId);
  assert.ok(phone);
  phone.seen = Date.now() - 15001;
  assert.equal((await tool(owner, { deviceId, requestId: randomUUID() })).isError, true);
  poll();
  assert.equal((await tool(owner, { deviceId, requestId: 'not-a-uuid' })).isError, true);
  assert.equal(
    (await tool(owner, { deviceId, requestId: randomUUID(), latitude: 18.4 })).isError,
    true,
    'Agents cannot inject a coordinate instead of obtaining a native point',
  );

  const pendingId = randomUUID();
  assert.equal((await tool(other, { deviceId, requestId: pendingId })).isError, true);
  const accepted = await capture(owner, pendingId);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.capturedAt, undefined, 'Acceptance does not claim a native effect');
  assert.equal(accepted.recordCount, undefined);
  assert.equal(captures.size, 1);
  assert.equal((await capture(owner, pendingId)).expiresAt, accepted.expiresAt);
  assert.equal(captures.size, 1, 'An exact retry cannot queue another capture');
  assert.equal((await tool(sibling, { deviceId, requestId: pendingId })).isError, true);
  for (const action of ['status', 'cancel']) {
    // oxlint-disable-next-line eslint/no-await-in-loop
    assert.equal((await tool(sibling, { action, deviceId, requestId: pendingId })).isError, true);
    // oxlint-disable-next-line eslint/no-await-in-loop
    assert.equal((await tool(other, { action, deviceId, requestId: pendingId })).isError, true);
  }
  poll({ device: otherDeviceId });
  assert.equal(
    (await tool(owner, { deviceId: otherDeviceId, requestId: pendingId })).isError,
    true,
    'A retry key cannot move the original request to a different phone',
  );
  assert.throws(() => report(pendingId, { action: 'start' }), /pending|awaiting|confirm|start/i);
  assert.equal(poll({ dispatch: false }).locationCapture, null);
  assert.equal((await capture(owner, pendingId, 'status')).status, 'accepted');
  dispatchCapture(pendingId);
  assert.equal((await capture(owner, pendingId, 'status')).status, 'awaiting_user');
  assert.throws(() => report(pendingId, { action: 'start' }, 'other-owner'), /not found/i);
  assert.throws(() => report(pendingId, { action: 'start' }, subject, otherDeviceId), /not found/i);
  assert.throws(
    () => report(pendingId, { action: 'complete', capturedAt: new Date().toISOString() }),
    /running|start|confirm|approval/i,
  );
  assert.equal((await capture(owner, pendingId, 'cancel')).status, 'cancelled');
  assert.equal((await capture(owner, pendingId)).status, 'cancelled');
  assert.equal(poll().locationCapture, null);
  assert.equal(
    resultSchema.parse(report(pendingId, { action: 'start' })).status,
    'cancelled',
    'A late phone start cannot resurrect cancelled work',
  );

  const completedId = randomUUID();
  await capture(owner, completedId);
  dispatchCapture(completedId);
  report(completedId, { action: 'start' });
  assert.equal((await capture(owner, completedId, 'status')).status, 'running');
  const runningCancel = await capture(owner, completedId, 'cancel');
  assert.equal(runningCancel.status, 'running');
  assert.equal(
    runningCancel.canCancel,
    false,
    'An active native effect cannot be falsely cancelled',
  );
  assert.equal(poll().locationCapture, null, 'An acknowledged capture is never dispatched again');
  report(completedId, { action: 'check' });
  const stamp = new Date().toISOString();
  report(completedId, { action: 'complete', capturedAt: stamp });
  const completed = await capture(owner, completedId, 'status');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.capturedAt, stamp);
  assert.equal(completed.recordCount, 1);
  report(completedId, {
    action: 'complete',
    capturedAt: new Date(Date.now() + 1000).toISOString(),
  });
  assert.deepEqual(
    await capture(owner, completedId),
    completed,
    'Report retries preserve the first effect',
  );
  assert.equal((await capture(owner, completedId, 'cancel')).status, 'completed');
  assert.equal(poll().locationCapture, null);

  captures = recoverCaptures();
  service = dataService();
  const recoveredOwner = await connect(subject, 'agent-one');
  assert.deepEqual(
    await capture(recoveredOwner, completedId),
    completed,
    'Encrypted durable metadata survives service recovery without another capture',
  );
  assert.equal((await capture(recoveredOwner, pendingId)).status, 'cancelled');
  assert.equal(poll().locationCapture, null);

  const failedId = randomUUID();
  await capture(recoveredOwner, failedId);
  dispatchCapture(failedId);
  report(failedId, { action: 'start' });
  report(failedId, { action: 'fail', error: 'permission_denied' });
  assert.equal((await capture(recoveredOwner, failedId)).status, 'failed');
  assert.equal(poll().locationCapture, null);

  const declinedId = randomUUID();
  await capture(recoveredOwner, declinedId);
  dispatchCapture(declinedId);
  report(declinedId, { action: 'cancel' });
  assert.equal((await capture(recoveredOwner, declinedId)).status, 'cancelled');

  for (const stage of ['accepted', 'awaiting_user', 'running']) {
    const id = randomUUID();
    // oxlint-disable-next-line eslint/no-await-in-loop
    await capture(recoveredOwner, id);
    if (stage !== 'accepted') dispatchCapture(id);
    if (stage === 'running') report(id, { action: 'start' });
    const retained = captures.get(id);
    assert.ok(retained);
    retained.expiresAt = Date.now() - 1;
    captures.set(id, retained);
    service.cleanup();
    // oxlint-disable-next-line eslint/no-await-in-loop
    assert.equal((await capture(recoveredOwner, id)).status, 'expired', `${stage} work expires`);
    assert.equal(poll().locationCapture, null);
    assert.equal(
      resultSchema.parse(report(id, { action: 'start' })).status,
      'expired',
      'A late phone start cannot resurrect expired work',
    );
  }

  for (const reason of ['disconnect', 'agent']) {
    const queuedId = randomUUID();
    const runningId = randomUUID();
    // oxlint-disable-next-line eslint/no-await-in-loop
    await capture(recoveredOwner, runningId);
    dispatchCapture(runningId);
    report(runningId, { action: 'start' });
    // oxlint-disable-next-line eslint/no-await-in-loop
    await capture(recoveredOwner, queuedId);
    if (reason === 'disconnect') service.cancelPhone(deviceId, subject);
    else service.cancelAgent(subject, 'agent-one');
    // oxlint-disable-next-line eslint/no-await-in-loop
    assert.equal((await capture(recoveredOwner, queuedId, 'status')).status, 'cancelled');
    // oxlint-disable-next-line eslint/no-await-in-loop
    assert.equal((await capture(recoveredOwner, runningId, 'status')).status, 'failed');
    assert.equal(
      resultSchema.parse(
        report(runningId, { action: 'complete', capturedAt: new Date().toISOString() }),
      ).status,
      'failed',
      'A late completion cannot replace an interrupted outcome',
    );
    // oxlint-disable-next-line eslint/no-await-in-loop
    assert.equal((await capture(recoveredOwner, completedId, 'status')).status, 'completed');
    assert.equal(poll().locationCapture, null);
  }
  assert.equal(
    profile.agentPermissions.location,
    false,
    'Capture confirmation never grants data reads',
  );
  assert.equal(profile.selection.location.length, 0);
  assert.equal(
    billing.snapshot(subject).used,
    0,
    'Saving a local point does not consume an export',
  );
  console.log(
    'Location capture: real MCP lifecycle, private metadata, ownership/client isolation, consent handoff, idempotent retries, durable recovery, cancellation, expiry, disconnect and agent revocation pass.',
  );
} finally {
  await Promise.all(clients.map((client) => client.close()));
  history.db.close();
  billing.db.close();
  codec.db.close();
}
