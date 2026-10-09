import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as policy from '../core/billing.js';
const db = new DatabaseSync(':memory:');
const secure = new Map();
const sqlite = {
  openDatabaseSync: () => ({
    execSync: (/** @type {string} */ sql) => db.exec(sql),
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    getFirstSync: (sql, ...args) => db.prepare(sql).get(...args) ?? null,
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    getAllSync: (sql, ...args) => db.prepare(sql).all(...args),
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    runSync: (sql, ...args) => db.prepare(sql).run(...args),
  }),
};
/** @type {{owner:string,deviceId:string}|null} */
let signedInAccount = null;
const mocks = {
  './phone-database.js': { phoneDatabase: sqlite.openDatabaseSync },
  'expo-secure-store': {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock',
    getItemAsync: async (/** @type {string} */ key) => secure.get(key) ?? null,
    setItemAsync: async (/** @type {string} */ key, /** @type {string} */ value) => {
      secure.set(key, value);
    },
    deleteItemAsync: async (/** @type {string} */ key) => {
      secure.delete(key);
    },
  },
  '../core/billing.js': policy,
  './session.js': {
    loadSession: async () => signedInAccount,
    api: async () => {
      if (!signedInAccount) throw new Error('Unexpected network call for a local export.');
      return { used: 5, reserved: 0, remaining: 0, unlocked: true, complimentary: true };
    },
  },
};
async function load() {
  const module = new SourceTextModule(
    await readFile(new URL('../client/billing.js', import.meta.url), 'utf8'),
  );
  await module.link((name) => {
    const values = /** @type {Record<string,unknown>} */ (
      mocks[/** @type {keyof typeof mocks} */ (name)]
    );
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return /** @type {{allowance:()=>{used:number,unlocked:boolean,promptVersion:number},reserveExport:(context:{owner:string,deviceId:string},id:string)=>Promise<void>,settleExport:(context:{owner:string,deviceId:string},id:string,used:boolean)=>Promise<void>,takeBlockedPaywall:(version:number)=>boolean,markPaywallSeen:(milestone:2|5)=>void,paywallSeen:(milestone:2|5)=>boolean,savePurchase:(proof:{store:'ios'|'android',proof:string})=>Promise<void>,clearNativePurchase:()=>Promise<void>,acceptAllowance:(value:import('../core/billing.js').ExportAllowance)=>void,clearAccountAllowance:()=>void,syncBilling:(session:{owner:string,deviceId:string}|null)=>Promise<void>}} */ (
    module.namespace
  );
}
try {
  let billing = await load();
  const context = { owner: 'local-device', deviceId: 'local-device' };
  for (let i = 1; i <= 5; i++) {
    // Each operation depends on the quota left by the previous process.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await billing.reserveExport(context, `export-${i}`);
    // oxlint-disable-next-line eslint/no-await-in-loop
    await billing.settleExport(context, `export-${i}`, true);
    assert.equal(billing.allowance().used, i);
    // oxlint-disable-next-line eslint/no-await-in-loop
    billing = await load();
    assert.equal(billing.allowance().used, i);
  }
  await assert.rejects(billing.reserveExport(context, 'sixth'), /5 free exports/);
  assert.equal(billing.takeBlockedPaywall(billing.allowance().promptVersion), true);
  assert.equal(billing.takeBlockedPaywall(billing.allowance().promptVersion), false);
  billing.markPaywallSeen(2);
  assert.equal((await load()).paywallSeen(2), true);
  assert.equal(billing.paywallSeen(5), false);
  await billing.savePurchase({ store: 'ios', proof: 'native-store-fixture' });
  billing = await load();
  assert.equal(billing.allowance().unlocked, true);
  await billing.reserveExport(context, 'paid-export');
  await billing.settleExport(context, 'paid-export', true);
  await billing.clearNativePurchase();
  billing = await load();
  assert.equal(billing.allowance().unlocked, false);
  await assert.rejects(billing.reserveExport(context, 'refunded'), /5 free exports/);
  signedInAccount = { owner: 'alice', deviceId: '' };
  await billing.syncBilling(signedInAccount);
  assert.equal(
    billing.allowance().unlocked,
    true,
    'Account-only sign-in retrieves a grant without agent pairing.',
  );
  await billing.reserveExport(context, 'account-grant-local');
  await billing.settleExport(context, 'account-grant-local', true);
  signedInAccount = null;
  billing.acceptAllowance({
    used: 5,
    reserved: 0,
    remaining: 0,
    unlocked: true,
    complimentary: true,
  });
  billing = await load();
  assert.equal(billing.allowance().unlocked, true);
  await billing.savePurchase({ store: 'ios', proof: 'native-plus-grant' });
  await billing.clearNativePurchase();
  assert.equal(
    billing.allowance().unlocked,
    true,
    'Clearing a native receipt preserves a complimentary account grant.',
  );
  await billing.syncBilling(null);
  assert.equal(
    billing.allowance().unlocked,
    false,
    'A missing session cannot retain cached account access.',
  );
  billing.acceptAllowance({
    used: 5,
    reserved: 0,
    remaining: 0,
    unlocked: true,
    complimentary: true,
  });
  billing.clearAccountAllowance();
  assert.equal(billing.allowance().unlocked, false, 'Sign-out clears account access.');
  console.log(
    'Local billing: shared counter, blocked prompts, reminder persistence, offline lifetime access across process restarts, and refund clearing passed.',
  );
} finally {
  db.close();
}
