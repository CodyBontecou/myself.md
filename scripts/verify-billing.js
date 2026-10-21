import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BillingStore } from '../server/billing-store.js';
import { exportAllowance } from '../core/billing.js';
import {
  purchaseAccountToken,
  subscriptionKey,
  verifyGooglePush,
  googleNotificationEvent,
} from '../server/store-subscriptions.js';
import { generateKeyPair, SignJWT } from 'jose';
import * as appleLibrary from '@apple/app-store-server-library';
import { decodeAppleNotification, decodeApplePurchase } from '../server/store-purchases.js';
const verifier = new appleLibrary.SignedDataVerifier(
  [],
  false,
  appleLibrary.Environment.SANDBOX,
  'com.myself.md',
);
for (const status of [
  appleLibrary.VerificationStatus.INVALID_ENVIRONMENT,
  appleLibrary.VerificationStatus.INVALID_CERTIFICATE,
  appleLibrary.VerificationStatus.RETRYABLE_VERIFICATION_FAILURE,
]) {
  const failure = new appleLibrary.VerificationException(status);
  assert.equal(failure.message, '');
  verifier.verifyAndDecodeTransaction = async () => {
    throw failure;
  };
  // oxlint-disable-next-line eslint/no-await-in-loop
  await assert.rejects(
    decodeApplePurchase(
      { library: appleLibrary, environment: appleLibrary.Environment.SANDBOX, verifier },
      'invalid-fixture-proof',
    ),
    (error) => {
      assert.ok(error instanceof Error && error.message.trim());
      assert.equal(
        /** @type {import('../server/errors.js').PairingError} */ (error).status,
        status === appleLibrary.VerificationStatus.RETRYABLE_VERIFICATION_FAILURE ? 503 : 403,
      );
      if (status === appleLibrary.VerificationStatus.INVALID_ENVIRONMENT)
        assert.match(error.message, /different store environment/);
      return true;
    },
  );
}
const notificationVerifier = new appleLibrary.SignedDataVerifier(
  [],
  false,
  appleLibrary.Environment.PRODUCTION,
  'com.myself.md',
  6821601165,
);
let alternateChecks = 0;
const notificationApple = {
  library: {
    ...appleLibrary,
    SignedDataVerifier: class extends appleLibrary.SignedDataVerifier {
      async verifyAndDecodeNotification(/** @type {string} */ proof) {
        alternateChecks++;
        if (proof === 'retry-other-environment')
          throw new appleLibrary.VerificationException(
            appleLibrary.VerificationStatus.RETRYABLE_VERIFICATION_FAILURE,
          );
        if (proof !== 'valid-other-environment')
          throw new appleLibrary.VerificationException(
            appleLibrary.VerificationStatus.INVALID_APP_IDENTIFIER,
          );
        return { notificationType: appleLibrary.NotificationTypeV2.TEST };
      }
    },
  },
  environment: appleLibrary.Environment.PRODUCTION,
  verifier: notificationVerifier,
};
/** @param {import('@apple/app-store-server-library').VerificationStatus} status */
async function verifyOtherNotificationEnvironment(status) {
  notificationVerifier.verifyAndDecodeNotification = async () => {
    throw new appleLibrary.VerificationException(status);
  };
  assert.equal(await decodeAppleNotification(notificationApple, 'valid-other-environment'), null);
  await assert.rejects(decodeAppleNotification(notificationApple, 'foreign-app'), {
    status: 401,
  });
}
await verifyOtherNotificationEnvironment(appleLibrary.VerificationStatus.INVALID_APP_IDENTIFIER);
await verifyOtherNotificationEnvironment(appleLibrary.VerificationStatus.INVALID_ENVIRONMENT);
await assert.rejects(decodeAppleNotification(notificationApple, 'retry-other-environment'), {
  status: 503,
});
const checksBeforeInvalidSignature = alternateChecks;
notificationVerifier.verifyAndDecodeNotification = async () => {
  throw new appleLibrary.VerificationException(appleLibrary.VerificationStatus.INVALID_CERTIFICATE);
};
await assert.rejects(decodeAppleNotification(notificationApple, 'forged-signature'), {
  status: 401,
});
assert.equal(alternateChecks, checksBeforeInvalidSignature);
notificationVerifier.verifyAndDecodeNotification = async () => {
  throw new appleLibrary.VerificationException(
    appleLibrary.VerificationStatus.RETRYABLE_VERIFICATION_FAILURE,
  );
};
await assert.rejects(decodeAppleNotification(notificationApple, 'ocsp-unavailable'), {
  status: 503,
});
assert.equal(alternateChecks, checksBeforeInvalidSignature);
notificationVerifier.verifyAndDecodeNotification = async () => ({
  notificationType: appleLibrary.NotificationTypeV2.TEST,
});
assert.deepEqual(await decodeAppleNotification(notificationApple, 'current-environment'), {
  notificationType: appleLibrary.NotificationTypeV2.TEST,
});
assert.equal(alternateChecks, checksBeforeInvalidSignature);
const notification = (/** @type {unknown} */ value) => ({
  message: {
    data: Buffer.from(
      JSON.stringify({ packageName: 'com.myself.md', .../** @type {object} */ (value) }),
    ).toString('base64'),
  },
});
const directory = mkdtempSync(join(tmpdir(), 'myself-billing-'));
const store = new BillingStore(join(directory, 'billing.sqlite'));
const peer = new BillingStore(join(directory, 'billing.sqlite'));
try {
  assert.deepEqual(store.snapshot('alice'), exportAllowance(0, 0, false));
  for (const kind of ['manual', 'schedule', 'mcp', 'cloud', 'share']) {
    store.reserve('alice', kind);
    peer.reserve('alice', kind);
    store.complete('alice', kind);
    peer.complete('alice', kind);
  }
  assert.equal(store.snapshot('alice').used, 5);
  assert.equal(store.snapshot('alice').remaining, 0);
  assert.throws(() => peer.reserve('alice', 'sixth'), /5 free exports/);
  store.release('alice', 'manual');
  assert.equal(store.snapshot('alice').used, 5);
  store.reserve('bob', 'failed');
  assert.equal(peer.snapshot('bob').remaining, 4);
  store.release('bob', 'failed');
  assert.equal(peer.snapshot('bob').remaining, 5);
  store.importUses('bob', ['offline-1', 'offline-2']);
  peer.importUses('bob', ['offline-1', 'offline-2']);
  assert.equal(store.snapshot('bob').used, 2);
  for (let i = 0; i < 3; i++) store.reserve('bob', `pending-${i}`);
  assert.throws(() => peer.reserve('bob', 'concurrent-sixth'), /5 free exports/);
  store.unlock('alice', { store: 'ios', id: 'verified-store-transaction', proof: 'fixture' });
  for (let i = 0; i < 10; i++) {
    store.reserve('alice', `paid-${i}`);
    store.complete('alice', `paid-${i}`);
  }
  assert.equal(store.snapshot('alice').unlocked, true);
  assert.throws(
    () => store.unlock('bob', { store: 'ios', id: 'verified-store-transaction', proof: 'fixture' }),
    /another account/,
  );
  store.revoke('alice');
  assert.equal(store.snapshot('alice').unlocked, false);
  assert.throws(() => store.reserve('alice', 'revoked'), /5 free exports/);
  const scope = JSON.stringify({ profileId: 'profile', days: ['2026-10-09'], formats: ['json'] });
  store.reserve('charlie', 'export', scope);
  store.requireUpload('charlie', 'export', 'profile', '2026-10-09', 'json');
  assert.throws(
    () => store.requireUpload('charlie', 'export', 'profile', '2026-10-10', 'json'),
    /outside/,
  );
  assert.throws(
    () => store.requireUpload('charlie', 'export', 'other-profile', '2026-10-09', 'json'),
    /outside/,
  );
  assert.throws(
    () => store.requireUpload('charlie', 'export', 'profile', '2026-10-09', 'jsonl'),
    /outside/,
  );
  assert.throws(
    () => store.requireUpload('bob', 'export', 'profile', '2026-10-09', 'json'),
    /Reserve/,
  );
  store.complete('charlie', 'export');
  store.requireUpload('charlie', 'export', 'profile', '2026-10-09', 'json');
  const accountToken = purchaseAccountToken('alice');
  assert.match(
    accountToken,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(purchaseAccountToken('alice'), accountToken);
  assert.notEqual(purchaseAccountToken('bob'), accountToken);
  const chain = subscriptionKey('android', 'purchase-chain');
  store.bindOwner(chain, 'alice');
  peer.bindOwner(chain, 'alice');
  assert.throws(() => peer.bindOwner(chain, 'bob'), /another.*account/);
  assert.throws(
    () => store.unlock('bob', { store: 'ios', id: 'verified-store-transaction', proof: 'fixture' }),
    /another.*account/,
    'Refund retains Lifetime ownership even after its entitlement row is removed',
  );
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const audience = 'https://myself.md/api/store/google/notifications';
  const email = 'push@fixture.iam.gserviceaccount.com';
  const key = async () => publicKey;
  const valid = await new SignJWT({ email, email_verified: true })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://accounts.google.com')
    .setAudience(audience)
    .setExpirationTime('5m')
    .sign(privateKey);
  await verifyGooglePush(`Bearer ${valid}`, audience, email, key);
  await assert.rejects(verifyGooglePush(null, audience, email, key), /required/);
  await assert.rejects(
    verifyGooglePush(`Bearer ${valid}`, `${audience}/wrong`, email, key),
    /invalid/,
  );
  await assert.rejects(
    verifyGooglePush(`Bearer ${valid}`, audience, 'other@fixture.com', key),
    /invalid/,
  );
  assert.equal(
    googleNotificationEvent(
      notification({
        oneTimeProductNotification: {
          notificationType: 1,
          purchaseToken: 'lifetime',
          sku: 'myself_md_lifetime',
        },
      }),
    ).kind,
    'ignored',
    'A successful Lifetime purchase notification is not a refund',
  );
  assert.equal(
    googleNotificationEvent(
      notification({
        voidedPurchaseNotification: {
          productType: 2,
          purchaseToken: 'lifetime',
        },
      }),
    ).kind,
    'lifetime',
  );
  console.log(
    'Billing: five shared uses, concurrent reservations, failures, retries, offline merge, purchase ownership, revocation, and cloud upload bounds passed.',
  );
} finally {
  store.db.close();
  peer.db.close();
  rmSync(directory, { recursive: true, force: true });
}
