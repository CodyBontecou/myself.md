import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { createDataService } from '../server/data-service.js';
import { BillingStore } from '../server/billing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { parseProfile } from '../core/profiles.js';

const deviceId = randomUUID();
const billing = new BillingStore(':memory:');
const history = new HistoryStore(':memory:', { seal: (value) => value, open: (value) => value });
/** @type {Map<string,import('../server/feedback-service.js').FeedbackOperation>} */
const operations = new Map();
const service = createDataService({
  billing,
  history,
  feedbackOperations: operations,
  refreshEntitlement: async () => {},
  devices: (subject) =>
    subject === 'owner' ? [{ id: deviceId, name: 'Fixture', created: Date.now() }] : [],
});
const catalog = {
  profiles: [
    {
      ...parseProfile({
        schema: 'myself.md.profile.v1',
        name: 'Private',
        selection: { health: [], time: [], location: [] },
      }),
      id: 'private',
      agentAccess: false,
    },
  ],
  domains: ['health', 'time', 'location'].map((domain) => ({
    domain,
    enabled: false,
    availableTypes: [],
    types: [],
    notes: [],
  })),
  feedback: { availability: 'ready', notificationsAvailable: true, operation: null },
};
/** @param {unknown} feedback */
function heartbeat(feedback = catalog.feedback) {
  return /** @type {{feedback:{id:string,expiresAt:number,notificationsEnabled?:boolean,settings?:object}|null}} */ (
    service.phoneApi(`/api/phones/${deviceId}/poll`, 'POST', 'owner', { ...catalog, feedback })
  );
}
/** @param {string} subject @param {string} agent */
async function connect(subject, agent) {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'feedback-fixture', version: '1' });
    service.registerDataTools(server, subject, agent);
    return server;
  });
  const client = new Client({ name: agent, version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    }),
  );
  return client;
}
const owner = await connect('owner', 'agent');
const other = await connect('other', 'other-agent');
const secondAgent = await connect('owner', 'second-agent');
/** @param {Client} client @param {string} name @param {Record<string,unknown>} args */
async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  return {
    error: result.isError === true,
    value: /** @type {Record<string,unknown>|undefined} */ (result.structuredContent),
  };
}
try {
  heartbeat();
  assert.equal((await call(other, 'get_phone_feedback', { deviceId })).error, true);
  assert.equal(
    (await call(owner, 'get_phone_feedback', { deviceId })).value?.availability,
    'ready',
  );
  const operationId = randomUUID();
  assert.equal(
    (await call(owner, 'request_phone_feedback', { deviceId, operationId })).value?.status,
    'accepted',
  );
  assert.equal(operations.size, 1);
  assert.equal(heartbeat().feedback?.id, operationId);
  assert.equal(
    (await call(owner, 'request_phone_feedback', { deviceId, operationId })).value?.status,
    'accepted',
  );
  assert.equal(operations.size, 1);
  assert.equal(
    (await call(secondAgent, 'get_phone_feedback_operation', { operationId })).error,
    true,
  );
  heartbeat({
    availability: 'ready',
    operation: { id: operationId, expiresAt: Date.now() + 10000, status: 'awaiting_user' },
  });
  assert.deepEqual(
    service.phoneApi(`/api/phones/${deviceId}/feedback`, 'POST', 'owner', { id: operationId }),
    { authorized: true },
  );
  service.cancelAgent('owner', 'agent');
  assert.throws(
    () =>
      service.phoneApi(`/api/phones/${deviceId}/feedback`, 'POST', 'owner', { id: operationId }),
    /cancelled/,
  );
  assert.equal(heartbeat().feedback, null);
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId })).value?.status,
    'cancelled',
  );
  const completedId = randomUUID();
  await call(owner, 'request_phone_feedback', { deviceId, operationId: completedId });
  heartbeat({
    availability: 'ready',
    operation: { id: completedId, expiresAt: Date.now() + 10000, status: 'completed' },
  });
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId: completedId })).value?.status,
    'failed',
  );
  const successId = randomUUID();
  await call(owner, 'request_phone_feedback', { deviceId, operationId: successId });
  const issueUrl = 'https://github.com/CodyBontecou/agent-bridge/issues/123';
  heartbeat({
    availability: 'ready',
    operation: { id: successId, expiresAt: Date.now() + 10000, status: 'running' },
  });
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId: successId })).value?.status,
    'running',
  );
  heartbeat({
    availability: 'ready',
    operation: { id: successId, expiresAt: Date.now() + 10000, status: 'completed', issueUrl },
  });
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId: successId })).value?.issueUrl,
    issueUrl,
  );
  const receiptId = randomUUID();
  await call(owner, 'request_phone_feedback', { deviceId, operationId: receiptId });
  const receiptUrl = `https://gripe.isolated.tech/reports/${'a'.repeat(64)}`;
  heartbeat({
    availability: 'ready',
    operation: {
      id: receiptId,
      expiresAt: Date.now() + 10000,
      status: 'completed',
      issueUrl: receiptUrl,
    },
  });
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId: receiptId })).value?.issueUrl,
    receiptUrl,
  );
  assert.throws(() =>
    heartbeat({
      availability: 'ready',
      operation: {
        id: receiptId,
        expiresAt: Date.now() + 10000,
        status: 'completed',
        issueUrl: 'https://attacker.example/reports/123',
      },
    }),
  );
  const settings = {
    companionEnabled: true,
    cropEnabled: false,
    drawingEnabled: false,
    titleEnabled: false,
    descriptionEnabled: true,
    tagsEnabled: false,
  };
  heartbeat({ availability: 'ready', operation: null, settings });
  assert.deepEqual(
    (await call(owner, 'get_phone_feedback', { deviceId })).value?.settings,
    settings,
  );
  const settingsId = randomUUID();
  const change = { deviceId, operationId: settingsId, settings: { companionEnabled: false } };
  assert.equal((await call(other, 'request_phone_feedback_settings', change)).error, true);
  assert.equal(
    (
      await call(owner, 'request_phone_feedback_settings', {
        ...change,
        settings: { unknown: true },
      })
    ).error,
    true,
  );
  assert.equal(
    (await call(owner, 'request_phone_feedback_settings', change)).value?.status,
    'accepted',
  );
  assert.equal(
    (await call(owner, 'request_phone_feedback_settings', change)).value?.status,
    'accepted',
  );
  assert.equal(
    (
      await call(owner, 'request_phone_feedback_settings', {
        ...change,
        settings: { companionEnabled: true },
      })
    ).error,
    true,
  );
  assert.equal(
    (await call(secondAgent, 'get_phone_feedback_operation', { operationId: settingsId })).error,
    true,
  );
  assert.deepEqual(heartbeat().feedback?.settings, change.settings);
  assert.deepEqual(
    service.phoneApi(`/api/phones/${deviceId}/feedback`, 'POST', 'owner', { id: settingsId }),
    { authorized: true },
  );
  heartbeat({
    availability: 'ready',
    settings: { ...settings, companionEnabled: false },
    operation: { id: settingsId, expiresAt: Date.now() + 10000, status: 'completed' },
  });
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId: settingsId })).value?.status,
    'completed',
  );
  const mismatchId = randomUUID();
  await call(owner, 'request_phone_feedback_settings', { ...change, operationId: mismatchId });
  heartbeat({
    availability: 'ready',
    settings,
    operation: { id: mismatchId, expiresAt: Date.now() + 10000, status: 'completed' },
  });
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId: mismatchId })).value?.status,
    'failed',
  );
  heartbeat();
  const notifyId = randomUUID();
  const notify = { deviceId, operationId: notifyId, enabled: true };
  assert.equal((await call(other, 'request_phone_feedback_notifications', notify)).error, true);
  assert.equal(
    (await call(owner, 'request_phone_feedback_notifications', notify)).value?.status,
    'accepted',
  );
  assert.equal(heartbeat().feedback?.notificationsEnabled, true);
  assert.equal(
    (await call(owner, 'request_phone_feedback_notifications', { ...notify, enabled: false }))
      .error,
    true,
  );
  heartbeat({
    availability: 'ready',
    operation: { id: notifyId, expiresAt: Date.now() + 10000, status: 'completed' },
  });
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId: notifyId })).value?.status,
    'failed',
  );
  heartbeat();
  const savedNotify = randomUUID();
  await call(owner, 'request_phone_feedback_notifications', {
    ...notify,
    operationId: savedNotify,
  });
  heartbeat({
    availability: 'ready',
    updates: { enabled: true, checkedAt: Date.now(), cursor: null, error: null, reports: [] },
    operation: { id: savedNotify, expiresAt: Date.now() + 10000, status: 'completed' },
  });
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId: savedNotify })).value?.status,
    'completed',
  );
  assert.equal(
    (await call(secondAgent, 'get_phone_feedback_operation', { operationId: savedNotify })).error,
    true,
  );
  const expiredId = randomUUID();
  await call(owner, 'request_phone_feedback', { deviceId, operationId: expiredId });
  const expired = operations.get(expiredId);
  assert.ok(expired);
  expired.expiresAt = Date.now() - 1;
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId: expiredId })).value?.status,
    'expired',
  );
  assert.equal(heartbeat().feedback, null);
  assert.throws(
    () => service.phoneApi(`/api/phones/${deviceId}/feedback`, 'POST', 'owner', { id: expiredId }),
    /expired/,
  );
  heartbeat({ availability: 'release_disabled', operation: null });
  assert.equal(
    (await call(owner, 'request_phone_feedback', { deviceId, operationId: randomUUID() })).error,
    true,
  );
  heartbeat({ availability: 'release_disabled', notificationsAvailable: true, operation: null });
  const releaseNotifications = randomUUID();
  assert.equal(
    (
      await call(owner, 'request_phone_feedback_notifications', {
        deviceId,
        operationId: releaseNotifications,
        enabled: false,
      })
    ).value?.status,
    'accepted',
  );
  assert.equal(
    heartbeat({ availability: 'release_disabled', notificationsAvailable: true, operation: null })
      .feedback?.notificationsEnabled,
    false,
  );
  heartbeat({
    availability: 'release_disabled',
    notificationsAvailable: true,
    updates: { enabled: false, checkedAt: Date.now(), cursor: null, error: null, reports: [] },
    operation: { id: releaseNotifications, expiresAt: Date.now() + 10000, status: 'completed' },
  });
  assert.equal(
    (await call(owner, 'get_phone_feedback_operation', { operationId: releaseNotifications })).value
      ?.status,
    'completed',
  );
  assert.throws(
    () => service.phoneApi(`/api/phones/${deviceId}/poll`, 'POST', 'other', catalog),
    /not found/,
  );
  console.log(
    'Feedback MCP: ownership, agent isolation, approval, revocation, idempotency, expiry, release denial and confirmed completion pass.',
  );
} finally {
  await Promise.all([owner.close(), other.close(), secondAgent.close()]);
  billing.db.close();
  history.db.close();
}
