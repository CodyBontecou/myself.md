import {
  cloudAllowance,
  lifetimeCloudBytes,
  lifetimeEntitlement,
} from '../core/cloud-allowance.js';
import { cloudPlan, cloudPlans } from '../core/cloud-plans.js';

/** `GET /api/cloud/status` body. Server-only extras (plans, handoff, diagnostics) are not read by the phone.
 * @typedef {import('../core/cloud-allowance.js').CloudAllowance} CloudStatus */
/** A purchasable store subscription with its localized price.
 * @typedef {{plan:import('../core/cloud-plans.js').CloudPlanId,period:import('../core/cloud-plans.js').CloudPeriod,productId:string,title:string,displayPrice:string,offerToken:string|null}} CloudOffer */

export const cloudTermsUrl = 'https://myself.md/terms';
export const cloudPrivacyUrl = 'https://myself.md/privacy';
export const cloudPeriods = /** @type {const} */ (['monthly', 'yearly']);
/** Store subscription management, matching the server `handoff.manageUrls`. */
export const cloudManageUrls = {
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions?package=com.myself.md',
};
const day = 86_400_000;
/** Fixed synthetic time keeps recorded fixture deadlines repeatable without changing the device clock. */
export const qaCloudTime = Date.parse('2026-10-16T12:00:00.000Z');

/** Latest server status per signed-in account, shared by Settings and the plans screen. */
let latest = /** @type {{key:string,value:CloudStatus|null}} */ ({ key: '', value: null });
/** @type {Set<()=>void>} */ const listeners = new Set();
/** @param {{server:string,owner:string}} session */
export function cloudStatusKey(session) {
  return `${session.server}|${session.owner}`;
}
/** @param {string} key @param {CloudStatus|null} value */
export function acceptCloudStatus(key, value) {
  latest = { key, value };
  for (const listener of listeners) listener();
}
export function cloudStatusSnapshot() {
  return latest;
}
/** @param {()=>void} listener */
export function subscribeCloudStatus(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @param {number} bytes */
function formatCloudBytes(bytes) {
  if (bytes >= 1_000_000_000_000) return `${Number((bytes / 1_000_000_000_000).toFixed(1))} TB`;
  return bytes >= 1_000_000_000
    ? `${Number((bytes / 1_000_000_000).toFixed(1))} GB`
    : `${Number((bytes / 1_000_000).toFixed(1))} MB`;
}
/** @param {number} ms */
export function formatCloudDate(ms) {
  const date = new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${date} (UTC)`;
}
/** @param {import('../core/cloud-plans.js').CloudPeriod} period */
export function periodUnit(period) {
  return period === 'monthly' ? 'month' : 'year';
}
/** @param {CloudStatus['plan']} plan */
export function cloudPlanTitle(plan) {
  if (plan === 'none') return 'No cloud storage';
  if (plan === 'included') return '100 MB included with Lifetime';
  return `${cloudPlan(plan)?.label ?? plan} cloud storage plan`;
}
/** @param {'ios'|'android'} store */
function storeName(store) {
  return store === 'ios' ? 'App Store' : 'Google Play';
}

/** Warnings that need the owner's attention, most urgent first.
 * @param {CloudStatus} value @param {number} [now]
 * @returns {{id:'lapse'|'grace'|'billing-retry'|'over-limit',title:string,body:string}[]} */
export function cloudStatusNotices(value, now = Date.now()) {
  /** @type {{id:'lapse'|'grace'|'billing-retry'|'over-limit',title:string,body:string}[]} */
  const notices = [];
  const subscription = value.subscription;
  const label = subscription ? (cloudPlan(subscription.plan)?.label ?? subscription.plan) : '';
  if (value.lapse) {
    const date = formatCloudDate(value.lapse.deleteAt);
    const days = Math.max(0, Math.ceil((value.lapse.deleteAt - now) / day));
    notices.push({
      id: 'lapse',
      title: `At least ${formatCloudBytes(value.lapse.bytesToDelete)} of cloud exports will be deleted on ${date}`,
      body: `Paid cloud storage ended and your exports use ${formatCloudBytes(value.usedBytes)} of the ${formatCloudBytes(value.lapse.targetBytes)} included with Lifetime. ${days === 1 ? '1 day' : `${days} days`} left: on ${date} your oldest whole exports are deleted until usage is ${formatCloudBytes(value.lapse.targetBytes)} or less. Resubscribe, or delete enough cloud files before the deadline, to prevent this cleanup. Download files first to keep offline copies; downloading alone does not prevent cloud deletion.`,
    });
  }
  if (subscription?.status === 'grace')
    notices.push({
      id: 'grace',
      title: 'Payment problem · storage continues for now',
      body: `${storeName(subscription.store)} could not renew your ${label} plan. Your paid storage stays available during the store's billing grace period. Update your payment method in Manage subscription to keep it.`,
    });
  if (subscription?.status === 'billing_retry')
    notices.push({
      id: 'billing-retry',
      title: 'Payment problem · paid storage paused',
      body: `${storeName(subscription.store)} is retrying the payment for your ${label} plan. Until it succeeds your capacity is ${formatCloudBytes(value.limitBytes)}. Update your payment method in Manage subscription.`,
    });
  if (value.overLimit && !value.lapse)
    notices.push({
      id: 'over-limit',
      title: 'Storage allowance reached',
      body: 'Uploads that exceed your capacity are blocked. You can still download or delete older files; nothing is deleted because of this.',
    });
  return notices;
}

/** Synthetic cloud status for QA fixtures. No account, store or network state is read.
 * @param {import('./qa-fixtures.js').QaScenario} scenario @param {'ios'|'android'} store @param {number} [now]
 * @returns {CloudStatus|null} */
export function qaCloudStatus(scenario, store, now = qaCloudTime) {
  const mb = 1_000_000;
  /** @param {import('../core/cloud-plans.js').CloudPlanId} plan @param {import('../core/cloud-plans.js').CloudPeriod} period @param {import('../core/cloud-allowance.js').SubscriptionStatus} status @param {number} expiresAt @param {boolean} autoRenew */
  const subscription = (plan, period, status, expiresAt, autoRenew) => ({
    plan,
    period,
    store,
    status,
    expiresAt,
    autoRenew,
  });
  switch (scenario) {
    case 'loading':
      return null;
    case 'empty':
      return cloudAllowance(lifetimeEntitlement(true), 0);
    case 'cloud-no-lifetime':
      return cloudAllowance(lifetimeEntitlement(false), 0);
    case 'cloud-10gb':
      return cloudAllowance(
        {
          lifetime: true,
          subscription: subscription('cloud_10gb', 'monthly', 'active', now + 18 * day, true),
          lapse: null,
        },
        420 * mb,
      );
    case 'cloud-grace':
      return cloudAllowance(
        {
          lifetime: true,
          subscription: subscription('cloud_10gb', 'yearly', 'grace', now - 2 * day, true),
          lapse: null,
        },
        3_200 * mb,
      );
    case 'cloud-billing-retry':
      return cloudAllowance(
        {
          lifetime: true,
          subscription: subscription('cloud_10gb', 'monthly', 'billing_retry', now - 2 * day, true),
          lapse: {
            startedAt: now - 2 * day,
            deleteAt: now + 28 * day,
            targetBytes: lifetimeCloudBytes,
          },
        },
        250 * mb,
      );
    case 'cloud-lapse':
      return cloudAllowance(
        {
          lifetime: true,
          subscription: subscription('cloud_10gb', 'monthly', 'expired', now - 7 * day, false),
          lapse: {
            startedAt: now - 7 * day,
            deleteAt: now + 23 * day,
            targetBytes: lifetimeCloudBytes,
          },
        },
        250 * mb,
      );
    default:
      return cloudAllowance(lifetimeEntitlement(true), 42 * mb);
  }
}
/** Store-shaped offers with approved US prices, so fixtures render without StoreKit or Play Billing.
 * @param {'ios'|'android'} store @returns {CloudOffer[]} */
export function qaCloudOffers(store) {
  return cloudPlans.flatMap((plan) =>
    cloudPeriods.map((period) => ({
      plan: plan.id,
      period,
      productId: store === 'ios' ? plan.ios[period] : plan.android.productId,
      title: `Cloud Storage ${plan.label}`,
      displayPrice: plan.usPrice[period],
      offerToken: null,
    })),
  );
}
