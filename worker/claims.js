import { DurableObject } from 'cloudflare:workers';
import { PairingError } from '../server/errors.js';
import { BillingStore } from '../server/billing-store.js';
import { importRows, exportRows, batchSchema } from './import.js';
import { objectDatabase } from './database.js';
/** One object per verified purchase preserves ownership across account partitions.
 * @augments {DurableObject<Env>} */
export class Purchase extends DurableObject {
  /** @param {DurableObjectState} ctx @param {Env} env */
  constructor(ctx, env) {
    super(ctx, env);
    this.billing = new BillingStore(objectDatabase(this.ctx.storage));
  }
  /** @param {import('./import.js').ImportBatch} value */
  importBatch(value) {
    importRows(this.billing.db, batchSchema.parse(value), [
      'billing_grants',
      'billing_purchases',
      'billing_claims',
    ]);
  }
  /** @param {string} table @param {number} offset */
  exportBatch(table, offset) {
    return exportRows(
      this.billing.db,
      ['billing_grants', 'billing_purchases', 'billing_claims'],
      table,
      offset,
    );
  }
  /** @param {{source:string,reference:string}} proof */
  createClaim(proof) {
    return this.billing.createClaim(proof);
  }
  /** @param {string} subject @param {string} ticket */
  claim(subject, ticket) {
    try {
      this.billing.claim(subject, ticket);
      const grant = this.billing.db
        .prepare('SELECT source,reference FROM billing_grants WHERE subject=?')
        .get(subject);
      if (!grant) throw new Error('Verified claim required.');
      return {
        ok: /** @type {const} */ (true),
        source: String(grant.source),
        reference: String(grant.reference),
      };
    } catch (error) {
      return failure(error);
    }
  }
  /** @param {string} subject @param {{store:string,id:string,proof:string}} purchase */
  unlock(subject, purchase) {
    try {
      this.billing.unlock(subject, purchase);
      return { ok: /** @type {const} */ (true) };
    } catch (error) {
      return failure(error);
    }
  }
  /** Preserve one-owner purchase protection without identity or receipt data.
   * @param {string} subject */
  forgetAccount(subject) {
    this.billing.db
      .prepare("UPDATE billing_purchases SET subject='deleted',proof='' WHERE subject=?")
      .run(subject);
    this.billing.db
      .prepare("UPDATE billing_grants SET subject='deleted' WHERE subject=?")
      .run(subject);
    this.billing.db.prepare('DELETE FROM billing_claims WHERE subject=?').run(subject);
  }
  /** @param {string} subject @param {string} source @param {string} reference */
  importGrant(subject, source, reference) {
    this.billing.grant(subject, source, reference);
  }
}

/** RPC does not preserve custom Error properties. Return expected denial states explicitly.
 * @param {unknown} error */
function failure(error) {
  if (!(error instanceof PairingError)) throw error;
  return { ok: /** @type {const} */ (false), status: error.status, error: error.message };
}
