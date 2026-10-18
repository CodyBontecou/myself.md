import { appleRoots, appleSigningKey, googleCredentials } from './purchase-credentials.js';
import { lifetimeProductId } from '../core/billing.js';
import { PairingError } from './errors.js';
export const appBundleId = () => process.env.APPLE_IAP_BUNDLE_ID ?? 'com.myself.md';
export const playPackage = () => process.env.GOOGLE_PLAY_PACKAGE ?? 'com.myself.md';
export const lifetimeProduct = () => process.env.LIFETIME_PRODUCT_ID ?? lifetimeProductId;
/** Translate Apple's message-less verification exceptions without accepting invalid proof.
 * @param {Awaited<ReturnType<typeof appleVerifier>>} apple @param {string} proof */
export async function decodeApplePurchase(apple, proof) {
  try {
    return await apple.verifier.verifyAndDecodeTransaction(proof);
  } catch (error) {
    if (!(error instanceof apple.library.VerificationException)) throw error;
    const reason = apple.library.VerificationStatus[error.status] ?? 'VERIFICATION_FAILURE';
    throw new PairingError(
      error.status === apple.library.VerificationStatus.RETRYABLE_VERIFICATION_FAILURE ? 503 : 403,
      error.status === apple.library.VerificationStatus.INVALID_ENVIRONMENT
        ? 'This Apple purchase belongs to a different store environment. Sandbox purchases cannot unlock production access.'
        : `Apple could not verify this purchase (${reason}). Please try restoring purchases again.`,
    );
  }
}
/** Apple's certificate-chain verifier for this server's environment (IAP_SANDBOX). */
export async function appleVerifier() {
  const library = await import('@apple/app-store-server-library');
  const roots = appleRoots();
  if (!roots.length)
    throw new PairingError(
      503,
      'Apple purchase verification is not configured. Your purchase can be restored later.',
    );
  const environment =
    process.env.IAP_SANDBOX === '1' ? library.Environment.SANDBOX : library.Environment.PRODUCTION;
  const appId = Number(process.env.APPLE_IAP_APP_ID);
  if (environment === library.Environment.PRODUCTION && !Number.isSafeInteger(appId))
    throw new PairingError(503, 'Apple app ID is not configured.');
  return {
    library,
    environment,
    verifier: new library.SignedDataVerifier(roots, true, environment, appBundleId(), appId),
  };
}
/** Authenticated App Store Server API client. @param {Awaited<ReturnType<typeof appleVerifier>>} apple */
export function appleClient(apple) {
  if (!appleSigningKey() || !process.env.APPLE_IAP_KEY_ID || !process.env.APPLE_IAP_ISSUER_ID)
    throw new PairingError(503, 'App Store Server API is not configured.');
  return new apple.library.AppStoreServerAPIClient(
    appleSigningKey() ?? '',
    process.env.APPLE_IAP_KEY_ID,
    process.env.APPLE_IAP_ISSUER_ID,
    appBundleId(),
    apple.environment,
  );
}
/** Google Play Developer API client with the androidpublisher scope. */
export async function googleClient() {
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
  return auth.getClient();
}
export const googleApplicationUrl = () =>
  `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(playPackage())}`;
/** Verify with Apple's certificate chain or Google Play's authenticated API. Never accept a client entitlement flag.
 * @param {{store:'ios'|'android',proof:string}} purchase */
export async function verifyStorePurchase(purchase) {
  const productId = lifetimeProduct();
  if (purchase.store === 'ios') {
    const apple = await appleVerifier();
    const supplied = await decodeApplePurchase(apple, purchase.proof);
    if (!supplied.transactionId) throw new PairingError(403, 'Apple transaction ID is missing.');
    const response = await appleClient(apple).getTransactionInfo(supplied.transactionId);
    if (!response.signedTransactionInfo)
      throw new PairingError(403, 'Apple transaction could not be verified.');
    const transaction = await decodeApplePurchase(apple, response.signedTransactionInfo);
    if (
      transaction.productId !== productId ||
      transaction.type !== apple.library.Type.NON_CONSUMABLE ||
      transaction.revocationDate ||
      !transaction.originalTransactionId
    )
      throw new PairingError(403, 'A valid lifetime purchase is required.');
    return { store: purchase.store, id: transaction.originalTransactionId, proof: purchase.proof };
  }
  const client = await googleClient();
  const url = `${googleApplicationUrl()}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchase.proof)}`;
  const { data } = await client.request({ url });
  const result =
    /** @type {{purchaseState?:number,consumptionState?:number,purchaseType?:number}} */ (data);
  if ((result.purchaseType === 0) !== (process.env.IAP_SANDBOX === '1'))
    throw new PairingError(403, 'Purchase environment does not match this server.');
  if (result.purchaseState !== 0 || result.consumptionState !== 0)
    throw new PairingError(403, 'A completed, non-consumable lifetime purchase is required.');
  return { store: purchase.store, id: purchase.proof, proof: purchase.proof };
}
