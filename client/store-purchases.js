import { errorJSON } from '../packages/support-chat/errors.js';
import { Platform } from 'react-native';
import { lifetimeProductId } from '../core/billing.js';
import { savePurchase, clearNativePurchase } from './billing.js';
/** @type {Promise<boolean>|null} */
let connection = null;
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
/** @param {(message:string)=>void} onError */
export async function connectStore(onError) {
  const iap = await store();
  const updates = iap.purchaseUpdatedListener((purchase) => {
    void deliver(purchase).catch((error) => onError(errorJSON(error)));
  });
  const errors = iap.purchaseErrorListener((error) => {
    if (error.code !== 'user-cancelled') onError(errorJSON(error));
  });
  try {
    connection ??= iap.initConnection();
    await connection;
  } catch (error) {
    updates.remove();
    errors.remove();
    throw error;
  }
  return () => {
    updates.remove();
    errors.remove();
    connection = null;
    void iap.endConnection();
  };
}
export async function lifetimeProduct() {
  const iap = await store();
  connection ??= iap.initConnection();
  await connection;
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
  const iap = await store();
  if (explicit && Platform.OS === 'ios') await iap.syncIOS();
  connection ??= iap.initConnection();
  await connection;
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
