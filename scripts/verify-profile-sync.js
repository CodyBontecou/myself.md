import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { CloudStore } from '../server/cloud-store.js';
import { parseProfile, parseProfileState } from '../core/profiles.js';
import { mergeProfileStates } from '../core/profile-sync.js';
import { createDashboardService } from '../server/dashboard-service.js';
import { HistoryStore } from '../server/history-store.js';
import { BillingStore } from '../server/billing-store.js';
import { createDataService } from '../server/data-service.js';
const noop = () => {};
const cloud = new CloudStore(':memory:', randomBytes(32));
const subject = 'sync-owner',
  device = '79e2ca52-32e3-47a1-b47b-f71059696a76';
const original = parseProfileState({
  profiles: [
    {
      ...parseProfile({
        schema: 'myself.md.profile.v1',
        name: 'One',
        selection: {
          health: ['native:steps'],
          time: ['native:applications'],
          location: ['native:points'],
        },
      }),
      id: 'one',
      agentAccess: true,
      agentPermissions: { health: true, time: true, location: true, logs: false },
    },
  ],
});
const domains = [
  { domain: /** @type {const} */ ('health'), availableTypes: ['native:steps'] },
  { domain: /** @type {const} */ ('time'), availableTypes: ['native:applications'] },
  { domain: /** @type {const} */ ('location'), availableTypes: ['native:points'] },
];
const clone = () => structuredClone(original);
const first = cloud.profileSync.poll(subject, device, original, domains, { base: null });
assert.equal(first.revision, 1);
assert.deepEqual(first.conflicts, []);
assert.equal(cloud.profiles(subject).length, 1, 'Phone-only profiles appear before a cloud upload');
assert.equal(cloud.profiles('other').length, 0, 'Account isolation');
const profile = original.profiles[0];
assert.ok(profile);
cloud.access(subject, device, profile, true);
cloud.syncAgentPermissions(subject, device, original.profiles);
const web = clone();
assert.ok(web.profiles[0]);
web.profiles[0].name = 'Web name';
web.profiles[0].agentPermissions = { health: false, time: true, location: true, logs: false };
const update = cloud.profileSync.update(subject, device, 'one', 1, web.profiles[0], undefined);
assert.equal(update.status, 'accepted');
assert.equal(
  cloud.profileSync.get(subject, device)?.confirmedRevision,
  1,
  'Save does not fabricate phone completion',
);
assert.equal(
  cloud.permission(subject, device, 'one').agentPermissions.health,
  true,
  'Retired agent toggles cannot disable paired-phone access',
);
assert.equal(
  cloud.permission(subject, device, 'one').shared,
  true,
  'Remaining confirmed source grants continue to allow cloud access without a second switch',
);
assert.throws(
  () => cloud.profileSync.update(subject, device, 'one', 1, profile, undefined),
  /another client/,
  'Stale web edits cannot overwrite',
);
assert.throws(
  () => cloud.profileSync.update('other', device, 'one', 2, profile, undefined),
  /Update and open/,
);
const offline = clone();
assert.ok(offline.profiles[0]);
offline.profiles[0].export.lookbackDays = 14;
const merged = cloud.profileSync.poll(subject, device, offline, domains, { base: original });
assert.deepEqual(merged.conflicts, []);
assert.equal(merged.state.profiles[0]?.name, 'Web name');
assert.equal(
  merged.state.profiles[0]?.export.lookbackDays,
  14,
  'Independent offline changes merge',
);
cloud.profileSync.poll(subject, device, merged.state, domains, { base: merged.state });
assert.equal(
  cloud.profileSync.get(subject, device)?.confirmedRevision,
  merged.revision,
  'Only actual acknowledgment completes sync',
);
const phoneEdit = structuredClone(merged.state);
assert.ok(phoneEdit.profiles[0]);
phoneEdit.profiles[0].name = 'Phone conflict';
const webEdit = structuredClone(merged.state);
assert.ok(webEdit.profiles[0]);
webEdit.profiles[0].name = 'Web conflict';
cloud.profileSync.update(subject, device, 'one', merged.revision, webEdit.profiles[0], undefined);
const conflict = cloud.profileSync.poll(subject, device, phoneEdit, domains, {
  base: merged.state,
});
assert.ok(conflict.conflicts.includes('one.name'));
assert.equal(conflict.state.profiles[0]?.name, 'Web conflict');
assert.equal(
  phoneEdit.profiles[0].name,
  'Phone conflict',
  'Phone edits remain available for owner choice',
);
phoneEdit.profiles[0].schedule.dailyTimes = ['08:00', '12:30', '18:00'];
phoneEdit.profiles[0].schedule.refreshHours = 1;
phoneEdit.profiles[0].export.includeToday = true;
phoneEdit.profiles[0].export.writeMode = 'new_file';
phoneEdit.profiles[0].export.destination = 'cloud';
const review = cloud.profileSync.propose(subject, device, 'one', phoneEdit.profiles[0]);
assert.equal(review.status, 'awaiting_user');
assert.equal(
  cloud.profileSync.get(subject, device)?.state.profiles[0]?.name,
  'Web conflict',
  'MCP proposal cannot mutate or grant itself access',
);
const before = cloud.profileSync.get(subject, device);
assert.ok(before);
const accepted = cloud.profileSync.update(
  subject,
  device,
  'one',
  before.revision,
  review.profile,
  review.id,
);
assert.equal(cloud.profileSync.get(subject, device)?.requests[0]?.status, 'accepted');
const after = cloud.profileSync.get(subject, device);
assert.ok(after);
cloud.profileSync.poll(subject, device, after.state, domains, { base: after.state });
assert.equal(cloud.profileSync.get(subject, device)?.requests[0]?.status, 'completed');
assert.equal(accepted.requiresPhoneSync, true);
assert.deepEqual(after.state.profiles[0]?.schedule.dailyTimes, ['08:00', '12:30', '18:00']);
assert.equal(after.state.profiles[0]?.schedule.refreshHours, 1);
assert.equal(after.state.profiles[0]?.export.includeToday, true);
assert.equal(after.state.profiles[0]?.export.writeMode, 'new_file');
assert.equal(after.state.profiles[0]?.export.destination, 'cloud');
const invalid = structuredClone(profile);
invalid.selection.health = ['native:unavailable'];
assert.throws(
  () => cloud.profileSync.update(subject, device, 'one', after.revision, invalid, undefined),
  /catalog/,
);
const raw = cloud.db.prepare('SELECT value FROM profile_sync').get();
assert.ok(raw);
assert.equal(
  Buffer.from(/** @type {Uint8Array} */ (raw.value)).includes(Buffer.from('Web conflict')),
  false,
  'Configuration encrypted at rest',
);
const dashboard = createDashboardService({
  cloud,
  history: new HistoryStore(':memory:', cloud),
  devices: () => [{ id: device, name: 'Fictional phone', created: 0 }],
  cancelAgent: () => {},
  revokeQueries: () => {},
});
const inventory = await dashboard.dashboardApi(
  subject,
  subject,
  '/api/dashboard',
  'GET',
  new URLSearchParams(),
  null,
);
assert.ok(inventory && 'profiles' in inventory);
assert.equal(inventory.profiles[0]?.name, 'Phone conflict');
await assert.rejects(
  () =>
    dashboard.dashboardApi(
      'other',
      'other',
      '/api/dashboard/profiles',
      'PUT',
      new URLSearchParams(),
      { deviceId: device, profileId: 'one', revision: after.revision, profile },
    ),
  /Update and open/,
);
assert.deepEqual(mergeProfileStates(original, original, original).state, original);
const superseded = cloud.profileSync.propose(subject, device, 'one', after.state.profiles[0]);
cloud.profileSync.update(subject, device, 'one', after.revision, superseded.profile, superseded.id);
const saved = cloud.profileSync.get(subject, device);
assert.ok(saved);
const newerPhone = structuredClone(saved.state);
assert.ok(newerPhone.profiles[0]);
newerPhone.profiles[0].name = 'Later phone edit';
cloud.profileSync.poll(subject, device, newerPhone, domains, { base: saved.state });
assert.equal(
  cloud.profileSync.get(subject, device)?.requests.find((r) => r.id === superseded.id)?.status,
  'cancelled',
  'A superseding phone edit must not falsely complete an agent suggestion',
);
/** @param {'source'|'agent'|'disconnect'|'approved'} change */
async function verifyAuthorizationDuringAwait(change) {
  const owner = `synthetic-await-${change}`;
  const deviceId = randomUUID();
  const clientId = 'synthetic-await-agent';
  const billing = new BillingStore(':memory:');
  const history = new HistoryStore(':memory:', cloud);
  /** @type {Map<string,import('../server/data-service.js').Job>} */
  const jobs = new Map();
  /** @type {()=>void} */ let entered = noop;
  /** @type {()=>void} */ let release = noop;
  const started = new Promise((resolve) => {
    entered = () => resolve(undefined);
  });
  const pending = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  let connected = true;
  const service = createDataService({
    cloud,
    billing,
    history,
    jobs,
    devices: (account) =>
      account === owner && connected ? [{ id: deviceId, name: 'Synthetic', created: 0 }] : [],
    refreshEntitlement: async () => {
      entered();
      await pending;
    },
  });
  service.phoneApi(`/api/phones/${deviceId}/poll`, 'POST', owner, {
    profiles: original.profiles.map((p) => ({
      ...p,
      agentAccess: false,
      agentPermissions: { health: false, time: false, location: false, logs: false },
    })),
    dispatch: true,
    profileSync: { base: null },
    domains: domains.map((domain) =>
      Object.assign({}, domain, { enabled: true, types: domain.availableTypes, notes: [] }),
    ),
  });
  cloud.observeAgent(owner, clientId);
  const handler = createMcpHandler(() => {
    const mcp = new McpServer({ name: 'synthetic-await', version: '1' });
    service.registerDataTools(mcp, owner, clientId);
    return mcp;
  });
  const client = new Client({ name: 'synthetic-await', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
        fetch: (input, init) => handler.fetch(new Request(input, init)),
      }),
    );
    const queued = client.callTool({
      name: 'query_phone_data',
      arguments: {
        deviceId,
        profileId: 'one',
        domain: 'health',
        type: 'steps',
        start: '2026-10-08T00:00:00.000Z',
        end: '2026-10-09T00:00:00.000Z',
      },
    });
    await started;
    if (change === 'source') {
      const denied = structuredClone(profile);
      assert.ok(denied);
      denied.selection.health = [];
      cloud.profileSync.update(owner, deviceId, 'one', 1, denied, undefined);
      service.revokeQueries(owner, deviceId);
    } else if (change === 'agent') {
      cloud.setAgent(owner, clientId, true);
      service.cancelAgent(owner, clientId);
    } else if (change === 'disconnect') {
      connected = false;
      service.cancelPhone(deviceId, owner);
    }
    release();
    const response = await queued;
    if (change === 'approved') {
      assert.ok(!response.isError, JSON.stringify(response));
      const job = [...jobs.values()][0];
      assert.ok(job);
      service.phoneApi(`/api/phones/${deviceId}/poll`, 'POST', owner, {
        profiles: original.profiles,
        dispatch: true,
        domains: domains.map((d) => ({ ...d, enabled: true, types: d.availableTypes, notes: [] })),
      });
      service.phoneApi(`/api/phones/${deviceId}/result`, 'POST', owner, {
        id: job.id,
        page: {
          records: [
            {
              domain: 'health',
              source: 'native',
              type: 'steps',
              start: null,
              end: null,
              native: { count: 42 },
            },
          ],
          nextCursor: null,
          warnings: [],
          capture: 'synthetic',
          complete: true,
        },
      });
      const result = await client.callTool({
        name: 'get_phone_request',
        arguments: { requestId: job.id },
      });
      assert.ok(!result.isError, JSON.stringify(result));
      assert.equal(jobs.get(job.id)?.state, 'complete');
      assert.equal(jobs.get(job.id)?.result?.page.records.length, 1);
      const retired = await client.callTool({
        name: 'request_phone_profile_agent_access',
        arguments: { deviceId, profileId: 'one', enabled: false },
      });
      assert.ok(!retired.isError);
      assert.match(JSON.stringify(retired), /unsupported/);
      return;
    }
    assert.equal(response.isError, true, `${change} during entitlement I/O rejects enqueue`);
    assert.equal(jobs.size, 0, 'Revoked work cannot appear after the cancellation sweep');
    assert.equal(billing.snapshot(owner).reserved, 0);
  } finally {
    release();
    await client.close();
    billing.db.close();
    history.db.close();
  }
}
await verifyAuthorizationDuringAwait('approved');
await verifyAuthorizationDuringAwait('source');
await verifyAuthorizationDuringAwait('agent');
await verifyAuthorizationDuringAwait('disconnect');
// Stale phone polls must not undo a dashboard type revocation before acknowledgment.
const selectionOwner = 'synthetic-cloud-selection';
const selectionDevice = randomUUID();
const selectionBilling = new BillingStore(':memory:');
const selectionHistory = new HistoryStore(':memory:', cloud);
const selectionService = createDataService({
  cloud,
  billing: selectionBilling,
  history: selectionHistory,
  refreshEntitlement: async () => {},
  devices: (account) =>
    account === selectionOwner ? [{ id: selectionDevice, name: 'Synthetic', created: 0 }] : [],
});
const selectionCatalog = {
  profiles: original.profiles,
  profileSync: { base: original },
  domains: domains.map((domain) =>
    Object.assign({}, domain, {
      enabled: true,
      types: domain.availableTypes,
      notes: [],
    }),
  ),
};
selectionService.phoneApi(
  `/api/phones/${selectionDevice}/poll`,
  'POST',
  selectionOwner,
  selectionCatalog,
);
const narrowedProfile = { ...profile, selection: { ...profile.selection, health: [] } };
cloud.profileSync.update(selectionOwner, selectionDevice, 'one', 1, narrowedProfile, undefined);
assert.deepEqual(cloud.permission(selectionOwner, selectionDevice, 'one').selection.health, []);
selectionService.phoneApi(
  `/api/phones/${selectionDevice}/poll`,
  'POST',
  selectionOwner,
  selectionCatalog,
);
assert.deepEqual(
  cloud.permission(selectionOwner, selectionDevice, 'one').selection.health,
  [],
  'Old phone selection cannot restore revoked cloud types',
);
assert.equal(
  cloud.permission(selectionOwner, selectionDevice, 'one').agentPermissions.health,
  true,
);
selectionHistory.db.close();
selectionBilling.db.close();
cloud.db.close();
console.log(
  'PASS full-profile synchronization, permissions, owner review, offline merge/conflicts, isolation, encrypted persistence, dashboard inventory and source/block/disconnect races during query authorization',
);
