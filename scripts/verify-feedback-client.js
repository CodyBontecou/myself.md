import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import * as errors from '../packages/support-chat/errors.js';

const settings = {
  companionEnabled: false,
  cropEnabled: true,
  drawingEnabled: true,
  titleEnabled: true,
  descriptionEnabled: true,
  tagsEnabled: true,
};
/** @type {{status:string,operationId:string,outcome:string,issueUrl:string,settings?:typeof settings}} */
let native = { status: 'ready', operationId: '', outcome: 'idle', issueUrl: '', settings };
let captures = 0;
let settingsWrites = 0;
let notificationWrites = 0;
let notificationsEnabled = false;

let toastMessage = '';
/** @type {Array<{text:string,onPress?:()=>void}>} */
let buttons = [];
const appState = { currentState: 'active' };
const bridge = {
  status: async () => native,
  configure: async (/** @type {Partial<typeof settings>} */ changes) => {
    settingsWrites++;
    native = { ...native, settings: { ...settings, ...changes } };
    return native;
  },
  open: async (/** @type {string} */ id) => {
    captures++;
    native = { ...native, operationId: id, outcome: 'running', issueUrl: '' };
    return native;
  },
};
/** @param {boolean} dev */
async function load(dev) {
  const context = createContext({ __DEV__: dev, Date });
  const source = new SourceTextModule(
    await readFile(new URL('../client/gripe.js', import.meta.url), 'utf8'),
    { context },
  );
  await source.link((specifier) => {
    const values =
      specifier === '../src/components/Toast.js'
        ? {
            showToast: (/** @type {{message:string}} */ toast) => {
              toastMessage = toast.message;
            },
          }
        : specifier === './feedback-updates.js'
          ? {
              configureReportReporter: async () => {},
              reportUpdatesSnapshot: () => ({ enabled: notificationsEnabled }),
              setReportNotifications: async (/** @type {boolean} */ enabled) => {
                notificationWrites++;
                notificationsEnabled = enabled;
              },
            }
          : specifier === '../packages/support-chat/errors.js'
            ? errors
            : specifier === 'expo'
              ? { requireOptionalNativeModule: () => bridge }
              : {
                  Platform: { OS: 'ios' },
                  AppState: appState,
                  Alert: {
                    /** @param {string} _title @param {string} _message @param {Array<{text:string,onPress?:()=>void}>} [actions] */
                    alert: (_title, _message, actions) => {
                      void _message;
                      buttons = actions ?? [];
                    },
                  },
                };
    return new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context },
    );
  });
  await source.evaluate();
  return /** @type {{openFeedback:()=>Promise<void>,requestFeedback:(request:{id:string,expiresAt:number,settings?:Partial<typeof settings>,notificationsEnabled?:boolean}|null,authorize:()=>Promise<unknown>)=>Promise<void>,feedbackState:()=>Promise<{availability:string,operation:null|{status:string,issueUrl?:string}}>}} */ (
    source.namespace
  );
}
const client = await load(true);
const request = { id: randomUUID(), expiresAt: Date.now() + 10000 };
await client.requestFeedback(request, async () => {
  throw new Error('Revoked');
});
assert.equal(captures, 0);
assert.equal((await client.feedbackState()).operation?.status, 'awaiting_user');
const approve = buttons.find((button) => button.text === 'Open feedback')?.onPress;
assert.ok(approve);
approve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(captures, 0);
assert.equal((await client.feedbackState()).operation?.status, 'failed');
const second = { id: randomUUID(), expiresAt: Date.now() + 10000 };
await client.requestFeedback(second, async () => ({ authorized: true }));
buttons.find((button) => button.text === 'Open feedback')?.onPress?.();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(captures, 1);
await client.requestFeedback(second, async () => {
  throw new Error('Must not reauthorize');
});
assert.equal(captures, 1);
assert.equal((await client.feedbackState()).operation?.status, 'running');
native = {
  ...native,
  outcome: 'completed',
  issueUrl: 'https://github.com/CodyBontecou/agent-bridge/issues/123',
};
assert.equal((await client.feedbackState()).operation?.status, 'completed');
native = { ...native, outcome: 'dry_run', issueUrl: '' };
assert.equal((await client.feedbackState()).operation?.status, 'failed');
const release = await load(false);
assert.equal((await release.feedbackState()).availability, 'unavailable');
await release.openFeedback();
assert.equal(
  toastMessage,
  'Screenshot feedback is disabled in this build. It currently requires an iOS Debug build.',
);
assert.equal(captures, 1);
native = { ...native, status: 'missing_key' };
await client.openFeedback();
assert.equal(toastMessage, 'Configure GRIPE_API_KEY and rebuild the iOS Debug app.');
console.log(
  'Feedback client: approval before capture, revocation denial, duplicate dispatch, native completion, dry-run isolation and Release gating pass.',
);

native = { ...native, status: 'ready' };
const settingRequest = {
  id: randomUUID(),
  expiresAt: Date.now() + 10000,
  settings: { companionEnabled: true, drawingEnabled: false },
};
await client.requestFeedback(settingRequest, async () => {
  throw new Error('Revoked');
});
buttons.find((button) => button.text === 'Apply settings')?.onPress?.();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(settingsWrites, 0);
const approvedSettings = { ...settingRequest, id: randomUUID() };
await client.requestFeedback(approvedSettings, async () => ({ authorized: true }));
assert.equal(settingsWrites, 0);
buttons.find((button) => button.text === 'Apply settings')?.onPress?.();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(settingsWrites, 1);
assert.equal((await client.feedbackState()).operation?.status, 'completed');
await client.requestFeedback(approvedSettings, async () => {
  throw new Error('Must not reauthorize');
});
assert.equal(settingsWrites, 1);
console.log(
  'Gripe settings: approval, revoked authorization, confirmed native values and safe retries pass.',
);

const deniedNotifications = {
  id: randomUUID(),
  expiresAt: Date.now() + 10000,
  notificationsEnabled: true,
};
await client.requestFeedback(deniedNotifications, async () => {
  throw new Error('Revoked');
});
assert.equal(notificationWrites, 0);
buttons.find((button) => button.text === 'Apply notifications')?.onPress?.();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(notificationWrites, 0);
assert.equal((await client.feedbackState()).operation?.status, 'failed');
const approvedNotifications = { ...deniedNotifications, id: randomUUID() };
await client.requestFeedback(approvedNotifications, async () => ({ authorized: true }));
assert.equal(notificationWrites, 0);
buttons.find((button) => button.text === 'Apply notifications')?.onPress?.();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(notificationWrites, 1);
assert.equal((await client.feedbackState()).operation?.status, 'completed');
await client.requestFeedback(approvedNotifications, async () => {
  throw new Error('Must not reauthorize');
});
assert.equal(notificationWrites, 1);
console.log(
  'Report notifications: owner approval, revoked authorization, saved preference and identical retry pass.',
);
