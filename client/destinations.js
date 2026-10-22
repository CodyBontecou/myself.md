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
async function authorizeCloud(session, profile) {
  const result = /** @type {{token:string}} */ (
    await api(session, '/api/cloud/credential', {
      method: 'POST',
      body: JSON.stringify({ deviceId: session.deviceId, profile }),
    })
  );
  const credential = { server: session.server, token: result.token };
  await saveDestinationCredential(session.deviceId, profile.id, credential);
  return credential;
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
      expiresAt: (session.lastActiveAt ?? Date.now()) + 365 * 86400000,
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
/** Coalesce first-use credential creation so concurrent exports cannot rotate each other's token. */
/** @type {Map<string,Promise<DestinationCredential>>} */
const pendingCredentials = new Map();
/** @param {import('./session.js').Session} session @param {import('../core/profiles.js').ExportProfile} profile */
async function cloudCredential(session, profile) {
  const key = `${session.server}|${session.owner}|${vaultKey(session.deviceId, profile.id, 'cloud')}`;
  const existing = pendingCredentials.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const stored = await SecureStore.getItemAsync(vaultKey(session.deviceId, profile.id, 'cloud'));
    const credential = stored ? /** @type {DestinationCredential} */ (JSON.parse(stored)) : null;
    return credential?.server && credential.token ? credential : authorizeCloud(session, profile);
  })();
  pendingCredentials.set(key, pending);
  try {
    return await pending;
  } finally {
    pendingCredentials.delete(key);
  }
}
/** A saved Cloud destination authorizes uploads; verify login before creating or renewing its credential.
 * @param {import('./export-context.js').ExportContext} context @param {import('../core/profiles.js').ExportProfile} profile */
export async function requireCloudAuthorization(context, profile) {
  if (profile.export.destination !== 'cloud') return null;
  const session = await loadSession();
  if (!session || session.deviceId !== context.deviceId || session.owner !== context.owner)
    throw new Error('Sign in again to resume cloud uploads.');
  const saved = loadProfiles(context.deviceId)?.profiles.find((p) => p.id === profile.id);
  if (saved?.export.destination !== 'cloud')
    throw new Error('Save Cloud as this profile’s export destination first.');
  const credential = await cloudCredential(session, saved);
  if (credential.server) credential.server = canonicalServiceOrigin(credential.server);
  await renewCredential(session, profile.id, credential);
  return credential;
}
/** @param {import('./export-context.js').ExportContext} context @param {import('../core/profiles.js').ExportProfile} profile @param {import('expo-file-system').File} file @param {import('../core/export-files.js').ExportFormat} format @param {Record<string,unknown>} manifest @param {()=>boolean} valid @param {DestinationCredential|null} [cloudAuthorization] */
export async function deliverExport(
  context,
  profile,
  file,
  format,
  manifest,
  valid,
  cloudAuthorization = null,
) {
  if (!valid()) throw new Error('Export cancelled before delivery.');
  const headers = {
    'Content-Type': format === 'json' ? 'application/json' : 'application/x-ndjson',
    'X-Export-Profile': profile.id,
    'X-Export-Day': String(/** @type {{day:string}} */ (manifest.interval).day),
  };
  if (profile.export.destination === 'http') {
    const stored = await SecureStore.getItemAsync(
      vaultKey(context.deviceId, profile.id, profile.export.destination),
    );
    const credential = stored ? /** @type {DestinationCredential} */ (JSON.parse(stored)) : null;
    const url = new URL(profile.export.httpUrl ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
      throw new Error('Use an HTTPS endpoint without credentials or fragments.');
    if (credential?.token && credential.url !== url.href)
      throw new Error('Save the HTTP credential for this endpoint before exporting.');
    recordDebug(context, 'export', 'started');
    const response = await send(url.href, {
      method: 'POST',
      // Expo fetch replaces explicit Content-Type with File.type, which is null for JSONL.
      // Raw bytes preserve the selected export format and the exact payload.
      body: await file.arrayBuffer(),
      headers: {
        ...headers,
        ...(credential?.token ? { Authorization: `Bearer ${credential.token}` } : {}),
      },
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`HTTP export failed (${response.status}).`);
    return null;
  }
  // The export runner renews once before staging; every upload still checks server authorization.
  const approved = cloudAuthorization ?? (await requireCloudAuthorization(context, profile));
  if (!approved) throw new Error('Cloud upload authorization is required.');
  if (!valid()) throw new Error('Export cancelled before upload.');
  if (file.size > 16 * 1024 * 1024)
    throw new Error('Cloud daily files are limited to 16 MiB. Reduce selected types.');
  return uploadCloudFile(approved, profile, file, format, manifest, valid, context);
}
/** Shared native file transport for normal exports and isolated live cloud QA.
 * @param {DestinationCredential} credential @param {import('../core/profiles.js').ExportProfile} profile
 * @param {import('expo-file-system').File} file @param {import('../core/export-files.js').ExportFormat} format
 * @param {Record<string,unknown>} manifest @param {()=>boolean} valid @param {import('./export-context.js').ExportContext} [context] */
export async function uploadCloudFile(credential, profile, file, format, manifest, valid, context) {
  if (!credential.server || !valid()) throw new Error('Cloud upload cancelled.');
  const headers = {
    'Content-Type': format === 'json' ? 'application/json' : 'application/x-ndjson',
    'X-Export-Profile': profile.id,
    'X-Export-Day': String(/** @type {{day:string}} */ (manifest.interval).day),
  };
  const authorization = `Upload ${credential.token}`;
  if (context) recordDebug(context, 'cloud', 'started');
  const begin = await send(`${credential.server}/api/cloud/uploads`, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, day: headers['X-Export-Day'], format, manifest }),
    redirect: 'error',
  });
  if (!begin.ok) throw await uploadFailure(begin, 'Cloud upload could not start');
  const receipt =
    /** @type {{id:string,completed?:boolean,recordCount?:number,bytes?:number,partial?:boolean}} */ (
      await begin.json()
    );
  const { id } = receipt;
  if (!valid()) throw new Error('Export cancelled before upload.');
  if (receipt.completed) return receipt;
  if (context) recordDebug(context, 'cloud', 'started');
  // Raw bytes avoid Expo overriding Content-Type with a null MIME type for JSONL files.
  const result = await send(`${credential.server}/api/cloud/uploads/${id}`, {
    method: 'PUT',
    body: await file.arrayBuffer(),
    headers: { ...headers, Authorization: authorization },
    redirect: 'error',
  });
  if (!result.ok) throw await uploadFailure(result, 'Cloud upload failed');
  return /** @type {{id:string,recordCount?:number,bytes?:number,partial?:boolean}} */ (
    await result.json()
  );
}
