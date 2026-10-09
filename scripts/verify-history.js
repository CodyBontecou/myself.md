import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportEvent, addArtifact, parseHistoryEvent } from '../core/history.js';
import { relatedHistoryEvents, historyOutcome } from '../core/history-display.js';
import { parseProfile } from '../core/profiles.js';
import { CloudStore } from '../server/cloud-store.js';
import { HistoryStore } from '../server/history-store.js';
const directory = mkdtempSync(join(tmpdir(), 'history-test-'));
const codec = new CloudStore(join(directory, 'cloud.sqlite'), randomBytes(32));
const path = join(directory, 'history.sqlite');
let store = new HistoryStore(path, codec);
const stamp = new Date().toISOString();
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Sleep snapshot',
    selection: { health: ['imported:sleep'], time: [], location: [] },
    export: { destination: 'http', httpUrl: 'https://example.com/private?token=secret' },
  }),
  id: 'profile',
};
let event = exportEvent({
  id: 'event',
  profile,
  actor: 'manual',
  interval: { start: stamp, end: stamp },
  stamp,
  timezone: 'UTC',
});
const artifact = {
  day: '2026-10-08',
  name: 'sleep.json',
  format: 'json',
  recordCount: 12,
  bytes: 120,
  uri: null,
  cloudId: null,
  checksum: null,
  partial: false,
};
try {
  assert.equal(event.destination, 'example.com');
  profile.name = 'Renamed';
  profile.selection.health.push('native:steps');
  assert.equal(event.profile.name, 'Sleep snapshot');
  assert.deepEqual(event.profile.selection.health, ['imported:sleep']);
  event = addArtifact(event, artifact, stamp);
  event = addArtifact(event, { ...artifact, format: 'jsonl' }, stamp);
  assert.equal(event.recordCount, 12);
  event = addArtifact(event, { ...artifact, recordCount: 12 }, stamp);
  assert.equal(event.artifacts.length, 2);
  assert.equal(event.recordCount, 12);
  const parsed = parseHistoryEvent({
    ...event,
    credentials: 'secret',
    records: [{ private: true }],
  });
  assert.ok(!JSON.stringify(parsed).includes('secret'));
  store.record('alice', 'phone', event);
  store.record('alice', 'other-phone', { ...event, id: 'other' });
  assert.equal(store.get('bob', 'event'), null);
  assert.equal(store.list('alice', 'phone').events.length, 1);
  assert.equal(store.list('alice', null).events.length, 2);
  assert.equal(store.list('bob', null).events.length, 0);
  const linked = Object.assign({}, event, { id: 'linked', relatedId: 'cloud-file' });
  const uploaded = Object.assign({}, event, {
    id: 'upload',
    artifacts: [Object.assign({}, artifact, { cloudId: 'cloud-file' })],
  });
  assert.deepEqual(relatedHistoryEvents([uploaded, linked], uploaded), [linked]);
  store.record('alice', 'phone', uploaded);
  store.record('alice', 'phone', linked);
  store.record('bob', 'phone', { ...linked, id: 'bob-linked' });
  assert.deepEqual(
    store.related('alice', uploaded).map((e) => e.id),
    ['linked'],
  );
  assert.equal(historyOutcome({ ...event, status: 'complete' }), 'Delivered');
  const row = store.db.prepare('SELECT value FROM activity WHERE id=?').get('event');
  assert.ok(row && !Buffer.from(/** @type {Uint8Array} */ (row.value)).includes('Sleep snapshot'));
  store.update('alice', 'event', { status: 'complete' });
  store.record('alice', 'phone', {
    ...event,
    id: 'pending',
    kind: 'access',
    actor: 'agent',
    target: 'phone',
    status: 'ready',
  });
  store.record('alice', 'phone', { ...event, id: 'phone-running' });
  store.db.close();
  store = new HistoryStore(path, codec);
  assert.equal(store.get('alice', 'event')?.event.status, 'complete');
  assert.equal(store.get('alice', 'pending')?.event.status, 'interrupted');
  assert.equal(store.get('alice', 'phone-running')?.event.status, 'running');
  store.record('alice', 'phone', {
    ...event,
    id: 'old',
    startedAt: new Date(Date.now() - 91 * 86400000).toISOString(),
  });
  store.list('alice', 'phone');
  assert.equal(store.get('alice', 'old'), null);
  for (let i = 0; i < 52; i++) store.record('alice', 'pages', { ...event, id: `page-${i}` });
  assert.equal(store.list('alice', 'pages').events.length, 50);
  assert.equal(store.list('alice', 'pages').hasMore, true);
  assert.equal(store.list('alice', 'pages', 50).events.length, 2);
  console.log(
    'History: metadata snapshots, credential stripping, artifact retry counts, encrypted tenant/device isolation, restart outcomes, pagination and retention passed.',
  );
} finally {
  store.db.close();
  codec.db.close();
  rmSync(directory, { recursive: true, force: true });
}
