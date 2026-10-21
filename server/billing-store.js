import { randomBytes, createHash } from 'node:crypto';
import { database, transaction } from './database.js';
import { exportAllowance, freeExports } from '../core/billing.js';
import { subscriptionEntitled } from '../core/cloud-allowance.js';
import { cloudPlan } from '../core/cloud-plans.js';
import { sorted } from '../core/collections.js';
import { PairingError } from './errors.js';
/** Verified store state for one subscription purchase chain.
 * @typedef {{store:'ios'|'android',id:string,product:string,plan:import('../core/cloud-plans.js').CloudPlanId,period:import('../core/cloud-plans.js').CloudPeriod,status:import('../core/cloud-allowance.js').SubscriptionStatus,expiresAt:number|null,autoRenew:boolean,linkedId:string|null}} StoreSubscription */
/** Undelivered or failed reminder. Channel states: 0 pending, 1 delivered, 2 unavailable.
 * @typedef {{id:string,kind:string,details:import('../core/cloud-notices.js').CloudNoticeContext,push:number,email:number,attempts:number}} PendingNotice */
/** @typedef {{kind:string,channel:string,at:number,message:string,retrying:boolean}} NoticeFailure */
export const subscriptionClaimed =
  'This subscription belongs to another myself.md account. Sign in to that account to restore it.';
const day = 86_400_000;
export class BillingStore {
  /** @param {string|import("./database.js").SqlDatabase} path */
  constructor(path) {
    this.db = database(path);
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS billing_uses (subject TEXT, id TEXT, state TEXT, scope TEXT, PRIMARY KEY(subject,id));
      CREATE TABLE IF NOT EXISTS billing_purchases (store TEXT, id TEXT, subject TEXT, proof TEXT, verified INTEGER, PRIMARY KEY(store,id));
      CREATE TABLE IF NOT EXISTS billing_grants (source TEXT, reference TEXT, subject TEXT, created INTEGER, PRIMARY KEY(source,reference));
      CREATE TABLE IF NOT EXISTS billing_claims (ticket TEXT PRIMARY KEY, source TEXT, reference TEXT, expires INTEGER, subject TEXT);
      CREATE TABLE IF NOT EXISTS cloud_owners (key TEXT PRIMARY KEY, subject TEXT);
      CREATE TABLE IF NOT EXISTS cloud_subscriptions (store TEXT, id TEXT, subject TEXT, product TEXT, plan TEXT, period TEXT, status TEXT, expires INTEGER, auto_renew INTEGER, linked TEXT, verified INTEGER, PRIMARY KEY(store,id));
      CREATE TABLE IF NOT EXISTS cloud_lapses (subject TEXT PRIMARY KEY, started INTEGER, delete_at INTEGER, target INTEGER, sent TEXT);
      CREATE TABLE IF NOT EXISTS cloud_notices (subject TEXT, id TEXT, kind TEXT, details TEXT, push INTEGER, email INTEGER, attempts INTEGER, error TEXT, channel TEXT, failed INTEGER, created INTEGER, PRIMARY KEY(subject,id));`);
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS cloud_revocations(subject TEXT PRIMARY KEY,created INTEGER,bytes INTEGER,plan TEXT)',
    );
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
    const subscription = this.cloudSubscription(subject);
    const cloudAccess = subscriptionEntitled(subscription);
    const lifetime = Boolean(paid) || complimentary;
    return {
      ...exportAllowance(
        Number(row?.used ?? 0),
        Number(row?.reserved ?? 0),
        lifetime || cloudAccess,
      ),
      ...(cloudAccess ? { lifetime, accessUntil: subscription?.expiresAt } : {}),
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
      EXISTS(SELECT 1 FROM billing_grants WHERE subject=?) OR ?`,
      )
      .run(
        subject,
        id,
        scope,
        subject,
        freeExports,
        subject,
        Date.now() - 86400000,
        subject,
        subscriptionEntitled(this.cloudSubscription(subject)) ? 1 : 0,
      );
    if (!result.changes)
      throw new PairingError(
        402,
        'Your 5 free exports have been used. Buy Lifetime or subscribe to Cloud in the phone app.',
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
   * @param {string} subject @param {string} id @param {string} profileId @param {string} exportDay @param {string} format */
  requireUpload(subject, id, profileId, exportDay, format) {
    this.requireReservation(subject, id);
    const row = this.db
      .prepare('SELECT scope FROM billing_uses WHERE subject=? AND id=?')
      .get(subject, id);
    const scope = /** @type {{profileId:string,days:string[],formats:string[]}} */ (
      JSON.parse(String(row?.scope || '{}'))
    );
    if (
      scope.profileId !== profileId ||
      !scope.days?.includes(exportDay) ||
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
    return transaction(this.db, () => {
      const row = this.db
        .prepare('SELECT source,reference,expires,subject FROM billing_claims WHERE ticket=?')
        .get(digest);
      if (!row || Number(row.expires) < Date.now())
        throw new PairingError(410, 'This claim expired. Start again in your original app.');
      if (row.subject && row.subject !== subject)
        throw new PairingError(409, 'This claim was already used by another account.');
      this.grant(subject, String(row.source), String(row.reference));
      this.db.prepare('UPDATE billing_claims SET subject=? WHERE ticket=?').run(subject, digest);
      return this.snapshot(subject);
    });
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
  /** @param {string} subject @param {string} [store] @param {string} [id] */
  revoke(subject, store, id) {
    for (const row of this.db
      .prepare('SELECT store,id FROM billing_purchases WHERE subject=?')
      .all(subject))
      this.bindOwner(`lifetime|${row.store}|${row.id}`, subject);
    if (store && id)
      this.db
        .prepare('DELETE FROM billing_purchases WHERE subject=? AND store=? AND id=?')
        .run(subject, store, id);
    else this.db.prepare('DELETE FROM billing_purchases WHERE subject=?').run(subject);
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
    this.bindOwner(`lifetime|${purchase.store}|${purchase.id}`, subject);
    this.db
      .prepare('INSERT OR REPLACE INTO billing_purchases VALUES (?,?,?,?,?)')
      .run(purchase.store, purchase.id, subject, purchase.proof, Date.now());
  }
  /** @param {string} subject @param {string} store @param {string} id */
  purchaseHeld(subject, store, id) {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM billing_purchases WHERE subject=? AND store=? AND id=?')
        .get(subject, store, id),
    );
  }
  /** @param {string} store @param {string} id */
  purchaseOwner(store, id) {
    const row = this.db
      .prepare('SELECT subject FROM billing_purchases WHERE store=? AND id=?')
      .get(store, id);
    return row ? String(row.subject) : this.owner(`lifetime|${store}|${id}`);
  }
  /** Lifetime held regardless of verification age, so a delayed hourly check never starts or cancels a lapse.
   * @param {string} subject */
  lifetimeHeld(subject) {
    return (
      this.hasGrant(subject) ||
      Boolean(this.db.prepare('SELECT 1 FROM billing_purchases WHERE subject=?').get(subject))
    );
  }
  /** One store subscription chain or purchase-account token binds to exactly one account.
   * @param {string} key @param {string} subject */
  bindOwner(key, subject) {
    this.db.prepare('INSERT OR IGNORE INTO cloud_owners VALUES (?,?)').run(key, subject);
    if (this.owner(key) !== subject) throw new PairingError(409, subscriptionClaimed);
  }
  /** @param {string} key */
  owner(key) {
    const row = this.db.prepare('SELECT subject FROM cloud_owners WHERE key=?').get(key);
    return row ? String(row.subject) : null;
  }
  /** @param {string} subject @param {StoreSubscription} value @param {number} [now] */
  saveSubscription(subject, value, now = Date.now()) {
    transaction(this.db, () => {
      const owner = this.db
        .prepare('SELECT subject FROM cloud_subscriptions WHERE store=? AND id=?')
        .get(value.store, value.id);
      if (owner && owner.subject !== subject) throw new PairingError(409, subscriptionClaimed);
      // Superseded Google tokens remain as chain history, never regain paid capacity on replay.
      if (
        this.db
          .prepare('SELECT 1 FROM cloud_subscriptions WHERE store=? AND linked=? AND subject=?')
          .get(value.store, value.id, subject)
      )
        return;
      if (value.linkedId)
        this.db
          .prepare(
            "UPDATE cloud_subscriptions SET status='expired',auto_renew=0 WHERE store=? AND id=? AND subject=?",
          )
          .run(value.store, value.linkedId, subject);
      this.db
        .prepare('INSERT OR REPLACE INTO cloud_subscriptions VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          value.store,
          value.id,
          subject,
          value.product,
          value.plan,
          value.period,
          value.status,
          value.expiresAt,
          value.autoRenew ? 1 : 0,
          value.linkedId,
          now,
        );
    });
  }
  /** @param {string} subject @returns {(StoreSubscription & {verified:number})[]} */
  subscriptions(subject) {
    return this.db
      .prepare('SELECT * FROM cloud_subscriptions WHERE subject=? ORDER BY verified DESC')
      .all(subject)
      .map((row) => ({
        store: /** @type {'ios'|'android'} */ (String(row.store)),
        id: String(row.id),
        product: String(row.product),
        plan: /** @type {import('../core/cloud-plans.js').CloudPlanId} */ (String(row.plan)),
        period: /** @type {import('../core/cloud-plans.js').CloudPeriod} */ (String(row.period)),
        status: /** @type {import('../core/cloud-allowance.js').SubscriptionStatus} */ (
          String(row.status)
        ),
        expiresAt: row.expires === null ? null : Number(row.expires),
        autoRenew: row.auto_renew === 1,
        linkedId: row.linked === null ? null : String(row.linked),
        verified: Number(row.verified),
      }));
  }
  /** The account's best subscription: paid capacity first, then the most recently verified.
   * Paid states without a successful store refresh end at their recorded provider expiry.
   * @param {string} subject @param {number} [now] @returns {import('../core/cloud-allowance.js').CloudSubscription|null} */
  cloudSubscription(subject, now = Date.now()) {
    const [best] = sorted(
      this.subscriptions(subject)
        .filter((row) => cloudPlan(row.plan))
        .map((row) => ({
          plan: row.plan,
          period: row.period,
          store: row.store,
          status:
            subscriptionEntitled(row) && (row.expiresAt === null || row.expiresAt <= now)
              ? /** @type {const} */ ('expired')
              : row.status,
          expiresAt: row.expiresAt,
          autoRenew: row.autoRenew,
        })),
      (a, b) =>
        Number(subscriptionEntitled(b)) - Number(subscriptionEntitled(a)) ||
        (subscriptionEntitled(a)
          ? (cloudPlan(b.plan)?.capacityBytes ?? 0) - (cloudPlan(a.plan)?.capacityBytes ?? 0)
          : 0),
    );
    return best ?? null;
  }
  /** @param {string} subject @param {number} [now] @returns {import('../core/cloud-allowance.js').CloudEntitlement} */
  cloudEntitlement(subject, now = Date.now()) {
    const access = this.snapshot(subject);
    return {
      lifetime: access.lifetime ?? access.unlocked,
      subscription: this.cloudSubscription(subject, now),
      lapse: this.lapse(subject)?.lapse ?? null,
    };
  }
  /** @param {string} subject @returns {{lapse:import('../core/cloud-allowance.js').CloudLapse,sent:number[]}|null} */
  lapse(subject) {
    const row = this.db.prepare('SELECT * FROM cloud_lapses WHERE subject=?').get(subject);
    if (!row) return null;
    return {
      lapse: {
        startedAt: Number(row.started),
        deleteAt: Number(row.delete_at),
        targetBytes: Number(row.target),
      },
      sent: /** @type {number[]} */ (JSON.parse(String(row.sent))),
    };
  }
  /** Persist a lapse decision. The same lapse keeps its reminder history.
   * @param {string} subject @param {import('../core/cloud-allowance.js').CloudLapse|null} lapse */
  setLapse(subject, lapse) {
    if (!lapse) {
      this.db.prepare('DELETE FROM cloud_lapses WHERE subject=?').run(subject);
      return;
    }
    if (this.lapse(subject)?.lapse.startedAt === lapse.startedAt) return;
    this.db
      .prepare("INSERT OR REPLACE INTO cloud_lapses VALUES (?,?,?,?,'[]')")
      .run(subject, lapse.startedAt, lapse.deleteAt, lapse.targetBytes);
  }
  /** @param {string} subject @param {number} startedAt @param {number[]} days */
  markRemindersSent(subject, startedAt, days) {
    const current = this.lapse(subject);
    if (current?.lapse.startedAt !== startedAt) return;
    this.db
      .prepare('UPDATE cloud_lapses SET sent=? WHERE subject=? AND started=?')
      .run(
        JSON.stringify(sorted([...new Set([...current.sent, ...days])], (a, b) => a - b)),
        subject,
        startedAt,
      );
  }
  /** @param {string} subject */
  hasSubscriptionHistory(subject) {
    return Boolean(
      this.db.prepare('SELECT 1 FROM cloud_subscriptions WHERE subject=?').get(subject),
    );
  }
  /** @param {string} subject @param {string} id @param {string} kind @param {PendingNotice['details']} details @param {number} [now] */
  queueNotice(subject, id, kind, details, now = Date.now()) {
    this.db
      .prepare('DELETE FROM cloud_notices WHERE subject=? AND created<? AND push<>0 AND email<>0')
      .run(subject, now - 90 * day);
    this.db
      .prepare('INSERT OR IGNORE INTO cloud_notices VALUES (?,?,?,?,0,0,0,NULL,NULL,NULL,?)')
      .run(subject, id, kind, JSON.stringify(details), now);
  }
  /** @param {string} subject @returns {PendingNotice[]} */
  pendingNotices(subject) {
    return this.db
      .prepare(
        'SELECT id,kind,details,push,email,attempts FROM cloud_notices WHERE subject=? AND (push=0 OR email=0) ORDER BY created,id',
      )
      .all(subject)
      .map((row) => ({
        id: String(row.id),
        kind: String(row.kind),
        details: JSON.parse(String(row.details)),
        push: Number(row.push),
        email: Number(row.email),
        attempts: Number(row.attempts),
      }));
  }
  /** Remove undelivered notices that a newer state supersedes.
   * @param {string} subject @param {string} prefix @param {string} [keep] */
  dropNotices(subject, prefix, keep = '') {
    this.db
      .prepare(
        'DELETE FROM cloud_notices WHERE subject=? AND substr(id,1,length(?))=? AND id<>? AND (push=0 OR email=0)',
      )
      .run(subject, prefix, prefix, keep);
  }
  /** @param {string} subject @param {string} id @param {{push:number,email:number,failure:{channel:string,message:string}|null}} result @param {number} [now] */
  noticeResult(subject, id, result, now = Date.now()) {
    if (result.failure)
      this.db
        .prepare(
          'UPDATE cloud_notices SET push=?,email=?,attempts=attempts+1,error=?,channel=?,failed=? WHERE subject=? AND id=?',
        )
        .run(
          result.push,
          result.email,
          result.failure.message,
          result.failure.channel,
          now,
          subject,
          id,
        );
    else
      this.db
        .prepare(
          'UPDATE cloud_notices SET push=?,email=?,attempts=attempts+1 WHERE subject=? AND id=?',
        )
        .run(result.push, result.email, subject, id);
  }
  /** Most recent delivery failure, without recipients or provider responses.
   * @param {string} subject @returns {NoticeFailure|null} */
  noticeFailure(subject) {
    const row = this.db
      .prepare(
        'SELECT kind,channel,failed,error,push,email FROM cloud_notices WHERE subject=? AND error IS NOT NULL ORDER BY failed DESC LIMIT 1',
      )
      .get(subject);
    return row
      ? {
          kind: String(row.kind),
          channel: String(row.channel),
          at: Number(row.failed),
          message: String(row.error),
          retrying: row.push === 0 || row.email === 0,
        }
      : null;
  }
  /** Persist deletion intent before asynchronous R2 work so failures survive restarts.
   * @param {string} subject @param {number} at @param {number} bytes @param {string|null} plan */
  queueRevocation(subject, at, bytes, plan) {
    this.db
      .prepare('INSERT OR IGNORE INTO cloud_revocations VALUES(?,?,?,?)')
      .run(subject, at, bytes, plan);
  }
  /** @param {string} subject */
  revocation(subject) {
    const row = this.db.prepare('SELECT * FROM cloud_revocations WHERE subject=?').get(subject);
    return row
      ? {
          at: Number(row.created),
          bytes: Number(row.bytes),
          plan: row.plan === null ? null : String(row.plan),
        }
      : null;
  }
  /** @param {string} subject */
  clearRevocation(subject) {
    this.db.prepare('DELETE FROM cloud_revocations WHERE subject=?').run(subject);
  }
  /** Accounts with lapse, notice or subscription work for self-hosted periodic maintenance. */
  cloudSubjects() {
    return this.db
      .prepare(
        "SELECT subject FROM cloud_revocations UNION SELECT subject FROM cloud_lapses UNION SELECT subject FROM cloud_notices WHERE push=0 OR email=0 UNION SELECT subject FROM cloud_subscriptions WHERE status<>'revoked'",
      )
      .all()
      .map((row) => String(row.subject));
  }
}
