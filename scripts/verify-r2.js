import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CloudStore } from '../server/cloud-store.js';
import { r2Store } from '../server/r2-store.js';
import { r2Fixture } from './r2-fixture.js';
import { parseProfile } from '../core/profiles.js';
const fixture = await r2Fixture();
const objects = r2Store(fixture.env);
assert.ok(objects);
const directory = mkdtempSync(join(tmpdir(), 'r2-test-'));
const path = join(directory, 'cloud.sqlite'),
  key = randomBytes(32);
// Reproduce the original ten-column production schema before opening the new store.
const oldDatabase = new DatabaseSync(path);
oldDatabase.exec(
  'CREATE TABLE exports(id TEXT PRIMARY KEY,subject TEXT,device TEXT,profile TEXT,day TEXT,format TEXT,created INTEGER,content BLOB,metadata BLOB,size INTEGER)',
);
oldDatabase.close();
let store = new CloudStore(path, key);
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Private',
    selection: { health: ['native:sleep'], time: [], location: [] },
  }),
  id: 'profile',
};
const record = {
  domain: 'health',
  type: 'sleep',
  source: 'healthkit',
  start: null,
  end: null,
  native: { private: 'synthetic-secret' },
};
const bytes = Buffer.from(JSON.stringify(record) + '\n');
/** @param {string} [day] */
const begin = (day = '2026-10-08') =>
  store.begin('alice', 'phone', profile.id, {
    profile,
    day,
    format: 'jsonl',
    manifest: { profileId: profile.id, recordCount: 1 },
  }).id;
/** @param {string} id @param {Uint8Array} [value] */
const commit = (id, value = bytes) => store.commit('alice', 'phone', profile.id, id, value);
try {
  const legacy = begin();
  await commit(legacy);
  const encrypted = Buffer.from(store.row('alice', legacy).content ?? []);
  store.db.close();
  store = new CloudStore(path, key, objects);
  fixture.state.failGet = true;
  await assert.rejects(store.migrateObjects(), /unavailable/);
  assert.deepEqual(Buffer.from(store.row('alice', legacy).content ?? []), encrypted);
  fixture.state.failGet = false;
  assert.equal((await store.migrateObjects()).migrated, 1);
  assert.equal((await store.migrateObjects()).migrated, 0);
  assert.equal(store.row('alice', legacy).content, null);
  const objectKey = store.row('alice', legacy).object_key;
  assert.ok(objectKey);
  assert.deepEqual(Buffer.from(await objects.get(objectKey)), encrypted);
  assert.ok(!encrypted.includes('synthetic-secret'));
  store.db.close();
  assert.throws(() => new CloudStore(path, key), /R2 credentials/);
  store = new CloudStore(path, key, objects);
  assert.deepEqual((await store.page('alice', legacy, 0, 50)).records, [record]);
  await assert.rejects(store.page('bob', legacy, 0, 50));
  await assert.rejects(store.page('alice', legacy, 0, 50, true));
  store.access('alice', 'phone', profile, true);
  store.objects = {
    ...objects,
    async get(k) {
      const result = await objects.get(k);
      store.setSharing('alice', 'phone', profile.id, false);
      return result;
    },
  };
  await assert.rejects(store.page('alice', legacy, 0, 50, true), /not found/);
  store.access('alice', 'phone', profile, true);
  store.objects = {
    ...objects,
    async get(k) {
      const result = await objects.get(k);
      store.access(
        'alice',
        'phone',
        { ...profile, selection: { health: [], time: [], location: [] } },
        true,
      );
      return result;
    },
  };
  assert.equal((await store.page('alice', legacy, 0, 50, true)).records.length, 0);
  store.objects = objects;
  store.access('alice', 'phone', profile, true);
  const replacement = begin();
  const results = await Promise.all([commit(replacement), commit(replacement)]);
  assert.equal(results.length, 2);
  assert.equal(store.list('alice').length, 1);
  assert.equal(store.list('alice')[0]?.id, replacement);
  await assert.rejects(
    commit(
      replacement,
      Buffer.from(JSON.stringify({ ...record, native: { private: 'different' } }) + '\n'),
    ),
    /different bytes/,
  );
  // Failed and concurrent orphan candidates are collected durably after restart.
  store.db.prepare('UPDATE object_garbage SET created=0').run();
  fixture.state.failDelete = true;
  await assert.rejects(store.sweepObjects(), /deletion failed/);
  assert.ok(store.db.prepare('SELECT key FROM object_garbage LIMIT 1').get());
  fixture.state.failDelete = false;
  await store.sweepObjects();
  assert.equal(fixture.files.size, 1);
  const quota = begin('2026-10-09');
  store.db.prepare('UPDATE exports SET size=? WHERE id=?').run(256 * 1024 * 1024, replacement);
  await assert.rejects(commit(quota), /quota reached/);
  assert.equal(store.row('alice', quota).object_key, null);
  store.db.prepare('UPDATE exports SET size=? WHERE id=?').run(bytes.length, replacement);
  await store.delete('alice', quota);
  // Revoke the upload token during the network PUT; the staged row must stay incomplete.
  const uploadToken = store.authorize('alice', 'phone', profile);
  const revoked = begin('2026-10-09');
  store.objects = {
    ...objects,
    async put(k, v) {
      await objects.put(k, v);
      store.authorize('alice', 'phone', profile);
    },
  };
  await assert.rejects(
    store.commit('alice', 'phone', profile.id, revoked, bytes, () => {
      store.credential(uploadToken);
    }),
    /expired/,
  );
  assert.equal(store.row('alice', revoked).object_key, null);
  store.objects = objects;
  await store.delete('alice', revoked);
  // Deleting a staged upload while PUT is in flight cannot resurrect it.
  const stale = begin('2026-10-09');
  store.objects = {
    ...objects,
    async put(k, v) {
      await objects.put(k, v);
      await store.delete('alice', stale);
    },
  };
  await assert.rejects(commit(stale), /not found/);
  assert.ok(!store.list('alice').some((item) => item.id === stale));
  store.objects = objects;
  await store.sweepObjects();
  fixture.state.failDelete = true;
  await assert.rejects(store.delete('alice', replacement), /deletion failed/);
  assert.equal(store.list('alice').length, 1);
  fixture.state.failDelete = false;
  // Expiry removes visibility immediately and queues physical deletion.
  store.db
    .prepare('UPDATE exports SET created=? WHERE id=?')
    .run(Date.now() - 31 * 86400000, replacement);
  assert.equal(store.list('alice').length, 0);
  await store.sweepObjects();
  assert.equal(fixture.files.size, 0);
  const restored = begin();
  await commit(restored);
  assert.equal((await store.restoreObjects()).restored, 1);
  assert.equal(store.row('alice', restored).object_key, null);
  assert.ok(store.row('alice', restored).content);
  await store.sweepObjects();
  store.db.close();
  store = new CloudStore(path, key);
  assert.deepEqual((await store.page('alice', restored, 0, 50)).records, [record]);
  assert.equal(r2Store({}), null);
  assert.throws(() => r2Store({ R2_BUCKET: 'partial' }), /all four/);
  assert.throws(() => r2Store({ ...fixture.env, ALLOW_HTTP_DEV: '0' }), /development mode/);
  console.log(
    'R2: real S3 SDK signing/HTTP, encrypted backfill verification, failure preservation, restart, tenant isolation, in-flight grant/token revocation, concurrent retries, quotas, orphan recovery, retention, deletion failure and SQLite rollback passed.',
  );
} finally {
  store.db.close();
  await new Promise((resolve) => fixture.server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
