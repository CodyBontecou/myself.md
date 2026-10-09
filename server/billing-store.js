import { DatabaseSync } from 'node:sqlite';
import { exportAllowance, freeExports } from '../core/billing.js';
import { PairingError } from './store.js';
export class BillingStore {
  /** @param {string} path */
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS billing_uses (subject TEXT, id TEXT, state TEXT, scope TEXT, PRIMARY KEY(subject,id));
      CREATE TABLE IF NOT EXISTS billing_purchases (store TEXT, id TEXT, subject TEXT, proof TEXT, verified INTEGER, PRIMARY KEY(store,id));`);
    if (
      !this.db
        .prepare('PRAGMA table_info(billing_uses)')
        .all()
        .some((row) => row.name === 'scope')
    )
      this.db.exec("ALTER TABLE billing_uses ADD COLUMN scope TEXT DEFAULT ''");
  }
  /** @param {string} subject */
  snapshot(subject) {
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(state='complete'),0) used, COALESCE(SUM(state='reserved'),0) reserved FROM billing_uses WHERE subject=?",
      )
      .get(subject);
    const paid = this.db
      .prepare('SELECT id FROM billing_purchases WHERE subject=? AND verified>?')
      .get(subject, Date.now() - 86400000);
    return exportAllowance(Number(row?.used ?? 0), Number(row?.reserved ?? 0), Boolean(paid));
  }
  /** @param {string} subject @param {string} id @param {string} [scope] */
  reserve(subject, id, scope = '') {
    if (this.db.prepare('SELECT id FROM billing_uses WHERE subject=? AND id=?').get(subject, id))
      return;
    const result = this.db
      .prepare(
        `INSERT INTO billing_uses SELECT ?,?,'reserved',? WHERE
      (SELECT COUNT(*) FROM billing_uses WHERE subject=?) < ? OR
      EXISTS(SELECT 1 FROM billing_purchases WHERE subject=? AND verified>?)`,
      )
      .run(subject, id, scope, subject, freeExports, subject, Date.now() - 86400000);
    if (!result.changes)
      throw new PairingError(
        402,
        'Your 5 free exports have been used. Buy the $19.99 lifetime unlock in the phone app.',
      );
  }
  /** @param {string} subject @param {string} id */
  complete(subject, id) {
    const result = this.db
      .prepare("UPDATE billing_uses SET state='complete' WHERE subject=? AND id=?")
      .run(subject, id);
    if (!result.changes) throw new PairingError(403, 'Export allowance was not reserved.');
  }
  /** @param {string} subject @param {string} id */
  release(subject, id) {
    this.db
      .prepare("DELETE FROM billing_uses WHERE subject=? AND id=? AND state='reserved'")
      .run(subject, id);
  }
  /** Import offline uses once per operation. Connecting never replenishes the allowance.
   * @param {string} subject @param {string[]} ids */
  importUses(subject, ids) {
    for (const id of ids)
      this.db
        .prepare("INSERT OR IGNORE INTO billing_uses VALUES (?,?,'complete','')")
        .run(subject, id);
  }
  /** @param {string} subject @param {string} id */
  requireReservation(subject, id) {
    if (!this.db.prepare('SELECT id FROM billing_uses WHERE subject=? AND id=?').get(subject, id))
      throw new PairingError(403, 'Reserve an export allowance before uploading.');
  }
  /** Bind a reservation to one export's profile, date range, and formats. Retrying the same files cannot extend the allowance.
   * @param {string} subject @param {string} id @param {string} profileId @param {string} day @param {string} format */
  requireUpload(subject, id, profileId, day, format) {
    this.requireReservation(subject, id);
    const row = this.db
      .prepare('SELECT scope FROM billing_uses WHERE subject=? AND id=?')
      .get(subject, id);
    const scope = /** @type {{profileId:string,days:string[],formats:string[]}} */ (
      JSON.parse(String(row?.scope || '{}'))
    );
    if (
      scope.profileId !== profileId ||
      !scope.days?.includes(day) ||
      !scope.formats?.includes(format)
    )
      throw new PairingError(403, 'Upload is outside the reserved export.');
  }
  /** @param {string} subject */
  purchase(subject) {
    return /** @type {{store:'ios'|'android',id:string,proof:string,verified:number}|undefined} */ (
      this.db
        .prepare(
          'SELECT store,id,proof,verified FROM billing_purchases WHERE subject=? ORDER BY verified DESC LIMIT 1',
        )
        .get(subject)
    );
  }
  /** @param {string} subject */
  revoke(subject) {
    this.db.prepare('DELETE FROM billing_purchases WHERE subject=?').run(subject);
  }
  /** @param {string} subject @param {{store:string,id:string,proof:string}} purchase */
  unlock(subject, purchase) {
    const owner = this.db
      .prepare('SELECT subject FROM billing_purchases WHERE store=? AND id=?')
      .get(purchase.store, purchase.id);
    if (owner && owner.subject !== subject)
      throw new PairingError(
        409,
        'This purchase is linked to another account. Sign in to that account to restore.',
      );
    this.db
      .prepare('INSERT OR REPLACE INTO billing_purchases VALUES (?,?,?,?,?)')
      .run(purchase.store, purchase.id, subject, purchase.proof, Date.now());
  }
}
