import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BillingStore } from '../server/billing-store.js';
import { exportAllowance } from '../core/billing.js';
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
  console.log(
    'Billing: five shared uses, concurrent reservations, failures, retries, offline merge, purchase ownership, revocation, and cloud upload bounds passed.',
  );
} finally {
  store.db.close();
  peer.db.close();
  rmSync(directory, { recursive: true, force: true });
}
