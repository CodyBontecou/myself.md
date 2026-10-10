import { readJSONResponse } from '../packages/support-chat/errors.js';
import { saveExportContext } from './export-context.js';
import { recordDebug } from './debug-log.js';
import { debugOperation } from '../core/debug-log.js';
import { canonicalServiceOrigin } from '../core/hosting.js';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();
/** @typedef {{server:string,issuer:string,resource:string,accessToken:string,refreshToken:string,expires:number,deviceId:string,account:string,owner:string,lastActiveAt?:number}} Session */
const key = 'qr-connect-session';
const inactiveSessions = new WeakSet();
const idleTimeout = 30 * 86400000;
/** @type {Session|null} */
let currentSession = null;
/** @type {Map<string, Promise<import('expo-auth-session').TokenResponse>>} */
const refreshes = new Map();
/** @returns {Promise<Session|null>} */
export async function loadSession() {
  const value = currentSession ? null : await SecureStore.getItemAsync(key);
  if (!currentSession && !value) return null;
  // Billing and foreground callers share mutations to rotating tokens and activity.
  const session = currentSession ?? /** @type {Session} */ (JSON.parse(value ?? 'null'));
  currentSession = session;
  const server = canonicalServiceOrigin(session.server);
  if (server !== session.server) {
    session.server = server;
    session.issuer = `${server}/auth/realms/qr-connect`;
    session.resource = `${server}/mcp`;
    await saveSession(session);
  }
  if (session.lastActiveAt !== undefined && Date.now() - session.lastActiveAt >= idleTimeout) {
    await clearSession(session);
    return null;
  }
  // Older installs have no activity timestamp; start their inactivity window on upgrade.
  if (session.lastActiveAt === undefined) {
    session.lastActiveAt = Date.now();
    await saveSession(session);
  }
  // Existing sessions retain their original device partition. Never reassign old records.
  if (!session.owner) {
    session.owner = session.deviceId;
    await saveSession(session);
  }
  if (session.deviceId) saveExportContext(session);
  return session;
}
/** @param {Session} [session] */
export async function clearSession(session) {
  const previous = session ?? currentSession;
  if (previous?.server && previous.deviceId && previous.accessToken) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`${previous.server}/api/support/v1`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${previous.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'device', id: previous.deviceId, token: null }),
        signal: controller.signal,
      });
      await response.body?.cancel();
    } catch {
      /* A signed-out session cannot refresh or regain support access. */
    } finally {
      clearTimeout(timeout);
    }
  }
  if (session) inactiveSessions.add(session);
  if (currentSession) inactiveSessions.add(currentSession);
  currentSession = null;
  saveExportContext(null);
  await SecureStore.deleteItemAsync(key);
}
/** @param {Session} session */
export async function saveSession(session) {
  if (inactiveSessions.has(session)) throw new Error('This session has been signed out.');
  await SecureStore.setItemAsync(key, JSON.stringify(session), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  currentSession = session;
  if (session.deviceId) saveExportContext(session);
}
/** Record actual foreground use; background exports do not extend the login window.
 * @param {Session} session @returns {Promise<boolean>} */
export async function resumeSession(session) {
  if (inactiveSessions.has(session)) return false;
  if (session.lastActiveAt !== undefined && Date.now() - session.lastActiveAt >= idleTimeout) {
    await clearSession(session);
    return false;
  }
  session.lastActiveAt = Date.now();
  await saveSession(session);
  return true;
}
/** Revoke with the existing token; sign-out must not refresh or persist the old session.
 * @param {Session} session */
export async function revokeDevice(session) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    await request(`${session.server}/api/devices/${session.deviceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
/** @template T @param {string} url @param {RequestInit} [options]
 * @param {{session:Session,operation:string}} [diagnostics] @returns {Promise<T>} */
async function request(url, options, diagnostics) {
  const started = Date.now();
  let status;
  try {
    const response = await fetch(url, options);
    status = response.status;
    const body = /** @type {T} */ (await readJSONResponse(response));
    if (diagnostics)
      recordDebug(diagnostics.session, diagnostics.operation, 'succeeded', {
        durationMs: Date.now() - started,
        httpStatus: status,
        url,
        credentials: requestCredentials(options?.headers),
      });
    return body;
  } catch (error) {
    if (diagnostics)
      recordDebug(diagnostics.session, diagnostics.operation, 'failed', {
        durationMs: Date.now() - started,
        ...(status ? { httpStatus: status } : {}),
        error,
        url,
        credentials: requestCredentials(options?.headers),
      });
    throw error;
  }
}
/** @param {RequestInit['headers']} headers */
function requestCredentials(headers) {
  /** @type {Record<string,string>} */
  const credentials = {};
  try {
    const values = new Headers(headers);
    for (const [header, value] of values.entries()) {
      if (/authorization|cookie|api.?key|token|secret/i.test(header)) credentials[header] = value;
    }
  } catch {
    /* Optional diagnostics cannot affect the request. */
  }
  return credentials;
}
/** @param {string} value */
function trustedUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' &&
    !(process.env.EXPO_PUBLIC_ALLOW_HTTP === '1' && url.protocol === 'http:')
  )
    throw new Error(
      'This server must use HTTPS. Local development requires EXPO_PUBLIC_ALLOW_HTTP=1.',
    );
  if (url.username || url.password) throw new Error('Invalid server URL.');
  return url;
}
/** @param {string} server @param {'apple'|'github'|'google'} provider @returns {Promise<Session>} */
export async function signIn(server, provider) {
  server = canonicalServiceOrigin(server);
  trustedUrl(server);
  const config = await request(/** @type {string} */ (`${server}/config`));
  const checked = /** @type {{issuer:string,clientId:string,resource:string}} */ (config);
  trustedUrl(checked.issuer);
  if (checked.clientId !== 'qr-phone' || checked.resource !== `${server}/mcp`)
    throw new Error('Invalid pairing server configuration.');
  const discovery = await AuthSession.fetchDiscoveryAsync(checked.issuer);
  const redirectUri = 'qrconnect://oauth';
  const auth = new AuthSession.AuthRequest({
    clientId: checked.clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
    scopes: ['openid', 'profile', 'qr-connect', 'offline_access'],
    extraParams: {
      resource: checked.resource,
      prompt: 'select_account',
      kc_idp_hint: provider,
    },
  });
  const result = await auth.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code || !auth.codeVerifier)
    throw new Error('Sign-in was cancelled or unsuccessful.');
  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId: checked.clientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: auth.codeVerifier, resource: checked.resource },
    },
    discovery,
  );
  const session = {
    server,
    issuer: checked.issuer,
    resource: checked.resource,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? '',
    expires: (token.issuedAt + (token.expiresIn ?? 300)) * 1000,
    deviceId: '',
    account: '',
    owner: '',
    lastActiveAt: Date.now(),
  };
  const info = await api(session, '/api/devices');
  const identity = /** @type {{account:string,subject:string}} */ (info);
  session.account = identity.account;
  session.owner = identity.subject;
  return session;
}
/** @template T @param {Session} session @param {string} path @param {RequestInit} [options] @returns {Promise<T>} */
export async function api(session, path, options) {
  if (inactiveSessions.has(session)) throw new Error('This session has been signed out.');
  if (session.lastActiveAt !== undefined && Date.now() - session.lastActiveAt >= idleTimeout)
    throw new Error('Your session expired after 30 days of inactivity. Please sign in again.');
  if (session.expires < Date.now() + 30000) await refreshSession(session);
  const send = () =>
    request(
      `${session.server}${path}`,
      {
        ...options,
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
      { session, operation: debugOperation(path) },
    );
  const rejectedToken = session.accessToken;
  let body;
  try {
    body = await send();
  } catch (error) {
    if (
      !session.refreshToken ||
      !error ||
      typeof error !== 'object' ||
      !('status' in error) ||
      error.status !== 401
    )
      throw error;
    await refreshSession(session, rejectedToken);
    body = await send();
  }
  if (inactiveSessions.has(session)) throw new Error('This session has been signed out.');
  return /** @type {T} */ (body);
}

/** Refresh a rejected token once; concurrent requests share its rotation.
 * @param {Session} session @param {string} [rejectedToken] */
async function refreshSession(session, rejectedToken) {
  if (inactiveSessions.has(session)) throw new Error('This session has been signed out.');
  if (rejectedToken !== undefined && session.accessToken !== rejectedToken) return;
  if (!session.refreshToken) throw new Error('Please sign in again.');
  const refreshKey = `${session.issuer}|${session.resource}|${session.refreshToken}`;
  let pending = refreshes.get(refreshKey);
  if (!pending) {
    pending = (async () => {
      const discovery = await AuthSession.fetchDiscoveryAsync(session.issuer);
      return AuthSession.refreshAsync(
        {
          clientId: 'qr-phone',
          refreshToken: session.refreshToken,
          extraParams: { resource: session.resource },
        },
        discovery,
      );
    })().finally(() => refreshes.delete(refreshKey));
    refreshes.set(refreshKey, pending);
  }
  const token = await pending;
  if (inactiveSessions.has(session)) throw new Error('This session has been signed out.');
  session.accessToken = token.accessToken;
  session.refreshToken = token.refreshToken ?? session.refreshToken;
  session.expires = (token.issuedAt + (token.expiresIn ?? 300)) * 1000;
  await saveSession(session);
}
