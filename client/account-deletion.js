import { forgetWhoop } from './whoop.js';
import { Directory, File, Paths } from 'expo-file-system';
import { loadProfiles } from './profiles.js';
import { forgetDestinationCredentials } from './destinations.js';
import { phoneDatabase } from './phone-database.js';
import { clearNativePurchase, clearAccountAllowance } from './billing.js';
const db = phoneDatabase();
db.execSync(
  "CREATE TABLE IF NOT EXISTS account_cleanup (id INTEGER PRIMARY KEY,owner TEXT,device TEXT,phase TEXT NOT NULL DEFAULT 'confirmed')",
);
if (
  !db
    .getAllSync('PRAGMA table_info(account_cleanup)')
    .some((column) => /** @type {{name:string}} */ (column).name === 'phase')
)
  db.execSync("ALTER TABLE account_cleanup ADD COLUMN phase TEXT NOT NULL DEFAULT 'confirmed'");
/** @typedef {{owner:string,deviceId:string}} AccountOwner */
/** @typedef {AccountOwner & {phase:'uncertain'|'confirmed'}} AccountCleanup */
/** @param {{owner:string,deviceId:string}} session */
export function queueAccountCleanup(session) {
  db.runSync(
    "INSERT OR REPLACE INTO account_cleanup(id,owner,device,phase) VALUES(1,?,?,'confirmed')",
    session.owner,
    session.deviceId,
  );
}
/** @returns {AccountCleanup|null} */
export function pendingAccountCleanup() {
  const row = /** @type {{owner:string,device:string,phase:'uncertain'|'confirmed'}|null} */ (
    db.getFirstSync('SELECT owner,device,phase FROM account_cleanup WHERE id=1')
  );
  return row ? { owner: row.owner, deviceId: row.device, phase: row.phase } : null;
}
/** Finish only after local cleanup and secure-session clearing both succeed. */
export function completeAccountCleanup() {
  db.runSync('DELETE FROM account_cleanup WHERE id=1');
}
/** Keep an uncertain remote outcome separate from permission to erase this phone.
 * @param {AccountOwner} session
 * @param {{request:(method:'GET'|'DELETE')=>Promise<import('../core/account-deletion.js').DeletionStatus>,stop:()=>Promise<void>,clear:()=>Promise<void>}} operations
 * @returns {Promise<import('../core/account-deletion.js').DeletionStatus|null>} */
export async function finishAccountDeletion(session, operations) {
  const pending = pendingAccountCleanup();
  if (pending && (pending.owner !== session.owner || pending.deviceId !== session.deviceId))
    throw new Error('Finish the pending account deletion before changing accounts.');
  if (!pending)
    db.runSync(
      "INSERT INTO account_cleanup(id,owner,device,phase) VALUES(1,?,?,'uncertain')",
      session.owner,
      session.deviceId,
    );
  await operations.stop();
  let result = null;
  if (pending?.phase !== 'confirmed') {
    try {
      result = await operations.request(pending ? 'GET' : 'DELETE');
      if (pending && result.state === 'active') result = await operations.request('DELETE');
    } catch (error) {
      // A first, explicit HTTP rejection proves this request was not accepted. A
      // later rejection cannot disprove an earlier request with a lost response.
      if (
        !pending &&
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'HTTPError' &&
        'status' in error &&
        typeof error.status === 'number' &&
        [400, 401, 403, 404, 405, 422, 429].includes(error.status)
      )
        completeAccountCleanup();
      throw error;
    }
    if (result.subject !== session.owner)
      throw new Error(
        'The deletion response did not match this account. Retry to check its status.',
      );
    if (result.state === 'active' || result.state === 'unavailable') {
      if (!pending) completeAccountCleanup();
      throw new Error(result.error ?? 'Deletion could not start.');
    }
    if (!['running', 'failed', 'completed'].includes(result.state))
      throw new Error('The deletion outcome is unknown. Retry to check its status.');
    queueAccountCleanup(session);
  }
  await deleteLocalAccount(session);
  await operations.clear();
  completeAccountCleanup();
  return result;
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
  await forgetWhoop(session.owner);
  await clearNativePurchase();
  clearAccountAllowance();
  db.withTransactionSync(() => {
    for (const [table, column, value] of [
      ['whoop_receipts', 'owner', session.owner],
      ['health_export_receipts', 'owner', session.owner],
      ['records', 'owner', session.owner],
      ['records', 'owner', device],
      ['location_capture_receipts', 'owner', session.owner],
      ['location_capture_receipts', 'device', device],
      ['settings', 'owner', session.deviceId || 'local-device'],
      ['profile_sync_base', 'owner', session.owner],
      ['profile_sync_base', 'device', device],
      ['export_profiles', 'owner', session.deviceId || 'local-device'],
      ['profile_pairing', 'owner', session.owner],
      ['profile_pairing', 'device', device],
      ['export_folders', 'owner', session.owner],
      ['export_folders', 'device', device],
      ['profile_schedules', 'device', session.deviceId || 'local-device'],
      ['activity_history', 'owner', session.owner],
      ['activity_history', 'device', device],
      ['debug_log', 'owner', session.owner],
      ['debug_log', 'device', device],
      ['debug_content', 'owner', session.owner],
      ['debug_content', 'device', device],
      ['debug_sharing', 'owner', session.owner],
      ['debug_sharing', 'device', device],
      ['profile_log_consent', 'owner', session.owner],
      ['profile_log_consent', 'device', device],
    ]) {
      if (
        db.getFirstSync("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table ?? '')
      )
        db.runSync(`DELETE FROM ${table} WHERE ${column}=?`, value ?? '');
    }
  });
}
