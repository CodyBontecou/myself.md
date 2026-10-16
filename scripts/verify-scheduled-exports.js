import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as schedules from '../core/schedules.js';
import { localCalendar } from '../client/calendar.js';
import { parseProfile } from '../core/profiles.js';
import { deliveredFormats } from '../core/export-files.js';
const session = { deviceId: 'phone-a', owner: 'owner-a', server: 'https://example.com' };
const profiles = ['a', 'b'].map((id) =>
  Object.assign(
    parseProfile({
      schema: 'myself.md.profile.v1',
      name: id,
      selection: { health: [], time: [], location: [] },
    }),
    { id },
  ),
);
/** @type {Map<string,string>} */
const rows = new Map();
/** @type {{profiles:{profileId:string,enabledAt:string}[]}[]} */
const registrations = [];
/** @type {{profile:string,day:string}[]} */
const exported = [];
const mocks = {
  phoneDatabase: () => ({
    execSync() {},
    /** @param {string} _sql @param {string} device @param {string} id */
    getFirstSync: (_sql, device, id) =>
      rows.has(`${device}/${id}`) ? { value: rows.get(`${device}/${id}`) } : null,
    /** @param {string} _sql @param {string} device @param {string} id @param {string} value */
    runSync: (_sql, device, id, value) => rows.set(`${device}/${id}`, value),
  }),
  loadExportContext: () => session,
  loadSession: async () => session,
  loadProfiles: () => ({ profiles }),
  /** @param {unknown} _session @param {string} _path @param {{body:string}} options */
  api: async (_session, _path, options) => {
    registrations.push(JSON.parse(options.body));
    return { requests: [] };
  },
  default: { expoConfig: { extra: { eas: { projectId: 'project' } } } },
  Alert: { alert() {} },
  Platform: { OS: 'ios' },
  qaEnabled: false,
  getPermissionsAsync: async () => ({ granted: true }),
  requestPermissionsAsync: async () => ({ granted: true }),
  getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[test]' }),
  setNotificationChannelAsync: async () => {},
  AndroidImportance: { DEFAULT: 3 },
  isTaskRegisteredAsync: async () => false,
  getStatusAsync: async () => 1,
  BackgroundTaskStatus: { Available: 1 },
  registerTaskAsync: async () => {},
  unregisterTaskAsync: async () => {},
  defineTask() {},
  reserveExport: async () => {},
  settleExport: async () => {},
  beginExport: () => 'history',
  recordArtifact() {},
  finishExport() {},
  errorJSON: String,
  exportFailureMessage: String,
  deliveredFormats,
  /** @param {unknown} _session @param {import("../core/profiles.js").ExportProfile} profile @param {{day:string}} day */
  exportProfileDay: async (_session, profile, day) => {
    exported.push({ profile: profile.id, day: day.day });
    return { files: [], count: 0, failedSources: 0 };
  },
};
const module = new SourceTextModule(
  await readFile(new URL('../client/export-task.js', import.meta.url), 'utf8'),
);
await module.link((specifier) => {
  const values =
    specifier === '../core/schedules.js'
      ? schedules
      : specifier === './calendar.js'
        ? { localCalendar }
        : mocks;
  return new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  });
});
await module.evaluate();
const task =
  /** @type {{setScheduleEnabled:(device:string,profile:import('../core/profiles.js').ExportProfile,enabled:boolean)=>Promise<void>,scheduleState:(device:string,profile:import('../core/profiles.js').ExportProfile)=>{progress:import('../core/schedules.js').ScheduleProgress},runScheduledExports:(profileId?:string)=>Promise<void>,openScheduledExport:(value:unknown)=>Promise<boolean>}} */ (
    /** @type {unknown} */ (module.namespace)
  );
const first = profiles[0];
assert.ok(first);
await task.setScheduleEnabled(session.deviceId, first, true);
assert.equal(
  registrations.length > 0,
  true,
  'Enabling a schedule must register cloud notifications',
);
console.log('Cloud schedule registration passed.');

const second = profiles[1];
assert.ok(second);
await task.setScheduleEnabled(session.deviceId, second, true);
const fireDate = localCalendar.instant(localCalendar.day(new Date().toISOString()), 8, 0);
for (const profile of profiles) {
  const state = task.scheduleState(session.deviceId, profile);
  state.progress.enabledAt = new Date(Date.parse(fireDate) - 172800000).toISOString();
  rows.set(`${session.deviceId}/${profile.id}`, JSON.stringify(state));
}
const payload = {
  deviceId: session.deviceId,
  profileId: second.id,
  enabledAt: task.scheduleState(session.deviceId, second).progress.enabledAt,
  fireDate,
  kind: 'completed-day',
};
// Anchor to yesterday if this command is run before today's scheduled time.
if (Date.parse(fireDate) > Date.now())
  payload.fireDate = new Date(Date.parse(fireDate) - 86400000).toISOString();
assert.equal(await task.openScheduledExport({ ...payload, deviceId: 'another-phone' }), false);
assert.equal(await task.openScheduledExport({ ...payload, enabledAt: 'stale' }), false);
assert.equal(await task.openScheduledExport(payload), true);
assert.equal(exported.length, second.export.lookbackDays);
assert.ok(exported.every((entry) => entry.profile === second.id));
const count = exported.length;
assert.equal(await task.openScheduledExport(payload), false);
assert.equal(exported.length, count, 'A duplicate tap must not export twice');
await task.setScheduleEnabled(session.deviceId, second, false);
assert.equal(await task.openScheduledExport(payload), false);
console.log('Correct-profile tap, stale/device rejection, disable and duplicate delivery passed.');

// Elapsed cadence executes the current day even if its latest missed slot was yesterday.
second.schedule = schedules.parseSchedule({ frequency: 'custom', unit: 'hour', interval: 365 });
await task.setScheduleEnabled(session.deviceId, second, true);
const elapsedState = task.scheduleState(session.deviceId, second);
elapsedState.progress.enabledAt = new Date(Date.now() - (365 + 24) * 3600000).toISOString();
rows.set(`${session.deviceId}/${second.id}`, JSON.stringify(elapsedState));
const beforeElapsed = exported.length;
await task.runScheduledExports(second.id);
assert.equal(exported.length, beforeElapsed + 1);
assert.equal(
  exported.at(-1)?.day,
  localCalendar.day(new Date().toISOString()),
  'Frequent cadence refreshes execution day, not the missed slot day',
);
await task.runScheduledExports(second.id);
assert.equal(exported.length, beforeElapsed + 1, 'Checkpoint prevents a duplicate interval export');
await task.setScheduleEnabled(session.deviceId, second, false);
const { DatabaseSync } = await import('node:sqlite');
const { createExportSchedules } = await import('../server/export-schedules.js');
const { scheduleCalendar } = await import('../server/schedule-calendar.js');
const database = new DatabaseSync(':memory:');
let pushes = 0;
let deliveryFails = false;
let connected = true;
/** @type {{exportSchedule:{profileId:string,deviceId:string,fireDate:string}}[]} */
const notifications = [];
const cloud = createExportSchedules(
  database,
  (subject, device) => {
    assert.equal(subject, 'owner-a');
    if (!connected || device !== 'phone-a') throw new Error('Not owned');
  },
  async () => {},
  async (_url, options) => {
    pushes++;
    const message = JSON.parse(String(options?.body));
    notifications.push(message.data);
    return Response.json({ data: { status: deliveryFails ? 'error' : 'ok' } });
  },
);
const registration = {
  deviceId: 'phone-a',
  token: 'ExponentPushToken[test]',
  timeZone: 'Europe/Berlin',
  profiles: [
    {
      profileId: 'b',
      enabledAt: '2026-10-13T00:00:00.000Z',
      schedule: schedules.parseSchedule({ hour: 8 }),
      lastCompleted: null,
      lastRefresh: null,
    },
  ],
};
await assert.rejects(
  cloud.register('owner-a', { ...registration, deviceId: 'other' }),
  /Not owned/,
);
await cloud.register('owner-a', registration);
await cloud.dispatch('2026-10-15T06:01:00.000Z');
assert.equal(pushes, 1);
assert.equal(notifications[0]?.exportSchedule.profileId, 'b');
assert.equal(notifications[0]?.exportSchedule.fireDate, '2026-10-15T06:00:00.000Z');
await cloud.register('owner-a', registration);
await cloud.dispatch('2026-10-15T06:02:00.000Z');
assert.equal(pushes, 1, 'Re-registration must preserve notification checkpoints');
assert.equal(
  cloud.list('owner-a')[0]?.profiles[0]?.lastCompleted,
  null,
  'Notification acceptance must not claim export completion',
);
deliveryFails = true;
await cloud.dispatch('2026-10-16T06:01:00.000Z');
assert.equal(cloud.list('owner-a')[0]?.notificationStatus, 'delivery-failed');
deliveryFails = false;
await cloud.dispatch('2026-10-16T06:02:00.000Z');
assert.equal(pushes, 3, 'Failed push must retry');
await cloud.dispatch('2026-10-16T06:03:00.000Z');
assert.equal(pushes, 3);
await cloud.register('owner-a', { ...registration, profiles: [] });
await cloud.dispatch('2026-10-17T06:01:00.000Z');
assert.equal(pushes, 3, 'Disabled schedules must stop push delivery');
assert.equal(
  scheduleCalendar('Europe/Berlin').instant('2026-10-26', 8, 0),
  '2026-10-26T07:00:00.000Z',
);
assert.equal(
  scheduleCalendar('Europe/Berlin').instant('2026-03-29', 2, 30),
  '2026-03-29T01:30:00.000Z',
);
assert.equal(
  scheduleCalendar('America/New_York').instant('2026-11-01', 1, 30),
  '2026-11-01T05:30:00.000Z',
);
/** @type {Map<string,unknown>} */
const tools = new Map();
cloud.registerTools(
  /** @type {import('@modelcontextprotocol/server').McpServer} */ (
    /** @type {unknown} */ ({
      /** @param {string} name @param {unknown} _config @param {unknown} callback */
      registerTool(name, _config, callback) {
        tools.set(name, callback);
      },
    })
  ),
  'owner-a',
);
const requestSchedule =
  /** @type {(input:{deviceId:string,profileId:string,enabled:boolean,requestId:string})=>Promise<unknown>} */ (
    tools.get('set_phone_export_schedule_enabled')
  );
const change = { deviceId: 'phone-a', profileId: 'b', enabled: true, requestId: 'retry-key' };
await requestSchedule(change);
assert.equal(cloud.requests('owner-a')[0]?.state, 'awaiting-user');
assert.equal(
  cloud.list('owner-a')[0]?.profiles.length,
  0,
  'Agent requests must not enable schedules before phone approval',
);
await requestSchedule(change);
assert.equal(cloud.requests('owner-a').length, 1);
await assert.rejects(requestSchedule({ ...change, enabled: false }), /different request/);
assert.throws(
  () =>
    cloud.completeRequest('owner-a', {
      requestId: change.requestId,
      deviceId: 'other',
      state: 'completed',
    }),
  /Not owned/,
);
cloud.completeRequest('owner-a', {
  requestId: change.requestId,
  deviceId: 'phone-a',
  state: 'running',
});
cloud.completeRequest('owner-a', {
  requestId: change.requestId,
  deviceId: 'phone-a',
  state: 'completed',
});
assert.equal(cloud.requests('owner-a')[0]?.state, 'completed');
await requestSchedule({ ...change, requestId: 'cancel-key' });
cloud.completeRequest('owner-a', {
  requestId: 'cancel-key',
  deviceId: 'phone-a',
  state: 'cancelled',
});
assert.equal(
  cloud.requests('owner-a').find((r) => r.requestId === 'cancel-key')?.state,
  'cancelled',
);
await requestSchedule({ ...change, requestId: 'expire-key' });
const actualNow = Date.now;
try {
  Date.now = () => actualNow() + 600000;
  assert.equal(
    cloud.requests('owner-a').find((r) => r.requestId === 'expire-key')?.state,
    'expired',
  );
} finally {
  Date.now = actualNow;
}
console.log('MCP owner review, retry keys, cross-device denial and terminal outcomes passed.');
assert.equal(
  scheduleCalendar('Europe/Berlin').instant('2026-10-25', 2, 30),
  '2026-10-25T00:30:00.000Z',
);
const beforeFrequentPushes = pushes;
await cloud.register('owner-a', {
  ...registration,
  profiles: [
    {
      ...registration.profiles[0],
      profileId: 'minute-profile',
      schedule: schedules.parseSchedule({ frequency: 'custom', unit: 'minute', interval: 1 }),
    },
  ],
});
await cloud.dispatch('2026-10-17T06:01:00.000Z');
assert.equal(
  pushes,
  beforeFrequentPushes,
  'Elapsed schedules never send per-minute reminder notifications',
);
assert.equal(cloud.list('owner-a')[0]?.profiles[0]?.timing.reminders, 'disabled');
connected = false;
await cloud.dispatch('2026-10-18T06:01:00.000Z');
assert.deepEqual(cloud.list('owner-a'), []);
database.close();
console.log(
  'Cloud due delivery, ownership, retries, checkpoints, disable/disconnect and DST passed.',
);

// Exercise the mounted phone listener as well as the export business logic above.
/** @typedef {{notification:{request:{identifier:string,content:{data:Record<string,unknown>}}}}} TapResponse */
/** @type {{listener?: (response:TapResponse)=>void, cleanup?:()=>void, removed:boolean}} */
const tapState = { removed: false };
/** @type {unknown[]} */
const tapRoutes = [];
/** @type {unknown[]} */
const tapExports = [];
const notificationModule = new SourceTextModule(
  await readFile(new URL('../client/PhoneNotifications.js', import.meta.url), 'utf8'),
);
const notificationMocks = {
  useEffect: (/** @type {()=>()=>void} */ effect) => {
    tapState.cleanup = effect();
  },
  usePhone: () => ({ session }),
  qaEnabled: false,
  setNotificationHandler() {},
  getLastNotificationResponse: () => null,
  addNotificationResponseReceivedListener: (/** @type {(response:TapResponse)=>void} */ open) => {
    tapState.listener = open;
    return {
      remove: () => {
        tapState.removed = true;
      },
    };
  },
  router: { push: (/** @type {unknown} */ route) => tapRoutes.push(route) },
  openScheduledExport: async (/** @type {unknown} */ tapPayload) => {
    tapExports.push(tapPayload);
    return true;
  },
};
await notificationModule.link(
  () =>
    new SyntheticModule(Object.keys(notificationMocks), function () {
      for (const [key, value] of Object.entries(notificationMocks)) this.setExport(key, value);
    }),
);
await notificationModule.evaluate();
const notificationComponent = /** @type {{default:()=>null}} */ (
  /** @type {unknown} */ (notificationModule.namespace)
);
notificationComponent.default();
assert.ok(tapState.listener);
/** @param {Record<string,unknown>} data @param {string} [identifier] */
const tap = (data, identifier = 'notice') =>
  tapState.listener?.({
    notification: { request: { identifier, content: { data } } },
  });
tap({ type: 'cloud-storage' });
tap({ type: 'cloud-storage' });
assert.deepEqual(tapRoutes, ['/cloud-storage'], 'Cloud notice replay must not navigate twice');
tap({ exportSchedule: { deviceId: 'another-phone', profileId: 'a' } });
assert.equal(tapExports.length, 0, 'A foreign phone notification must not execute');
tap({ exportSchedule: { deviceId: session.deviceId, profileId: 'a' } });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(tapExports.length, 1);
assert.deepEqual(tapRoutes[1], { pathname: '/profiles/[id]', params: { id: 'a' } });
tap({ gripeReportId: 'removed-report', conversationId: 'removed-mobile-support' });
assert.equal(tapRoutes.length, 2, 'Removed mobile routes must not be opened');
tapState.cleanup?.();
assert.equal(tapState.removed, true);
tap({ type: 'cloud-storage' }, 'after-unmount');
assert.equal(tapRoutes.length, 2);
console.log(
  'Phone notification taps: cloud replay, owned exports, foreign-device denial and cleanup pass.',
);
