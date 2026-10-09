import { readFileSync } from 'node:fs';
import {
  SignedDataVerifier,
  AppStoreServerAPIClient,
  Environment,
  Type,
} from '@apple/app-store-server-library';
import { GoogleAuth } from 'google-auth-library';
import { lifetimeProductId } from '../core/billing.js';
import { PairingError } from './store.js';
/** Verify with Apple's certificate chain or Google Play's authenticated API. Never accept a client entitlement flag.
 * @param {{store:'ios'|'android',proof:string}} purchase */
export async function verifyStorePurchase(purchase) {
  const productId = process.env.LIFETIME_PRODUCT_ID ?? lifetimeProductId;
  if (purchase.store === 'ios') {
    const roots = (process.env.APPLE_IAP_ROOT_CERTIFICATES ?? '')
      .split(',')
      .filter(Boolean)
      .map((path) => readFileSync(path));
    if (!roots.length)
      throw new PairingError(
        503,
        'Apple purchase verification is not configured. Your purchase can be restored later.',
      );
    const environment =
      process.env.IAP_SANDBOX === '1' ? Environment.SANDBOX : Environment.PRODUCTION;
    const appId = Number(process.env.APPLE_IAP_APP_ID);
    if (environment === Environment.PRODUCTION && !Number.isSafeInteger(appId))
      throw new PairingError(503, 'Apple app ID is not configured.');
    const verifier = new SignedDataVerifier(
      roots,
      true,
      environment,
      process.env.APPLE_IAP_BUNDLE_ID ?? 'com.myself.md',
      appId,
    );
    const supplied = await verifier.verifyAndDecodeTransaction(purchase.proof);
    if (!supplied.transactionId) throw new PairingError(403, 'Apple transaction ID is missing.');
    if (
      !process.env.APPLE_IAP_KEY_PATH ||
      !process.env.APPLE_IAP_KEY_ID ||
      !process.env.APPLE_IAP_ISSUER_ID
    )
      throw new PairingError(503, 'App Store Server API is not configured.');
    const client = new AppStoreServerAPIClient(
      readFileSync(process.env.APPLE_IAP_KEY_PATH, 'utf8'),
      process.env.APPLE_IAP_KEY_ID,
      process.env.APPLE_IAP_ISSUER_ID,
      process.env.APPLE_IAP_BUNDLE_ID ?? 'com.myself.md',
      environment,
    );
    const response = await client.getTransactionInfo(supplied.transactionId);
    if (!response.signedTransactionInfo)
      throw new PairingError(403, 'Apple transaction could not be verified.');
    const transaction = await verifier.verifyAndDecodeTransaction(response.signedTransactionInfo);
    if (
      transaction.productId !== productId ||
      transaction.type !== Type.NON_CONSUMABLE ||
      transaction.revocationDate ||
      !transaction.originalTransactionId
    )
      throw new PairingError(403, 'A valid lifetime purchase is required.');
    return { store: purchase.store, id: transaction.originalTransactionId, proof: purchase.proof };
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS)
    throw new PairingError(
      503,
      'Google Play verification is not configured. Your purchase can be restored later.',
    );
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
  const client = await auth.getClient();
  const app = encodeURIComponent(process.env.GOOGLE_PLAY_PACKAGE ?? 'com.codybontecou.sharedjsapp');
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${app}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchase.proof)}`;
  const { data } = await client.request({ url });
  const result = /** @type {{purchaseState?:number,consumptionState?:number}} */ (data);
  if (result.purchaseState !== 0 || result.consumptionState !== 0)
    throw new PairingError(403, 'A completed, non-consumable lifetime purchase is required.');
  return { store: purchase.store, id: purchase.proof, proof: purchase.proof };
}
