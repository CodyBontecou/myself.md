import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProfile } from '../core/profiles.js';
const directory = mkdtempSync(join(tmpdir(), 'cloud-test-'));
process.env.DATA_DIR = directory;
const { CloudStore } = await import('../server/cloud-store.js');
const path = join(directory, 'exports.sqlite'),
  key = randomBytes(32);
let store = new CloudStore(path, key);
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Synthetic',
    selection: { health: ['native:sleep'], time: [], location: [] },
  }),
  id: 'profile',
};
const records = [
  {
    domain: 'health',
    type: 'sleep',
    source: 'healthkit',
    start: '2026-10-08T00:00:00.000Z',
    end: null,
    native: { private: 'synthetic-private-value' },
  },
];
const metadata = {
  profile,
  day: '2026-10-08',
  format: 'jsonl',
  manifest: { profileId: profile.id, recordCount: 1 },
};
try {
  const token = store.authorize('alice', 'device', profile);
  assert.equal(store.credential(token).subject, 'alice');
  const { id } = store.begin('alice', 'device', profile.id, metadata);
  assert.throws(() => store.page('alice', id, 0, 50));
  assert.throws(() => store.row('bob', id));
  assert.throws(() =>
    store.commit('alice', 'device', 'wrong', id, Buffer.from(JSON.stringify(records[0]) + '\n')),
  );
  assert.throws(
    () =>
      store.commit(
        'alice',
        'device',
        profile.id,
        id,
        Buffer.from(JSON.stringify({ ...records[0], source: 'imported' }) + '\n'),
      ),
    /Imported data is no longer supported/,
  );
  const bytes = Buffer.from(JSON.stringify(records[0]) + '\n');
  store.commit('alice', 'device', profile.id, id, bytes);
  assert.deepEqual(store.page('alice', id, 0, 50).records, records);
  assert.equal(store.list('alice', true).length, 0);
  assert.throws(() => store.page('alice', id, 0, 50, true));
  store.access('alice', 'device', profile, true);
  assert.equal(store.list('alice', true).length, 1);
  assert.deepEqual(store.page('alice', id, 0, 50, true).records, records);
  const encrypted = store.row('alice', id).content;
  assert.ok(encrypted);
  assert.ok(!Buffer.from(encrypted).includes('synthetic-private-value'));
  store.observeAgent('alice', 'test-agent');
  store.setAgent('alice', 'test-agent', true);
  assert.throws(() => store.observeAgent('alice', 'test-agent'));
  assert.throws(() => store.setAgent('bob', 'test-agent', false));
  store.db.close();
  store = new CloudStore(path, key);
  assert.equal(store.agents('alice')[0]?.blocked, true);
  assert.throws(() => store.observeAgent('alice', 'test-agent'));
  store.setAgent('alice', 'test-agent', false);
  store.observeAgent('alice', 'test-agent');

  assert.deepEqual(store.page('alice', id, 0, 50, true).records, records);
  assert.throws(() => store.page('bob', id, 0, 50, true));
  assert.throws(() => store.delete('bob', id));
  store.access(
    'alice',
    'device',
    { ...profile, selection: { health: [], time: [], location: [] } },
    true,
  );
  assert.equal(store.page('alice', id, 0, 50, true).records.length, 0);
  store.access('alice', 'device', profile, false);
  assert.throws(() => store.page('alice', id, 0, 50, true));
  const denied = store.begin('alice', 'device', profile.id, {
    ...metadata,
    manifest: { profileId: profile.id, recordCount: 1 },
  });
  assert.throws(() =>
    store.commit(
      'alice',
      'device',
      profile.id,
      denied.id,
      Buffer.from(JSON.stringify({ ...records[0], type: 'heart' }) + '\n'),
    ),
  );
  assert.throws(() => store.commit('alice', 'device', profile.id, denied.id, Buffer.from('')));
  assert.deepEqual(store.delete('alice', denied.id), { deleted: true });
  assert.throws(() => store.row('alice', denied.id));
  const json = store.begin('alice', 'device', profile.id, {
    ...metadata,
    format: 'json',
    manifest: { profileId: profile.id, recordCount: 2 },
  });
  store.commit(
    'alice',
    'device',
    profile.id,
    json.id,
    Buffer.from(
      JSON.stringify({ schema: 'myself.md.export.v1', records: [records[0], records[0]] }),
    ),
  );
  assert.equal(store.page('alice', json.id, 0, 1).nextCursor, '1');
  assert.equal(store.page('alice', json.id, 1, 1).nextCursor, null);
  store.db.prepare('UPDATE exports SET created=? WHERE id=?').run(Date.now() - 31 * 86400000, id);
  store.cleanup();
  assert.throws(() => store.row('alice', id));
  console.log(
    'Cloud: account isolation, encryption, restart persistence, incomplete uploads, explicit sharing, selection revocation, bounds and retention passed.',
  );
} finally {
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
