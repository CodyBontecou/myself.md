import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { createExportSchedules } from '../server/export-schedules.js';

/** @typedef {{profileId:string,deviceId:string,enabledAt:string,kind:string,fireDate:string}} Hint */
/** @type {{_contentAvailable?:boolean,priority?:string,title?:string,body?:string,sound?:string,data:{exportSchedules:Hint[]}}[]} */
const messages = [];
const cloud = createExportSchedules(
  new DatabaseSync(':memory:'),
  () => {},
  async () => {},
  async (_url, options) => {
    messages.push(JSON.parse(String(options?.body)));
    return Response.json({ data: { status: 'ok' } });
  },
);
const registration = {
  deviceId: 'phone-a',
  token: 'ExponentPushToken[test]',
  backgroundNotifications: true,
  timeZone: 'America/Puerto_Rico',
  profiles: ['append', 'replace', 'new_file'].map((profileId) => ({
    profileId,
    enabledAt: '2026-10-18T10:00:00.000Z',
    schedule: { frequency: 'daily', dailyTimes: ['08:00', '08:20'] },
    lastCompleted: null,
    lastRefresh: null,
  })),
};
await cloud.register('owner-a', registration);
await cloud.dispatch('2026-10-18T12:00:01.000Z');
assert.equal(messages.length, 1, 'Batch simultaneous profiles into one phone wake');
const wake = messages[0];
assert.ok(wake);
assert.equal(wake['_contentAvailable'], true, 'Scheduled push must request background execution');
assert.equal(wake.priority, 'normal', 'Silent iOS wakes require APNs priority 5');
assert.equal(wake.title, undefined);
assert.equal(wake.body, undefined);
assert.equal(wake.sound, undefined);
assert.equal(wake.data.exportSchedules.length, 3);
assert.equal(cloud.list('owner-a')[0]?.profiles[0]?.lastCompleted, null);
await cloud.dispatch('2026-10-18T12:01:00.000Z');
assert.equal(messages.length, 1, 'Accepted wake checkpoints must prevent duplicate sends');
await cloud.dispatch('2026-10-18T12:20:01.000Z');
assert.equal(messages.length, 2, 'The second daily slot must send a distinct wake');
await cloud.register('owner-a', { ...registration, backgroundNotifications: false });
await cloud.dispatch('2026-10-19T12:00:01.000Z');
assert.equal(messages.length, 5, 'Legacy phones retain individual tap reminders');
assert.equal(messages.at(-1)?.sound, 'default');

/** @type {Map<string,(event:{data:unknown,error?:unknown})=>Promise<unknown>>} */
const callbacks = new Map();
/** @type {unknown[]} */
const received = [];
let registered = false;
let fail = false;
const mocks = {
  /** @param {string} name @param {(event:{data:unknown,error?:unknown})=>Promise<unknown>} callback */
  defineTask(name, callback) {
    callbacks.set(name, callback);
  },
  isTaskRegisteredAsync: async () => registered,
  registerTaskAsync: async () => {
    registered = true;
  },
  unregisterTaskAsync: async () => {
    registered = false;
  },
  BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 },
  /** @param {unknown} hint */
  openScheduledExport: async (hint) => {
    if (fail) throw new Error('Upload failed');
    received.push(hint);
    return true;
  },
};
const module = new SourceTextModule(
  await readFile(new URL('../client/export-notification-task.js', import.meta.url), 'utf8'),
);
await module.link(
  () =>
    new SyntheticModule(Object.keys(mocks), function () {
      for (const [name, value] of Object.entries(mocks)) this.setExport(name, value);
    }),
);
await module.evaluate();
const registrationModule = new SourceTextModule(
  await readFile(new URL('../client/export-notification-registration.js', import.meta.url), 'utf8'),
);
await registrationModule.link(
  () =>
    new SyntheticModule(Object.keys(mocks), function () {
      for (const [name, value] of Object.entries(mocks)) this.setExport(name, value);
    }),
);
await registrationModule.evaluate();
const reconcile =
  /** @type {{reconcileExportNotificationTask:(enabled:boolean)=>Promise<void>}} */ (
    /** @type {unknown} */ (registrationModule.namespace)
  ).reconcileExportNotificationTask;
assert.equal(callbacks.size, 1, 'Define the handler before mounting React');
const callback = callbacks.get('profile-export-notifications');
assert.ok(callback);
await reconcile(true);
assert.equal(registered, true);
const hints = wake.data.exportSchedules;
await callback({ data: { data: { dataString: JSON.stringify({ exportSchedules: hints }) } } });
assert.deepEqual(received, hints);
await callback({ data: { data: { exportSchedule: hints[0] } } });
assert.equal(received.length, 4);
await callback({ data: { data: { dataString: '{broken' } } });
await callback({ data: { actionIdentifier: 'default', notification: {} } });
await callback({ data: { data: { type: 'cloud-storage' } } });
assert.equal(received.length, 4, 'Malformed, unrelated and tap events do not dispatch');
fail = true;
assert.equal(await callback({ data: { data: { exportSchedule: hints[0] } } }), 2);
await reconcile(false);
assert.equal(registered, false, 'Disable removes the background notification consumer');
console.log(
  'Background export notifications: batched two-slot wakes, legacy fallback, headless handler, malformed input, failure and teardown passed.',
);
