import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { parseProfile } from '../core/profiles.js';
import { lifetimeCloudBytes } from '../core/cloud-allowance.js';
import { cloudDebugFixture, cloudDebugAction, cloudDebugUsage } from '../core/cloud-debug.js';
const billing = new BillingStore(':memory:');
const objects = new Map();
/** @type {(()=>void)|null} */
let beforePut = null;
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
    objects.delete(key);
  },
};
const cloud = new CloudStore(
  ':memory:',
  randomBytes(32),
  objectStore,
  (subject) => billing.snapshot(subject).unlocked,
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
