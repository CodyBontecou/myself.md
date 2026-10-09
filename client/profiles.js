import * as SQLite from 'expo-sqlite';
import { qaEnabled, qaSession, qaSnapshot, updateQa } from './qa-runtime.js';
import { parseProfile, parseProfileState } from '../core/profiles.js';
const db = SQLite.openDatabaseSync('phone-data.sqlite');
db.execSync('CREATE TABLE IF NOT EXISTS export_profiles (owner TEXT PRIMARY KEY, value TEXT)');
/** @param {string} owner @returns {import('../core/profiles.js').ProfileState|null} */
export function loadProfiles(owner) {
  if (qaEnabled && owner === qaSession.deviceId) return qaSnapshot().profiles;
  const row = /** @type {{value:string}|null} */ (
    db.getFirstSync('SELECT value FROM export_profiles WHERE owner=?', owner)
  );
  if (!row) return null;
  const state = /** @type {import('../core/profiles.js').ProfileState & {activeId?:string}} */ (
    JSON.parse(row.value)
  );
  if (!Array.isArray(state.profiles) || !state.profiles.length)
    throw new Error('Invalid saved profiles.');
  return {
    profiles: state.profiles.map((p) => {
      const legacy = parseProfile(p, true);
      return Object.assign(
        parseProfile({
          ...legacy,
          selection: {
            health: legacy.selection.health.filter((key) => key.startsWith('native:')),
            time: legacy.selection.time.filter((key) => key.startsWith('native:')),
            location: legacy.selection.location.filter((key) => key.startsWith('native:')),
          },
        }),
        {
          id: p.id,
          agentAccess:
            p.agentAccess === undefined ? p.id === state.activeId : p.agentAccess === true,
        },
      );
    }),
  };
}
/** @param {string} owner @param {import('../core/profiles.js').ProfileState} state */
export function saveProfiles(owner, state) {
  state = parseProfileState(state);
  if (qaEnabled && owner === qaSession.deviceId) {
    updateQa({ profiles: state });
    return;
  }
  db.runSync('INSERT OR REPLACE INTO export_profiles VALUES (?,?)', owner, JSON.stringify(state));
}
