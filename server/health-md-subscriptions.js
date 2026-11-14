import { z } from 'zod';
import { sorted } from '../core/collections.js';
import { PairingError } from './errors.js';
import { googleCredentials } from './purchase-credentials.js';

/** Health.md Android subscription status for its Settings › Subscription screen.
 * Play Billing exposes no renewal date on-device, so the app sends its own purchase token here.
 * This is read-only, grants nothing and is independent of myself.md's own subscriptions. */
const healthMdProducts = new Set(['health_md_premium_weekly', 'health_md_premium_yearly']);
const subscriptionsUrl =
  'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.healthmd.android/purchases/subscriptionsv2/tokens/';
const unavailable = 'Google Play subscription status is unavailable. Try again shortly.';
const notHealthMd = 'This is not an active Health.md Google Play subscription.';
/** @typedef {'active'|'grace'|'on_hold'|'paused'|'canceled'|'expired'|'pending'} HealthMdSubscriptionState */
/** @typedef {{productId:string,state:HealthMdSubscriptionState,expiresAt:string|null,autoRenewing:boolean,test:boolean}} HealthMdPlaySubscription */
/** @typedef {{request:(options:{url:string,timeout:number})=>Promise<{data:unknown}>}} GoogleRequester */

/** @type {Record<string,HealthMdSubscriptionState>} */
const states = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
  SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_CANCELED: 'canceled',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_PENDING: 'pending',
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
};
const requestSchema = z.object({ purchaseToken: z.string().min(1).max(30000) });
const googleSubscription = z
  .object({
    subscriptionState: z.string().optional(),
    testPurchase: z.unknown().optional(),
    lineItems: z
      .array(
        z
          .object({
            productId: z.string(),
            expiryTime: z.string().optional(),
            autoRenewingPlan: z
              .object({ autoRenewEnabled: z.boolean().optional() })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

/** @returns {Promise<GoogleRequester>} */
async function healthMdGoogleClient() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    throw new PairingError(503, 'Google Play subscription status is not configured.');
  const { GoogleAuth } = await import('google-auth-library');
  const credentials = googleCredentials();
  return new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    ...(credentials ? { credentials } : {}),
  }).getClient();
}
/** @param {unknown} error */
function googleStatus(error) {
  if (!error || typeof error !== 'object') return 0;
  const response = 'response' in error ? error.response : undefined;
  return Number(
    ('status' in error && error.status) ||
      (response && typeof response === 'object' && 'status' in response && response.status) ||
      0,
  );
}
/** @param {string|undefined} value */
function isoTime(value) {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Read one Health.md subscription from purchases.subscriptionsv2.get. Never echoes the token or account data.
 * @param {unknown} body @param {() => Promise<GoogleRequester>} [connect]
 * @returns {Promise<HealthMdPlaySubscription>} */
export async function readHealthMdPlaySubscription(body, connect = healthMdGoogleClient) {
  const input = requestSchema.safeParse(body);
  if (!input.success) throw new PairingError(400, 'A Google Play purchase token is required.');
  let data;
  try {
    const client = await connect();
    ({ data } = await client.request({
      url: subscriptionsUrl + encodeURIComponent(input.data.purchaseToken),
      timeout: 15000,
    }));
  } catch (error) {
    if (error instanceof PairingError) throw error;
    // Missing, malformed or foreign tokens are denials; credential, transport and Google failures stay retryable.
    throw [400, 404, 410].includes(googleStatus(error))
      ? new PairingError(403, notHealthMd)
      : new PairingError(503, unavailable);
  }
  const purchase = googleSubscription.safeParse(data);
  if (!purchase.success) throw new PairingError(503, unavailable);
  const lines = purchase.data.lineItems
    .filter((item) => healthMdProducts.has(item.productId))
    .map((item) => ({ item, expiresAt: isoTime(item.expiryTime) }));
  const [line] = sorted(
    lines,
    (a, b) => (Date.parse(b.expiresAt ?? '') || 0) - (Date.parse(a.expiresAt ?? '') || 0),
  );
  if (!line) throw new PairingError(403, notHealthMd);
  return {
    productId: line.item.productId,
    state: states[purchase.data.subscriptionState ?? ''] ?? 'expired',
    expiresAt: line.expiresAt,
    autoRenewing: line.item.autoRenewingPlan?.autoRenewEnabled === true,
    test: purchase.data.testPurchase !== undefined,
  };
}
