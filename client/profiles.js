import * as SQLite from 'expo-sqlite';
import { parseProfile } from '../core/profiles.js';
const db = SQLite.openDatabaseSync('phone-data.sqlite');
db.execSync('CREATE TABLE IF NOT EXISTS export_profiles (owner TEXT PRIMARY KEY, value TEXT)');
/** @param {string} owner @returns {import('../core/profiles.js').ProfileState|null} */
export function loadProfiles(owner) {
  const row = /** @type {{value:string}|null} */ (
    db.getFirstSync('SELECT value FROM export_profiles WHERE owner=?', owner)
  );
  if (!row) return null;
  const state = /** @type {import('../core/profiles.js').ProfileState} */ (JSON.parse(row.value));
  if (
    !Array.isArray(state.profiles) ||
    !state.profiles.length ||
    !state.profiles.some((p) => p.id === state.activeId)
  )
    throw new Error('Invalid saved profiles.');
  return {
    activeId: state.activeId,
    profiles: state.profiles.map((p) => Object.assign(parseProfile(p), { id: p.id })),
  };
}
/** @param {string} owner @param {import('../core/profiles.js').ProfileState} state */
export function saveProfiles(owner, state) {
  db.runSync('INSERT OR REPLACE INTO export_profiles VALUES (?,?)', owner, JSON.stringify(state));
}
