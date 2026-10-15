import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { parseProfile } from '../core/profiles.js';
import { lifetimeCloudBytes } from '../core/cloud-allowance.js';
import { cloudDebugFixture, cloudDebugAction, cloudDebugUsage } from '../core/cloud-debug.js';
import { createCloudSubscriptions } from '../server/cloud-subscriptions.js';
import { HistoryStore } from '../server/history-store.js';
import { PairingError } from '../server/errors.js';
import {
  purchaseAccountToken,
  subscriptionKey,
  verifyGooglePush,
  googleNotificationEvent,
} from '../server/store-subscriptions.js';
import { cloudPlan } from '../core/cloud-plans.js';
import { createBillingService } from '../server/billing-service.js';
const billing = new BillingStore(':memory:');
const objects = new Map();
/** @type {(()=>void)|null} */
let beforePut = null;
let deleteFailure = false;
/** @type {import('../server/r2-store.js').ObjectStore} */
const objectStore = {
  put: async (key, value) => {
    objects.set(key, value);
    beforePut?.();
  },
  get: async (key) => {
    const value = objects.get(key);
    assert.ok(value);
    return value;
  },
  delete: async (key) => {
    if (deleteFailure) throw new Error('Synthetic R2 deletion outage');
    objects.delete(key);
  },
};
const cloud = new CloudStore(':memory:', randomBytes(32), objectStore, (subject) =>
  billing.cloudEntitlement(subject),
);
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Allowance fixture',
    selection: { health: ['native:sleep'], time: [], location: [] },
  }),
  id: 'profile',
};
const bytes = Buffer.from(
  JSON.stringify({
    domain: 'health',
    type: 'sleep',
    source: 'healthkit',
    start: null,
    end: null,
    native: { synthetic: true },
  }),
);
/** @param {string} subject @param {string} day */
function begin(subject, day) {
  return cloud.begin(subject, 'device', profile.id, {
    profile,
    day,
    format: 'jsonl',
    manifest: { profileId: profile.id, recordCount: 1 },
  }).id;
}
/** @param {string} subject */
function allow(subject) {
  cloud.authorize(subject, 'device', profile);
}
try {
  allow('free');
  assert.equal(cloud.storageStatus('free').limitBytes, 0);
  assert.throws(() => begin('free', '2026-10-01'), /Verified lifetime/);
  billing.unlock('paid', { store: 'ios', id: 'fixture-purchase', proof: 'fixture' });
  billing.grant('grant', 'fixture', 'complimentary');
  for (const subject of ['paid', 'grant']) {
    allow(subject);
    assert.equal(cloud.storageStatus(subject).limitBytes, lifetimeCloudBytes);
  }
  assert.equal(cloud.storageStatus('free').usedBytes, 0);
  const base = begin('paid', '2026-10-01');
  await cloud.commit('paid', 'device', profile.id, base, bytes);
  assert.equal(cloud.storageStatus('paid').usedBytes, bytes.length);
  await cloud.commit('paid', 'device', profile.id, base, bytes);
  assert.equal(cloud.storageStatus('paid').usedBytes, bytes.length, 'Retry must not count twice');
  // Model an existing large archive without allocating 100 MB in the test process.
  cloud.db
    .prepare('UPDATE exports SET size=? WHERE id=?')
    .run(lifetimeCloudBytes - bytes.length, base);
  const first = begin('paid', '2026-10-02');
  const second = begin('paid', '2026-10-03');
  const commits = await Promise.allSettled([
    cloud.commit('paid', 'device', profile.id, first, bytes),
    cloud.commit('paid', 'device', profile.id, second, bytes),
  ]);
  assert.equal(commits.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(cloud.storageStatus('paid').usedBytes, lifetimeCloudBytes);
  assert.equal(cloud.storageStatus('paid').availableBytes, 0);
  assert.throws(() => begin('paid', '2026-10-04'), /quota/);
  const replacement = begin('paid', '2026-10-01');
  await cloud.commit('paid', 'device', profile.id, replacement, bytes);
  assert.equal(
    cloud.storageStatus('paid').usedBytes,
    bytes.length * 2,
    'Replacement frees old archive capacity',
  );
  cloud.db.prepare('UPDATE exports SET size=? WHERE id=?').run(lifetimeCloudBytes + 1, replacement);
  assert.equal(cloud.storageStatus('paid').overLimit, true);
  assert.throws(() => begin('paid', '2026-10-04'), /quota/);
  assert.equal(
    (await cloud.page('paid', replacement, 0, 50)).records.length,
    1,
    'Over-limit accounts retain reads',
  );
  await cloud.delete('paid', replacement);
  assert.equal(cloud.storageStatus('paid').usedBytes, bytes.length);
  const revoked = begin('paid', '2026-10-05');
  beforePut = () => billing.revoke('paid');
  await assert.rejects(
    cloud.commit('paid', 'device', profile.id, revoked, bytes),
    /Verified lifetime/,
  );
  beforePut = null;
  assert.equal(cloud.storageStatus('paid').eligible, false);
  assert.equal(cloud.storageStatus('grant').usedBytes, 0, 'Accounts cannot affect one another');
  const granted = begin('grant', '2026-10-05');
  await cloud.commit('grant', 'device', profile.id, granted, bytes);
  cloud.db
    .prepare('UPDATE exports SET created=? WHERE id=?')
    .run(Date.now() - 31 * 86400000, granted);
  assert.equal(cloud.storageStatus('grant').retentionDays, null);
  assert.equal(
    cloud.storageStatus('grant').usedBytes,
    bytes.length,
    'Old files still consume capacity',
  );
  await cloud.sweepObjects();
  assert.deepEqual(await cloud.bytes(cloud.row('grant', granted)), bytes);
  assert.ok(objects.has(cloud.row('grant', granted).object_key));
  assert.throws(() => cloud.row('paid', granted), /not found/);
  await cloud.delete('grant', granted);
  assert.equal(cloud.storageStatus('grant').usedBytes, 0, 'Owner deletion frees capacity');
  console.log(
    'Cloud allowance: eligibility, grants, account isolation, exact capacity, concurrent commits, retries, replacements, over-limit reads, deletion, revocation during R2 upload and retention passed.',
  );
} finally {
  cloud.db.close();
  billing.db.close();
}

// The debug phone harness runs the production capacity rule without granting account access.
const freeFixture = cloudDebugFixture('free');
assert.equal(cloudDebugAction(freeFixture, 'upload', 1_000_000).outcome, 'rejected');
assert.equal(cloudDebugUsage(freeFixture).usedBytes, 0);
const lifetimeFixture = cloudDebugFixture('lifetime');
const uploadedFixture = cloudDebugAction(lifetimeFixture, 'upload', 1_000_000);
assert.equal(uploadedFixture.outcome, 'completed');
assert.equal(cloudDebugUsage(uploadedFixture.state).usedBytes, 1_000_000);
assert.equal(cloudDebugUsage(cloudDebugAction(uploadedFixture.state, 'delete').state).usedBytes, 0);
const fullFixture = cloudDebugFixture('full');
const rejectedFixture = cloudDebugAction(fullFixture, 'upload', 1);
assert.equal(rejectedFixture.outcome, 'rejected');
assert.equal(rejectedFixture.state, fullFixture);
const freedFixture = cloudDebugAction(fullFixture, 'delete').state;
assert.equal(cloudDebugAction(freedFixture, 'upload', 1_000_000).outcome, 'completed');
assert.equal(cloudDebugUsage(cloudDebugFixture('over-limit')).overLimit, true);
assert.equal(cloudDebugUsage(cloudDebugFixture('used')).usedBytes, 42_000_000);
assert.throws(() => cloudDebugFixture('unrecognized'));
assert.throws(() => cloudDebugAction(lifetimeFixture, 'grant'));
assert.throws(() => cloudDebugAction(lifetimeFixture, 'upload', -1));
assert.throws(() => cloudDebugAction(lifetimeFixture, 'upload', 17 * 1024 * 1024));
console.log(
  'Cloud debug harness: free and lifetime isolation, usage, deletion, exact capacity, rejected uploads and validated operations passed.',
);

// Exercise the actual persistence, lifecycle, encrypted deletion and dual-channel dispatch seam.
const subscriptionsBilling = new BillingStore(':memory:');
let clock = Date.now();
const subscriptionCloud = new CloudStore(':memory:', randomBytes(32), objectStore, (subject) =>
  subscriptionsBilling.cloudEntitlement(subject, clock),
);
const subscriptionHistory = new HistoryStore(':memory:', subscriptionCloud);
/** @type {Map<string,import('../server/store-subscriptions.js').VerifiedSubscription>} */
const values = new Map();
/** @type {string[]} */
const emails = [];
/** @type {string[]} */
const pushes = [];
/** @type {number[]} */
const alarms = [];
const noop = () => {};
let outage = false;
let emailFailure = false;
/** @type {import('../server/store-subscriptions.js').SubscriptionVerifier} */
const verifier = {
  verify: async (_store, proof) => {
    const value = values.get(proof);
    if (!value) throw new PairingError(403, 'Unknown fixture purchase.');
    return { ...value };
  },
  read: async (_store, id) => {
    if (outage) throw new Error('Synthetic verification outage');
    const value = values.get(id);
    if (!value) throw new PairingError(403, 'Unknown fixture purchase.');
    return { ...value };
  },
  acknowledge: async () => {},
};
const lifetimeRefunds = new Set();
let lifetimeOutage = false;
const lifetimeBilling = createBillingService({
  billing: subscriptionsBilling,
  verifyStorePurchase: async (value) => {
    if (lifetimeOutage)
      throw Object.assign(new Error('Synthetic publisher permission outage'), { status: 403 });
    if (lifetimeRefunds.has(value.proof)) throw new PairingError(403, 'Verified refunded Lifetime');
    return { ...value, id: value.proof };
  },
  unlock: async (subject, value) => {
    subscriptionsBilling.unlock(subject, value);
  },
});
const lifecycle = createCloudSubscriptions({
  billing: subscriptionsBilling,
  cloud: subscriptionCloud,
  history: subscriptionHistory,
  refreshEntitlement: lifetimeBilling.refreshEntitlement,
  verifier,
  now: () => clock,
  pushTokens: () => ['ExponentPushToken[fixture]'],
  accountEmail: async () => 'synthetic@example.com',
  mailer: {
    configured: true,
    send: async (message) => {
      if (emailFailure) throw new Error('Synthetic mail outage');
      emails.push(message.subject);
    },
  },
  send: async (_url, options) => {
    const message = JSON.parse(String(options?.body));
    assert.deepEqual(message.data, { type: 'cloud-storage', url: 'myselfmd://cloud-storage' });
    pushes.push(message.title);
    return new Response(JSON.stringify({ data: { status: 'ok', id: 'ticket' } }));
  },
  arm: async (at) => {
    alarms.push(at);
  },
});
lifetimeBilling.configureCloud({
  run: lifecycle.run,
  revoked: lifecycle.lifetimeRevoked,
  changed: lifecycle.reconcile,
});
/** @param {string} id @param {string} subject @param {Partial<import('../server/store-subscriptions.js').VerifiedSubscription>} [changes] */
function purchase(id, subject, changes = {}) {
  const value = {
    store: /** @type {const} */ ('android'),
    id,
    product: 'myself_md_cloud_1gb',
    plan: /** @type {const} */ ('cloud_1gb'),
    period: /** @type {const} */ ('monthly'),
    status: /** @type {const} */ ('active'),
    expiresAt: clock + 365 * 86400000,
    autoRenew: true,
    linkedId: null,
    accountToken: purchaseAccountToken(subject),
    acknowledged: true,
    ...changes,
  };
  values.set(id, value);
  return value;
}
/** @param {string} subject @param {string} day @param {number} size @param {number} created */
async function archive(subject, day, size, created) {
  subscriptionCloud.authorize(subject, 'device', profile);
  const item = subscriptionCloud.begin(subject, 'device', profile.id, {
    profile,
    day,
    format: 'jsonl',
    manifest: { profileId: profile.id, recordCount: 1 },
  });
  await subscriptionCloud.commit(subject, 'device', profile.id, item.id, bytes);
  subscriptionCloud.db
    .prepare('UPDATE exports SET size=?,created=? WHERE id=?')
    .run(size, created, item.id);
  return item.id;
}
try {
  purchase('unpaid', 'free');
  await assert.rejects(
    lifecycle.subscribe('free', {
      store: 'android',
      proof: 'unpaid',
      productId: 'myself_md_cloud_1gb',
    }),
    (error) => error instanceof PairingError && error.status === 402,
  );
  for (const subject of ['subscriber', 'other', 'legacy'])
    subscriptionsBilling.grant(subject, 'fixture', subject);
  const firstSubscription = purchase('first', 'subscriber');
  const status = await lifecycle.subscribe('subscriber', {
    store: 'android',
    proof: 'first',
    productId: firstSubscription.product,
  });
  assert.equal(
    status.limitBytes,
    cloudPlan('cloud_1gb')?.capacityBytes,
    'Tier replaces, rather than adds to, 100 MB',
  );
  const oldest = await archive('subscriber', '2026-10-01', 90_000_000, clock - 2000);
  const newest = await archive('subscriber', '2026-10-02', 90_000_000, clock - 1000);
  values.set('first', { ...firstSubscription, status: 'grace' });
  await lifecycle.notification('subscriber', {
    kind: 'subscription',
    store: 'android',
    id: 'first',
    accountToken: null,
    linkedId: null,
    revoked: false,
  });
  assert.equal(
    (await lifecycle.status('subscriber')).plan,
    'cloud_1gb',
    'Store grace preserves paid capacity',
  );
  values.set('first', { ...firstSubscription, status: 'billing_retry' });
  await lifecycle.notification('subscriber', {
    kind: 'subscription',
    store: 'android',
    id: 'first',
    accountToken: null,
    linkedId: null,
    revoked: false,
  });
  const lapse = subscriptionsBilling.lapse('subscriber');
  assert.ok(lapse);
  assert.equal((await lifecycle.status('subscriber')).limitBytes, lifetimeCloudBytes);
  assert.deepEqual(subscriptionsBilling.lapse('subscriber')?.sent, [0]);
  const deletionDate = new Date(lapse.lapse.deleteAt).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  assert.equal(emails.length, 1);
  assert.equal(pushes.length, 1);
  assert.equal(emails[0]?.includes(`${deletionDate} (UTC)`), true);
  const reminderAt = lapse.lapse.startedAt + 23 * 86400000;
  // Drive scheduled work, including legitimate hourly store refreshes, until the reminder is due.
  while (clock < reminderAt) {
    const wake = alarms.at(-1);
    assert.ok(
      wake !== undefined && wake > clock && wake <= reminderAt,
      'Alarm must not skip the day-23 reminder',
    );
    clock = wake;
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each alarm depends on the previous maintenance pass's scheduled wake.
    await lifecycle.maintain('subscriber');
  }
  await lifecycle.maintain('subscriber');
  assert.deepEqual(subscriptionsBilling.lapse('subscriber')?.sent, [0, 23]);
  assert.equal(emails.length, 2, 'Day-23 reminder is not repeated');
  assert.equal(emails[1]?.startsWith('7 days left:'), true);
  assert.equal(emails[1]?.includes(`${deletionDate} (UTC)`), true);
  assert.equal(pushes[1], '7 days until cloud exports are deleted');
  clock = lapse.lapse.startedAt + 29 * 86400000;
  emailFailure = true;
  await lifecycle.maintain('subscriber');
  assert.deepEqual(
    subscriptionsBilling.lapse('subscriber')?.sent,
    [0, 23],
    'Failed email must not mark reminder sent',
  );
  assert.equal(subscriptionsBilling.noticeFailure('subscriber')?.retrying, true);
  const pushesBeforeRetry = pushes.length;
  emailFailure = false;
  await lifecycle.maintain('subscriber');
  assert.equal(pushes.length, pushesBeforeRetry, 'Successful push is not repeated on email retry');
  assert.deepEqual(subscriptionsBilling.lapse('subscriber')?.sent, [0, 23, 29]);
  assert.equal(emails[2]?.startsWith('1 day left:'), true);
  assert.equal(emails[2]?.includes(`${deletionDate} (UTC)`), true);
  assert.equal(pushes.at(-1), '1 day until cloud exports are deleted');
  clock = lapse.lapse.deleteAt;
  await lifecycle.maintain('subscriber');
  assert.throws(() => subscriptionCloud.row('subscriber', oldest), /not found/);
  assert.equal(
    subscriptionCloud.row('subscriber', newest).size,
    90_000_000,
    'Day 30 deletes oldest whole exports only until target fits',
  );
  assert.equal(subscriptionCloud.storageStatus('subscriber').usedBytes, 90_000_000);
  assert.equal(subscriptionsBilling.lapse('subscriber'), null);
  assert.equal(subscriptionHistory.list('subscriber', null).events.length, 1);

  // Reactivation cancels an existing lapse without deleting; an outage cannot invent grace.
  await archive('subscriber', '2026-10-03', 90_000_000, clock);
  await lifecycle.reconcile('subscriber');
  assert.ok(subscriptionsBilling.lapse('subscriber'));
  const renewed = purchase('renewed', 'subscriber', { linkedId: 'first', expiresAt: clock + 1000 });
  await lifecycle.subscribe('subscriber', {
    store: 'android',
    proof: 'renewed',
    productId: renewed.product,
  });
  assert.equal(subscriptionsBilling.lapse('subscriber'), null);
  clock += 3600001;
  outage = true;
  assert.equal(
    (await lifecycle.status('subscriber')).plan,
    'included',
    'No extra grace after recorded expiry during outages',
  );
  assert.equal(
    (await subscriptionCloud.page('subscriber', newest, 0, 50)).records.length,
    1,
    'Expiry and transient store outages retain owner downloads before day 30',
  );
  assert.ok(subscriptionsBilling.lapse('subscriber'));
  outage = false;
  await assert.rejects(
    lifecycle.subscribe('other', {
      store: 'android',
      proof: 'renewed',
      productId: renewed.product,
    }),
    (error) => error instanceof PairingError && error.status === 409,
  );
  const ancestor = purchase('ancestor', 'subscriber', { accountToken: null });
  const middle = purchase('middle', 'subscriber', { accountToken: null, linkedId: ancestor.id });
  const descendant = purchase('descendant', 'other', { accountToken: null, linkedId: middle.id });
  subscriptionsBilling.bindOwner(subscriptionKey('android', ancestor.id), 'subscriber');
  await assert.rejects(
    lifecycle.subscribe('other', {
      store: 'android',
      proof: descendant.id,
      productId: descendant.product,
    }),
    (error) => error instanceof PairingError && error.status === 409,
    'Linked ancestors cannot transfer ownership',
  );
  await archive('legacy', '2026-10-01', 110_000_000, clock);
  await lifecycle.reconcile('legacy');
  assert.equal(
    subscriptionsBilling.lapse('legacy'),
    null,
    'Lifetime-only legacy overage is not a paid lapse',
  );
  const lowUsage = purchase('low-usage', 'other', { status: 'expired' });
  subscriptionsBilling.saveSubscription('other', lowUsage, clock);
  await lifecycle.reconcile('other');
  assert.equal(
    subscriptionsBilling.lapse('other'),
    null,
    'Paid expiry below included capacity starts no lapse',
  );
  subscriptionsBilling.grant('downgrade', 'fixture', 'downgrade');
  const large = purchase('large', 'downgrade', {
    plan: 'cloud_10gb',
    product: 'myself_md_cloud_10gb',
  });
  await lifecycle.subscribe('downgrade', {
    store: 'android',
    proof: large.id,
    productId: large.product,
  });
  const largeExport = await archive('downgrade', '2026-10-01', 5_000_000_000, clock);
  const small = purchase('small', 'downgrade', { linkedId: large.id });
  const downgraded = await lifecycle.subscribe('downgrade', {
    store: 'android',
    proof: small.id,
    productId: small.product,
  });
  assert.equal(downgraded.overLimit, true);
  assert.equal(downgraded.lapse, null, 'Paid downgrade never starts destructive lapse');
  assert.equal(subscriptionCloud.row('downgrade', largeExport).size, 5_000_000_000);
  assert.equal((await subscriptionCloud.page('downgrade', largeExport, 0, 50)).records.length, 1);
  assert.throws(
    () =>
      subscriptionCloud.begin('downgrade', 'device', profile.id, {
        profile,
        day: '2026-10-02',
        format: 'jsonl',
        manifest: { profileId: profile.id, recordCount: 1 },
      }),
    /quota/,
  );
  await lifecycle.notification('downgrade', {
    kind: 'subscription',
    store: 'android',
    id: small.id,
    accountToken: null,
    linkedId: null,
    revoked: true,
  });
  await lifecycle.notification('downgrade', {
    kind: 'subscription',
    store: 'android',
    id: small.id,
    accountToken: null,
    linkedId: null,
    revoked: false,
  });
  assert.equal(
    subscriptionsBilling.subscriptions('downgrade').find((row) => row.id === small.id)?.status,
    'revoked',
    'A stale duplicate callback cannot resurrect revoked capacity',
  );

  // Authenticate a real signed OIDC push, decode the store refund, then execute deletion.
  const { privateKey: pushPrivateKey, publicKey: pushPublicKey } = await generateKeyPair('RS256');
  const pushAudience = 'https://myself.md/api/store/google/notifications';
  const pushEmail = 'refund@fixture.iam.gserviceaccount.com';
  const pushJwt = await new SignJWT({ email: pushEmail, email_verified: true })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://accounts.google.com')
    .setAudience(pushAudience)
    .setExpirationTime('5m')
    .sign(pushPrivateKey);
  const signedRefund = async () => {
    await verifyGooglePush(`Bearer ${pushJwt}`, pushAudience, pushEmail, async () => pushPublicKey);
    const event = googleNotificationEvent({
      message: {
        data: Buffer.from(
          JSON.stringify({
            packageName: 'com.myself.md',
            voidedPurchaseNotification: { productType: 2, purchaseToken: 'refunded-lifetime' },
          }),
        ).toString('base64'),
      },
    });
    assert.equal(event.kind, 'lifetime');
    await lifecycle.notification('revoked', event);
  };
  subscriptionsBilling.unlock('revoked', {
    store: 'android',
    id: 'refunded-lifetime',
    proof: 'refunded-lifetime',
  });
  const refunded = await archive('revoked', '2026-10-01', 1, clock);
  const refundedKey = subscriptionCloud.row('revoked', refunded).object_key;
  assert.ok(refundedKey && objects.has(refundedKey));
  lifetimeOutage = true;
  await assert.rejects(signedRefund(), /permission outage/);
  assert.equal(
    objects.has(refundedKey),
    true,
    'Provider permission failures never revoke or delete Lifetime data',
  );
  lifetimeOutage = false;
  lifetimeRefunds.add('refunded-lifetime');
  await signedRefund();
  assert.equal(subscriptionCloud.storageStatus('revoked').limitBytes, 0);
  assert.equal(
    subscriptionCloud.usage('revoked').length,
    0,
    'Verified Lifetime refund immediately deletes every export',
  );
  assert.equal(
    objects.has(refundedKey),
    false,
    'Verified refund physically deletes the R2 object immediately',
  );
  assert.equal(subscriptionsBilling.revocation('revoked'), null);
  assert.match(emails.at(-1) ?? '', /lifetime/i);
  const refundNotices = emails.length;
  await signedRefund();
  assert.equal(emails.length, refundNotices, 'Duplicate Lifetime refund is idempotent');
  subscriptionsBilling.unlock('retry-refund', {
    store: 'ios',
    id: 'retry-refund',
    proof: 'retry-refund',
  });
  const retryFile = await archive('retry-refund', '2026-10-01', 1, clock);
  const retryKey = subscriptionCloud.row('retry-refund', retryFile).object_key;
  lifetimeRefunds.add('retry-refund');
  deleteFailure = true;
  await assert.rejects(
    lifecycle.notification('retry-refund', { kind: 'lifetime', store: 'ios', id: 'retry-refund' }),
    /R2 deletion outage/,
  );
  assert.ok(
    subscriptionsBilling.revocation('retry-refund'),
    'Failed R2 deletion keeps durable refund work',
  );
  assert.equal(objects.has(retryKey), true);
  deleteFailure = false;
  await lifecycle.maintain('retry-refund');
  assert.equal(objects.has(retryKey), false);
  assert.equal(subscriptionsBilling.revocation('retry-refund'), null);

  // A purchase finishing during refund deletion must wait, then fail its Lifetime check.
  subscriptionsBilling.unlock('racing', {
    store: 'ios',
    id: 'racing-lifetime',
    proof: 'racing-lifetime',
  });
  await archive('racing', '2026-10-01', 1, clock);
  purchase('racing-subscription', 'racing');
  const normalDelete = subscriptionCloud.delete.bind(subscriptionCloud);
  /** @type {()=>void} */ let releaseDeletion = noop;
  /** @type {()=>void} */ let enteredDeletion = noop;
  const deleteGate = new Promise((resolve) => {
    releaseDeletion = () => resolve(undefined);
  });
  const entered = new Promise((resolve) => {
    enteredDeletion = () => resolve(undefined);
  });
  subscriptionCloud.delete = async (subject, id) => {
    if (subject === 'racing') {
      enteredDeletion();
      await deleteGate;
    }
    return normalDelete(subject, id);
  };
  lifetimeRefunds.add('racing-lifetime');
  const refund = lifecycle.notification('racing', {
    kind: 'lifetime',
    store: 'ios',
    id: 'racing-lifetime',
  });
  await entered;
  const concurrentPurchase = lifecycle.subscribe('racing', {
    store: 'android',
    proof: 'racing-subscription',
    productId: 'myself_md_cloud_1gb',
  });
  releaseDeletion();
  await refund;
  await assert.rejects(
    concurrentPurchase,
    (error) => error instanceof PairingError && error.status === 402,
  );
  subscriptionCloud.delete = normalDelete;

  // Count staged and completed exports together without making the 10 GB plan unusable.
  for (const [subject, plan, count] of /** @type {const} */ ([
    ['count-included', null, 128],
    ['count-1gb', 'cloud_1gb', 128],
    ['count-10gb', 'cloud_10gb', 1280],
  ])) {
    subscriptionsBilling.grant(subject, 'fixture', subject);
    if (plan)
      subscriptionsBilling.saveSubscription(subject, purchase(subject, subject, { plan }), clock);
    subscriptionCloud.authorize(subject, 'device', profile);
    subscriptionCloud.setSharing(subject, 'device', profile.id, true);
    /** @param {number} index */
    const stage = (index) =>
      subscriptionCloud.begin(subject, 'device', profile.id, {
        profile,
        day: new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10),
        format: 'jsonl',
        manifest: { profileId: profile.id, recordCount: 1 },
      });
    for (let index = 0; index < count; index++) {
      const item = stage(index);
      if (plan === 'cloud_10gb' && index < 129) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Exercise sequential real commits without overlapping encrypted writes.
        await subscriptionCloud.commit(subject, 'device', profile.id, item.id, bytes);
      }
    }
    assert.equal(subscriptionCloud.usage(subject).length, plan === 'cloud_10gb' ? 129 : 0);
    assert.throws(() => stage(count), /quota/, `${subject} includes staged uploads in its cap`);
    if (plan === 'cloud_10gb') {
      assert.equal(
        subscriptionCloud.list(subject).length,
        129,
        'No legacy 128-file list truncation',
      );
      assert.equal(
        subscriptionCloud.list(subject, true).length,
        129,
        'MCP lists every shared export',
      );
      const replacement = stage(0);
      assert.throws(() => stage(1), /quota/, 'Only one bounded replacement overlap is allowed');
      // oxlint-disable-next-line eslint/no-await-in-loop -- Finish this tier's replacement before asserting its persisted count and downgrade.
      await subscriptionCloud.commit(subject, 'device', profile.id, replacement.id, bytes);
      assert.equal(subscriptionCloud.list(subject).length, 129);
      subscriptionsBilling.saveSubscription(
        subject,
        purchase(`${subject}-smaller`, subject, { linkedId: subject }),
        clock,
      );
      assert.equal(
        subscriptionCloud.list(subject).length,
        129,
        'Downgrade retains all existing files',
      );
      assert.throws(() => stage(count), /quota/, 'Reduced count cap blocks additional uploads');
    }
  }
  console.log(
    'Cloud subscriptions: real shared lifecycle capacity, grace/retry, 0/23/29 dual-channel retries, oldest-first day-30 deletion, renewal, outage expiry, chain ownership and immediate Lifetime refund deletion passed.',
  );
} finally {
  subscriptionHistory.db.close();
  subscriptionCloud.db.close();
  subscriptionsBilling.db.close();
}
