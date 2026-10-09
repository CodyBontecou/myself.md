import { Buffer } from 'node:buffer';
import { backup, DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { CloudStore } from '../server/cloud-store.js';
import { r2Store } from '../server/r2-store.js';
const [command, destination] = process.argv.slice(2);
if (!['status', 'backup', 'migrate', 'restore', 'compact'].includes(command ?? ''))
  throw new Error(
    'Usage: cloud-storage.js status|backup PATH|migrate|restore|compact. Stop the service before restore or compact.',
  );
const key = Buffer.from(process.env.CLOUD_ENCRYPTION_KEY ?? '', 'hex');
const store = new CloudStore(
  join(process.env.DATA_DIR ?? '.local', 'cloud.sqlite'),
  key,
  r2Store(process.env),
);
/** Keep ciphertext and network requests bounded while processing a large database.
 * @param {'migrate'|'restore'} direction @param {number} [total] @returns {Promise<number>} */
async function transfer(direction, total = 0) {
  const count =
    direction === 'migrate'
      ? (await store.migrateObjects()).migrated
      : (await store.restoreObjects()).restored;
  return count === 128 ? transfer(direction, total + count) : total + count;
}
try {
  if (command === 'backup') {
    if (!destination) throw new Error('Specify a private backup destination.');
    if (!(store.db instanceof DatabaseSync))
      throw new Error('Backup requires a local SQLite database.');
    await backup(store.db, destination);
    chmodSync(destination, 0o600);
    console.log('Encrypted database backup completed.');
  } else if (command === 'migrate') {
    if (!store.objects) throw new Error('Configure R2 before migration.');
    console.log({ migrated: await transfer('migrate') });
    await store.sweepObjects();
  } else if (command === 'restore') {
    console.log({ restored: await transfer('restore') });
  } else if (command === 'compact') {
    store.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
    console.log('Cloud database compacted.');
  }
  console.log(
    store.db
      .prepare(
        `SELECT COUNT(*) exports,
    COALESCE(SUM(content IS NOT NULL),0) sqliteFiles,
    COALESCE(SUM(object_key IS NOT NULL),0) r2Files,
    COALESCE(SUM(size),0) bytes FROM exports`,
      )
      .get(),
  );
} finally {
  store.db.close();
}
