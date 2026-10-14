import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createContext, SourceTextModule, SyntheticModule, runInContext } from 'node:vm';
import * as policy from '../core/billing.js';
import { errorMessage } from '../packages/support-chat/errors.js';

const db = new DatabaseSync(':memory:');
/** @type {Map<number,{callback:()=>void,delay:number}>} */
const timers = new Map();
let timerId = 0;
let busy = false;
let error = '';
let mode = 'network';
let requestCount = 0;
/** @type {AbortSignal|undefined} */
let signal;
/** @type {(value:import('../core/billing.js').ExportAllowance)=>void} */
let finishRequest = () => {};
/** @type {(value:string|null)=>void} */
let finishStorage = () => {};
const session = { owner: 'fixture-owner', deviceId: '' };
const runtime = createContext({
  process: { env: {} },
  AbortController,
  setTimeout: (/** @type {()=>void} */ callback, /** @type {number} */ delay) => {
    timers.set(++timerId, { callback, delay });
    return timerId;
  },
  clearTimeout: (/** @type {number} */ id) => timers.delete(id),
  setBusy: (/** @type {boolean} */ value) => {
    busy = value;
  },
  setError: (/** @type {string} */ value) => {
    error = value;
  },
  errorMessage,
});
const mocks = {
  './phone-database.js': {
    phoneDatabase: () => ({
      execSync: (/** @type {string} */ sql) => db.exec(sql),
      getFirstSync: (
        /** @type {string} */ sql,
        /** @type {import('node:sqlite').SQLInputValue[]} */ ...args
      ) => db.prepare(sql).get(...args),
      getAllSync: (
        /** @type {string} */ sql,
        /** @type {import('node:sqlite').SQLInputValue[]} */ ...args
      ) => db.prepare(sql).all(...args),
      runSync: (
        /** @type {string} */ sql,
        /** @type {import('node:sqlite').SQLInputValue[]} */ ...args
      ) => db.prepare(sql).run(...args),
    }),
  },
  'expo-secure-store': {
    getItemAsync: () =>
      mode === 'storage'
        ? new Promise((resolve) => {
            finishStorage = resolve;
          })
        : Promise.resolve(null),
  },
  '../core/billing.js': policy,
  './session.js': {
    loadSession: async () => session,
    api: async (
      /** @type {unknown} */ _session,
      /** @type {string} */ path,
      /** @type {RequestInit} */ options,
    ) => {
      assert.equal(path, '/api/billing');
      requestCount++;
      signal = options.signal ?? undefined;
      if (mode === 'success') return policy.exportAllowance(0, 0, true);
      if (mode === 'failure') throw new Error('Billing service unavailable');
      // A stalled refresh/transport may ignore cancellation and return much later.
      return new Promise((resolve) => {
        finishRequest = resolve;
      });
    },
  },
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
try {
  const billing = new SourceTextModule(await readFile('client/billing.js', 'utf8'), {
    context: runtime,
  });
  await billing.link((name) => {
    const values = /** @type {Record<string,unknown>} */ (
      mocks[/** @type {keyof typeof mocks} */ (name)]
    );
    return new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context: runtime },
    );
  });
  await billing.evaluate();
  const run = (await readFile('client/PhoneProvider.js', 'utf8')).match(
    /  async function run\(action\) \{[\s\S]*?\n  \}/,
  )?.[0];
  assert.ok(run);
  runInContext(run, runtime);
  const billingAPI =
    /** @type {{syncBilling:(session:{owner:string,deviceId:string})=>Promise<void>,allowance:()=>import('../core/billing.js').ExportAllowance}} */ (
      billing.namespace
    );
  const check = () => runtime.run(() => billingAPI.syncBilling(session));
  const expire = () => {
    for (const timer of timers.values()) {
      if (timer.delay <= 15000) timer.callback();
    }
  };
  const pending = check();
  await flush();
  assert.equal(busy, true);
  expire();
  await flush();
  assert.equal(
    busy,
    false,
    'A stalled lifetime check must release Checking and the account controls within 15 seconds',
  );
  await pending;
  assert.match(error, /timed out.*try again/i);
  assert.equal(signal?.aborted, true, 'Timeout cancels the billing transport');
  assert.equal(timers.size, 0);
  finishRequest(policy.exportAllowance(0, 0, true));
  await flush();
  assert.equal(
    billingAPI.allowance().unlocked,
    false,
    'Late responses cannot overwrite allowance after a timeout',
  );

  mode = 'success';
  await check();
  assert.equal(busy, false);
  assert.equal(error, '');
  assert.equal(
    billingAPI.allowance().unlocked,
    true,
    'The user can retry successfully without signing out',
  );
  assert.equal(timers.size, 0);

  mode = 'storage';
  const beforeStorage = requestCount;
  const stalledStorage = check();
  await flush();
  expire();
  await flush();
  assert.equal(busy, false, 'A stalled keychain read also releases the UI');
  await stalledStorage;
  finishStorage(null);
  await flush();
  assert.equal(
    requestCount,
    beforeStorage,
    'A late keychain read cannot start a request after timeout',
  );
  assert.equal(
    billingAPI.allowance().unlocked,
    true,
    'Timeout preserves the last verified allowance',
  );

  mode = 'failure';
  await check();
  assert.equal(busy, false);
  assert.match(error, /Billing service unavailable/);
  assert.equal(timers.size, 0);
  console.log(
    'PASS lifetime check timeout, UI recovery, transport cancellation, late-response isolation, retry, keychain stall and ordinary failure.',
  );
} finally {
  db.close();
}
