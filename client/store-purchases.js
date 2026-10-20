import { errorJSON } from '../packages/support-chat/errors.js';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { lifetimeProductId } from '../core/billing.js';
import { cloudPlanForProduct, cloudPlans, legacyCloudPlans } from '../core/cloud-plans.js';
import { sorted } from '../core/collections.js';
import { savePurchase, clearNativePurchase, acceptAllowance } from './billing.js';
import { api, loadSession } from './session.js';
import {
  acceptCloudStatus,
  cloudManageUrls,
  cloudPeriods,
  cloudStatusKey,
} from './cloud-storage.js';
import { qaEnabled } from './qa-runtime.js';
/** @type {Promise<boolean>|null} */
let connection = null;
/** Native listeners belong to the shared connection, not one screen. @type {null|(()=>void)} */
let removeStoreListeners = null;
let storeGeneration = 0;
/** @type {Set<(message:string)=>void>} */
const storeErrors = new Set();
/** Await an earlier shutdown before opening another native connection. @type {Promise<unknown>} */
let closingStore = Promise.resolve();
/** @type {null|{verify:(purchase:import('expo-iap').Purchase)=>Promise<void>,completed:()=>void}} */
let debugDelivery = null;
/** Scope real sandbox delivery to the isolated Debug route, without retaining normal purchase proof.
 * @param {(purchase:import('expo-iap').Purchase)=>Promise<void>} verify
 * @param {()=>void} completed */
export function sandboxPurchaseDelivery(verify, completed) {
  if (!__DEV__ || (Platform.OS !== 'ios' && Platform.OS !== 'android'))
    throw new Error('Sandbox QA requires a native Debug build.');
  const target = { verify, completed };
  debugDelivery = target;
  return () => {
    if (debugDelivery === target) debugDelivery = null;
  };
}
const productId = process.env.EXPO_PUBLIC_LIFETIME_PRODUCT_ID ?? lifetimeProductId;
/** Native adapter only; all payments go through StoreKit or Google Play Billing. */
async function store() {
  if (qaEnabled) throw new Error('Store purchases require a normal build, not QA fixtures.');
  if (Platform.OS !== 'ios' && Platform.OS !== 'android')
    throw new Error('Purchase or restore in the iOS or Android app.');
  const iap = await import('expo-iap');
  return iap;
}
/** @param {import('expo-iap').Purchase} purchase */
async function deliver(purchase) {
  if (purchase.productId !== productId || purchase.purchaseState !== 'purchased') return false;
  if (!purchase.purchaseToken)
    throw new Error('The store did not return purchase proof. Please restore purchases.');
  const debug = __DEV__ ? debugDelivery : null;
  const environment = 'environmentIOS' in purchase ? purchase.environmentIOS : null;
  if (__DEV__ && environment === 'Sandbox' && !debug)
    throw new Error('Restore this sandbox purchase in the isolated live cloud QA screen.');
  if (debug) {
    // Google identifies license-test purchases only in its authenticated server response.
    if (Platform.OS === 'ios' && environment !== 'Sandbox')
      throw new Error('Sandbox transaction required.');
    await debug.verify(purchase);
  } else
    await savePurchase({
      store: Platform.OS === 'ios' ? 'ios' : 'android',
      proof: purchase.purchaseToken,
    });
  const iap = await store();
  await iap.finishTransaction({ purchase, isConsumable: false });
  debug?.completed();
  return true;
}
/** One retryable initialization for offers, checkout, restore and the root listener owner. */
async function connectedStore() {
  const iap = await store();
  if (!connection) {
    /** @type {(()=>void)|undefined} */
    let remove;
    const generation = storeGeneration;
    const attempt = closingStore.then(async () => {
      if (generation !== storeGeneration)
        throw new Error('The store connection closed. Please try again.');
      const updates = iap.purchaseUpdatedListener((purchase) => {
        const delivery = cloudProductIds.has(purchase.productId)
          ? deliverCloudOnce(purchase)
          : deliver(purchase);
        void delivery.catch((error) => {
          if (!settleCloud({ kind: 'error', error }, purchase.productId))
            for (const onError of storeErrors) onError(errorJSON(error));
        });
      });
      try {
        const errors = iap.purchaseErrorListener((error) => {
          if (cloudOutcome && (!error.productId || error.productId === cloudOutcome.productId)) {
            settleCloud(cloudFailure(error), error.productId);
            return;
          }
          if (error.code !== 'user-cancelled')
            for (const onError of storeErrors) onError(errorJSON(error));
        });
        remove = () => {
          updates.remove();
          errors.remove();
        };
      } catch (error) {
        updates.remove();
        throw error;
      }
      if (!(await iap.initConnection()))
        throw new Error('The store connection could not be opened. Please try again.');
      if (generation !== storeGeneration)
        throw new Error('The store connection closed. Please try again.');
      removeStoreListeners = remove;
      return true;
    });
    const ready = attempt.catch((error) => {
      remove?.();
      if (connection === ready) connection = null;
      throw error;
    });
    connection = ready;
  }
  await connection;
  return iap;
}
/** @param {(message:string)=>void} onError */
export async function connectStore(onError) {
  storeErrors.add(onError);
  // Keep the root owner registered after a temporary failure. The next store operation retries.
  await connectedStore().catch(() => {});
  return () => {
    if (!storeErrors.delete(onError) || storeErrors.size) return;
    storeGeneration++;
    settleCloud({
      kind: 'error',
      error: new Error('The store connection closed. Please try again.'),
    });
    removeStoreListeners?.();
    removeStoreListeners = null;
    const pending = connection;
    connection = null;
    closingStore = Promise.allSettled([closingStore, pending]).then(async () => {
      const iap = await store();
      return iap.endConnection();
    });
    // Cleanup errors must not become unhandled rejections or poison the next attempt.
    closingStore = closingStore.catch(() => {});
  };
}
export async function lifetimeProduct() {
  const iap = await connectedStore();
  const products = await iap.fetchProducts({ skus: [productId], type: 'in-app' });
  const product = products?.find((item) => item.id === productId);
  if (
    !product ||
    product.type !== 'in-app' ||
    !product.displayPrice ||
    ('productStatusAndroid' in product &&
      typeof product.productStatusAndroid === 'string' &&
      product.productStatusAndroid !== 'ok')
  )
    throw new Error('Lifetime unlock is not available in the store yet. Please try again later.');
  return product;
}
export async function buyLifetime() {
  const iap = await store();
  const product = await lifetimeProduct();
  const offer =
    product.platform === 'android'
      ? product.discountOffers?.find(
          (item) => item.purchaseOptionIdAndroid === 'lifetime' && !item.id,
        )
      : undefined;
  await iap.requestPurchase({
    type: 'in-app',
    request: {
      apple: { sku: productId },
      google: {
        skus: [productId],
        ...(offer?.offerTokenAndroid ? { offerToken: offer.offerTokenAndroid } : {}),
      },
    },
  });
}
/** @param {boolean} [explicit] */
export async function restoreLifetime(explicit = false) {
  const iap = await connectedStore();
  if (explicit && Platform.OS === 'ios') await iap.syncIOS();
  const purchases = await iap.getAvailablePurchases();
  const purchase = purchases.find(
    (item) => item.productId === productId && item.purchaseState === 'purchased',
  );
  if (purchase) await deliver(purchase);
  else {
    if (!debugDelivery) await clearNativePurchase();
    if (explicit) throw new Error('No lifetime purchase was found for this store account.');
  }
}

/** @typedef {{kind:'verified',status:import('./cloud-storage.js').CloudStatus}|{kind:'pending'}|{kind:'cancelled'}|{kind:'error',error:unknown}} CloudPurchaseEvent */
const storeName = () => (Platform.OS === 'ios' ? 'ios' : 'android');
const cloudProductIds = new Set(
  [...cloudPlans, ...legacyCloudPlans].flatMap((plan) => [
    plan.ios.monthly,
    plan.ios.yearly,
    plan.android.productId,
  ]),
);
/** Resolves only the product's checkout the user started; unrelated store replays still verify.
 * @type {{productId:string,resolve:(event:CloudPurchaseEvent)=>void}|null} */
let cloudOutcome = null;
/** One server verification per store proof, whether it arrives as an event or a purchase result.
 * @type {Map<string,Promise<import('./cloud-storage.js').CloudStatus|undefined>>} */
const cloudDeliveries = new Map();
/** @param {CloudPurchaseEvent} event @param {string|null} [checkoutProductId] */
function settleCloud(event, checkoutProductId) {
  if (checkoutProductId && cloudOutcome?.productId !== checkoutProductId) return false;
  const resolve = cloudOutcome?.resolve;
  cloudOutcome = null;
  resolve?.(event);
  return Boolean(resolve);
}
/** @param {unknown} error @returns {CloudPurchaseEvent} */
function cloudFailure(error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'user-cancelled') return { kind: 'cancelled' };
  // Ask to Buy and slow payment methods complete later through the purchase listener.
  if (code === 'deferred-payment' || code === 'pending') return { kind: 'pending' };
  if (code === 'already-owned')
    return {
      kind: 'error',
      error: new Error(
        'This store account already has a cloud storage subscription. Tap Restore purchases to link it to your account, or Manage subscription to change it.',
      ),
    };
  return { kind: 'error', error };
}
async function signedInSession() {
  const session = await loadSession();
  if (!session?.owner || session.requiresSignIn) return null;
  return session;
}
/** Server verification binds the subscription to the account and returns the refreshed status.
 * @param {import('./session.js').Session} session @param {import('expo-iap').Purchase} purchase */
async function verifyCloudPurchase(session, purchase) {
  const status = /** @type {import('./cloud-storage.js').CloudStatus} */ (
    await api(session, '/api/cloud/subscription', {
      method: 'POST',
      body: JSON.stringify({
        store: storeName(),
        proof: purchase.purchaseToken,
        productId: purchase.productId,
      }),
    })
  );
  acceptCloudStatus(cloudStatusKey(session), status);
  if (status.appAccess) acceptAllowance(status.appAccess);
  return status;
}
/** Finish only after the server verified the proof. Google Play subscriptions are acknowledged by
 * the server during verification, so Android has no client-side finish step.
 * @param {import('expo-iap').Purchase} purchase */
async function finishCloudPurchase(purchase) {
  if (Platform.OS !== 'ios') return;
  const iap = await store();
  await iap.finishTransaction({ purchase, isConsumable: false });
}
/** @param {import('expo-iap').Purchase} purchase */
async function deliverCloud(purchase) {
  if (purchase.purchaseState === 'pending') {
    settleCloud({ kind: 'pending' }, purchase.productId);
    return;
  }
  if (purchase.purchaseState !== 'purchased') return;
  if (!purchase.purchaseToken)
    throw new Error('The store did not return subscription proof. Tap Restore purchases.');
  const session = await signedInSession();
  if (!session) {
    // Unfinished store transactions replay after sign-in, and Restore links them explicitly.
    if (cloudOutcome)
      throw new Error(
        'Sign in to myself.md, then tap Restore purchases to activate this subscription.',
      );
    return;
  }
  const status = await verifyCloudPurchase(session, purchase);
  await finishCloudPurchase(purchase);
  settleCloud({ kind: 'verified', status }, purchase.productId);
  return status;
}
/** @param {import('expo-iap').Purchase} purchase */
function deliverCloudOnce(purchase) {
  const key = purchase.purchaseToken ?? purchase.id;
  const existing = cloudDeliveries.get(key);
  if (existing) return existing;
  const delivery = deliverCloud(purchase).finally(() => cloudDeliveries.delete(key));
  cloudDeliveries.set(key, delivery);
  return delivery;
}

/** Localized store offers for every tier and period available to this store account.
 * @returns {Promise<import('./cloud-storage.js').CloudOffer[]>} */
export async function cloudOffers() {
  const iap = await connectedStore();
  const ios = Platform.OS === 'ios';
  const products =
    (await iap.fetchProducts({
      skus: ios
        ? cloudPlans.flatMap((plan) => [plan.ios.monthly, plan.ios.yearly])
        : cloudPlans.map((plan) => plan.android.productId),
      type: 'subs',
    })) ?? [];
  /** @type {import('./cloud-storage.js').CloudOffer[]} */
  const offers = [];
  for (const item of products) {
    if (item.type !== 'subs') continue;
    const product = /** @type {import('expo-iap').ProductSubscription} */ (item);
    if (product.platform === 'ios') {
      const match = cloudPlanForProduct('ios', product.id);
      if (match && product.displayPrice)
        offers.push({
          plan: match.plan.id,
          period: match.period,
          productId: product.id,
          title: product.displayName || product.displayNameIOS || product.title,
          displayPrice: product.displayPrice,
          offerToken: null,
        });
      continue;
    }
    const plan = cloudPlans.find((candidate) => candidate.android.productId === product.id);
    if (!plan || (product.productStatusAndroid && product.productStatusAndroid !== 'ok')) continue;
    for (const period of cloudPeriods) {
      const basePlanId = plan.android.basePlans[period];
      const candidates = product.subscriptionOffers.filter(
        (offer) => offer.basePlanIdAndroid === basePlanId && offer.offerTokenAndroid,
      );
      // Base plans carry no developer offer ID; prefer them over any promotional offer.
      const offer =
        candidates.find((candidate) => !candidate.id || candidate.id === basePlanId) ??
        candidates[0];
      const phases = offer?.pricingPhasesAndroid?.pricingPhaseList ?? [];
      const price = phases[phases.length - 1]?.formattedPrice || offer?.displayPrice;
      if (offer?.offerTokenAndroid && price)
        offers.push({
          plan: plan.id,
          period,
          productId: product.id,
          title: product.displayName || product.nameAndroid || product.title,
          displayPrice: price,
          offerToken: offer.offerTokenAndroid,
        });
    }
  }
  if (!offers.length)
    throw new Error(
      'Cloud storage plans are not available in the store yet. Please try again later.',
    );
  return offers;
}

/** Start checkout for a tier. Resolves once the store reports an outcome and, for a completed
 * payment, after the server verified it. The transaction is finished only after verification.
 * @param {import('./cloud-storage.js').CloudOffer} offer @returns {Promise<CloudPurchaseEvent>} */
export async function buyCloudPlan(offer) {
  if (cloudOutcome) throw new Error('A cloud storage purchase is already in progress.');
  const session = await signedInSession();
  if (!session) throw new Error('Sign in to myself.md before subscribing to cloud storage.');
  // A stable server-issued UUID lets the server reject a subscription bought for another account.
  const account = /** @type {{appAccountToken?:unknown}} */ (
    await api(session, '/api/cloud/purchase-account')
  );
  const appAccountToken = account.appAccountToken;
  if (typeof appAccountToken !== 'string' || !appAccountToken)
    throw new Error('Cloud storage checkout is unavailable right now. Please try again later.');
  if (Platform.OS === 'android' && !offer.offerToken)
    throw new Error('This plan is not available in Google Play yet. Please try again later.');
  const iap = await connectedStore();
  if (cloudOutcome) throw new Error('A cloud storage purchase is already in progress.');
  /** @type {Promise<CloudPurchaseEvent>} */
  const outcome = new Promise((resolve) => {
    cloudOutcome = { productId: offer.productId, resolve };
  });
  try {
    /** @type {import('expo-iap').RequestPurchaseResult|void} */
    let result;
    if (Platform.OS === 'ios') {
      // Apple moves between tiers of the same subscription group itself.
      result = await iap.requestPurchase({
        type: 'subs',
        request: { apple: { sku: offer.productId, appAccountToken } },
      });
    } else {
      // Google Play needs the current purchase token to replace a tier or billing period.
      const owned = (await iap.getAvailablePurchases()).find(
        (purchase) =>
          cloudProductIds.has(purchase.productId) &&
          purchase.purchaseState === 'purchased' &&
          purchase.purchaseToken,
      );
      // Verify the old chain belongs to this account before replacing its store entitlement.
      if (owned) await verifyCloudPurchase(session, owned);
      result = await iap.requestPurchase({
        type: 'subs',
        request: {
          google: {
            skus: [offer.productId],
            subscriptionOffers: [
              { sku: offer.productId, offerToken: /** @type {string} */ (offer.offerToken) },
            ],
            obfuscatedAccountId: appAccountToken,
            ...(owned?.purchaseToken
              ? {
                  purchaseToken: owned.purchaseToken,
                  subscriptionProductReplacementParams: {
                    oldProductId: owned.productId,
                    // Google forbids time-proration for base-plan changes within one product.
                    replacementMode:
                      owned.productId === offer.productId
                        ? 'charge-full-price'
                        : 'with-time-proration',
                  },
                }
              : {}),
          },
        },
      });
    }
    // Direct results belong to this request. A scheduled same-group change can still return
    // the current entitlement, while unrelated background listener events must not settle checkout.
    const purchases = Array.isArray(result) ? result : result ? [result] : [];
    for (const purchase of purchases) {
      if (!cloudProductIds.has(purchase.productId)) continue;
      if (purchase.purchaseState === 'pending') {
        settleCloud({ kind: 'pending' }, offer.productId);
        continue;
      }
      void deliverCloudOnce(purchase)
        .then((status) => {
          return status ? settleCloud({ kind: 'verified', status }, offer.productId) : false;
        })
        .catch((error) => settleCloud({ kind: 'error', error }, offer.productId));
    }
  } catch (error) {
    settleCloud(cloudFailure(error));
  }
  return outcome;
}

/** Link the store account's current cloud subscription to the signed-in account. */
export async function restoreCloudPlan() {
  const session = await signedInSession();
  if (!session) throw new Error('Sign in to myself.md before restoring a cloud storage plan.');
  const iap = await connectedStore();
  if (Platform.OS === 'ios') await iap.syncIOS();
  const purchase = sorted(
    (await iap.getAvailablePurchases()).filter(
      (item) =>
        cloudProductIds.has(item.productId) &&
        item.purchaseState === 'purchased' &&
        item.purchaseToken,
    ),
    (a, b) => b.transactionDate - a.transactionDate,
  )[0];
  if (!purchase)
    throw new Error('No active cloud storage subscription was found for this store account.');
  const status = await verifyCloudPurchase(session, purchase);
  await finishCloudPurchase(purchase);
  return status;
}

/** Open the store's subscription management for the store that bills the plan.
 * @param {'ios'|'android'} billedBy @param {string|null} androidProductId */
export async function manageCloudSubscription(billedBy, androidProductId) {
  if (billedBy !== Platform.OS) {
    await Linking.openURL(cloudManageUrls[billedBy]);
    return;
  }
  const iap = await store();
  await iap.deepLinkToSubscriptions({
    skuAndroid: androidProductId,
    packageNameAndroid: Constants.expoConfig?.android?.package ?? 'com.myself.md',
  });
}
