import { Directory, File, Paths } from 'expo-file-system';
import { loadProfiles } from './profiles.js';
import { forgetDestinationCredentials } from './destinations.js';
import { phoneDatabase } from './phone-database.js';
import { clearNativePurchase, clearAccountAllowance } from './billing.js';
const db = phoneDatabase();
db.execSync(
  'CREATE TABLE IF NOT EXISTS account_cleanup (id INTEGER PRIMARY KEY,owner TEXT,device TEXT)',
);
/** @param {{owner:string,deviceId:string}} session */
export function queueAccountCleanup(session) {
  db.runSync(
    'INSERT OR REPLACE INTO account_cleanup VALUES(1,?,?)',
    session.owner,
    session.deviceId,
  );
}
/** @returns {{owner:string,deviceId:string}|null} */
export function pendingAccountCleanup() {
  const row = /** @type {{owner:string,device:string}|null} */ (
    db.getFirstSync('SELECT owner,device FROM account_cleanup WHERE id=1')
  );
  return row ? { owner: row.owner, deviceId: row.device } : null;
}
/** Finish only after local cleanup and secure-session clearing both succeed. */
export function completeAccountCleanup() {
  db.runSync('DELETE FROM account_cleanup WHERE id=1');
}
/** Remove account-owned app records on this phone. System health data and external destinations remain user-owned.
 * @param {{owner:string,deviceId:string}} session */
export async function deleteLocalAccount(session) {
  queueAccountCleanup(session);
  const device = session.deviceId || 'local-device';
  const profiles = loadProfiles(device)?.profiles ?? [];
  await profiles.reduce(async (previous, profile) => {
    await previous;
    await forgetDestinationCredentials(device, profile.id);
    for (const base of [Paths.document, Paths.cache]) {
      const directory = new Directory(
        base,
        profile.export.folderName,
        encodeURIComponent(device),
        encodeURIComponent(profile.id),
      );
      if (directory.exists) directory.delete();
    }
  }, Promise.resolve());
  if (
    db.getFirstSync("SELECT name FROM sqlite_master WHERE type='table' AND name='activity_history'")
  ) {
    const events = /** @type {{value:string}[]} */ (
      db.getAllSync(
        'SELECT value FROM activity_history WHERE owner=? OR device=?',
        session.owner,
        device,
      )
    );
    for (const row of events) {
      const event = JSON.parse(row.value);
      for (const artifact of Array.isArray(event.artifacts) ? event.artifacts : []) {
        if (typeof artifact.uri !== 'string' || !artifact.uri.startsWith('file:')) continue;
        const file = new File(artifact.uri);
        if (
          [Paths.document, Paths.cache].some((base) =>
            file.uri.startsWith(`${base.uri.replace(/\/$/, '')}/`),
          ) &&
          file.exists
        )
          file.delete();
      }
    }
  }
  await clearNativePurchase();
  clearAccountAllowance();
  db.withTransactionSync(() => {
    for (const [table, column, value] of [
      ['records', 'owner', session.owner],
      ['records', 'owner', device],
      ['settings', 'owner', session.deviceId || 'local-device'],
      ['export_profiles', 'owner', session.deviceId || 'local-device'],
      ['profile_schedules', 'device', session.deviceId || 'local-device'],
      ['activity_history', 'owner', session.owner],
      ['activity_history', 'device', device],
      ['debug_log', 'owner', session.owner],
      ['debug_log', 'device', device],
      ['debug_content', 'owner', session.owner],
      ['debug_content', 'device', device],
      ['debug_sharing', 'owner', session.owner],
      ['debug_sharing', 'device', device],
    ]) {
      if (
        db.getFirstSync("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table ?? '')
      )
        db.runSync(`DELETE FROM ${table} WHERE ${column}=?`, value ?? '');
    }
  });
}
