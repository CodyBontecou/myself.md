import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRemoteSupportCleanup } from '../server/support-remote.js';
import { deleteLegacySupport } from '../server/support-cleanup.js';
const thread = '11111111111111111';
const channel = '22222222222222222';
const config = { SUPPORT_DISCORD_BOT_TOKEN: 'fixture-bot', SUPPORT_DISCORD_CHANNEL_ID: channel };
const db = new DatabaseSync(':memory:');
/** @param {string} subject */
function retained(subject) {
  return {
    conversation: db.prepare('SELECT * FROM support_conversations WHERE subject=?').get(subject),
    messages: db.prepare('SELECT * FROM support_messages WHERE subject=?').all(subject),
  };
}
/** @param {string|null} checkpoint */
function seed(checkpoint = thread) {
  db.prepare('INSERT OR REPLACE INTO support_conversations VALUES(?,?)').run('owner', checkpoint);
  db.prepare('INSERT OR REPLACE INTO support_messages VALUES(?,?)').run('owner', 'saved-message');
}
try {
  await deleteLegacySupport(db, 'owner', {}, async () => {
    throw new Error('New accounts have no Discord work');
  });
  db.exec(`CREATE TABLE support_conversations(subject TEXT PRIMARY KEY,thread TEXT);
    CREATE TABLE support_messages(subject TEXT PRIMARY KEY,value TEXT);`);
  db.prepare('INSERT INTO support_conversations VALUES(?,?)').run('other', thread);
  db.prepare('INSERT INTO support_messages VALUES(?,?)').run('other', 'keep');
  seed(null);
  await deleteLegacySupport(db, 'owner', {}, async () => {
    throw new Error('Conversations without threads have no Discord work');
  });
  assert.equal(retained('owner').conversation, undefined);
  assert.equal(retained('owner').messages.length, 0);
  assert.equal(retained('other').messages.length, 1);

  seed();
  await assert.rejects(
    () => deleteLegacySupport(db, 'owner', {}),
    /requires Discord configuration/,
  );
  assert.equal(retained('owner').messages.length, 1);
  await assert.rejects(
    () =>
      deleteLegacySupport(db, 'owner', config, async () =>
        Response.json({ id: thread, parent_id: '33333333333333333' }),
      ),
    /configured parent channel/,
  );
  assert.equal(retained('owner').conversation?.thread, thread);
  assert.equal(retained('owner').messages.length, 1);

  /** @type {string[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const failingDelete = async (url, options) => {
    assert.equal(String(url), `https://discord.com/api/v10/channels/${thread}`);
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bot fixture-bot');
    assert.equal(options?.redirect, 'error');
    calls.push(options?.method ?? 'GET');
    return options?.method === 'DELETE'
      ? new Response(null, { status: 429 })
      : Response.json({ id: thread, parent_id: channel });
  };
  await assert.rejects(
    () => deleteLegacySupport(db, 'owner', config, failingDelete),
    /retry automatically/,
  );
  assert.deepEqual(calls, ['GET', 'DELETE']);
  assert.equal(retained('owner').conversation?.thread, thread);
  assert.equal(
    retained('owner').messages.length,
    1,
    'Failed Discord cleanup retains retry checkpoints',
  );
  await deleteLegacySupport(db, 'owner', config, async (_url, options) => {
    calls.push(options?.method ?? 'GET');
    return options?.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : Response.json({ id: thread, parent_id: channel });
  });
  assert.deepEqual(calls, ['GET', 'DELETE', 'GET', 'DELETE']);
  assert.equal(retained('owner').conversation, undefined);
  assert.equal(retained('owner').messages.length, 0);
  assert.equal(retained('other').messages.length, 1, 'Cleanup stays account-scoped');

  seed();
  let missingCalls = 0;
  await deleteLegacySupport(db, 'owner', config, async () => {
    missingCalls++;
    return new Response(null, { status: 404 });
  });
  assert.equal(missingCalls, 1, 'An already deleted thread is complete without another DELETE');
  assert.equal(retained('owner').conversation, undefined);
  seed();
  await deleteLegacySupport(db, 'owner', config, async (_url, options) =>
    options?.method === 'DELETE'
      ? new Response(null, { status: 404 })
      : Response.json({ id: thread, parent_id: channel }),
  );
  assert.equal(retained('owner').conversation, undefined, 'A concurrent deletion is idempotent');
  seed();
  await assert.rejects(
    () => deleteLegacySupport(db, 'owner', config, async () => new Response(null, { status: 503 })),
    /retry automatically/,
  );
  assert.equal(retained('owner').messages.length, 1);
  console.log(
    'Legacy support cleanup: absent tables, account isolation, parent verification, retry checkpoints and idempotent Discord deletion pass.',
  );
} finally {
  db.close();
}

// The retired integration only retains erasure, with failure propagated for account-deletion retry.
/** @type {{url:string,body:unknown}[]} */
const remoteCalls = [];
const remoteCleanup = createRemoteSupportCleanup(
  { SUPPORT_ISOBOT_ORIGIN: 'https://support.fixture', SUPPORT_ISOBOT_TOKEN: 'fixture-token' },
  async (url, options) => {
    remoteCalls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    assert.equal(options?.method, 'POST');
    assert.equal(new Headers(options?.headers).get('X-Support-Owner'), 'owner');
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer fixture-token');
    return Response.json({ deleted: true });
  },
);
assert.deepEqual(Object.keys(remoteCleanup), ['deleteRemoteSupport']);
await remoteCleanup.deleteRemoteSupport('owner');
assert.deepEqual(remoteCalls, [
  { url: 'https://support.fixture/api/support/v1', body: { action: 'deleteAccount' } },
]);
await createRemoteSupportCleanup({}, async () => {
  throw new Error('Unexpected request');
}).deleteRemoteSupport('owner');
await assert.rejects(
  () =>
    createRemoteSupportCleanup(
      { SUPPORT_ISOBOT_ORIGIN: 'https://support.fixture', SUPPORT_ISOBOT_TOKEN: 'fixture-token' },
      async () => Response.json({ error: 'Retry cleanup' }, { status: 503 }),
    ).deleteRemoteSupport('owner'),
  /Retry cleanup/,
);
console.log(
  'Historical remote cleanup: erasure-only surface, ownership, unconfigured no-op and retry propagation pass.',
);
