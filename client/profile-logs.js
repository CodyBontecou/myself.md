import { loadProfiles, saveProfiles } from './profiles.js';
import { debugSharing, setDebugSharing } from './debug-log.js';
import { agentLogsAllowed, parseAgentPermissions, parseProfileState } from '../core/profiles.js';
import { qaEnabled } from './qa-runtime.js';
import { phoneDatabase } from './phone-database.js';
const db = phoneDatabase();
db.execSync(
  'CREATE TABLE IF NOT EXISTS profile_log_consent (owner TEXT, device TEXT, PRIMARY KEY(owner,device))',
);

/** Preserve prior phone-wide denials as explicit profile denials before presenting a single control.
 * @param {{owner:string,deviceId:string}} session */
export function loadAgentProfiles(session) {
  const state = loadProfiles(session.deviceId);
  if (
    !state ||
    qaEnabled ||
    db.getFirstSync(
      'SELECT device FROM profile_log_consent WHERE owner=? AND device=?',
      session.owner,
      session.deviceId,
    )
  )
    return state;
  const shared = debugSharing(session).shared;
  const migrated = {
    profiles: state.profiles.map((profile) =>
      Object.assign({}, profile, {
        agentPermissions: {
          ...parseAgentPermissions(profile.agentPermissions),
          logs: shared && parseAgentPermissions(profile.agentPermissions).logs,
        },
      }),
    ),
  };
  saveAgentProfiles(session, migrated);
  return migrated;
}

/** The transport gate follows owner-approved profile permissions; it is no longer a separate setting.
 * @param {{owner:string,deviceId:string}} session
 * @param {import('../core/profiles.js').ProfileState} state */
export function saveAgentProfiles(session, state) {
  state = parseProfileState(state);
  saveProfiles(session.deviceId, state);
  if (qaEnabled) return;
  db.runSync(
    'INSERT OR IGNORE INTO profile_log_consent VALUES (?,?)',
    session.owner,
    session.deviceId,
  );
  const shared = state.profiles.some(agentLogsAllowed);
  if (debugSharing(session).shared !== shared) setDebugSharing(session, shared);
}
