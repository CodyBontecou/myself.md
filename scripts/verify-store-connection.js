import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as plans from '../core/cloud-plans.js';
import * as policy from '../core/billing.js';
import * as collections from '../core/collections.js';

const [plan] = plans.cloudPlans;
assert.ok(plan);
const offer = {
  plan: /** @type {const} */ ('cloud_10gb'),
  period: /** @type {const} */ ('monthly'),
  productId: plan.ios.monthly,
  title: '10 GB',
  displayPrice: '$2.99',
  offerToken: null,
};
function noClose() {}

/** Exercise the actual adapter with only native, session and storage boundaries replaced.
 * @param {{failures?:number,falseResult?:boolean,holdClose?:boolean}} [options] */
async function fixture({ failures = 0, falseResult = false, holdClose = false } = {}) {
  const state = { attempts: 0, checkouts: 0, finishes: 0, verifications: 0, closes: 0 };
  /** @type {Set<(value:unknown)=>void>} */
  const updates = new Set();
  /** @type {Set<(value:unknown)=>void>} */
  const errors = new Set();
  /** @type {unknown[]} */
  let purchases = [];
  /** @type {unknown} */
  let checkoutPurchase = null;
  let rejectVerification = false;
  /** @type {()=>void} */
  let finishClose = noClose;
  const closeGate = new Promise((resolve) => {
    finishClose = () => resolve(undefined);
  });
  const iap = {
    initConnection: async () => {
      state.attempts++;
      if (state.attempts > failures) return true;
      if (falseResult) return false;
      throw new Error('Temporary native connection failure');
    },
    purchaseUpdatedListener: (/** @type {(value:unknown)=>void} */ listener) => {
      updates.add(listener);
      return { remove: () => updates.delete(listener) };
    },
    purchaseErrorListener: (/** @type {(value:unknown)=>void} */ listener) => {
      errors.add(listener);
      return { remove: () => errors.delete(listener) };
    },
    endConnection: async () => {
      state.closes++;
      if (holdClose) await closeGate;
    },
    fetchProducts: async () => [
      { id: offer.productId, type: 'subs', platform: 'ios', displayPrice: '$2.99' },
    ],
    requestPurchase: async () => {
      state.checkouts++;
      if (checkoutPurchase) {
        queueMicrotask(() => {
          for (const listener of updates) listener(checkoutPurchase);
        });
        return;
      }
      throw Object.assign(new Error('Native test cancellation'), { code: 'user-cancelled' });
    },
    syncIOS: async () => {},
    getAvailablePurchases: async () => purchases,
    finishTransaction: async () => {
      state.finishes++;
    },
  };
  const mocks = {
    '../packages/support-chat/errors.js': { errorJSON: (/** @type {unknown} */ e) => String(e) },
    'react-native': { Linking: {}, Platform: { OS: 'ios' } },
    'expo-constants': { default: {} },
    '../core/billing.js': policy,
    '../core/cloud-plans.js': plans,
    '../core/collections.js': collections,
    './billing.js': { savePurchase: async () => {}, clearNativePurchase: async () => {} },
    './session.js': {
      loadSession: async () => ({ owner: 'qa', deviceId: 'qa' }),
      api: async (/** @type {unknown} */ _session, /** @type {string} */ path) => {
        if (path === '/api/cloud/purchase-account')
          return { appAccountToken: '00000000-0000-4000-8000-000000000001' };
        assert.equal(path, '/api/cloud/subscription');
        state.verifications++;
        if (rejectVerification) throw new Error('Purchase belongs to another account');
        return { plan: 'cloud_10gb', eligible: true };
      },
    },
    './cloud-storage.js': {
      acceptCloudStatus() {},
      cloudManageUrls: {},
      cloudPeriods: ['monthly', 'yearly'],
      cloudStatusKey: () => 'qa',
    },
    './qa-runtime.js': { qaEnabled: false },
    'expo-iap': iap,
  };
  /** @param {string} name */
  async function synthetic(name) {
    const values = /** @type {Record<string,unknown>} */ (
      mocks[/** @type {keyof typeof mocks} */ (name)]
    );
    assert.ok(values, name);
    const module = new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
    await module.link(() => {
      throw new Error('Unexpected synthetic dependency');
    });
    await module.evaluate();
    return module;
  }
  const module = new SourceTextModule(
    await readFile(new URL('../client/store-purchases.js', import.meta.url), 'utf8'),
    { importModuleDynamically: synthetic },
  );
  await module.link(synthetic);
  await module.evaluate();
  const api =
    /** @type {{connectStore:(onError:(message:string)=>void)=>Promise<()=>void>,buyCloudPlan:(offer:object)=>Promise<{kind:string}>,cloudOffers:()=>Promise<unknown[]>,restoreCloudPlan:()=>Promise<{plan:string}>}} */ (
      module.namespace
    );
  return {
    api,
    state,
    updates,
    errors,
    finishClose,
    setCheckoutPurchase: (/** @type {unknown} */ value) => (checkoutPurchase = value),
    rejectVerification: () => (rejectVerification = true),
    setPurchases: (/** @type {unknown[]} */ value) => (purchases = value),
  };
}

// Mirrors the root's caught startup failure followed by the owner's checkout action.
const retry = await fixture({ failures: 1 });
const closeRetry = await retry.api.connectStore(() => {}).catch(() => () => {});
assert.equal(retry.updates.size, 0, 'Failed initialization removes its native listeners');
assert.equal((await retry.api.buyCloudPlan(offer)).kind, 'cancelled');
assert.equal(retry.state.attempts, 2, 'Checkout retries after failed startup');
assert.equal(retry.state.checkouts, 1);
assert.equal(retry.updates.size, 1);
assert.equal(retry.errors.size, 1);
closeRetry();

const falseResult = await fixture({ failures: 1, falseResult: true });
await assert.rejects(falseResult.api.cloudOffers(), /connection could not be opened/);
assert.equal(falseResult.updates.size, 0);
assert.equal((await falseResult.api.buyCloudPlan(offer)).kind, 'cancelled');
assert.equal(falseResult.state.attempts, 2);

const concurrent = await fixture();
const [closeFirst, closeSecond] = await Promise.all([
  concurrent.api.connectStore(() => {}),
  concurrent.api.connectStore(() => {}),
  concurrent.api.cloudOffers(),
]);
assert.equal(concurrent.state.attempts, 1);
assert.equal(concurrent.updates.size, 1, 'Concurrent consumers share native listeners');
closeFirst();
assert.equal(concurrent.updates.size, 1, 'One owner cannot close another owner’s listeners');
closeFirst();
assert.equal(concurrent.state.closes, 0, 'Cleanup is idempotent');
closeSecond();
assert.equal(concurrent.updates.size, 0);
await concurrent.api.cloudOffers();
assert.equal(concurrent.state.attempts, 2);
assert.equal(concurrent.state.closes, 1);
assert.equal(concurrent.updates.size, 1);

const shutdown = await fixture({ holdClose: true });
const closeShutdown = await shutdown.api.connectStore(() => {});
closeShutdown();
const reopen = shutdown.api.cloudOffers();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(shutdown.state.attempts, 1, 'Reopening waits for native shutdown');
shutdown.finishClose();
await reopen;
assert.equal(shutdown.state.attempts, 2);
assert.equal(shutdown.updates.size, 1);

const restore = await fixture({ failures: 1 });
await restore.api.connectStore(() => {}).catch(() => {});
restore.setPurchases([
  {
    id: 'synthetic-transaction',
    productId: offer.productId,
    purchaseState: 'purchased',
    purchaseToken: 'synthetic-proof',
    transactionDate: 1,
  },
]);
assert.equal((await restore.api.restoreCloudPlan()).plan, 'cloud_10gb');
assert.equal(restore.state.attempts, 2);
assert.equal(restore.state.verifications, 1, 'Restore still requires server verification');
assert.equal(restore.state.finishes, 1, 'Only a verified restore is finished');
console.log(
  'Store connection: startup retry, false readiness, shared listeners, owner cleanup, shutdown ordering, native cancellation and verified restore passed.',
);

const purchase = {
  id: 'synthetic-checkout',
  productId: offer.productId,
  purchaseState: 'purchased',
  purchaseToken: 'synthetic-checkout-proof',
  transactionDate: 2,
};
const events = await fixture({ failures: 1 });
await events.api.connectStore(() => {}).catch(() => {});
events.setCheckoutPurchase(purchase);
assert.equal((await events.api.buyCloudPlan(offer)).kind, 'verified');
assert.equal(events.state.verifications, 1);
assert.equal(events.state.finishes, 1);
const rejected = await fixture();
rejected.setCheckoutPurchase(purchase);
rejected.rejectVerification();
assert.equal((await rejected.api.buyCloudPlan(offer)).kind, 'error');
assert.equal(rejected.state.verifications, 1);
assert.equal(rejected.state.finishes, 0, 'Rejected ownership cannot finish the native purchase');
