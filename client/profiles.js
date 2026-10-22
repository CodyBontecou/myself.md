import { canonicalServiceOrigin } from '../core/hosting.js';
import { loadGrants } from './library.js';
import { phoneDatabase } from './phone-database.js';
import { qaEnabled, qaSession, qaSnapshot, updateQa } from './qa-runtime.js';
import { parseProfile, parseProfileState, parseAgentPermissions } from '../core/profiles.js';
const db = phoneDatabase();
db.execSync('CREATE TABLE IF NOT EXISTS export_profiles (owner TEXT PRIMARY KEY, value TEXT)');
db.execSync(
  'CREATE TABLE IF NOT EXISTS profile_pairing (id INTEGER PRIMARY KEY, owner TEXT, device TEXT)',
);
db.execSync(
  'CREATE TABLE IF NOT EXISTS profile_connections (owner TEXT NOT NULL, device TEXT PRIMARY KEY)',
);
// Existing rows have no verified service binding; never use them as recovery sources.
for (const table of ['profile_pairing', 'profile_connections']) {
  if (!db.getFirstSync(`SELECT name FROM pragma_table_info('${table}') WHERE name='scope'`))
    db.execSync(`ALTER TABLE ${table} ADD COLUMN scope TEXT NOT NULL DEFAULT ''`);
}
/** @typedef {{owner:string,deviceId:string,server:string,issuer:string}} PairingIdentity */
/** @param {PairingIdentity} session */
function serviceScope(session) {
  if (!session.server || !session.issuer)
    throw new Error('A signed-in paired phone is required to preserve setup.');
  return JSON.stringify([canonicalServiceOrigin(session.server), session.issuer]);
}
/** Cache validation work, never the database read or a caller's mutable state.
 * @type {{owner:string,raw:string,normalized:string}|null} */
let validatedProfiles = null;
/** @param {string} owner @returns {import('../core/profiles.js').ProfileState|null} */
export function loadProfiles(owner) {
  if (qaEnabled && owner === qaSession.deviceId) return qaSnapshot().profiles;
  const row = /** @type {{value:string}|null} */ (
    db.getFirstSync('SELECT value FROM export_profiles WHERE owner=?', owner)
  );
  if (row && validatedProfiles?.owner === owner && validatedProfiles.raw === row.value)
    return /** @type {import('../core/profiles.js').ProfileState} */ (
      JSON.parse(validatedProfiles.normalized)
    );
  validatedProfiles = null;
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
  else validatedProfiles = { owner, raw: row.value, normalized: JSON.stringify(result) };
  return result;
}
/** @param {string} owner @param {import('../core/profiles.js').ProfileState} state */
export function saveProfiles(owner, state) {
  state = parseProfileState(state);
  if (qaEnabled && owner === qaSession.deviceId) {
    updateQa({ profiles: state });
    return;
  }
  validatedProfiles = null;
  db.runSync(
    'INSERT OR REPLACE INTO export_profiles VALUES (?,?)',
    owner,
    JSON.stringify({ ...state, agentConsentVersion: 1 }),
  );
}

/** Record the owner-confirmed handoff before persisting its secure session.
 * @param {PairingIdentity} session */
export function prepareProfilePairing(session) {
  if (qaEnabled) return;
  if (
    !session.owner ||
    session.owner === 'local-device' ||
    !session.deviceId ||
    session.deviceId === 'local-device'
  )
    throw new Error('A signed-in paired phone is required to preserve setup.');
  const scope = serviceScope(session);
  if (!loadProfiles('local-device')) return;
  if (loadProfiles(session.deviceId))
    throw new Error('This paired phone already has profiles. Its saved setup was preserved.');
  db.runSync(
    'INSERT OR REPLACE INTO profile_pairing (id,owner,device,scope) VALUES (1,?,?,?)',
    session.owner,
    session.deviceId,
    scope,
  );
}

/** Finish before mounting the paired profile provider, including after an interrupted save.
 * Restore known same-account configuration on re-pairing; only an explicit handoff consumes anonymous setup.
 * @param {PairingIdentity} session */
export function completeProfilePairing(session) {
  if (qaEnabled) return;
  const scope = serviceScope(session);
  db.withTransactionSync(() => {
    const pending = /** @type {{owner:string,device:string,scope:string}|null} */ (
      db.getFirstSync('SELECT owner,device,scope FROM profile_pairing WHERE id=1')
    );
    if (
      pending &&
      (pending.owner !== session.owner ||
        pending.device !== session.deviceId ||
        pending.scope !== scope)
    )
      return;
    const connection = /** @type {{device:string}|null} */ (
      db.getFirstSync(
        'SELECT device FROM profile_connections WHERE owner=? AND scope=? ORDER BY rowid DESC LIMIT 1',
        session.owner,
        scope,
      )
    );
    const foreign = db.getFirstSync(
      "SELECT owner FROM profile_connections WHERE device=? AND (owner<>? OR (scope<>'' AND scope<>?))",
      session.deviceId,
      session.owner,
      scope,
    );
    if (foreign) throw new Error('This saved phone setup belongs to another account.');
    const previous =
      connection && connection.device !== session.deviceId && !loadProfiles(session.deviceId)
        ? loadProfiles(connection.device)
        : null;
    if (previous) savePrivateProfiles(session.deviceId, previous);
    if (pending) {
      const local = loadProfiles('local-device');
      // A returning account keeps its configuration; anonymous setup remains separate.
      if (local && !previous) {
        if (loadProfiles(session.deviceId))
          throw new Error('This paired phone already has profiles. Its saved setup was preserved.');
        savePrivateProfiles(session.deviceId, local);
        db.runSync('DELETE FROM export_profiles WHERE owner=?', 'local-device');
      }
      db.runSync('DELETE FROM profile_pairing WHERE id=1');
    }
    db.runSync(
      'INSERT OR REPLACE INTO profile_connections (owner,device,scope) VALUES (?,?,?)',
      session.owner,
      session.deviceId,
      scope,
    );
  });
}
/** Copy configuration without restoring consent, native grants or automatic-export progress.
 * @param {string} device @param {import('../core/profiles.js').ProfileState} state */
function savePrivateProfiles(device, state) {
  saveProfiles(device, {
    profiles: state.profiles.map((profile) =>
      Object.assign({}, profile, {
        agentAccess: false,
        agentPermissions: { health: false, time: false, location: false, logs: false },
      }),
    ),
  });
}
