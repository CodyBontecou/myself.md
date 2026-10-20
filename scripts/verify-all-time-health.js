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
/** @type {{profile:import('../core/profiles.js').ExportProfile,day:string,billing:string}[]} */ const writes =
  [];
/** @type {Map<string,{start:string,end:string}>} */ const intervals = new Map();
/** @type {string[]} */ let reservedDays = [];
let settlements = 0,
  completed = false,
  cancelAfter = Infinity;
let discoveryKeys = /** @type {string[]} */ ([]);
const taskMocks = {
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
    finishExport: () => {
      completed = true;
    },
  },
  './profile-export.js': {
    exportProfileDay: async (
      /** @type {unknown} */ _context,
      /** @type {import('../core/profiles.js').ExportProfile} */ current,
      /** @type {{day:string}} */ interval,
      /** @type {()=>boolean} */ valid,
      /** @type {unknown} */ _progress,
      /** @type {(artifact:unknown)=>void} */ artifact,
      /** @type {string} */ billing,
      /** @type {()=>Promise<void>} */ check,
    ) => {
      assert.equal(valid(), true);
      await check();
      writes.push({ profile: current, day: interval.day, billing });
      artifact({});
      return { count: 1, files: [], failedSources: 0 };
    },
  },
  './destinations.js': { requireCloudAuthorization: async () => {} },
  './export-notification-registration.js': { reconcileExportNotificationTask: async () => {} },
  './health-history.js': {
    earliestHealthDate: async (/** @type {string} */ _owner, /** @type {string[]} */ keys) => {
      discoveryKeys = keys;
      if (discoveryFailure) throw new Error('Discovery failed');
      return oldest;
    },
  },
};
const task =
  /** @type {{exportNow:(currentContext:typeof context,currentProfile:typeof profile,progress:()=>void,options?:{allTimeHealth?:boolean,requestId?:string,check?:()=>Promise<void>})=>Promise<{days:number,recordCount:number,historyId:string,batches:number,failedSources:number}>,scheduleState:(device:string,currentProfile:typeof profile)=>{progress:unknown}}} */ (
    await load('../client/export-task.js', taskMocks)
  );
const beforeSchedule = task.scheduleState(context.deviceId, profile).progress;
const result = await task.exportNow(context, profile, () => {}, {
  allTimeHealth: true,
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
assert.equal(result.batches, Math.ceil(result.days / 30));
assert.ok(
  [...intervals.values()].every((i) => Date.parse(i.end) - Date.parse(i.start) <= 31 * 86400000),
  'History stays bounded',
);
assert.deepEqual(task.scheduleState(context.deviceId, profile).progress, beforeSchedule);
assert.equal(profile.selection.time.length, 1, 'All Time does not change the saved profile');
writes.length = 0;
discoveryFailure = true;
completed = false;
await assert.rejects(
  task.exportNow(context, profile, () => {}, { allTimeHealth: true }),
  /Discovery failed/,
);
assert.equal(writes.length, 0);
assert.equal(completed, false);
discoveryFailure = false;
cancelAfter = 2;
await assert.rejects(
  task.exportNow(context, profile, () => {}, {
    allTimeHealth: true,
    check: async () => {
      if (writes.length >= cancelAfter) throw new Error('Request cancelled');
    },
  }),
  /Request cancelled/,
);
assert.equal(writes.length, 2, 'Cancellation stops remaining daily effects');
assert.ok(reservedDays.length > 2000);

const subject = 'all-time-owner',
  deviceId = randomUUID(),
  otherDevice = randomUUID();
const billing = new BillingStore(':memory:');
const codec = new CloudStore(':memory:', randomBytes(32));
const history = new HistoryStore(':memory:', { seal: (v) => v, open: (v) => v });
/** @type {Map<string,import('../server/data-service.js').Phone>} */ const phones = new Map();
/** @returns {Map<string,import('../server/health-export.js').HealthExport>} */
function recover() {
  return new DurableMap(
    codec.db,
    codec,
    'health-exports',
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
    healthExports: requests,
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
    availableTypes: [],
    types: [],
    notes: [],
  })),
};
/** @param {boolean} [capable] @param {string} [device] */
function poll(capable = true, device = deviceId) {
  return z
    .object({ healthExport: z.object({ requestId: z.uuid() }).passthrough().nullable() })
    .parse(
      service.phoneApi(`/api/phones/${device}/poll`, 'POST', subject, {
        ...catalog,
        ...(capable ? { allTimeHealthExport: { version: 1 } } : {}),
      }),
    );
}
/** @type {Client[]} */ const clients = [];
/** @param {string} owner @param {string} agent */
async function connect(owner, agent) {
  const handler = createMcpHandler(() => {
    const mcp = new McpServer({ name: 'all-time-test', version: '1' });
    service.registerDataTools(mcp, owner, agent);
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
    name: 'export_all_time_health',
    arguments: { action, deviceId: device, profileId: profile.id, requestId: id },
  });
}
/** @param {Client} client @param {string} id @param {string} [action] */
async function status(client, id, action = 'status') {
  const r = await call(client, id, action);
  assert.ok(!r.isError, JSON.stringify(r));
  return z
    .object({
      status: z.string(),
      receipt: z.unknown().optional(),
      partial: z.boolean().optional(),
    })
    .passthrough()
    .parse(r.structuredContent);
}
/** @param {string} id @param {Record<string,unknown>} value */
function report(id, value) {
  return service.phoneApi(`/api/phones/${deviceId}/health-export`, 'POST', subject, {
    requestId: id,
    ...value,
  });
}
try {
  const owner = await connect(subject, 'agent'),
    sibling = await connect(subject, 'sibling'),
    foreign = await connect('foreign', 'agent');
  assert.ok((await owner.listTools()).tools.some((t) => t.name === 'export_all_time_health'));
  poll(false);
  assert.equal((await call(owner, randomUUID())).isError, true);
  assert.equal(requests.size, 0);
  poll();
  const id = randomUUID();
  assert.equal((await call(foreign, id)).isError, true);
  assert.equal((await status(owner, id, 'request')).status, 'accepted');
  assert.equal((await status(owner, id, 'request')).receipt, undefined);
  assert.equal(requests.size, 1);
  assert.equal((await call(sibling, id, 'status')).isError, true);
  poll(true, otherDevice);
  assert.equal((await call(owner, id, 'status', otherDevice)).isError, true);
  assert.throws(() => report(id, { action: 'start' }), /owner review/);
  assert.equal(poll().healthExport?.requestId, id);
  assert.throws(() => report(id, { action: 'complete' }), /receipt/);
  report(id, { action: 'start' });
  assert.equal((await status(owner, id)).status, 'running');
  assert.equal(poll().healthExport, null, 'Started work never redispatches');
  assert.throws(() => report(id, { action: 'complete' }), /receipt/);
  const receipt = {
    historyId: `health-${id}`,
    start: oldest,
    end,
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
    receipt: { ...receipt, historyId: `health-${cancelId}` },
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
    'Queueing and review do not consume export allowance',
  );
  assert.equal(
    catalog.profiles[0].agentAccess,
    false,
    'Export approval does not grant agent reads',
  );
  // Join the actual MCP request, phone review, export orchestration and receipt replay.
  const journal = new Map();
  let buttons = /** @type {{text:string,onPress:()=>void}[]} */ ([]);
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
      Alert: {
        alert: (
          /** @type {string} */ _title,
          /** @type {string} */ _description,
          /** @type {typeof buttons} */ actions,
        ) => {
          buttons = actions;
        },
      },
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
    /** @type {{reviewHealthExport:(session:typeof context,request:{requestId:string,profileId:string,configuration:string,expiresAt:string}|null,active:()=>boolean)=>Promise<void>}} */ (
      await load('../client/health-export-request.js', mobileMocks)
    );
  const mobileId = randomUUID();
  await status(owner, mobileId, 'request');
  const dispatched = z
    .object({
      requestId: z.string(),
      profileId: z.string(),
      configuration: z.string(),
      expiresAt: z.string(),
    })
    .parse(poll().healthExport);
  cancelAfter = Infinity;
  writes.length = 0;
  await mobile.reviewHealthExport(context, dispatched, () => true);
  assert.equal(runCount, 0, 'A delivered review cannot export until the owner confirms');
  const approve = buttons.find((button) => button.text === 'Export All Time');
  assert.ok(approve);
  approve.onPress();
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
  await mobile.reviewHealthExport(context, null, () => true);
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
    await load('../client/health-export-request.js', mobileMocks)
  );
  await restartedMobile.reviewHealthExport(context, null, () => true);
  assert.equal((await status(owner, interruptedId)).status, 'failed');
  assert.equal(runCount, 1, 'Runtime restart reports interruption without repeating delivery');
  console.log(
    'All Time Health: multi-year calendar coverage, snapshots, history batching, one allowance, discovery failure, cancellation, Android history consent, real MCP lifecycle/ownership/client isolation, durable retries, expiry, profile changes, owner-approved phone execution, lost acknowledgments and JS restart recovery pass.',
  );
} finally {
  await Promise.all(clients.map((c) => c.close()));
  history.db.close();
  billing.db.close();
  codec.db.close();
}
