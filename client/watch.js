import { requireOptionalNativeModule } from 'expo';
import { api } from './session.js';
import { watchProfile } from '../core/watch.js';
/** @typedef {{status:()=>Promise<string>,provision:(payload:string)=>Promise<string>}} WatchBridge */
const bridge = /** @type {WatchBridge|null} */ (requireOptionalNativeModule('WatchBridge'));
/** @typedef {{supported:boolean,paired?:boolean,installed?:boolean,reachable?:boolean,deviceId?:string,configured?:boolean}} WatchConnection */
/** @returns {Promise<WatchConnection>} */
export async function watchConnection() {
  return bridge ? JSON.parse(await bridge.status()) : { supported: false };
}
/** @typedef {{id:string,name:string,parentDeviceId:string,ready:boolean,lastSeenAt:number|null,expiresAt:number,metric:string,scope:string,destination:string,agentAccess:boolean,summary?:import('../core/watch.js').WatchSummary,jobs:import('../core/watch.js').WatchJob[]}} WatchState */
/** @param {import('./session.js').Session} session */
export async function listWatches(session) {
  return /** @type {{devices:WatchState[]}} */ (
    await api(session, '/api/watches', { method: 'POST', body: JSON.stringify({ action: 'list' }) })
  );
}
/** @param {import('./session.js').Session} session @param {{name:string,endpoint:string,bearer:string,agentAccess:boolean}} settings */
export async function setupWatch(session, settings) {
  if (!bridge) throw new Error('Install a rebuilt iOS app with Apple Watch support.');
  let endpoint;
  try {
    endpoint = new URL(settings.endpoint.trim());
  } catch {
    throw new Error('Enter a valid HTTPS destination URL.');
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash)
    throw new Error('Use an HTTPS endpoint without credentials or fragments.');
  watchProfile(settings.name, endpoint.href);
  if (settings.bearer.length > 4096 || /[\r\n]/.test(settings.bearer))
    throw new Error('Use a bearer token without line breaks.');
  const connection = await watchConnection();
  if (!connection.deviceId || !connection.reachable)
    throw new Error('Open myself.md on your paired Apple Watch, then try again.');
  const configured =
    /** @type {{deviceId:string,revision:string,expiresAt:number,profile:import('../core/profiles.js').ExportProfile,token:string}} */ (
      await api(session, '/api/watches', {
        method: 'POST',
        body: JSON.stringify({
          action: 'configure',
          deviceId: connection.deviceId,
          parentDeviceId: session.deviceId,
          name: settings.name,
          endpoint: endpoint.href,
          agentAccess: settings.agentAccess,
        }),
      })
    );
  // Credentials travel only in an acknowledged interactive message, never the WC background queue.
  await bridge.provision(
    JSON.stringify({ ...configured, server: session.server, destinationBearer: settings.bearer }),
  );
}
/** @param {import('./session.js').Session} session @param {string} deviceId */
export async function revokeWatch(session, deviceId) {
  return api(session, '/api/watches', {
    method: 'POST',
    body: JSON.stringify({ action: 'revoke', deviceId }),
  });
}
/** @param {import('./session.js').Session} session @param {string} deviceId @param {string} requestId */
export async function cancelWatchExport(session, deviceId, requestId) {
  return api(session, '/api/watches', {
    method: 'POST',
    body: JSON.stringify({ action: 'cancel', deviceId, requestId }),
  });
}
