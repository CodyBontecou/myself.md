import { z } from 'zod';
import { PairingError } from './errors.js';
/** @template T @param {string} _subject @param {()=>Promise<T>} task @returns {Promise<T>} */
const runDirectly = (_subject, task) => task();
/** @returns {Promise<unknown>} */
const unchanged = async () => undefined;
/** @param {{billing:import('./billing-store.js').BillingStore,verifyStorePurchase:typeof import('./store-purchases.js').verifyStorePurchase,unlock:(subject:string,purchase:{store:string,id:string,proof:string})=>Promise<void>,revoked?:(subject:string)=>Promise<void>}} dependencies */
export function createBillingService({
  billing,
  verifyStorePurchase,
  unlock,
  revoked = async () => {},
}) {
  /** @type {<T>(subject:string,task:()=>Promise<T>)=>Promise<T>} */
  let run = runDirectly;
  /** @type {(subject:string)=>Promise<unknown>} */
  let changed = unchanged;
  /** Share the account entitlement/deletion queue after composition, without a module cycle.
   * @param {{run:typeof run,revoked:(subject:string)=>Promise<void>,changed:typeof changed}} lifecycle */
  function configureCloud(lifecycle) {
    run = lifecycle.run;
    revoked = lifecycle.revoked;
    changed = lifecycle.changed;
  }
  /** @param {string} subject @param {unknown} body */
  async function billingApi(subject, body) {
    const input = z
      .object({
        action: z.enum(['sync', 'reserve', 'complete', 'release', 'purchase']),
        id: z.string().min(1).max(200).optional(),
        scope: z
          .object({
            profileId: z.string().min(1).max(100),
            days: z
              .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
              .min(1)
              .max(31),
            formats: z
              .array(z.enum(['json', 'jsonl']))
              .min(1)
              .max(2),
          })
          .optional(),
        offlineUses: z.array(z.string().min(1).max(200)).max(5).default([]),
        purchase: z
          .object({ store: z.enum(['ios', 'android']), proof: z.string().min(1).max(30000) })
          .optional(),
      })
      .parse(body);
    await refreshEntitlement(subject);
    billing.importUses(subject, input.offlineUses);
    if (input.action === 'purchase') {
      if (!input.purchase) throw new Error('Purchase proof required.');
      await unlock(subject, await verifyStorePurchase(input.purchase));
      await changed(subject);
    } else if (input.action !== 'sync') {
      if (!input.id) throw new Error('Export ID required.');
      if (input.action === 'reserve')
        billing.reserve(subject, input.id, JSON.stringify(input.scope ?? {}));
      else billing[input.action](subject, input.id);
    }
    return billing.snapshot(subject);
  }

  /** Refresh directly with the original store; a phone heartbeat is not required.
   * A store denial revokes the purchase; `revoked` then removes Lifetime-only cloud storage.
   * @param {string} subject @param {boolean} [force] Skip the hourly cache, e.g. after a refund notification. */
  async function refreshUnlocked(subject, force = false) {
    if (billing.hasGrant(subject)) return;
    const purchase = billing.purchase(subject);
    if (!purchase || (!force && purchase.verified > Date.now() - 3600000)) return;
    try {
      await unlock(subject, await verifyStorePurchase(purchase));
    } catch (error) {
      if (error instanceof PairingError && error.status === 403) {
        billing.revoke(subject, purchase.store, purchase.id);
        await revoked(subject);
      } else throw error;
    }
  }
  /** @param {string} subject @param {boolean} [force] */
  function refreshEntitlement(subject, force = false) {
    return run(subject, () => refreshUnlocked(subject, force));
  }

  return {
    configureCloud,
    billingApi: (/** @type {string} */ subject, /** @type {unknown} */ body) =>
      run(subject, () => billingApi(subject, body)),
    refreshEntitlement,
  };
}
