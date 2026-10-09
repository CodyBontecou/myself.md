import { saveExportContext } from './export-context.js';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();
/** @typedef {{server:string,issuer:string,resource:string,accessToken:string,refreshToken:string,expires:number,deviceId:string,account:string,owner:string}} Session */
const key = 'qr-connect-session';
const inactiveSessions = new WeakSet();
/** @returns {Promise<Session|null>} */
export async function loadSession() {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  const session = /** @type {Session} */ (JSON.parse(value));
  // Existing sessions retain their original device partition. Never reassign old records.
  if (!session.owner) {
    session.owner = session.deviceId;
    await saveSession(session);
  }
  saveExportContext(session);
  return session;
}
/** @param {Session} [session] */
export async function clearSession(session) {
  if (session) inactiveSessions.add(session);
  saveExportContext(null);
  await SecureStore.deleteItemAsync(key);
}
/** @param {Session} session */
export async function saveSession(session) {
  if (inactiveSessions.has(session)) throw new Error('This session has been signed out.');
  await SecureStore.setItemAsync(key, JSON.stringify(session), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  saveExportContext(session);
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
/** @template T @param {string} url @param {RequestInit} [options] @returns {Promise<T>} */
async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'The server could not complete this request.');
  return body;
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
/** @param {string} server @param {'apple'|'github'} provider @returns {Promise<Session>} */
export async function signIn(server, provider) {
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
    scopes: ['openid', 'profile', 'qr-connect'],
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
  if (session.expires < Date.now() + 30000) {
    if (!session.refreshToken) throw new Error('Please sign in again.');
    const discovery = await AuthSession.fetchDiscoveryAsync(session.issuer);
    const token = await AuthSession.refreshAsync(
      {
        clientId: 'qr-phone',
        refreshToken: session.refreshToken,
        extraParams: { resource: session.resource },
      },
      discovery,
    );
    if (inactiveSessions.has(session)) throw new Error('This session has been signed out.');
    session.accessToken = token.accessToken;
    session.refreshToken = token.refreshToken ?? session.refreshToken;
    session.expires = (token.issuedAt + (token.expiresIn ?? 300)) * 1000;
    if (session.deviceId) await saveSession(session);
  }
  const body = await request(`${session.server}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (inactiveSessions.has(session)) throw new Error('This session has been signed out.');
  return /** @type {T} */ (body);
}
