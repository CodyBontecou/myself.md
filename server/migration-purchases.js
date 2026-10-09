import { appleRoots, appleSigningKey, googleCredentials } from './purchase-credentials.js';
import { z } from 'zod';
import { PairingError } from './errors.js';
const healthProducts = [
  'com.codybontecou.obsidianhealth.unlock',
  'com.codybontecou.obsidianhealth.unlock.family',
];
const isoProducts = ['com.bontecou.isome.lifetime.individual', 'com.bontecou.isome.lifetime'];
const proofSchema = z.object({
  app: z.enum(['health.md', 'iso.me']),
  store: z.enum(['ios', 'android']),
  kind: z.enum(['iap', 'app']),
  proof: z.string().min(1).max(30000),
});
/** Check decoded, server-verified evidence. Never call with client-decoded JSON.
 * @param {'health.md'|'iso.me'} app @param {'iap'|'app'} kind
 * @param {{productId?:string,type?:string,inAppOwnershipType?:string,revocationDate?:number,originalTransactionId?:string,appTransactionId?:string,originalPurchaseDate?:number}} evidence */
export function migrationEligibility(app, kind, evidence) {
  if (kind === 'app') {
    if (
      app !== 'health.md' ||
      !evidence.appTransactionId ||
      !evidence.originalPurchaseDate ||
      evidence.originalPurchaseDate >= Date.UTC(2026, 3, 26)
    )
      throw new PairingError(403, 'A qualifying original paid Health.md download is required.');
    return { source: 'health.md:ios:app', reference: evidence.appTransactionId };
  }
  const products = app === 'health.md' ? healthProducts : isoProducts;
  if (
    !products.includes(evidence.productId ?? '') ||
    evidence.type !== 'Non-Consumable' ||
    evidence.revocationDate ||
    evidence.inAppOwnershipType !== 'PURCHASED' ||
    !evidence.originalTransactionId
  )
    throw new PairingError(
      403,
      'A qualifying lifetime purchase owned by you is required. Restore purchases in your original app.',
    );
  return { source: `${app}:ios:iap`, reference: evidence.originalTransactionId };
}
/** @param {unknown} body */
export async function verifyMigrationPurchase(body) {
  const input = proofSchema.parse(body);
  if (input.store === 'android') {
    if (input.app !== 'health.md' || input.kind !== 'iap')
      throw new PairingError(403, 'This Android purchase is not eligible.');
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
      throw new PairingError(503, 'Google purchase verification is not configured.');
    const { GoogleAuth } = await import('google-auth-library');
    const credentials = googleCredentials();
    const client = await new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      ...(credentials ? { credentials } : {}),
    }).getClient();
    const { data } = await client.request({
      url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.healthmd.android/purchases/products/health_md_premium_lifetime/tokens/${encodeURIComponent(input.proof)}`,
    });
    const purchase = /** @type {{purchaseState?:number,consumptionState?:number}} */ (data);
    if (purchase.purchaseState !== 0 || purchase.consumptionState !== 0)
      throw new PairingError(403, 'A completed Health.md lifetime purchase is required.');
    return { source: 'health.md:android:iap', reference: input.proof };
  }
  const { SignedDataVerifier, AppStoreServerAPIClient, Environment } =
    await import('@apple/app-store-server-library');
  const roots = appleRoots();
  const appId = Number(
    input.app === 'health.md'
      ? process.env.HEALTH_MD_APPLE_APP_ID
      : process.env.ISO_ME_APPLE_APP_ID,
  );
  const bundleId =
    input.app === 'health.md' ? 'com.codybontecou.obsidianhealth' : 'com.bontecou.isome';
  const environment =
    process.env.IAP_SANDBOX === '1' ? Environment.SANDBOX : Environment.PRODUCTION;
  if (
    !roots.length ||
    !Number.isSafeInteger(appId) ||
    appId <= 0 ||
    !appleSigningKey() ||
    !process.env.APPLE_IAP_KEY_ID ||
    !process.env.APPLE_IAP_ISSUER_ID
  )
    throw new PairingError(503, 'Legacy Apple purchase verification is not configured.');
  const verifier = new SignedDataVerifier(roots, true, environment, bundleId, appId);
  const client = new AppStoreServerAPIClient(
    appleSigningKey() ?? '',
    process.env.APPLE_IAP_KEY_ID,
    process.env.APPLE_IAP_ISSUER_ID,
    bundleId,
    environment,
  );
  if (input.kind === 'app') {
    const supplied = await verifier.verifyAndDecodeAppTransaction(input.proof);
    if (!supplied.appTransactionId)
      throw new PairingError(403, 'Refresh your original app purchase and try again.');
    const current = await client.getAppTransactionInfo(supplied.appTransactionId);
    if (!current.signedAppTransactionInfo)
      throw new PairingError(403, 'Apple could not verify the original app purchase.');
    return migrationEligibility(
      input.app,
      input.kind,
      await verifier.verifyAndDecodeAppTransaction(current.signedAppTransactionInfo),
    );
  }
  const supplied = await verifier.verifyAndDecodeTransaction(input.proof);
  if (!supplied.transactionId) throw new PairingError(403, 'Purchase transaction ID is missing.');
  const current = await client.getTransactionInfo(supplied.transactionId);
  if (!current.signedTransactionInfo)
    throw new PairingError(403, 'Apple could not verify the lifetime purchase.');
  return migrationEligibility(
    input.app,
    input.kind,
    await verifier.verifyAndDecodeTransaction(current.signedTransactionInfo),
  );
}
