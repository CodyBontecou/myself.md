import { verifyCloudWrites } from './cloud-write-fixture.js';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
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
const legacy = new DatabaseSync(path);
legacy.exec(
  'CREATE TABLE cloud_access(subject TEXT,device TEXT,profile TEXT,shared INTEGER,selection TEXT,PRIMARY KEY(subject,device,profile))',
);
legacy.close();
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
  store.access('alice', 'device', profile, true);
  store.db.prepare('UPDATE upload_keys SET expires=?').run(Date.now() - 1);
  assert.throws(() => store.credential(token), /expired/);
  const expiresAt = Date.now() + 30 * 86400000;
  assert.throws(
    () => store.renewAuthorization('bob', 'device', profile.id, token, expiresAt),
    /revoked or does not match/,
  );
  assert.throws(
    () => store.renewAuthorization('alice', 'other', profile.id, token, expiresAt),
    /revoked or does not match/,
  );
  assert.throws(
    () => store.renewAuthorization('alice', 'device', 'other', token, expiresAt),
    /revoked or does not match/,
  );
  assert.throws(
    () => store.renewAuthorization('alice', 'device', profile.id, token, Date.now() - 1),
    /Sign in again/,
  );
  assert.equal(
    store.renewAuthorization('alice', 'device', profile.id, token, expiresAt).expiresAt,
    expiresAt,
  );
  assert.equal(
    store.renewAuthorization('alice', 'device', profile.id, token, expiresAt - 10000).expiresAt,
    expiresAt,
    'A stale background deadline cannot shorten foreground renewal',
  );
  assert.equal(store.credential(token).subject, 'alice');
  assert.equal(
    store.permission('alice', 'device', profile.id).shared,
    false,
    'Legacy sharing cannot create a grant',
  );
  store.access('alice', 'device', profile, false);
  store.access('alice', 'device', profile, true);
  store.syncAgentPermissions('alice', 'device', [{ ...profile, agentAccess: true }]);
  store.authorize('alice', 'device', profile);
  assert.equal(
    store.permission('alice', 'device', profile.id).shared,
    true,
    'Upload credential creation preserves confirmed Agent permissions',
  );
  store.access('alice', 'device', profile, false);
  store.authorize('alice', 'device', profile);
  assert.equal(
    store.permission('alice', 'device', profile.id).shared,
    true,
    'A legacy sharing-off value cannot block confirmed Agent permissions',
  );
  store.syncAgentPermissions('alice', 'device', [{ ...profile, agentAccess: false }]);
  const revoked = store.authorize('alice', 'device', { ...profile, id: 'rotated' });
  store.authorize('alice', 'device', { ...profile, id: 'rotated' });
  assert.throws(
    () => store.renewAuthorization('alice', 'device', 'rotated', revoked, expiresAt),
    /revoked/,
  );
  assert.throws(
    () =>
      store.begin('alice', 'device', profile.id, {
        ...metadata,
        manifest: { ...metadata.manifest, schema: 'myself.md.export.v2' },
      }),
    /Unsupported export schema/,
  );
  const { id } = store.begin('alice', 'device', profile.id, metadata);
  await assert.rejects(async () => await store.page('alice', id, 0, 50));
  assert.throws(() => store.row('bob', id));
  await assert.rejects(
    async () =>
      await store.commit(
        'alice',
        'device',
        'wrong',
        id,
        Buffer.from(JSON.stringify(records[0]) + '\n'),
      ),
  );
  await assert.rejects(
    async () =>
      await store.commit(
        'alice',
        'device',
        profile.id,
        id,
        Buffer.from(JSON.stringify({ ...records[0], source: 'imported' }) + '\n'),
      ),
    /Imported data is no longer supported/,
  );
  const bytes = Buffer.from(JSON.stringify(records[0]) + '\n');
  await store.commit('alice', 'device', profile.id, id, bytes);
  const firstExport = store.list('alice')[0];
  assert.ok(firstExport);
  assert.equal(firstExport.schema, profile.export.schema);
  assert.equal((await store.page('alice', id, 0, 50)).schema, profile.export.schema);
  assert.deepEqual(await store.bytes(store.row('alice', id)), bytes);
  assert.deepEqual((await store.page('alice', id, 0, 50)).records, records);
  assert.equal(store.list('alice', true).length, 0);
  await assert.rejects(async () => await store.page('alice', id, 0, 50, true));
  store.access('alice', 'device', profile, true);
  assert.equal(
    store.list('alice', true).length,
    0,
    'Legacy cloud sharing alone cannot authorize records',
  );
  await assert.rejects(() => store.page('alice', id, 0, 50, true), /not found/);
  const approved = {
    ...profile,
    agentAccess: true,
    agentPermissions: { health: true, time: false, location: false, logs: false },
  };
  store.syncAgentPermissions('alice', 'device', [approved]);
  assert.equal(store.list('alice', true).length, 1);
  assert.deepEqual((await store.page('alice', id, 0, 50, true)).records, records);
  const mixed = {
    ...profile,
    id: 'mixed',
    name: 'Mixed source export',
    selection: {
      health: ['native:sleep'],
      time: ['native:applications'],
      location: ['native:points'],
    },
  };
  const mixedRecords = /** @type {const} */ (['health', 'time', 'location']).map((domain) =>
    Object.assign({}, records[0], { domain, type: (mixed.selection[domain][0] ?? '').slice(7) }),
  );
  store.access('alice', 'device', mixed, true);
  const mixedId = store.begin('alice', 'device', mixed.id, {
    ...metadata,
    profile: mixed,
    manifest: { profileId: mixed.id, recordCount: 3 },
  }).id;
  await store.commit(
    'alice',
    'device',
    mixed.id,
    mixedId,
    Buffer.from(mixedRecords.map((record) => JSON.stringify(record)).join('\n') + '\n'),
  );
  const mixedBytes = await store.bytes(store.row('alice', mixedId));
  const mixedApproved = {
    ...mixed,
    agentAccess: true,
    agentPermissions: { health: true, time: true, location: true, logs: false },
  };
  store.syncAgentPermissions('alice', 'device', [approved, mixedApproved]);
  const cursorPage = await store.page('alice', mixedId, 0, 1, true);
  assert.equal(cursorPage.nextCursor, '1');
  await ['health', 'time', 'location'].reduce(async (previous, domain) => {
    await previous;
    store.syncAgentPermissions('alice', 'device', [
      approved,
      {
        ...mixedApproved,
        agentPermissions: { ...mixedApproved.agentPermissions, [domain]: false },
      },
    ]);
    const page = await store.page('alice', mixedId, 0, 50, true);
    assert.equal(page.records.length, 2);
    assert.ok(
      page.records.every((record) => record.domain !== domain),
      `${domain} revocation filters an already stored mixed file`,
    );
    assert.equal(
      (await store.page('alice', id, 0, 50, true)).records.length,
      1,
      'Other profiles remain authorized',
    );
    assert.equal(
      (await store.page('alice', mixedId, 0, 50)).records.length,
      3,
      'Owner access is preserved',
    );
    assert.deepEqual(
      await store.bytes(store.row('alice', mixedId)),
      mixedBytes,
      'Stored bytes do not change',
    );
  }, Promise.resolve());
  store.syncAgentPermissions('alice', 'device', [
    approved,
    { ...mixedApproved, agentAccess: false },
  ]);
  await assert.rejects(
    () => store.page('alice', mixedId, Number(cursorPage.nextCursor), 1, true),
    /not found/,
  );
  assert.ok(
    !store.list('alice', true).some((file) => file.id === mixedId),
    'All-off profile hidden from agents',
  );
  assert.throws(() => store.setSharing('alice', 'device', mixed.id, true), /Use Agent permissions/);
  await assert.rejects(
    () => store.page('alice', mixedId, 0, 1, true),
    /not found/,
    'Retired sharing controls cannot override source denials',
  );
  store.db.close();
  store = new CloudStore(path, key);
  await assert.rejects(
    () => store.page('alice', mixedId, 0, 1, true),
    /not found/,
    'Source revocation survives a server restart',
  );
  store.syncAgentPermissions('bob', 'device', [mixedApproved]);
  await assert.rejects(
    () => store.page('alice', mixedId, 0, 1, true),
    /not found/,
    'Another account cannot change permissions',
  );
  store.syncAgentPermissions('alice', 'other-device', [mixedApproved]);
  await assert.rejects(
    () => store.page('alice', mixedId, 0, 1, true),
    /not found/,
    'Another device cannot change permissions',
  );
  store.syncAgentPermissions('alice', 'device', [approved, mixedApproved]);
  const readBytes = store.bytes.bind(store);
  store.bytes = async (row) => {
    const readContent = await readBytes(row);
    store.syncAgentPermissions('alice', 'device', [approved]);
    return readContent;
  };
  await assert.rejects(
    () => store.page('alice', mixedId, 0, 1, true),
    /not found/,
    'Revocation during object I/O is rechecked',
  );
  store.bytes = readBytes;
  store.access('alice', 'device', mixed, true);
  await assert.rejects(
    () => store.page('alice', mixedId, 0, 1, true),
    /not found/,
    'Changing cloud selection does not reset denial',
  );
  await store.delete('alice', mixedId);
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

  assert.deepEqual((await store.page('alice', id, 0, 50, true)).records, records);
  await assert.rejects(async () => await store.page('bob', id, 0, 50, true));
  await assert.rejects(async () => await store.delete('bob', id));
  store.syncAgentPermissions('alice', 'device', [
    { ...approved, selection: { health: [], time: [], location: [] } },
  ]);
  assert.equal((await store.page('alice', id, 0, 50, true)).records.length, 0);
  store.access('alice', 'device', profile, true);
  assert.equal(
    (await store.page('alice', id, 0, 50, true)).records.length,
    0,
    'Legacy upload payload cannot widen confirmed selection',
  );
  store.syncAgentPermissions('alice', 'device', [{ ...profile, agentAccess: false }]);
  await assert.rejects(async () => await store.page('alice', id, 0, 50, true));
  const denied = store.begin('alice', 'device', profile.id, {
    ...metadata,
    manifest: { profileId: profile.id, recordCount: 1 },
  });
  await assert.rejects(
    async () =>
      await store.commit(
        'alice',
        'device',
        profile.id,
        denied.id,
        Buffer.from(JSON.stringify({ ...records[0], type: 'heart' }) + '\n'),
      ),
  );
  await assert.rejects(
    async () => await store.commit('alice', 'device', profile.id, denied.id, Buffer.from('')),
  );
  assert.deepEqual(await store.delete('alice', denied.id), { deleted: true });
  assert.throws(() => store.row('alice', denied.id));
  const json = store.begin('alice', 'device', profile.id, {
    ...metadata,
    day: '2026-10-09',
    format: 'json',
    manifest: { profileId: profile.id, recordCount: 2 },
  });
  await assert.rejects(
    () =>
      store.commit(
        'alice',
        'device',
        profile.id,
        json.id,
        Buffer.from(JSON.stringify({ schema: 'myself.md.export.v2', records })),
      ),
    /Unsupported export schema/,
  );
  await store.commit(
    'alice',
    'device',
    profile.id,
    json.id,
    Buffer.from(
      JSON.stringify({ schema: 'myself.md.export.v1', records: [records[0], records[0]] }),
    ),
  );
  assert.equal((await store.page('alice', json.id, 0, 1)).nextCursor, '1');
  assert.equal((await store.page('alice', json.id, 1, 1)).nextCursor, null);
  // One daily file per schema: a JSONL upload replaces the day's JSON file and frees its quota.
  const jsonl = store.begin('alice', 'device', profile.id, { ...metadata, day: '2026-10-09' });
  await store.commit('alice', 'device', profile.id, jsonl.id, bytes);
  assert.throws(() => store.row('alice', json.id), /not found/);
  assert.deepEqual(
    store
      .list('alice')
      .filter((item) => item.day === '2026-10-09')
      .map((item) => item.id),
    [jsonl.id],
  );
  await store.delete('alice', jsonl.id);

  // Seed a different historical identity without releasing a fictional schema.
  const coexistProfile = { ...profile, id: 'schema-isolation' };
  const coexistMetadata = {
    ...metadata,
    profile: coexistProfile,
    manifest: { profileId: coexistProfile.id, recordCount: 1 },
  };
  const older = store.begin('alice', 'device', coexistProfile.id, coexistMetadata);
  await store.commit('alice', 'device', coexistProfile.id, older.id, bytes);
  store.db
    .prepare('UPDATE exports SET schema=? WHERE id=?')
    .run('historical-schema-fixture', older.id);
  const newer = store.begin('alice', 'device', coexistProfile.id, coexistMetadata);
  await store.commit('alice', 'device', coexistProfile.id, newer.id, bytes);
  assert.equal(store.row('alice', older.id).schema, 'historical-schema-fixture');
  assert.deepEqual(await store.bytes(store.row('alice', older.id)), bytes);
  assert.equal(store.row('alice', newer.id).schema, profile.export.schema);
  await store.delete('alice', older.id);
  await store.delete('alice', newer.id);
  store.db.prepare('UPDATE exports SET created=? WHERE id=?').run(Date.now() - 31 * 86400000, id);
  store.cleanup();
  assert.ok(store.list('alice').some((item) => item.id === id));
  assert.deepEqual(await store.bytes(store.row('alice', id)), bytes);
  store.db.close();
  store = new CloudStore(path, key);
  assert.deepEqual(await store.bytes(store.row('alice', id)), bytes);
  await store.delete('alice', id);
  assert.throws(() => store.row('alice', id));
  await verifyCloudWrites(store);
  const storedReceipt = store.db
    .prepare('SELECT * FROM cloud_writes WHERE subject=? AND result IS NOT NULL LIMIT 1')
    .get('cloud-write-modes');
  assert.ok(storedReceipt);
  store.db.close();
  store = new CloudStore(path, key);
  assert.deepEqual(
    store.db
      .prepare('SELECT * FROM cloud_writes WHERE subject=? AND request=?')
      .get('cloud-write-modes', storedReceipt.request ?? ''),
    storedReceipt,
    'Delivery receipts survive a server restart',
  );

  console.log(
    'Cloud: account isolation, encryption, restart persistence, incomplete uploads, explicit sharing, selection revocation, bounds and retention passed.',
  );
} finally {
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
