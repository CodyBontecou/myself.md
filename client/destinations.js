import { recordDebug } from './debug-log.js';
import * as SecureStore from 'expo-secure-store';
import { fetch } from 'expo/fetch';
import { api, loadSession } from './session.js';
import { loadProfiles } from './profiles.js';
import { canonicalServiceOrigin } from '../core/hosting.js';
/** @param {string} url @param {Parameters<typeof fetch>[1]} options */
async function send(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
/** Preserve actionable failures; only an authentication denial suggests reauthorization.
 * @param {Response} response @param {string} action */
async function uploadFailure(response, action) {
  const body = await response.json().catch(() => null);
  const detail = typeof body?.error === 'string' ? body.error : '';
  const recovery = response.status === 401 ? ' Sign in again to resume cloud uploads.' : '';
  return new Error(`${action} (${response.status}).${detail ? ` ${detail}` : ''}${recovery}`);
}
/** @param {string} device @param {string} profile @param {string} kind */
const vaultKey = (device, profile, kind) =>
  `export-${[...`${device}|${profile}|${kind}`].map((c) => c.charCodeAt(0).toString(16)).join('-')}`;
/** @param {string} device @param {string} profile */
export async function forgetDestinationCredentials(device, profile) {
  await SecureStore.deleteItemAsync(vaultKey(device, profile, 'cloud'));
  await SecureStore.deleteItemAsync(vaultKey(device, profile, 'http'));
}
/** @typedef {{server?:string,url?:string,token:string}} DestinationCredential */
/** @param {string} device @param {string} profile @param {DestinationCredential} value */
export async function saveDestinationCredential(device, profile, value) {
  await SecureStore.setItemAsync(
    vaultKey(device, profile, value.server ? 'cloud' : 'http'),
    JSON.stringify(value),
    {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    },
  );
}
/** @param {import('./session.js').Session} session @param {import('../core/profiles.js').ExportProfile} profile */
export async function authorizeCloud(session, profile) {
  const result = /** @type {{token:string}} */ (
    await api(session, '/api/cloud/credential', {
      method: 'POST',
      body: JSON.stringify({ deviceId: session.deviceId, profile }),
    })
  );
  await saveDestinationCredential(session.deviceId, profile.id, {
    server: session.server,
    token: result.token,
  });
}
/** @param {import('./session.js').Session} session @param {string} profileId @param {DestinationCredential} credential */
async function renewCredential(session, profileId, credential) {
  if (!credential.server || canonicalServiceOrigin(credential.server) !== session.server)
    throw new Error('Cloud upload authorization belongs to another server.');
  await api(session, '/api/cloud/credential/renew', {
    method: 'POST',
    body: JSON.stringify({
      deviceId: session.deviceId,
      profileId,
      token: credential.token,
      expiresAt: (session.lastActiveAt ?? Date.now()) + 30 * 86400000,
    }),
  });
}
/** Keep approved profiles aligned with foreground activity; never create a new approval.
 * @param {import('./session.js').Session} session */
export async function renewCloudAuthorizations(session) {
  if (!session.server || !session.deviceId) return;
  const profiles = loadProfiles(session.deviceId)?.profiles ?? [];
  await Promise.all(
    profiles
      .filter((p) => p.export.destination === 'cloud')
      .map(async (profile) => {
        const stored = await SecureStore.getItemAsync(
          vaultKey(session.deviceId, profile.id, 'cloud'),
        );
        if (stored) await renewCredential(session, profile.id, JSON.parse(stored));
      }),
  );
}
/** @param {import('./session.js').Session} session @param {import('../core/profiles.js').ExportProfile} profile @param {boolean} [shared] */
export async function cloudAccess(session, profile, shared) {
  return /** @type {{shared:boolean}} */ (
    await api(session, '/api/cloud/access', {
      method: shared === undefined ? 'POST' : 'PUT',
      body: JSON.stringify({
        deviceId: session.deviceId,
        profile,
        ...(shared === undefined ? {} : { shared }),
      }),
    })
  );
}
/** @param {import('./export-context.js').ExportContext} context @param {import('../core/profiles.js').ExportProfile} profile @param {import('expo-file-system').File} file @param {import('../core/export-files.js').ExportFormat} format @param {Record<string,unknown>} manifest @param {()=>boolean} valid */
export async function deliverExport(context, profile, file, format, manifest, valid) {
  const stored = await SecureStore.getItemAsync(
    vaultKey(context.deviceId, profile.id, profile.export.destination),
  );
  const credential = stored ? /** @type {DestinationCredential} */ (JSON.parse(stored)) : null;
  if (!valid()) throw new Error('Export cancelled before delivery.');
  const headers = {
    'Content-Type': format === 'json' ? 'application/json' : 'application/x-ndjson',
    'X-Export-Profile': profile.id,
    'X-Export-Day': String(/** @type {{day:string}} */ (manifest.interval).day),
  };
  if (profile.export.destination === 'http') {
    const url = new URL(profile.export.httpUrl ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
      throw new Error('Use an HTTPS endpoint without credentials or fragments.');
    if (credential?.token && credential.url !== url.href)
      throw new Error('Save the HTTP credential for this endpoint before exporting.');
    recordDebug(context, 'export', 'started', {
      url: url.href,
      ...(credential?.token
        ? { credentials: { Authorization: `Bearer ${credential.token}` } }
        : {}),
    });
    const response = await send(url.href, {
      method: 'POST',
      body: file,
      headers: {
        ...headers,
        ...(credential?.token ? { Authorization: `Bearer ${credential.token}` } : {}),
      },
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`HTTP export failed (${response.status}).`);
    return null;
  }
  if (!credential?.server) throw new Error('Authorize cloud uploads on this profile first.');
  credential.server = canonicalServiceOrigin(credential.server);
  const session = await loadSession();
  if (!session || session.deviceId !== context.deviceId || session.owner !== context.owner)
    throw new Error('Sign in again to resume cloud uploads.');
  await renewCredential(session, profile.id, credential);
  if (!valid()) throw new Error('Export cancelled before upload.');
  if (file.size > 16 * 1024 * 1024)
    throw new Error('Cloud daily files are limited to 16 MiB. Reduce selected types.');
  const authorization = `Upload ${credential.token}`;
  recordDebug(context, 'cloud', 'started', {
    url: `${credential.server}/api/cloud/uploads`,
    credentials: { Authorization: authorization },
  });
  const begin = await send(`${credential.server}/api/cloud/uploads`, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, day: headers['X-Export-Day'], format, manifest }),
    redirect: 'error',
  });
  if (!begin.ok) throw await uploadFailure(begin, 'Cloud upload could not start');
  const { id } = /** @type {{id:string}} */ (await begin.json());
  if (!valid()) throw new Error('Export cancelled before upload.');
  recordDebug(context, 'cloud', 'started', {
    url: `${credential.server}/api/cloud/uploads/${id}`,
    credentials: { Authorization: authorization },
  });
  const result = await send(`${credential.server}/api/cloud/uploads/${id}`, {
    method: 'PUT',
    body: file,
    headers: { ...headers, Authorization: authorization },
    redirect: 'error',
  });
  if (!result.ok) throw await uploadFailure(result, 'Cloud upload failed');
  return { id };
}
