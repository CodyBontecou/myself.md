import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { cloudPlanForProduct } from '../core/cloud-plans.js';
import { subscriptionEntitled } from '../core/cloud-allowance.js';
import { sorted } from '../core/collections.js';
import { PairingError } from './errors.js';
import {
  appBundleId,
  appleClient,
  appleVerifier,
  googleApplicationUrl,
  googleClient,
  lifetimeProduct,
  playPackage,
} from './store-purchases.js';
/** Store truth for one subscription chain, plus the fields used for ownership and acknowledgement.
 * @typedef {import('./billing-store.js').StoreSubscription & {accountToken:string|null,acknowledged:boolean}} VerifiedSubscription */
/** @typedef {{verify:(store:'ios'|'android',proof:string)=>Promise<VerifiedSubscription>,read:(store:'ios'|'android',id:string)=>Promise<VerifiedSubscription>,acknowledge:(subscription:VerifiedSubscription)=>Promise<void>}} SubscriptionVerifier */
/** A verified store notification reduced to the purchase it concerns.
 * @typedef {{kind:'subscription',store:'ios'|'android',id:string,accountToken:string|null,linkedId:string|null,revoked:boolean}|{kind:'lifetime',store:'ios'|'android',id:string}|{kind:'ignored',reason:string}} StoreEvent */

const subscriptionInvalid = 'This subscription could not be verified.';
/** @param {'ios'|'android'} store @param {string} id */
export const subscriptionKey = (store, id) => `cloud-subscription|${store}|${id}`;
/** @param {string} token */
export const accountTokenKey = (token) => `cloud-account|${token}`;
/** Stable UUID shared with the stores as appAccountToken / obfuscatedAccountId. It identifies the account without exposing its subject.
 * @param {string} subject */
export function purchaseAccountToken(subject) {
  const hex = createHash('sha256')
    .update(`myself.md cloud purchase account|${subject}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
/** Missing, expired or foreign purchases are denials; transport and configuration failures stay retryable.
 * @param {unknown} error */
function storeDenial(error) {
  if (error instanceof PairingError) return error;
  const status =
    error && typeof error === 'object'
      ? Number(
          ('httpStatusCode' in error && error.httpStatusCode) ||
            ('status' in error && error.status) ||
            ('response' in error &&
              error.response &&
              typeof error.response === 'object' &&
              'status' in error.response &&
              error.response.status),
        )
      : 0;
  return [400, 404, 410].includes(status) ? new PairingError(403, subscriptionInvalid) : error;
}
/** @type {Record<number,import('../core/cloud-allowance.js').SubscriptionStatus>} */
const appleStatuses = { 1: 'active', 2: 'expired', 3: 'billing_retry', 4: 'grace', 5: 'revoked' };
/** Current App Store status for a subscription chain, from App Store Server API getAllSubscriptionStatuses.
 * @param {string} originalTransactionId @returns {Promise<VerifiedSubscription>} */
async function readAppleSubscription(originalTransactionId) {
  const apple = await appleVerifier();
  let response;
  try {
    response = await appleClient(apple).getAllSubscriptionStatuses(originalTransactionId);
  } catch (error) {
    throw storeDenial(error);
  }
  if (response.bundleId && response.bundleId !== appBundleId())
    throw new PairingError(403, subscriptionInvalid);
  const items = (response.data ?? []).flatMap((group) => group.lastTransactions ?? []);
  const item = items.find((entry) => entry.originalTransactionId === originalTransactionId);
  if (!item?.signedTransactionInfo) throw new PairingError(403, subscriptionInvalid);
  const transaction = await apple.verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
  const renewal = item.signedRenewalInfo
    ? await apple.verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo)
    : null;
  const product = cloudPlanForProduct('ios', transaction.productId ?? '');
  if (
    !product ||
    transaction.bundleId !== appBundleId() ||
    !transaction.originalTransactionId ||
    transaction.originalTransactionId !== originalTransactionId ||
    transaction.type !== apple.library.Type.AUTO_RENEWABLE_SUBSCRIPTION
  )
    throw new PairingError(403, subscriptionInvalid);
  const status = transaction.revocationDate
    ? 'revoked'
    : (appleStatuses[Number(item.status)] ?? 'expired');
  return {
    store: 'ios',
    id: transaction.originalTransactionId,
    product: String(transaction.productId),
    plan: product.plan.id,
    period: product.period,
    status,
    expiresAt:
      status === 'grace'
        ? (renewal?.gracePeriodExpiresDate ?? transaction.expiresDate ?? null)
        : (transaction.expiresDate ?? null),
    autoRenew: renewal?.autoRenewStatus === 1,
    linkedId: null,
    accountToken: (transaction.appAccountToken ?? renewal?.appAccountToken)?.toLowerCase() ?? null,
    acknowledged: true,
  };
}
const googleSubscription = z
  .object({
    subscriptionState: z.string().optional(),
    acknowledgementState: z.enum([
      'ACKNOWLEDGEMENT_STATE_PENDING',
      'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    ]),
    linkedPurchaseToken: z.string().optional(),
    testPurchase: z.unknown().optional(),
    externalAccountIdentifiers: z
      .object({ obfuscatedExternalAccountId: z.string().optional() })
      .passthrough()
      .optional(),
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
            offerDetails: z.object({ basePlanId: z.string().optional() }).passthrough().optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();
/** Current Google Play status from purchases.subscriptionsv2.get.
 * @param {string} token @returns {Promise<VerifiedSubscription>} */
async function readGoogleSubscription(token) {
  const client = await googleClient();
  let data;
  try {
    ({ data } = await client.request({
      url: `${googleApplicationUrl()}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
    }));
  } catch (error) {
    throw storeDenial(error);
  }
  const purchase = googleSubscription.parse(data);
  if ((purchase.testPurchase !== undefined) !== (process.env.IAP_SANDBOX === '1'))
    throw new PairingError(403, 'Purchase environment does not match this server.');
  const [line] = sorted(
    purchase.lineItems.flatMap((item) => {
      const product = cloudPlanForProduct(
        'android',
        item.productId,
        item.offerDetails?.basePlanId ?? '',
      );
      return product ? [{ item, product, expiresAt: Date.parse(item.expiryTime ?? '') }] : [];
    }),
    (a, b) => (b.expiresAt || 0) - (a.expiresAt || 0),
  );
  if (!line) throw new PairingError(403, subscriptionInvalid);
  const expiresAt = Number.isFinite(line.expiresAt) ? line.expiresAt : null;
  /** @type {import('../core/cloud-allowance.js').SubscriptionStatus} */
  const status =
    {
      SUBSCRIPTION_STATE_ACTIVE: /** @type {const} */ ('active'),
      SUBSCRIPTION_STATE_IN_GRACE_PERIOD: /** @type {const} */ ('grace'),
      SUBSCRIPTION_STATE_ON_HOLD: /** @type {const} */ ('billing_retry'),
      // Cancelled subscriptions keep access until the paid period ends.
      SUBSCRIPTION_STATE_CANCELED:
        expiresAt !== null && expiresAt > Date.now()
          ? /** @type {const} */ ('active')
          : /** @type {const} */ ('expired'),
    }[purchase.subscriptionState ?? ''] ?? 'expired';
  return {
    store: 'android',
    id: token,
    product: line.item.productId,
    plan: line.product.plan.id,
    period: line.product.period,
    status,
    expiresAt,
    autoRenew: line.item.autoRenewingPlan?.autoRenewEnabled === true,
    linkedId: purchase.linkedPurchaseToken ?? null,
    accountToken: purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    acknowledged: purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
  };
}
/** Google refunds subscriptions that remain unacknowledged for three days.
 * @param {VerifiedSubscription} subscription */
async function acknowledgeGoogleSubscription(subscription) {
  const client = await googleClient();
  await client.request({
    url: `${googleApplicationUrl()}/purchases/subscriptions/${encodeURIComponent(subscription.product)}/tokens/${encodeURIComponent(subscription.id)}:acknowledge`,
    method: 'POST',
    data: {},
  });
}
/** @type {SubscriptionVerifier} */
export const storeSubscriptions = {
  async verify(store, proof) {
    if (store === 'android') return readGoogleSubscription(proof);
    const apple = await appleVerifier();
    const supplied = await apple.verifier
      .verifyAndDecodeTransaction(proof)
      .catch(() => Promise.reject(new PairingError(403, subscriptionInvalid)));
    if (!supplied.originalTransactionId || !cloudPlanForProduct('ios', supplied.productId ?? ''))
      throw new PairingError(403, subscriptionInvalid);
    return readAppleSubscription(supplied.originalTransactionId);
  },
  read: (store, id) => (store === 'ios' ? readAppleSubscription(id) : readGoogleSubscription(id)),
  async acknowledge(subscription) {
    if (subscription.store === 'android' && !subscription.acknowledged)
      await acknowledgeGoogleSubscription(subscription);
  },
};
/** True when a verified Google subscription still needs server acknowledgement. @param {VerifiedSubscription} subscription */
export const needsAcknowledgement = (subscription) =>
  subscription.store === 'android' &&
  !subscription.acknowledged &&
  subscriptionEntitled(subscription);

/** App Store Server Notifications V2: verify the signed payload, then identify the purchase.
 * @param {unknown} body @returns {Promise<StoreEvent>} */
async function appleNotificationEvent(body) {
  const input = z.object({ signedPayload: z.string().min(1).max(200000) }).parse(body);
  const apple = await appleVerifier();
  let payload;
  try {
    payload = await apple.verifier.verifyAndDecodeNotification(input.signedPayload);
  } catch (error) {
    // Sandbox notifications may reach a production server through a shared URL.
    if (
      error instanceof apple.library.VerificationException &&
      error.status === apple.library.VerificationStatus.INVALID_ENVIRONMENT
    )
      return { kind: 'ignored', reason: 'environment' };
    throw new PairingError(401, 'App Store notification signature is invalid.');
  }
  if (payload.notificationType === 'TEST' || !payload.data?.signedTransactionInfo)
    return { kind: 'ignored', reason: 'no transaction' };
  const transaction = await apple.verifier.verifyAndDecodeTransaction(
    payload.data.signedTransactionInfo,
  );
  if (!transaction.originalTransactionId) return { kind: 'ignored', reason: 'no transaction' };
  if (transaction.productId === lifetimeProduct())
    return ['REFUND', 'REVOKE'].includes(String(payload.notificationType))
      ? { kind: 'lifetime', store: 'ios', id: transaction.originalTransactionId }
      : { kind: 'ignored', reason: 'lifetime unchanged' };
  if (!cloudPlanForProduct('ios', transaction.productId ?? ''))
    return { kind: 'ignored', reason: 'unknown product' };
  return {
    kind: 'subscription',
    store: 'ios',
    id: transaction.originalTransactionId,
    accountToken: transaction.appAccountToken?.toLowerCase() ?? null,
    linkedId: null,
    // Status is re-read from Apple, which reports refunds through revocationDate.
    revoked: false,
  };
}
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
/** Pub/Sub push authenticates with a Google-signed OIDC token for the configured service account.
 * @param {string|undefined|null} authorization @param {string} audience
 * @param {string|undefined} [email] @param {import('jose').JWTVerifyGetKey} [keys] */
export async function verifyGooglePush(
  authorization,
  audience,
  email = process.env.GOOGLE_PUBSUB_PUSH_SERVICE_ACCOUNT,
  keys = googleKeys,
) {
  if (!email) throw new PairingError(503, 'Google Play notifications are not configured.');
  const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw new PairingError(401, 'Pub/Sub OIDC token required.');
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    });
    if (payload.email !== email || payload.email_verified !== true) throw new Error('email');
  } catch {
    throw new PairingError(401, 'Pub/Sub OIDC token is invalid.');
  }
}
const developerNotification = z
  .object({
    packageName: z.string(),
    subscriptionNotification: z
      .object({ notificationType: z.number(), purchaseToken: z.string().min(1) })
      .passthrough()
      .optional(),
    oneTimeProductNotification: z
      .object({ notificationType: z.number(), purchaseToken: z.string().min(1), sku: z.string() })
      .passthrough()
      .optional(),
    voidedPurchaseNotification: z
      .object({ purchaseToken: z.string().min(1), productType: z.number() })
      .passthrough()
      .optional(),
  })
  .passthrough();
/** Google Play real-time developer notification from an authenticated Pub/Sub push.
 * @param {unknown} body @returns {StoreEvent} */
export function googleNotificationEvent(body) {
  const { message } = z
    .object({ message: z.object({ data: z.string().max(200000) }).passthrough() })
    .passthrough()
    .parse(body);
  const notification = developerNotification.parse(
    JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')),
  );
  if (notification.packageName !== playPackage())
    return { kind: 'ignored', reason: 'other package' };
  const voided = notification.voidedPurchaseNotification;
  if (voided)
    return voided.productType === 1
      ? {
          kind: 'subscription',
          store: 'android',
          id: voided.purchaseToken,
          accountToken: null,
          linkedId: null,
          revoked: true,
        }
      : { kind: 'lifetime', store: 'android', id: voided.purchaseToken };
  const oneTime = notification.oneTimeProductNotification;
  if (oneTime)
    return oneTime.sku === lifetimeProduct() && oneTime.notificationType === 2
      ? { kind: 'lifetime', store: 'android', id: oneTime.purchaseToken }
      : { kind: 'ignored', reason: 'lifetime unchanged or unknown product' };
  const subscription = notification.subscriptionNotification;
  if (subscription)
    return {
      kind: 'subscription',
      store: 'android',
      id: subscription.purchaseToken,
      accountToken: null,
      linkedId: null,
      // SUBSCRIPTION_REVOKED ends access immediately; subscriptionsv2 reports it only as expired.
      revoked: subscription.notificationType === 12,
    };
  return { kind: 'ignored', reason: 'test or unsupported notification' };
}
/** @typedef {{ownerOf:(key:string)=>Promise<string|null>,purchaseOwner:(store:'ios'|'android',id:string)=>Promise<string|null>,read:SubscriptionVerifier['read'],deliver:(subject:string,event:Exclude<StoreEvent,{kind:'ignored'}>)=>Promise<void>}} NotificationRoute */
/** Resolve the owning account: the bound purchase first, then the Google linked purchase, then the purchase-account token.
 * @param {Exclude<StoreEvent,{kind:'ignored'}>} event @param {NotificationRoute} route */
async function eventOwner(event, route) {
  if (event.kind === 'lifetime') return route.purchaseOwner(event.store, event.id);
  const bound = await route.ownerOf(subscriptionKey(event.store, event.id));
  if (bound) return bound;
  if (event.store === 'android' && !event.accountToken) {
    const current = await route.read('android', event.id);
    event.accountToken = current.accountToken;
    event.linkedId = current.linkedId;
  }
  return (
    (event.linkedId && (await route.ownerOf(subscriptionKey(event.store, event.linkedId)))) ||
    (event.accountToken && (await route.ownerOf(accountTokenKey(event.accountToken)))) ||
    null
  );
}
/** Shared Node and Worker handler for both store notification endpoints.
 * @param {'apple'|'google'} source @param {Uint8Array} bytes @param {string|undefined|null} authorization
 * @param {string} audience @param {NotificationRoute} route */
export async function handleStoreNotification(source, bytes, authorization, audience, route) {
  if (source === 'google') await verifyGooglePush(authorization, audience);
  let body;
  try {
    body = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new PairingError(400, 'Invalid notification body.');
  }
  const event =
    source === 'apple' ? await appleNotificationEvent(body) : googleNotificationEvent(body);
  if (event.kind === 'ignored') return { received: true, handled: false };
  try {
    const subject = await eventOwner(event, route);
    // Unbound purchases are bound when the app posts its proof; the store keeps the state.
    if (!subject) return { received: true, handled: false };
    await route.deliver(subject, event);
    return { received: true, handled: true };
  } catch (error) {
    if (error instanceof PairingError && [402, 403, 409].includes(error.status))
      return { received: true, handled: false };
    // Non-2xx responses make Apple and Pub/Sub retry later.
    throw error instanceof PairingError
      ? error
      : new PairingError(503, 'Notification could not be processed. Retry later.');
  }
}
