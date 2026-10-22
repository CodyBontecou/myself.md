import { loadProfiles, saveProfiles } from './profiles.js';
import { debugSharing, setDebugSharing } from './debug-log.js';
import { parseProfileState } from '../core/profiles.js';
import { qaEnabled } from './qa-runtime.js';

/** Paired-phone access includes diagnostics without a separate profile opt-in.
 * @param {{owner:string,deviceId:string}} session */
export function loadAgentProfiles(session) {
  const state = loadProfiles(session.deviceId);
  if (state) saveAgentProfiles(session, state);
  return state;
}

/** @param {{owner:string,deviceId:string}} session
 * @param {import('../core/profiles.js').ProfileState} state */
export function saveAgentProfiles(session, state) {
  saveProfiles(session.deviceId, parseProfileState(state));
  if (qaEnabled) return;
  const shared = session.owner !== 'local-device' && session.deviceId !== 'local-device';
  if (debugSharing(session).shared !== shared) setDebugSharing(session, shared);
}
