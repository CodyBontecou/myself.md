import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { exportAllowance, freeExports } from '../core/billing.js';
import { PairingError } from './store.js';
export class BillingStore {
  /** @param {string} path */
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS billing_uses (subject TEXT, id TEXT, state TEXT, scope TEXT, PRIMARY KEY(subject,id));
      CREATE TABLE IF NOT EXISTS billing_purchases (store TEXT, id TEXT, subject TEXT, proof TEXT, verified INTEGER, PRIMARY KEY(store,id));
      CREATE TABLE IF NOT EXISTS billing_grants (source TEXT, reference TEXT, subject TEXT, created INTEGER, PRIMARY KEY(source,reference));
      CREATE TABLE IF NOT EXISTS billing_claims (ticket TEXT PRIMARY KEY, source TEXT, reference TEXT, expires INTEGER, subject TEXT);`);
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
    const complimentary = this.hasGrant(subject);
    return {
      ...exportAllowance(
        Number(row?.used ?? 0),
        Number(row?.reserved ?? 0),
        Boolean(paid) || complimentary,
      ),
      ...(complimentary ? { complimentary: true } : {}),
    };
  }
  /** @param {string} subject @param {string} id @param {string} [scope] */
  reserve(subject, id, scope = '') {
    if (this.db.prepare('SELECT id FROM billing_uses WHERE subject=? AND id=?').get(subject, id))
      return;
    const result = this.db
      .prepare(
        `INSERT INTO billing_uses SELECT ?,?,'reserved',? WHERE
      (SELECT COUNT(*) FROM billing_uses WHERE subject=?) < ? OR
      EXISTS(SELECT 1 FROM billing_purchases WHERE subject=? AND verified>?) OR
      EXISTS(SELECT 1 FROM billing_grants WHERE subject=?)`,
      )
      .run(subject, id, scope, subject, freeExports, subject, Date.now() - 86400000, subject);
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
    for (const id of ids) {
      this.db
        .prepare("INSERT OR IGNORE INTO billing_uses VALUES (?,?,'complete','')")
        .run(subject, id);
      this.db
        .prepare("UPDATE billing_uses SET state='complete' WHERE subject=? AND id=?")
        .run(subject, id);
    }
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
  hasGrant(subject) {
    return Boolean(this.db.prepare('SELECT 1 FROM billing_grants WHERE subject=?').get(subject));
  }
  /** One purchase may grant lifetime access to one account. Repeating for that account is safe.
   * @param {string} subject @param {string} source @param {string} reference */
  grant(subject, source, reference) {
    this.db
      .prepare('INSERT OR IGNORE INTO billing_grants VALUES (?,?,?,?)')
      .run(source, reference, subject, Date.now());
    const owner = this.db
      .prepare('SELECT subject FROM billing_grants WHERE source=? AND reference=?')
      .get(source, reference);
    if (owner?.subject !== subject)
      throw new PairingError(409, 'This purchase has already been claimed by another account.');
  }
  /** Proofs never enter browser URLs. Only a short-lived random claim ticket does.
   * @param {{source:string,reference:string}} proof */
  createClaim(proof) {
    this.db.prepare('DELETE FROM billing_claims WHERE expires<?').run(Date.now());
    const ticket = randomBytes(32).toString('base64url');
    const digest = createHash('sha256').update(ticket).digest('hex');
    this.db
      .prepare('INSERT INTO billing_claims VALUES (?,?,?,?,NULL)')
      .run(digest, proof.source, proof.reference, Date.now() + 900000);
    return ticket;
  }
  /** @param {string} subject @param {string} ticket */
  claim(subject, ticket) {
    const digest = createHash('sha256').update(ticket).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db
        .prepare('SELECT source,reference,expires,subject FROM billing_claims WHERE ticket=?')
        .get(digest);
      if (!row || Number(row.expires) < Date.now())
        throw new PairingError(410, 'This claim expired. Start again in your original app.');
      if (row.subject && row.subject !== subject)
        throw new PairingError(409, 'This claim was already used by another account.');
      this.grant(subject, String(row.source), String(row.reference));
      this.db.prepare('UPDATE billing_claims SET subject=? WHERE ticket=?').run(subject, digest);
      this.db.exec('COMMIT');
      return this.snapshot(subject);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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
