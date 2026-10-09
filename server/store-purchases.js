import { appleRoots, appleSigningKey, googleCredentials } from './purchase-credentials.js';
import { lifetimeProductId } from '../core/billing.js';
import { PairingError } from './errors.js';
/** Verify with Apple's certificate chain or Google Play's authenticated API. Never accept a client entitlement flag.
 * @param {{store:'ios'|'android',proof:string}} purchase */
export async function verifyStorePurchase(purchase) {
  const { SignedDataVerifier, AppStoreServerAPIClient, Environment, Type } =
    await import('@apple/app-store-server-library');
  const productId = process.env.LIFETIME_PRODUCT_ID ?? lifetimeProductId;
  if (purchase.store === 'ios') {
    const roots = appleRoots();
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
    if (!appleSigningKey() || !process.env.APPLE_IAP_KEY_ID || !process.env.APPLE_IAP_ISSUER_ID)
      throw new PairingError(503, 'App Store Server API is not configured.');
    const client = new AppStoreServerAPIClient(
      appleSigningKey() ?? '',
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
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    throw new PairingError(
      503,
      'Google Play verification is not configured. Your purchase can be restored later.',
    );
  const { GoogleAuth } = await import('google-auth-library');
  const credentials = googleCredentials();
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    ...(credentials ? { credentials } : {}),
  });
  const client = await auth.getClient();
  const app = encodeURIComponent(process.env.GOOGLE_PLAY_PACKAGE ?? 'com.codybontecou.sharedjsapp');
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${app}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchase.proof)}`;
  const { data } = await client.request({ url });
  const result = /** @type {{purchaseState?:number,consumptionState?:number}} */ (data);
  if (result.purchaseState !== 0 || result.consumptionState !== 0)
    throw new PairingError(403, 'A completed, non-consumable lifetime purchase is required.');
  return { store: purchase.store, id: purchase.proof, proof: purchase.proof };
}
