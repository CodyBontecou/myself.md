import { boundedWait, waitMsInput } from '../server/bounded-wait.js';
import { setTimeout as delay } from 'node:timers/promises';
import * as dataRange from '../core/data-range.js';
import { domains } from '../core/data.js';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { parseProfile } from '../core/profiles.js';
import * as schedules from '../core/schedules.js';
import * as exportFiles from '../core/export-files.js';
import * as healthTypes from '../client/health-types.js';
import { localCalendar } from '../client/calendar.js';
import { createDataService } from '../server/data-service.js';
import { restrictChatgptTools } from '../server/chatgpt-tools.js';
import { BillingStore } from '../server/billing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { CloudStore } from '../server/cloud-store.js';
import { DurableMap } from '../worker/queues.js';

/** @param {string} path @param {Record<string,Record<string,unknown>>} dependencies */
async function load(path, dependencies) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'));
  await module.link((specifier) => {
    const values = dependencies[specifier];
    assert.ok(values, `Missing dependency ${specifier}`);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
let waitReads = 0;
const timedOut = await boundedWait(() => {
  waitReads++;
  return { status: 'queued' };
}, 30);
assert.ok(waitReads >= 2);
assert.equal(timedOut.retryAfterMs, 1000);
waitReads = 0;
assert.equal(
  (
    await boundedWait(() => {
      waitReads++;
      return { status: 'awaiting_user' };
    }, 25000)
  ).retryAfterMs,
  null,
);
assert.equal(waitReads, 1, 'Owner handoff must return immediately');
assert.throws(() => waitMsInput.parse(25001));
assert.throws(() => waitMsInput.parse(-1));
const platform = { OS: 'ios' };
let allowHistory = false,
  requestHistory = 0,
  nativeReads = 0;
const oldest = '2020-02-28T12:00:00.000Z';
let discoveryFailure = false;
const discovery =
  /** @type {{earliestHealthDate:(owner:string,keys:string[],end:string,check:()=>Promise<void>)=>Promise<string|null>}} */ (
    await load('../client/health-history.js', {
      'react-native': { Platform: platform },
      '@kingstinct/react-native-healthkit': {
        isHealthDataAvailable: () => true,
        queryQuantitySamples: async (
          /** @type {string} */ type,
          /** @type {{limit:number,ascending:boolean}} */ options,
        ) => {
          nativeReads++;
          assert.equal(options.limit, 1);
          assert.equal(options.ascending, true);
          if (discoveryFailure) throw new Error('Locked health store');
          return type.endsWith('HeartRate') ? [] : [{ startDate: new Date(oldest) }];
        },
      },
      'react-native-health-connect': {
        initialize: async () => true,
        getGrantedPermissions: async () =>
          allowHistory ? [{ accessType: 'read', recordType: 'ReadHealthDataHistory' }] : [],
        requestPermission: async () => {
          requestHistory++;
        },
        readRecords: async () => {
          nativeReads++;
          return { records: [{ startTime: oldest }] };
        },
      },
      './health-types.js': healthTypes,
      '../core/data.js': await import('../core/data.js'),
      './whoop.js': {
        whoopPage: async (_owner = '', _query = {}, cursor = '') =>
          cursor
            ? {
                records: [{ start: null, native: { created_at: '2018-01-01T00:00:00.000Z' } }],
                nextCursor: null,
              }
            : { records: [{ start: oldest, native: {} }], nextCursor: 'next' },
      },
    })
  );
const steps = 'native:HKQuantityTypeIdentifierStepCount';
const snapshot = 'native:HKCharacteristicTypeIdentifierBiologicalSex';
const end = new Date().toISOString();
const noop = async () => {};
assert.equal(
  await discovery.earliestHealthDate(
    'owner',
    [snapshot, steps, 'native:HKQuantityTypeIdentifierHeartRate'],
    end,
    noop,
  ),
  oldest,
);
assert.equal(nativeReads, 2, 'Snapshots do not expand history or fetch series');
assert.equal(await discovery.earliestHealthDate('owner', [snapshot], end, noop), null);
assert.equal(
  await discovery.earliestHealthDate('owner', ['native:whoop.recovery'], end, noop),
  '2018-01-01T00:00:00.000Z',
);
discoveryFailure = true;
await assert.rejects(discovery.earliestHealthDate('owner', [steps], end, noop), /Locked/);
discoveryFailure = false;
await assert.rejects(
  discovery.earliestHealthDate('owner', [steps], end, async () => {
    throw new Error('Cancelled');
  }),
  /Cancelled/,
);
platform.OS = 'android';
const previousReads = nativeReads;
await assert.rejects(
  discovery.earliestHealthDate('owner', ['native:Steps'], end, noop),
  /past-data access/,
);
assert.equal(nativeReads, previousReads, 'History denial cannot silently export the last 30 days');
assert.equal(requestHistory, 1);
allowHistory = true;
assert.equal(await discovery.earliestHealthDate('owner', ['native:Steps'], end, noop), oldest);

const context = { owner: 'fixture', deviceId: 'phone' };
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'All Time fixture',
    selection: {
      health: [steps, snapshot],
      time: ['native:applications'],
      location: ['native:points'],
    },
  }),
  id: 'profile',
};
/** @type {Map<string,string>} */ const state = new Map();
/** @type {{profile:import('../core/profiles.js').ExportProfile,day:string,billing:string,start:string,end:string}[]} */ const writes =
  [];
/** @type {Map<string,{start:string,end:string}>} */ const intervals = new Map();
/** @type {string[]} */ let reservedDays = [];
let settlements = 0,
  completed = false,
  cancelAfter = Infinity;
let discoveryKeys = /** @type {string[]} */ ([]);
/** @type {boolean[]} */ const healthLookahead = [];
/** @type {unknown[]} */ const whoopReaders = [];
/** @type {string[]} */ const historyOutcomes = [];
/** @type {(()=>boolean)[]} */ const exportValidity = [];
const taskMocks = {
  '../core/data-range.js': dataRange,
  '../core/data.js': { domains },
  './library.js': { earliestLocationDate: () => null },
  'expo-constants': { default: { expoConfig: {} } },
  'expo-notifications': {},
  'react-native': { Platform: platform, Alert: {} },
  './session.js': { api: async () => ({}), loadSession: async () => null },
  './qa-runtime.js': { qaEnabled: false },
  '../packages/support-chat/errors.js': { errorJSON: String },
  './billing.js': {
    reserveExport: async (
      /** @type {unknown} */ _session,
      /** @type {string} */ _id,
      /** @type {{days:string[]}} */ scope,
    ) => {
      reservedDays = scope.days;
    },
    settleExport: async () => {
      settlements++;
    },
  },
  '../core/diagnostics.js': { exportFailureMessage: String },
  'expo-background-task': {},
  'expo-task-manager': { defineTask() {} },
  './phone-database.js': {
    phoneDatabase: () => ({
      execSync() {},
      getFirstSync: (
        /** @type {string} */ _sql,
        /** @type {string} */ _device,
        /** @type {string} */ id,
      ) => (state.has(id) ? { value: state.get(id) } : null),
      runSync: (
        /** @type {string} */ _sql,
        /** @type {string} */ _device,
        /** @type {string} */ id,
        /** @type {string} */ value,
      ) => state.set(id, value),
    }),
  },
  '../core/schedules.js': schedules,
  '../core/export-files.js': exportFiles,
  './export-context.js': { loadExportContext: () => context },
  './profiles.js': { loadProfiles: () => ({ profiles: [profile] }) },
  './calendar.js': { localCalendar },
  './history.js': {
    beginExport: (
      /** @type {unknown} */ _context,
      /** @type {unknown} */ _profile,
      /** @type {string} */ _actor,
      /** @type {{start:string,end:string}} */ interval,
      id = 'history',
    ) => {
      intervals.set(id, interval);
      return id;
    },
    recordArtifact() {},
    finishExport: (
      /** @type {unknown} */ _context,
      /** @type {unknown} */ _id,
      /** @type {string} */ outcome,
    ) => {
      completed = true;
      historyOutcomes.push(outcome);
    },
  },
  './profile-export.js': {
    exportProfileDay: async (
      /** @type {unknown} */ _context,
      /** @type {import('../core/profiles.js').ExportProfile} */ current,
      /** @type {{day:string,start:string,end:string}} */ interval,
      /** @type {()=>boolean} */ valid,
      /** @type {unknown} */ _progress,
      /** @type {(artifact:unknown)=>void} */ artifact,
      /** @type {string} */ billing,
      /** @type {()=>Promise<void>} */ check,
      /** @type {unknown} */ _cloudAuthorization,
      prefetchHealth = false,
      /** @type {unknown} */ readWhoop,
    ) => {
      healthLookahead.push(prefetchHealth);
      whoopReaders.push(readWhoop);
      assert.equal(valid(), true);
      exportValidity.push(valid);
      await check();
      writes.push({ profile: current, ...interval, billing });
      artifact({});
      return { count: 1, files: [], failedSources: 0 };
    },
  },
  './destinations.js': { requireCloudAuthorization: async () => {} },
  './export-notification-registration.js': { reconcileExportNotificationTask: async () => {} },
  './whoop-export.js': {
    createWhoopExportReader: () => async () => {
      throw new Error('Unexpected provider read in lifecycle fixture');
    },
  },
  './health-history.js': {
    requireHealthHistory: async () => {},
    earliestHealthDate: async (/** @type {string} */ _owner, /** @type {string[]} */ keys) => {
      discoveryKeys = keys;
      if (discoveryFailure) throw new Error('Discovery failed');
      return oldest;
    },
  },
};
const task =
  /** @type {{exportNow:(currentContext:typeof context,currentProfile:typeof profile,progress:()=>void,options?:{range?:import('../core/data-range.js').DataRange,domains?:import('../core/data.js').Domain[],requestId?:string,check?:()=>Promise<void>})=>Promise<{days:number,recordCount:number,historyId:string,batches:number,failedSources:number,start:string,end:string}>,scheduleState:(device:string,currentProfile:typeof profile)=>{progress:unknown}}} */ (
    await load('../client/export-task.js', taskMocks)
  );
const beforeSchedule = task.scheduleState(context.deviceId, profile).progress;
const result = await task.exportNow(context, profile, () => {}, {
  domains: ['health'],
  range: { start: null, end: null },
  requestId: 'fixture-export',
  check: async () => {
    if (writes.length >= cancelAfter) throw new Error('Request cancelled');
  },
});
assert.deepEqual(discoveryKeys, profile.selection.health);
assert.ok(
  result.days > 2000,
  'All Time must span years, beyond the previous 30-day limit and history artifact ceiling',
);
assert.equal(writes[0]?.day, localCalendar.day(oldest));
assert.equal(writes.at(-1)?.day, localCalendar.day(end));
assert.equal(new Set(writes.map((w) => w.day)).size, result.days);
assert.ok(
  writes.some((w) => w.day === '2020-02-29'),
  'Leap day is retained',
);
assert.ok(
  writes.every((w) => !w.profile.selection.time.length && !w.profile.selection.location.length),
);
assert.ok(
  writes.slice(0, -1).every((w) => !w.profile.selection.health.includes(snapshot)),
  'Current snapshots are exported only today',
);
assert.deepEqual(writes.at(-1)?.profile.selection.health, profile.selection.health);
assert.ok(
  writes.every((w) => w.billing === 'fixture-export'),
  'One allowance covers the entire export',
);
assert.equal(settlements, 1);
assert.equal(result.recordCount, writes.length);
assert.ok(
  exportValidity.every((current) => !current()),
  'Completed operations invalidate pending source dispatch',
);
assert.ok(healthLookahead.every(Boolean), 'All Time enables bounded Health lookahead');
assert.ok(
  whoopReaders.every((reader) => typeof reader === 'function' && reader === whoopReaders[0]),
  'All Time shares one provider quota/proof reader across every history batch',
);
assert.equal(result.batches, Math.ceil(result.days / 30));
assert.ok(
  [...intervals.values()].every((i) => Date.parse(i.end) - Date.parse(i.start) <= 31 * 86400000),
  'History stays bounded',
);
assert.deepEqual(task.scheduleState(context.deviceId, profile).progress, beforeSchedule);
assert.equal(profile.selection.time.length, 1, 'All Time does not change the saved profile');
writes.length = 0;
healthLookahead.length = 0;
whoopReaders.length = 0;
const boundedRange = { start: '2026-01-05T12:34:00.000Z', end: '2026-01-07T04:56:00.000Z' };
const boundedResult = await task.exportNow(context, profile, () => {}, {
  domains: ['health', 'location'],
  range: boundedRange,
});
assert.equal(writes.length, 3);
assert.ok(
  healthLookahead.every((enabled) => !enabled),
  'Bounded exports retain their read mode',
);
assert.ok(
  whoopReaders.every((reader) => reader === undefined),
  'Bounded exports retain their original provider transport',
);
assert.equal(writes[0]?.start, boundedRange.start);
assert.equal(writes.at(-1)?.end, boundedRange.end);
assert.equal(boundedResult.start, boundedRange.start);
assert.equal(boundedResult.end, boundedRange.end);
assert.ok(
  writes.every(
    (w) => w.profile.selection.location.length === 1 && w.profile.selection.time.length === 0,
  ),
);
await assert.rejects(
  task.exportNow(context, profile, () => {}, {
    domains: ['time'],
    range: { start: null, end: null },
  }),
  /Choose a start date/,
);
writes.length = 0;
discoveryFailure = true;
completed = false;
await assert.rejects(
  task.exportNow(context, profile, () => {}, {
    domains: ['health'],
    range: { start: null, end: null },
  }),
  /Discovery failed/,
);
assert.equal(writes.length, 0);
assert.equal(completed, false);
discoveryFailure = false;
cancelAfter = 2;
await assert.rejects(
  task.exportNow(context, profile, () => {}, {
    domains: ['health'],
    range: { start: null, end: null },
    check: async () => {
      if (writes.length >= cancelAfter) throw new Error('Request cancelled');
    },
  }),
  /Request cancelled/,
);
assert.equal(writes.length, 2, 'Cancellation stops remaining daily effects');
assert.ok(reservedDays.length > 2000);
writes.length = 0;
historyOutcomes.length = 0;
const unavailable = new Error('Approval service temporarily unavailable');
await assert.rejects(
  task.exportNow(context, profile, () => {}, {
    domains: ['health'],
    range: { start: null, end: null },
    check: async () => {
      if (writes.length >= 1) throw unavailable;
    },
  }),
  (error) => error === unavailable,
);
assert.equal(writes.length, 1, 'A failed approval check aborts remaining daily effects');
assert.ok(
  exportValidity.every((current) => !current()),
  'Failed operations invalidate pending source dispatch',
);
assert.equal(
  historyOutcomes.at(-1),
  'failed',
  'Service failures do not become local cancellations',
);

const subject = 'all-time-owner',
  deviceId = randomUUID(),
  otherDevice = randomUUID();
const billing = new BillingStore(':memory:');
const codec = new CloudStore(':memory:', randomBytes(32));
const history = new HistoryStore(':memory:', { seal: (v) => v, open: (v) => v });
/** @type {Map<string,import('../server/data-service.js').Phone>} */ const phones = new Map();
/** @returns {Map<string,import('../server/phone-export.js').PhoneExport>} */
function recover() {
  return new DurableMap(
    codec.db,
    codec,
    'phone-exports',
    (value) => value,
    (value) => value,
  );
}
let requests = recover(),
  blocked = false;
function dataService() {
  return createDataService({
    cloud: {
      syncAgentPermissions() {},
      observeAgent: () => {
        if (blocked) throw new Error('Agent blocked');
      },
    },
    billing,
    history,
    phones,
    phoneExports: requests,
    refreshEntitlement: async () => {},
    devices: (owner) =>
      owner === subject
        ? [deviceId, otherDevice].map((id) => ({ id, name: 'Fixture', created: 0 }))
        : [],
  });
}
let service = dataService();
const catalog = {
  profiles: [{ ...profile, agentAccess: false }],
  domains: ['health', 'time', 'location'].map((domain) => ({
    domain,
    enabled: false,
    availableTypes: /** @type {string[]} */ ([]),
    types: /** @type {string[]} */ ([]),
    notes: [],
  })),
};
/** @param {boolean} [capable] @param {string} [device] */
function poll(capable = true, device = deviceId) {
  return z
    .object({ phoneExport: z.object({ requestId: z.uuid() }).passthrough().nullable() })
    .parse(
      service.phoneApi(`/api/phones/${device}/poll`, 'POST', subject, {
        ...catalog,
        ...(capable
          ? { dataExport: { version: 1 }, dataQuery: { version: 1, aggregation: 1 } }
          : {}),
      }),
    );
}
/** @type {Client[]} */ const clients = [];
/** @param {string} owner @param {string} agent @param {boolean} [chatgpt] */
async function connect(owner, agent, chatgpt = false) {
  const handler = createMcpHandler(() => {
    const mcp = new McpServer({ name: 'all-time-test', version: '1' });
    if (chatgpt) restrictChatgptTools(mcp);
    service.registerDataTools(mcp, owner, agent, { chatgpt });
    return mcp;
  });
  const client = new Client({ name: 'all-time-test', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    }),
  );
  clients.push(client);
  return client;
}
/** @param {Client} client @param {string} id @param {string} [action] @param {string} [device] */
async function call(client, id, action = 'request', device = deviceId) {
  return client.callTool({
    name: 'export_phone_data',
    arguments: {
      action,
      deviceId: device,
      profileId: profile.id,
      requestId: id,
      domains: ['health'],
    },
  });
}
/** @param {Client} client @param {string} id @param {string} [action] */
async function status(client, id, action = 'status') {
  const r = await call(client, id, action);
  assert.ok(!r.isError, JSON.stringify(r));
  return z
    .object({
      status: z.string(),
      ownerHandoff: z.object({ requiresUserApproval: z.boolean() }),
      receipt: z.unknown().optional(),
      partial: z.boolean().optional(),
    })
    .passthrough()
    .parse(r.structuredContent);
}
/** @param {string} id @param {Record<string,unknown>} value */
function report(id, value) {
  return service.phoneApi(`/api/phones/${deviceId}/export`, 'POST', subject, {
    requestId: id,
    ...value,
  });
}
try {
  const owner = await connect(subject, 'agent', true),
    sibling = await connect(subject, 'sibling'),
    foreign = await connect('foreign', 'agent');
  assert.ok((await owner.listTools()).tools.some((t) => t.name === 'export_phone_data'));
  await assert.rejects(
    () => owner.callTool({ name: 'export_all_time_health', arguments: {} }),
    /not found/,
  );
  poll(false);
  assert.equal((await call(owner, randomUUID())).isError, true);
  assert.equal(requests.size, 0);
  poll();
  const chatgptCatalog = await owner.callTool({
    name: 'get_phone_data_catalog',
    arguments: { deviceId },
  });
  assert.equal(
    z
      .object({ catalog: z.object({ dataExport: z.object({ version: z.literal(1) }) }) })
      .parse(chatgptCatalog.structuredContent).catalog.dataExport.version,
    1,
  );
  await assert.rejects(
    () => owner.callTool({ name: 'request_phone_profile_agent_access', arguments: {} }),
    /not found/,
  );
  const id = randomUUID();
  assert.equal((await call(foreign, id)).isError, true);
  assert.equal((await status(owner, id, 'request')).status, 'accepted');
  assert.equal((await status(owner, id, 'request')).receipt, undefined);
  assert.equal((await status(owner, id)).ownerHandoff.requiresUserApproval, false);
  assert.equal(requests.size, 1);
  assert.equal(
    (
      await owner.callTool({
        name: 'export_phone_data',
        arguments: {
          deviceId,
          profileId: profile.id,
          requestId: id,
          domains: ['health'],
          range: { start: '2026-01-01T00:00:00.000Z', end: null },
        },
      })
    ).isError,
    true,
    'A retry cannot change its date range',
  );
  assert.equal((await call(sibling, id, 'status')).isError, true);
  poll(true, otherDevice);
  assert.equal((await call(owner, id, 'status', otherDevice)).isError, true);
  assert.throws(() => report(id, { action: 'start' }), /phone dispatch/);
  assert.equal(poll().phoneExport?.requestId, id);
  assert.throws(() => report(id, { action: 'complete' }), /receipt/);
  report(id, { action: 'start' });
  assert.equal((await status(owner, id)).status, 'running');
  assert.equal(poll().phoneExport, null, 'Started work never redispatches');
  assert.throws(() => report(id, { action: 'complete' }), /receipt/);
  const receipt = {
    historyId: `export-${id}`,
    start: oldest,
    end: z
      .object({ range: z.object({ end: z.string() }) })
      .parse((await call(owner, id, 'status')).structuredContent).range.end,
    days: 2000,
    batches: 67,
    recordCount: 3000,
    failedSources: 1,
  };
  report(id, { action: 'complete', receipt });
  assert.equal((await status(owner, id)).status, 'completed');
  assert.equal((await status(owner, id)).partial, true);
  report(id, { action: 'fail' });
  assert.equal((await status(owner, id)).status, 'completed');
  requests = recover();
  service = dataService();
  poll();
  assert.deepEqual(
    (await status(owner, id, 'request')).receipt,
    receipt,
    'Durable retry retains delivery without another export',
  );
  const cancelId = randomUUID();
  await status(owner, cancelId, 'request');
  poll();
  report(cancelId, { action: 'start' });
  assert.equal((await status(owner, cancelId, 'cancel')).status, 'cancelled');
  report(cancelId, {
    action: 'complete',
    receipt: { ...receipt, historyId: `export-${cancelId}` },
  });
  assert.equal((await status(owner, cancelId)).status, 'cancelled');
  const expiredId = randomUUID();
  await status(owner, expiredId, 'request');
  const expired = requests.get(expiredId);
  assert.ok(expired);
  expired.expiresAt = Date.now() - 1;
  requests.set(expiredId, expired);
  assert.equal((await status(owner, expiredId)).status, 'expired');
  const changedId = randomUUID();
  await status(owner, changedId, 'request');
  catalog.profiles[0] = { ...profile, name: 'Changed', agentAccess: false };
  poll();
  assert.equal((await status(owner, changedId)).status, 'failed');
  catalog.profiles[0] = { ...profile, agentAccess: false };
  poll();
  const blockedId = randomUUID();
  await status(owner, blockedId, 'request');
  poll();
  report(blockedId, { action: 'start' });
  blocked = true;
  assert.throws(() => report(blockedId, { action: 'check' }), /blocked/);
  blocked = false;
  service.cancelAgent(subject, 'agent');
  assert.equal((await status(owner, blockedId)).status, 'cancelled');
  assert.equal(
    billing.snapshot(subject).used,
    0,
    'Queueing and dispatch do not consume export allowance',
  );
  assert.equal(
    catalog.profiles[0].agentAccess,
    false,
    'Export execution does not change agent read configuration',
  );
  // Join the actual MCP request, automatic phone execution, export orchestration and receipt replay.
  const journal = new Map();
  let runCount = 0,
    dropCompletion = true;
  /** @type {(()=>void)|undefined} */ let finish;
  const finished = new Promise((resolve) => {
    finish = () => resolve(undefined);
  });
  const nativeDb = {
    execSync() {},
    getAllSync: () => [...journal.entries()].map(([request, value]) => ({ request, value })),
    getFirstSync: (
      /** @type {string} */ _sql,
      /** @type {string} */ _owner,
      /** @type {string} */ _device,
      /** @type {string} */ receiptId,
    ) => (journal.has(receiptId) ? { request: receiptId } : null),
    runSync: (
      /** @type {string} */ _sql,
      /** @type {string} */ _owner,
      /** @type {string} */ _device,
      /** @type {string} */ receiptId,
      /** @type {string} */ value,
    ) => journal.set(receiptId, value),
  };
  const mobileMocks = {
    'react-native': {
      AppState: { currentState: 'active' },
      Alert: { alert: () => assert.fail('Agent exports must not prompt for approval') },
    },
    './session.js': {
      api: async (
        /** @type {unknown} */ _session,
        /** @type {string} */ _path,
        /** @type {{body:string}} */ options,
      ) => {
        const body = JSON.parse(options.body);
        const response = report(body.requestId, body);
        if (body.action === 'complete') {
          finish?.();
          if (dropCompletion) throw new Error('Acknowledgment lost');
        }
        return response;
      },
    },
    './export-context.js': { loadExportContext: () => context },
    './profiles.js': { loadProfiles: () => ({ profiles: [profile] }) },
    '../core/profiles.js': { parseProfile },
    './export-task.js': {
      /** @param {Parameters<typeof task.exportNow>} args */
      exportNow: async (...args) => {
        runCount++;
        return task.exportNow(...args);
      },
    },
    './phone-database.js': { phoneDatabase: () => nativeDb },
    './qa-runtime.js': { qaEnabled: false },
    '../src/components/Toast.js': { showToast: () => () => {} },
    '../packages/support-chat/errors.js': { errorMessage: String },
  };
  const mobile =
    /** @type {{reviewPhoneExport:(session:typeof context,request:{requestId:string,profileId:string,configuration:string,expiresAt:string,domains:import('../core/data.js').Domain[],range:{start:string|null,end:string}}|null,active:()=>boolean)=>Promise<void>}} */ (
      await load('../client/phone-export-request.js', mobileMocks)
    );
  const mobileId = randomUUID();
  await status(owner, mobileId, 'request');
  const dispatched = z
    .object({
      requestId: z.string(),
      profileId: z.string(),
      configuration: z.string(),
      expiresAt: z.string(),
      domains: z.array(z.enum(domains)),
      range: z.object({ start: z.string().nullable(), end: z.string() }),
    })
    .parse(poll().phoneExport);
  cancelAfter = Infinity;
  writes.length = 0;
  await mobile.reviewPhoneExport(context, dispatched, () => true);
  await finished;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runCount, 1);
  assert.ok(writes.length > 2000);
  assert.equal((await status(owner, mobileId)).status, 'completed');
  const storedReceipt = JSON.parse(journal.get(mobileId));
  assert.equal(
    storedReceipt.action,
    'complete',
    'Delivery is journaled before completion acknowledgment',
  );
  dropCompletion = false;
  await mobile.reviewPhoneExport(context, null, () => true);
  assert.equal(
    runCount,
    1,
    'Lost acknowledgment replays a receipt without repeating file delivery',
  );
  assert.equal(JSON.parse(journal.get(mobileId)).acknowledged, true);
  const interruptedId = randomUUID();
  await status(owner, interruptedId, 'request');
  poll();
  report(interruptedId, { action: 'start' });
  journal.set(interruptedId, JSON.stringify({ action: 'running' }));
  const restartedMobile = /** @type {typeof mobile} */ (
    await load('../client/phone-export-request.js', mobileMocks)
  );
  await restartedMobile.reviewPhoneExport(context, null, () => true);
  assert.equal((await status(owner, interruptedId)).status, 'failed');
  assert.equal(runCount, 1, 'Runtime restart reports interruption without repeating delivery');
  catalog.profiles[0] = { ...profile, agentAccess: true };
  catalog.domains[0] = {
    ...catalog.domains[0],
    domain: 'health',
    enabled: true,
    types: [steps],
    availableTypes: [steps],
    notes: [],
  };
  poll();
  const longRead = await owner.callTool({
    name: 'query_phone_data',
    arguments: {
      deviceId,
      profileId: profile.id,
      domain: 'health',
      type: steps.slice(7),
      start: '2020-01-01T00:00:00.000Z',
      end: '2021-01-01T00:00:00.000Z',
    },
  });
  assert.notEqual(longRead.isError, true, JSON.stringify(longRead));
  await Promise.all(
    [owner, sibling].map(async (connection) => {
      const filtered = await connection.callTool({
        name: 'get_phone_data_catalog',
        arguments: { deviceId, profileId: profile.id, domains: ['health'], detail: 'summary' },
      });
      assert.notEqual(filtered.isError, true);
      const filteredCatalog = z
        .object({
          catalog: z.object({
            domains: z.array(z.object({ domain: z.literal('health'), typeCount: z.number() })),
            profiles: z.array(
              z.object({
                id: z.string(),
                selection: z.object({ health: z.object({ typeCount: z.number() }) }).strict(),
              }),
            ),
          }),
        })
        .parse(filtered.structuredContent);
      assert.equal(filteredCatalog.catalog.profiles.length, 1);
      assert.equal(filteredCatalog.catalog.domains.length, 1);
      assert.equal(JSON.stringify(filtered.structuredContent).includes('availableTypes'), false);
      assert.equal(
        (
          await connection.callTool({
            name: 'get_phone_data_catalog',
            arguments: { deviceId, profileId: 'missing' },
          })
        ).isError,
        true,
      );
    }),
  );
  const longId = z.object({ requestId: z.string() }).parse(longRead.structuredContent).requestId;
  poll();
  service.phoneApi(`/api/phones/${deviceId}/result`, 'POST', subject, {
    id: longId,
    error: 'Fixture drained',
  });
  const queryArguments = {
    deviceId,
    profileId: profile.id,
    domain: 'health',
    type: steps.slice(7),
    start: '2026-10-01T00:00:00.000Z',
    end: '2026-10-02T00:00:00.000Z',
    aggregation: { operation: 'sum', field: 'quantity', groupBy: 'day' },
    requestKey: 'aggregate-wait',
  };
  service.phoneApi(`/api/phones/${deviceId}/poll`, 'POST', subject, {
    ...catalog,
    dataQuery: { version: 1 },
    dataExport: { version: 1 },
  });
  assert.equal(
    (
      await owner.callTool({
        name: 'query_phone_data',
        arguments: { ...queryArguments, requestKey: 'old-phone' },
      })
    ).isError,
    true,
    'Old phones must not ignore aggregation',
  );
  poll();
  const accepted = await owner.callTool({ name: 'query_phone_data', arguments: queryArguments });
  assert.notEqual(accepted.isError, true, JSON.stringify(accepted));
  const queryId = z
    .object({ requestId: z.string(), retryAfterMs: z.literal(1000) })
    .parse(accepted.structuredContent).requestId;
  const unchanged = await owner.callTool({
    name: 'query_phone_data',
    arguments: { ...queryArguments, waitMs: 10 },
  });
  assert.equal(
    z.object({ requestId: z.string() }).parse(unchanged.structuredContent).requestId,
    queryId,
    'Transport wait must not change retry identity',
  );
  const waitRunning = owner.callTool({
    name: 'get_phone_request',
    arguments: { requestId: queryId, waitMs: 1000 },
  });
  await delay(30);
  poll();
  const running = await waitRunning;
  assert.equal(z.object({ status: z.string() }).parse(running.structuredContent).status, 'running');
  const waitComplete = owner.callTool({
    name: 'get_phone_request',
    arguments: { requestId: queryId, waitMs: 1000 },
  });
  await delay(30);
  service.phoneApi(`/api/phones/${deviceId}/result`, 'POST', subject, {
    id: queryId,
    page: {
      records: [],
      nextCursor: null,
      warnings: [],
      capture: 'aggregate-native-scalars',
      complete: true,
      aggregation: {
        operation: 'sum',
        groupBy: 'day',
        field: 'quantity',
        unitField: null,
        start: queryArguments.start,
        end: queryArguments.end,
        scannedRecords: 0,
        skippedRecords: 0,
      },
    },
  });
  assert.equal(
    z
      .object({ status: z.string(), retryAfterMs: z.null() })
      .parse((await waitComplete).structuredContent).status,
    'complete',
  );
  assert.equal(
    (await sibling.callTool({ name: 'get_phone_request', arguments: { requestId: queryId } }))
      .isError,
    true,
    'Sibling client cannot read retained query',
  );
  assert.equal(
    (
      await owner.callTool({
        name: 'query_phone_data',
        arguments: {
          ...queryArguments,
          requestKey: 'missing-field',
          aggregation: { operation: 'sum' },
        },
      })
    ).isError,
    true,
    'Missing numeric field fails',
  );
  const revokeJob = await owner.callTool({
    name: 'query_phone_data',
    arguments: { ...queryArguments, requestKey: 'revoke-during-wait' },
  });
  const revokeId = z.object({ requestId: z.string() }).parse(revokeJob.structuredContent).requestId;
  const revoking = owner.callTool({
    name: 'get_phone_request',
    arguments: { requestId: revokeId, waitMs: 1000 },
  });
  await delay(30);
  blocked = true;
  assert.equal((await revoking).isError, true, 'Client block is rechecked after bounded waiting');
  blocked = false;
  const revoked = owner.callTool({
    name: 'get_phone_request',
    arguments: { requestId: revokeId, waitMs: 1000 },
  });
  await delay(30);
  catalog.profiles[0] = {
    ...profile,
    agentAccess: true,
    selection: { ...profile.selection, health: [] },
  };
  poll();
  assert.equal((await revoked).isError, true, 'Profile selections are rechecked during wait');
  catalog.profiles[0] = { ...profile, agentAccess: true };
  poll();
  const waitExport = randomUUID();
  const waitingExport = owner.callTool({
    name: 'export_phone_data',
    arguments: {
      deviceId,
      profileId: profile.id,
      requestId: waitExport,
      domains: ['health'],
      waitMs: 1000,
    },
  });
  await delay(30);
  poll();
  const exportOutcome = await waitingExport;
  assert.notEqual(exportOutcome.isError, true, JSON.stringify(exportOutcome));
  assert.equal(
    z.object({ status: z.string() }).parse(exportOutcome.structuredContent).status,
    'queued',
    'Bounded waits expose dispatched work without requiring owner approval',
  );
  await status(owner, waitExport, 'cancel');
  console.log(
    'MCP optimization: full/restricted filtered discovery, aggregate query dispatch/results, idempotent wait arguments, state-change waits, owner handoff, blocked-client and revoked-grant denial pass.',
  );
  console.log(
    'All Time Health: multi-year calendar coverage, snapshots, history batching, one allowance, discovery failure, cancellation, Android history consent, real MCP lifecycle/ownership/client isolation, durable retries, expiry, profile changes, automatic phone execution, lost acknowledgments and JS restart recovery pass.',
  );
} finally {
  await Promise.all(clients.map((c) => c.close()));
  history.db.close();
  billing.db.close();
  codec.db.close();
}
