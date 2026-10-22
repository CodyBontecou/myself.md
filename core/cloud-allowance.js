import { cloudPlan } from './cloud-plans.js';
import { sorted } from './collections.js';

export const lifetimeCloudBytes = 100_000_000;
/** Days between a paid-storage lapse and deletion of the oldest exports above the included allowance. */
export const cloudRetentionDays = 30;
/** Lapse reminder offsets in days: the lapse itself, 7 days left, 1 day left. */
export const cloudReminderDays = [0, 23, 29];
const day = 86_400_000;

/** Store state after verification. Only `active` and `grace` grant paid capacity; billing retry and Google account hold do not.
 * @typedef {'active'|'grace'|'billing_retry'|'expired'|'revoked'} SubscriptionStatus */
/** @typedef {{plan:import('./cloud-plans.js').CloudPlanId,period:import('./cloud-plans.js').CloudPeriod,store:'ios'|'android',status:SubscriptionStatus,expiresAt:number|null,autoRenew:boolean}} CloudSubscription */
/** Pending deletion after paid storage ended with usage above the included allowance.
 * @typedef {{startedAt:number,deleteAt:number,targetBytes:number}} CloudLapse */
/** Server-derived account entitlement. Cloud subscriptions are independent of Lifetime access.
 * @typedef {{lifetime:boolean,subscription:CloudSubscription|null,lapse:CloudLapse|null,complimentaryCloud?:boolean}} CloudEntitlement */
/** @typedef {'none'|'included'|import('./cloud-plans.js').CloudPlanId} CloudPlanState */
/** @typedef {{eligible:boolean,plan:CloudPlanState,limitBytes:number,usedBytes:number,availableBytes:number,overLimit:boolean,retentionDays:number|null,subscription:CloudSubscription|null,lapse:(CloudLapse & {bytesToDelete:number})|null,complimentaryCloud?:boolean}} CloudAllowance */

/** @param {boolean} lifetime @returns {CloudEntitlement} */
export function lifetimeEntitlement(lifetime) {
  return { lifetime, subscription: null, lapse: null };
}
/** @param {CloudSubscription|null} subscription */
export function subscriptionEntitled(subscription) {
  return Boolean(
    subscription &&
    cloudPlan(subscription.plan) &&
    (subscription.status === 'active' || subscription.status === 'grace'),
  );
}
/** @param {CloudEntitlement} entitlement @returns {CloudPlanState} */
function cloudPlanState(entitlement) {
  if (entitlement.complimentaryCloud) return 'cloud_100gb';
  return subscriptionEntitled(entitlement.subscription) && entitlement.subscription
    ? entitlement.subscription.plan
    : entitlement.lifetime
      ? 'included'
      : 'none';
}
/** @param {CloudEntitlement} entitlement */
function cloudCapacity(entitlement) {
  const plan = cloudPlanState(entitlement);
  if (plan === 'none') return 0;
  if (plan === 'included') return lifetimeCloudBytes;
  return cloudPlan(plan)?.capacityBytes ?? 0;
}
/** @param {CloudEntitlement} entitlement @param {number} usedBytes @returns {CloudAllowance} */
export function cloudAllowance(entitlement, usedBytes) {
  const limitBytes = cloudCapacity(entitlement);
  const lapse = entitlement.lapse;
  return {
    ...(entitlement.complimentaryCloud ? { complimentaryCloud: true } : {}),
    eligible: limitBytes > 0,
    plan: cloudPlanState(entitlement),
    limitBytes,
    usedBytes,
    availableBytes: Math.max(0, limitBytes - usedBytes),
    overLimit: usedBytes > limitBytes,
    retentionDays: lapse ? cloudRetentionDays : null,
    subscription: entitlement.subscription,
    lapse: lapse ? { ...lapse, bytesToDelete: Math.max(0, usedBytes - lapse.targetBytes) } : null,
  };
}
/** @param {number} bytes */
function size(bytes) {
  return bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(bytes % 1_000_000_000 ? 1 : 0)} GB`
    : `${(bytes / 1_000_000).toFixed(0)} MB`;
}
/** @param {CloudAllowance} value */
export function cloudUsageLabel(value) {
  return `${(value.usedBytes / 1_000_000).toFixed(1)} MB of ${size(value.limitBytes)} used`;
}
/** Shared commit-capacity rule; entitlement and file validation remain required.
 * @param {CloudAllowance} value @param {number} bytes @param {number} [replacedBytes] */
export function cloudUploadFits(value, bytes, replacedBytes = 0) {
  return value.eligible && value.usedBytes - replacedBytes + bytes <= value.limitBytes;
}
/** Decide the pending deletion after an entitlement change.
 * A paid lapse uses the remaining Lifetime allowance, or zero for subscription-only accounts.
 * Restored paid capacity or usage at or below the allowance cancels it. An existing lapse keeps its original deadline.
 * @param {CloudEntitlement} entitlement @param {number} usedBytes @param {number} now @returns {CloudLapse|null} */
export function nextLapse(entitlement, usedBytes, now) {
  if (entitlement.complimentaryCloud || subscriptionEntitled(entitlement.subscription)) return null;
  const targetBytes = entitlement.lifetime ? lifetimeCloudBytes : 0;
  if (usedBytes <= targetBytes) return null;
  return entitlement.lapse
    ? { ...entitlement.lapse, targetBytes }
    : {
        startedAt: now,
        deleteAt: now + cloudRetentionDays * day,
        targetBytes,
      };
}
/** Reminder offsets that are due and not yet sent, oldest first.
 * @param {CloudLapse} lapse @param {readonly number[]} sentDays @param {number} now */
export function lapseRemindersDue(lapse, sentDays, now) {
  return cloudReminderDays.filter(
    (offset) =>
      !sentDays.includes(offset) && now >= lapse.startedAt + offset * day && now < lapse.deleteAt,
  );
}
/** Oldest exports to delete so remaining usage is at or below the target. Ties break by ID for determinism.
 * @param {readonly {id:string,size:number,created:number}[]} exports @param {number} targetBytes */
export function retentionVictims(exports, targetBytes) {
  let used = exports.reduce((sum, item) => sum + item.size, 0);
  /** @type {string[]} */
  const ids = [];
  for (const item of sorted(exports, (a, b) => a.created - b.created || (a.id < b.id ? -1 : 1))) {
    if (used <= targetBytes) break;
    ids.push(item.id);
    used -= item.size;
  }
  return ids;
}
