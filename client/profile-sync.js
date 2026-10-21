import { saveAgentProfiles } from './profile-logs.js';
import { phoneDatabase } from './phone-database.js';
import { parseProfileState } from '../core/profiles.js';
const db = phoneDatabase();
db.execSync(
  'CREATE TABLE IF NOT EXISTS profile_sync_base (owner TEXT,device TEXT,value TEXT,PRIMARY KEY(owner,device))',
);
/** @param {import('./session.js').Session} session @returns {import('../core/profiles.js').ProfileState|null} */
export function profileSyncBase(session) {
  const row = db.getFirstSync(
    'SELECT value FROM profile_sync_base WHERE owner=? AND device=?',
    session.owner,
    session.deviceId,
  );
  return row ? parseProfileState(JSON.parse(String(row.value))) : null;
}
/** @param {import('./session.js').Session} session @param {import('../core/profiles.js').ProfileState} state */
export function saveProfileSyncBase(session, state) {
  db.runSync(
    'INSERT OR REPLACE INTO profile_sync_base VALUES (?,?,?)',
    session.owner,
    session.deviceId,
    JSON.stringify(parseProfileState(state)),
  );
}

/** Commit the received state and its merge baseline together; failed saves must not advance the baseline.
 * @param {import('./session.js').Session} session @param {import('../core/profiles.js').ProfileState} state @param {import('../core/profiles.js').ProfileState} base */
export function commitSyncedProfiles(session, state, base) {
  db.withTransactionSync(() => {
    saveAgentProfiles(session, state);
    saveProfileSyncBase(session, base);
  });
}
