import assert from 'node:assert/strict';
import { BillingStore } from '../server/billing-store.js';
import { migrationEligibility, verifyMigrationPurchase } from '../server/migration-purchases.js';
const store = new BillingStore(':memory:');
try {
  for (const productId of [
    'com.codybontecou.obsidianhealth.unlock',
    'com.codybontecou.obsidianhealth.unlock.family',
    'com.bontecou.isome.lifetime',
    'com.bontecou.isome.lifetime.individual',
  ]) {
    const app = productId.includes('isome') ? 'iso.me' : 'health.md';
    const evidence = {
      productId,
      type: 'Non-Consumable',
      inAppOwnershipType: 'PURCHASED',
      originalTransactionId: productId,
    };
    const proof = migrationEligibility(app, 'iap', evidence);
    const ticket = store.createClaim(proof);
    assert.equal(store.claim('alice', ticket).unlocked, true);
    assert.equal(store.claim('alice', ticket).unlocked, true);
    assert.throws(() => store.claim('bob', ticket), /another account/);
    assert.throws(() => store.claim('bob', store.createClaim(proof)), /another account/);
    assert.throws(
      () => migrationEligibility(app, 'iap', { ...evidence, revocationDate: 1 }),
      /qualifying/,
    );
    assert.throws(
      () => migrationEligibility(app, 'iap', { ...evidence, inAppOwnershipType: 'FAMILY_SHARED' }),
      /qualifying/,
    );
  }
  assert.throws(
    () =>
      migrationEligibility('health.md', 'iap', {
        productId: 'com.bontecou.isome.lifetime',
        type: 'Non-Consumable',
        originalTransactionId: 'wrong-app',
      }),
    /qualifying/,
  );
  assert.throws(
    () =>
      migrationEligibility('iso.me', 'app', {
        appTransactionId: 'free-download',
        originalPurchaseDate: 1,
      }),
    /qualifying/,
  );
  const cutoff = Date.UTC(2026, 3, 26);
  const legacy = migrationEligibility('health.md', 'app', {
    appTransactionId: 'legacy-download',
    originalPurchaseDate: cutoff - 1,
  });
  assert.throws(
    () =>
      migrationEligibility('health.md', 'app', {
        appTransactionId: 'free-download',
        originalPurchaseDate: cutoff,
      }),
    /qualifying/,
  );
  const ticket = store.createClaim(legacy);
  store.db.exec('UPDATE billing_claims SET expires=0 WHERE subject IS NULL');
  assert.throws(() => store.claim('alice', ticket), /expired/);
  assert.throws(() => store.claim('alice', 'unknown'), /expired/);
  store.grant('carol', 'time.md:stripe', 'pi_fixture');
  store.grant('carol', 'time.md:stripe', 'pi_fixture');
  assert.throws(() => store.grant('bob', 'time.md:stripe', 'pi_fixture'), /another account/);
  store.revoke('carol');
  for (let i = 0; i < 8; i++) {
    store.reserve('carol', `grant-${i}`);
    store.complete('carol', `grant-${i}`);
  }
  assert.equal(store.snapshot('carol').complimentary, true);
  assert.equal(store.snapshot('bob').unlocked, false);
  await assert.rejects(
    verifyMigrationPurchase({ app: 'iso.me', store: 'android', kind: 'iap', proof: 'fake' }),
    /not eligible/,
  );
  await assert.rejects(
    verifyMigrationPurchase({ app: 'time.md', store: 'ios', kind: 'app', proof: 'fake' }),
  );
  console.log(
    'PASS Migration: eligible products, paid-download cutoff, refunds, ownership, ticket expiry, idempotence, and manual grants.',
  );
} finally {
  store.db.close();
}
