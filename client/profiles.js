import { loadGrants } from './library.js';
import { phoneDatabase } from './phone-database.js';
import { qaEnabled, qaSession, qaSnapshot, updateQa } from './qa-runtime.js';
import { parseProfile, parseProfileState, parseAgentPermissions } from '../core/profiles.js';
const db = phoneDatabase();
db.execSync('CREATE TABLE IF NOT EXISTS export_profiles (owner TEXT PRIMARY KEY, value TEXT)');
db.execSync(
  'CREATE TABLE IF NOT EXISTS profile_pairing (id INTEGER PRIMARY KEY, owner TEXT, device TEXT)',
);
/** @param {string} owner @returns {import('../core/profiles.js').ProfileState|null} */
export function loadProfiles(owner) {
  if (qaEnabled && owner === qaSession.deviceId) return qaSnapshot().profiles;
  const row = /** @type {{value:string}|null} */ (
    db.getFirstSync('SELECT value FROM export_profiles WHERE owner=?', owner)
  );
  if (!row) return null;
  const state =
    /** @type {import('../core/profiles.js').ProfileState & {activeId?:string,agentConsentVersion?:number}} */ (
      JSON.parse(row.value)
    );
  if (!Array.isArray(state.profiles) || !state.profiles.length)
    throw new Error('Invalid saved profiles.');
  const legacyGrants = state.agentConsentVersion === 1 ? null : loadGrants(owner);
  const result = parseProfileState({
    profiles: state.profiles.map((p) => {
      const legacy = parseProfile(p, true);
      const permissions = parseAgentPermissions(p.agentPermissions);
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
          agentPermissions: legacyGrants
            ? {
                ...permissions,
                health: permissions.health && legacyGrants.health === true,
                time: permissions.time && legacyGrants.time === true,
                location: permissions.location && legacyGrants.location === true,
              }
            : permissions,
          agentAccess:
            p.agentAccess === undefined ? p.id === state.activeId : p.agentAccess === true,
        },
      );
    }),
  });
  if (legacyGrants) saveProfiles(owner, result);
  return result;
}
/** @param {string} owner @param {import('../core/profiles.js').ProfileState} state */
export function saveProfiles(owner, state) {
  state = parseProfileState(state);
  if (qaEnabled && owner === qaSession.deviceId) {
    updateQa({ profiles: state });
    return;
  }
  db.runSync(
    'INSERT OR REPLACE INTO export_profiles VALUES (?,?)',
    owner,
    JSON.stringify({ ...state, agentConsentVersion: 1 }),
  );
}

/** Record the owner-confirmed handoff before persisting its secure session.
 * @param {{owner:string,deviceId:string}} session */
export function prepareProfilePairing(session) {
  if (qaEnabled) return;
  if (
    !session.owner ||
    session.owner === 'local-device' ||
    !session.deviceId ||
    session.deviceId === 'local-device'
  )
    throw new Error('A signed-in paired phone is required to preserve setup.');
  if (!loadProfiles('local-device')) return;
  if (loadProfiles(session.deviceId))
    throw new Error('This paired phone already has profiles. Its saved setup was preserved.');
  db.runSync(
    'INSERT OR REPLACE INTO profile_pairing VALUES (1,?,?)',
    session.owner,
    session.deviceId,
  );
}

/** Finish before mounting the paired profile provider, including after an interrupted save.
 * Only this explicit handoff can consume anonymous setup; account switches cannot adopt it.
 * @param {{owner:string,deviceId:string}} session */
export function completeProfilePairing(session) {
  if (qaEnabled) return;
  db.withTransactionSync(() => {
    const pending = db.getFirstSync(
      'SELECT owner FROM profile_pairing WHERE id=1 AND owner=? AND device=?',
      session.owner,
      session.deviceId,
    );
    if (!pending) return;
    const local = loadProfiles('local-device');
    if (local) {
      if (loadProfiles(session.deviceId))
        throw new Error('This paired phone already has profiles. Its saved setup was preserved.');
      saveProfiles(session.deviceId, {
        profiles: local.profiles.map((profile) =>
          Object.assign({}, profile, {
            agentAccess: false,
            agentPermissions: { health: false, time: false, location: false, logs: false },
          }),
        ),
      });
      db.runSync('DELETE FROM export_profiles WHERE owner=?', 'local-device');
    }
    db.runSync('DELETE FROM profile_pairing WHERE id=1');
  });
}
