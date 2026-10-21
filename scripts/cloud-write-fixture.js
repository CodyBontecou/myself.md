import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { parseProfile } from '../core/profiles.js';
/** @param {string} value */
const record = (value) => ({
  domain: 'health',
  type: 'sleep',
  source: 'native',
  start: null,
  end: null,
  native: { value },
});

/** Exercise identical write semantics with SQLite bytes and encrypted R2 objects.
 * @param {import('../server/cloud-store.js').CloudStore} store */
export async function verifyCloudWrites(store) {
  const subject = 'cloud-write-modes',
    device = 'owned-phone',
    day = '2026-10-17';
  const profile = {
    ...parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'Cloud modes',
      selection: { health: ['native:sleep'], time: [], location: [] },
      export: { destination: 'cloud' },
    }),
    id: 'modes',
  };
  /** @param {string} operation @param {import('../core/export-files.js').ExportWriteMode} mode @param {string} [exportDay] */
  const input = (operation, mode, exportDay = day) => ({
    profile: { ...profile, export: { ...profile.export, writeMode: mode } },
    day: exportDay,
    format: 'jsonl',
    manifest: {
      schema: profile.export.schema,
      profileId: profile.id,
      billingOperationId: operation,
      recordCount: 1,
      captures: [{ operation }],
      failures: [],
      status: 'complete',
    },
  });
  /** @param {string} value */
  const bytes = (value) => Buffer.from(JSON.stringify(record(value)) + '\n');
  /** @param {string} operation @param {import('../core/export-files.js').ExportWriteMode} mode @param {string} [exportDay] */
  const begin = (operation, mode, exportDay = day) =>
    store.begin(subject, device, profile.id, input(operation, mode, exportDay));
  /** @param {string} id @param {string} value */
  const commit = (id, value) => store.commit(subject, device, profile.id, id, bytes(value));
  /** @param {string} id */
  const read = async (id) => (await store.page(subject, id, 0, 100)).records;
  const first = begin('first', 'new_file');
  assert.equal(begin('first', 'new_file').id, first.id, 'A pending retry reuses the upload');
  await commit(first.id, 'first');
  const secondInput = input('second', 'new_file');
  secondInput.manifest.status = 'partial';
  const second = store.begin(subject, device, profile.id, secondInput);
  await commit(second.id, 'second');
  assert.equal(store.list(subject).length, 2);
  const appended = begin('append', 'append');
  const receipt = await commit(appended.id, 'third');
  assert.equal(receipt.recordCount, 2);
  assert.equal(receipt.partial, true, 'Append preserves partial status from the existing file');
  assert.equal(begin('append', 'append').partial, true);
  assert.deepEqual(await read(appended.id), [record('second'), record('third')]);
  assert.deepEqual(
    await read(first.id),
    [record('first')],
    'Older New file snapshots remain unchanged',
  );
  const metadata = store.metadata(store.row(subject, appended.id)).manifest;
  assert.equal(metadata.recordCount, 2);
  assert.equal(/** @type {unknown[]} */ (metadata.captures).length, 2);
  assert.equal(
    store.row(subject, appended.id).size,
    Buffer.from(await store.bytes(store.row(subject, appended.id))).length,
  );
  assert.equal(
    (await commit(appended.id, 'third')).recordCount,
    2,
    'PUT retry does not append twice',
  );
  assert.equal(
    begin('append', 'append').completed,
    true,
    'Lost-response retry returns the completed receipt',
  );
  await assert.rejects(commit(appended.id, 'different'), /different bytes/);
  assert.throws(() => begin('append', 'replace'), /different profile settings/);
  await assert.rejects(
    store.commit('other-owner', device, profile.id, appended.id, bytes('third')),
    /not found/,
  );
  await assert.rejects(
    store.commit(subject, 'foreign-phone', profile.id, appended.id, bytes('third')),
    /not found/,
  );
  const replacement = begin('replace', 'replace');
  await commit(replacement.id, 'replacement');
  assert.deepEqual(await read(replacement.id), [record('replacement')]);
  assert.deepEqual(await read(first.id), [record('first')]);
  assert.equal(
    begin('append', 'append').completed,
    true,
    'Replacing an artifact must not erase the retry receipt',
  );
  assert.equal(store.list(subject).length, 2);
  const skip = begin('skip', 'skip');
  assert.equal((await commit(skip.id, 'ignored')).id, replacement.id);
  assert.equal(begin('skip', 'skip').completed, true);
  assert.deepEqual(await read(replacement.id), [record('replacement')]);
  const denied = begin('denied', 'append');
  await assert.rejects(
    store.commit(subject, device, profile.id, denied.id, bytes('denied'), () => {
      throw new Error('Owner revoked upload');
    }),
    /revoked/,
  );
  assert.deepEqual(await read(replacement.id), [record('replacement')]);
  assert.equal(begin('denied', 'append').completed, false);
  const a = begin('race-a', 'append'),
    b = begin('race-b', 'append');
  const raced = await Promise.allSettled([commit(a.id, 'race-a'), commit(b.id, 'race-b')]);
  assert.equal(raced.filter((result) => result.status === 'fulfilled').length, 1);
  const failed = raced[0]?.status === 'rejected' ? a : b;
  await commit(failed.id, failed === a ? 'race-a' : 'race-b');
  const latest = store.latest(subject, device, profile.id, day, profile.export.schema);
  assert.ok(latest);
  const merged = await read(latest.id);
  assert.equal(merged.length, 3, 'A conflicting append can retry without losing either writer');
  assert.ok(
    merged.some((row) => JSON.stringify(row.native) === JSON.stringify({ value: 'race-a' })),
  );
  assert.ok(
    merged.some((row) => JSON.stringify(row.native) === JSON.stringify({ value: 'race-b' })),
  );
  const broken = begin('broken', 'replace');
  await assert.rejects(
    store.commit(subject, device, profile.id, broken.id, Buffer.from('broken JSONL')),
  );
  assert.equal((await read(latest.id)).length, 3, 'Invalid uploads preserve the previous file');
  const legacyInput = input('legacy-json', 'new_file', '2026-10-16');
  const legacy = store.begin(subject, device, profile.id, { ...legacyInput, format: 'json' });
  await store.commit(
    subject,
    device,
    profile.id,
    legacy.id,
    Buffer.from(JSON.stringify({ schema: profile.export.schema, records: [record('legacy')] })),
  );
  const converted = begin('legacy-append', 'append', '2026-10-16');
  await commit(converted.id, 'jsonl');
  assert.deepEqual(
    await read(converted.id),
    [record('legacy'), record('jsonl')],
    'Append preserves legacy JSON when delivering JSONL',
  );
  // Publication order, rather than staging order, defines the latest daily file.
  const delayed = begin('delayed', 'append', '2026-10-15');
  const snapshotA = begin('later-a', 'new_file', '2026-10-15');
  await commit(snapshotA.id, 'later-a');
  const snapshotB = begin('later-b', 'new_file', '2026-10-15');
  await commit(snapshotB.id, 'later-b');
  await commit(delayed.id, 'delayed');
  assert.equal(
    store.latest(subject, device, profile.id, '2026-10-15', profile.export.schema)?.id,
    delayed.id,
  );
  assert.deepEqual(await read(delayed.id), [record('later-b'), record('delayed')]);
  assert.deepEqual(await read(snapshotA.id), [record('later-a')]);
  await store.delete(subject, first.id);
  assert.equal(
    begin('first', 'new_file').completed,
    true,
    'A retry cannot resurrect an owner-deleted snapshot',
  );
  assert.ok(!store.list(subject).some((item) => item.id === first.id));
  // Capacity is checked against merged bytes; failure must preserve the last good file.
  const storageStatus = store.storageStatus;
  const usedBytes = store.storageStatus(subject).usedBytes;
  store.storageStatus = (owner) => ({
    ...storageStatus.call(store, owner),
    limitBytes: usedBytes + 1,
  });
  try {
    const quota = begin('quota-append', 'append');
    await assert.rejects(commit(quota.id, 'quota'), /quota reached/);
    assert.equal((await read(latest.id)).length, 3);
    const newFile = begin('quota-snapshot', 'new_file');
    await assert.rejects(commit(newFile.id, 'quota-new-file'), /quota reached/);
    assert.equal(store.list(subject).length, 4);
  } finally {
    store.storageStatus = storageStatus;
  }
  const stored = store.list(subject).find((item) => item.id === latest.id);
  assert.equal(stored?.writeMode, 'append');
  assert.equal(stored?.recordCount, 3);
  const largeMetadata = input('metadata-base', 'new_file', '2026-10-14');
  const captures = [{ detail: 'x'.repeat(600000) }];
  const largeBase = store.begin(subject, device, profile.id, {
    ...largeMetadata,
    manifest: { ...largeMetadata.manifest, captures },
  });
  await commit(largeBase.id, 'metadata-base');
  const largeAppendInput = input('metadata-append', 'append', '2026-10-14');
  const largeAppend = store.begin(subject, device, profile.id, {
    ...largeAppendInput,
    manifest: { ...largeAppendInput.manifest, captures },
  });
  await assert.rejects(commit(largeAppend.id, 'metadata-append'), /metadata is limited/);
  assert.deepEqual(await read(largeBase.id), [record('metadata-base')]);
  assert.equal(store.list('other-owner').length, 0);
  console.log(
    `Cloud write modes (${store.objects ? 'R2' : 'SQLite'}): snapshots, append, replace, skip, receipts, concurrency, metadata, legacy formats and ownership passed.`,
  );
}
