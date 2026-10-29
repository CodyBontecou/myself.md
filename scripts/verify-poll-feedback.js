import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { errorJSON, errorMessage } from '../packages/support-chat/errors.js';

// Run the real phone polling effect, controlling only transport and its clock.
const source = readFileSync('client/DataPanel.js', 'utf8');
const effect = source.match(
  /  useEffect\(\(\) => \{\n    if \(!session.server\) \{[\s\S]*?\n  \}, \[session, phoneCatalog, publish, acceptProfileSync, refreshLocation\]\);/,
)?.[0];
assert.ok(effect);
let fail = true;
let message = 'Your sign-in has expired. Open Settings → Account → Sign in again.';
let notifications = 0;
/** @type {(()=>void)|undefined} */ let tick;
/** @type {(()=>void)|undefined} */ let cleanup;
const context = vm.createContext({
  errorJSON,
  errorMessage,
  session: { server: 'https://fixture.test', deviceId: 'fixture' },
  AppState: { currentState: 'active' },
  useEffect: (/** @type {()=>()=>void} */ callback) => {
    cleanup = callback();
  },
  setTimeout: (/** @type {()=>void} */ callback) => {
    tick = callback;
    return 1;
  },
  clearTimeout: () => {},
  phoneCatalog: async () => ({ domains: [], profiles: [] }),
  api: async () => {
    if (fail) throw new Error(message);
    return { request: null, allowance: {} };
  },
  showToast: () => {
    notifications++;
  },
  recordDebug: () => {},
  version: { current: 0 },
  profileState: { current: { profiles: [] } },
  reviewWhoopRequest: async () => {},
  reviewPhoneExport: async () => {},
  acceptAllowance: () => {},
  acceptProfileSync: () => {},
  reviewLocationCapture: async () => {},
  setNotes: () => {},
  publish: () => {},
  refreshLocation: () => {},
});
vm.runInContext(effect, context);
const settle = () => new Promise((resolve) => setImmediate(resolve));
await settle();
assert.equal(notifications, 1);
// Represents dismissal followed by ten more background retries of the same error.
let retries = Promise.resolve();
for (let i = 0; i < 10; i++)
  retries = retries.then(() => {
    tick?.();
    return settle();
  });
await retries;
assert.equal(notifications, 1, 'Dismissing the toast must not be undone by the next poll');
message = 'Network unavailable';
tick?.();
await settle();
assert.equal(notifications, 2, 'A different failure must still be reported');
fail = false;
tick?.();
await settle();
fail = true;
tick?.();
await settle();
assert.equal(notifications, 3, 'A new outage after successful recovery must be reported');
cleanup?.();
tick?.();
await settle();
assert.equal(notifications, 3, 'A retired polling effect cannot notify');
console.log(
  'PASS repeated poll failures stay quiet; changed failures and failures after recovery notify.',
);
