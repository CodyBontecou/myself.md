import { readJSONResponse } from '../packages/support-chat/errors.js';
import { saveExportContext } from './export-context.js';
import { recordDebug } from './debug-log.js';
import { debugOperation } from '../core/debug-log.js';
import { canonicalServiceOrigin } from '../core/hosting.js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();
/** @typedef {{server:string,issuer:string,resource:string,accessToken:string,refreshToken:string,expires:number,deviceId:string,account:string,owner:string,lastActiveAt?:number,requiresSignIn?:boolean,authenticationRequired?:boolean}} Session */
const key = 'myselfmd-session';
const legacyKey = 'qr-connect-session';
const inactiveSessions = new WeakSet();
const provisionalSessions = new WeakSet();
const idleTimeout = 365 * 86400000;
/** @type {Session|null} */
let currentSession = null;
let sessionRevision = 0;
/** @type {WeakMap<Session,number>} */
const sessionRevisions = new WeakMap();
/** @type {{session:Session,revision:number}|null} */
let pendingSessionClear = null;
let persistence = Promise.resolve();
/** @param {()=>Promise<void>} operation */
function persist(operation) {
  const result = persistence.then(operation);
  persistence = result.catch(() => {});
  return result;
}
/** @param {Session} session */
function sessionIsActive(session) {
  const revision = sessionRevisions.get(session);
  return !inactiveSessions.has(session) && (revision === undefined || revision === sessionRevision);
}
/** @param {Session} session */
function activeSession(session) {
  if (!sessionIsActive(session)) throw new Error('This session has been signed out or replaced.');
  sessionRevisions.set(session, sessionRevision);
}
/** Persist activity/token changes only while their accepted session is current.
 * @param {Session} session */
function updateSession(session) {
  activeSession(session);
  return persist(async () => {
    activeSession(session);
    if (provisionalSessions.has(session)) return;
    await SecureStore.setItemAsync(key, JSON.stringify(session), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    activeSession(session);
    currentSession = session;
    if (session.deviceId) saveExportContext(session);
  });
}
/** @type {Map<string, Promise<import('expo-auth-session').TokenResponse>>} */
const refreshes = new Map();
/** @returns {Promise<Session|null>} */
export async function loadSession() {
  await persistence;
  if (pendingSessionClear?.revision === sessionRevision) {
    await clearSession(pendingSessionClear.session);
    return loadSession();
  }
  const revision = sessionRevision;
  let value = currentSession ? null : await SecureStore.getItemAsync(key);
  const legacy = !currentSession && !value ? await SecureStore.getItemAsync(legacyKey) : null;
  value ??= legacy;
  if (revision !== sessionRevision) return loadSession();
  if (!currentSession && !value) return null;
  // Billing and foreground callers share mutations to rotating tokens and activity.
  const session = currentSession ?? /** @type {Session} */ (JSON.parse(value ?? 'null'));
  activeSession(session);
  currentSession = session;
  const hostedReset =
    canonicalServiceOrigin(session.server) === 'https://myself.md' &&
    !session.owner?.startsWith('https://myself.md/auth/realms/myselfmd|');
  if (legacy || session.issuer.endsWith('/realms/qr-connect') || hostedReset) {
    session.requiresSignIn = true;
    session.accessToken = '';
    session.refreshToken = '';
    session.expires = 0;
    session.issuer = session.issuer.replace(/\/realms\/qr-connect$/, '/realms/myselfmd');
    await updateSession(session);
    await SecureStore.deleteItemAsync(legacyKey);
  }
  const server = canonicalServiceOrigin(session.server);
  if (server !== session.server) {
    session.server = server;
    session.issuer = `${server}/auth/realms/myselfmd`;
    session.resource = `${server}/mcp`;
    await updateSession(session);
  }
  if (session.lastActiveAt !== undefined && Date.now() - session.lastActiveAt >= idleTimeout) {
    await clearSession(session);
    return null;
  }
  // Older installs have no activity timestamp; start their inactivity window on upgrade.
  if (session.lastActiveAt === undefined) {
    session.lastActiveAt = Date.now();
    await updateSession(session);
  }
  // Existing sessions retain their original device partition. Never reassign old records.
  if (!session.owner) {
    session.owner = session.deviceId;
    await updateSession(session);
  }
  activeSession(session);
  if (session.deviceId) saveExportContext(session);
  return session;
}
/** @param {Session} [session] */
export async function clearSession(session) {
  const retry =
    session &&
    !currentSession &&
    pendingSessionClear?.session === session &&
    pendingSessionClear.revision === sessionRevision;
  if (
    session &&
    session !== currentSession &&
    !retry &&
    (inactiveSessions.has(session) ||
      (sessionRevisions.has(session) && sessionRevisions.get(session) !== sessionRevision))
  )
    return;
  const previous = session ?? currentSession;
  if (!retry) {
    if (session) inactiveSessions.add(session);
    if (currentSession) inactiveSessions.add(currentSession);
    sessionRevision++;
    currentSession = null;
    saveExportContext(null);
    if (previous) pendingSessionClear = { session: previous, revision: sessionRevision };
  }
  const revision = sessionRevision;
  await persist(async () => {
    // A failed erase may retry only its retirement epoch. A newer queued login
    // can become current before this callback runs and must keep its credentials.
    if (
      revision !== sessionRevision ||
      currentSession ||
      (previous &&
        (pendingSessionClear?.session !== previous || pendingSessionClear.revision !== revision))
    )
      return;
    await SecureStore.deleteItemAsync(key);
    await SecureStore.deleteItemAsync(legacyKey);
    if (pendingSessionClear?.revision === revision) pendingSessionClear = null;
  });
  if (revision !== sessionRevision || currentSession) return;
  if (previous?.server && previous.deviceId && previous.accessToken) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const scheduleResponse = await fetch(`${previous.server}/api/export-schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${previous.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: previous.deviceId,
          token: null,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          profiles: [],
        }),
        signal: controller.signal,
      });
      await scheduleResponse.body?.cancel();
    } catch {
      /* A signed-out session cannot refresh its export schedule. */
    } finally {
      clearTimeout(timeout);
    }
  }
}
/** Replace a signed-in connection. Pairing retains the previous connection's token lineage.
 * @param {Session} session @param {Session} [previous] */
export async function saveSession(session, previous) {
  activeSession(session);
  if (previous) activeSession(previous);
  return persist(async () => {
    activeSession(session);
    const before = currentSession;
    const interruptedClear = pendingSessionClear;
    const lineage = previous ?? before;
    const pending = lineage
      ? refreshes.get(`${lineage.issuer}|${lineage.resource}|${lineage.refreshToken}`)
      : undefined;
    const revision = ++sessionRevision;
    sessionRevisions.set(session, revision);
    /** @type {import('expo-auth-session').TokenResponse|undefined} */
    let rotation;
    try {
      if (previous) {
        if (
          previous.owner !== session.owner ||
          previous.server !== session.server ||
          previous.issuer !== session.issuer ||
          previous.resource !== session.resource
        )
          throw new Error('Pairing cannot replace another account connection.');
        const token = await pending;
        rotation = token;
        if (token) {
          previous.accessToken = token.accessToken;
          previous.refreshToken = token.refreshToken ?? previous.refreshToken;
          previous.expires = (token.issuedAt + (token.expiresIn ?? 300)) * 1000;
        }
        session.accessToken = previous.accessToken;
        session.refreshToken = previous.refreshToken;
        session.expires = previous.expires;
      }
      activeSession(session);
      await SecureStore.setItemAsync(key, JSON.stringify(session), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      activeSession(session);
      currentSession = session;
      if (session.deviceId) saveExportContext(session);
      provisionalSessions.delete(session);
      pendingSessionClear = null;
    } catch (error) {
      const token =
        rotation ?? (!previous && pending ? await pending.catch(() => undefined) : undefined);
      if (sessionRevision === revision && before && token) {
        before.accessToken = token.accessToken;
        before.refreshToken = token.refreshToken ?? before.refreshToken;
        before.expires = (token.issuedAt + (token.expiresIn ?? 300)) * 1000;
        try {
          await SecureStore.setItemAsync(key, JSON.stringify(before), {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
          });
        } catch {
          // Keep the usable in-memory token for retry; the original storage failure remains visible.
        }
      }
      if (sessionRevision === revision) {
        currentSession = before;
        if (
          !before &&
          interruptedClear?.revision === revision - 1 &&
          pendingSessionClear === interruptedClear
        )
          pendingSessionClear = { session: interruptedClear.session, revision };
        if (before) sessionRevisions.set(before, revision);
        if (previous) sessionRevisions.set(previous, revision);
      }
      throw error;
    }
  });
}
/** Record actual foreground use; background exports do not extend the login window.
 * @param {Session} session @returns {Promise<boolean>} */
export async function resumeSession(session) {
  if (inactiveSessions.has(session)) return false;
  activeSession(session);
  if (session.lastActiveAt !== undefined && Date.now() - session.lastActiveAt >= idleTimeout) {
    await clearSession(session);
    return false;
  }
  session.lastActiveAt = Date.now();
  await updateSession(session);
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
    if (diagnostics) activeSession(diagnostics.session);
    if (diagnostics)
      recordDebug(diagnostics.session, diagnostics.operation, 'succeeded', {
        durationMs: Date.now() - started,
        httpStatus: status,
      });
    return body;
  } catch (error) {
    if (diagnostics && sessionIsActive(diagnostics.session))
      recordDebug(diagnostics.session, diagnostics.operation, 'failed', {
        durationMs: Date.now() - started,
        ...(status ? { httpStatus: status } : {}),
        error,
      });
    throw error;
  }
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
/** Sign-in failure codes shared by the browser and native flows.
 * @param {string|undefined} code @param {unknown} [cause] */
function signInError(code, cause) {
  return new Error(
    code === 'account_not_linked'
      ? 'This sign-in method is not connected to your account. Use your original method, then open Connected logins to connect it.'
      : code === 'account_already_linked_to_different_user'
        ? 'This sign-in method belongs to another account. Sign in with the method connected to your original account.'
        : code === 'state_mismatch' || code === 'state_not_found'
          ? 'This sign-in attempt expired or was replaced. Please start again from the app.'
          : code === 'access_denied'
            ? 'Sign-in was cancelled.'
            : code === 'rate_limited'
              ? 'Too many sign-in attempts. Wait a minute and try again.'
              : 'Sign-in could not finish. Please start again from the app.',
    { cause },
  );
}
/** @param {string} server */
async function signInConfig(server) {
  server = canonicalServiceOrigin(server);
  trustedUrl(server);
  const config = await request(/** @type {string} */ (`${server}/config`));
  const checked = /** @type {{issuer:string,clientId:string,resource:string}} */ (config);
  trustedUrl(checked.issuer);
  if (checked.clientId !== 'myselfmd-phone' || checked.resource !== `${server}/mcp`)
    throw new Error('Invalid pairing server configuration.');
  const discovery = await AuthSession.fetchDiscoveryAsync(checked.issuer);
  return { server, checked, discovery };
}
/** A PKCE phone authorization; the browser and native flows send the same request.
 * @param {{issuer:string,clientId:string,resource:string}} checked @param {Record<string,string>} [extraParams] */
function phoneAuthorization(checked, extraParams = {}) {
  return new AuthSession.AuthRequest({
    clientId: checked.clientId,
    redirectUri: 'myselfmd://oauth',
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
    scopes: ['openid', 'profile', 'myselfmd', 'offline_access'],
    extraParams: { resource: checked.resource, ...extraParams },
  });
}
/** Exchange the one-time code and read the account it belongs to.
 * @param {string} server @param {{issuer:string,clientId:string,resource:string}} checked @param {AuthSession.DiscoveryDocument} discovery @param {string} code @param {string} codeVerifier @returns {Promise<Session>} */
async function finishSignIn(server, checked, discovery, code, codeVerifier) {
  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId: checked.clientId,
      code,
      redirectUri: 'myselfmd://oauth',
      extraParams: { code_verifier: codeVerifier, resource: checked.resource },
    },
    discovery,
  );
  const previous = currentSession;
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
  // Refresh may be needed to read identity, but cannot accept this account before owner review.
  provisionalSessions.add(session);
  const info = await api(session, '/api/devices');
  const identity = /** @type {{account:string,subject:string}} */ (info);
  session.account = identity.account;
  session.owner = identity.subject;
  if (previous?.owner === session.owner && previous.server === server && previous.deviceId) {
    const devices = /** @type {{devices:{id:string}[]}} */ (info).devices;
    if (devices.some((device) => device.id === previous.deviceId))
      session.deviceId = previous.deviceId;
  }
  return session;
}
/** Sign in with Apple's native sheet: no browser or website. The ID token continues the same
 * signed PKCE phone authorization on the server, which returns the usual one-time code.
 * @param {string} server @returns {Promise<Session>} */
async function signInWithAppleSheet(server) {
  const { server: origin, checked, discovery } = await signInConfig(server);
  const auth = phoneAuthorization(checked);
  const authorizeUrl = await auth.makeAuthUrlAsync(discovery);
  if (!auth.codeVerifier) throw signInError(undefined);
  // Without a session the server answers with its signed login query instead of a page.
  const started = /** @type {{url?:unknown}} */ (
    await request(authorizeUrl, { headers: { Accept: 'application/json' } })
  );
  if (typeof started.url !== 'string') throw signInError(undefined);
  const login = new URL(started.url);
  if (login.origin !== origin || !login.searchParams.has('sig')) throw signInError(undefined);
  const nonce = Crypto.randomUUID() + Crypto.randomUUID();
  /** @type {AppleAuthentication.AppleAuthenticationCredential} */
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      nonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    throw signInError(
      error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED'
        ? 'access_denied'
        : undefined,
      error,
    );
  }
  if (!credential.identityToken || !credential.authorizationCode) throw signInError(undefined);
  const name = {
    ...(credential.fullName?.givenName ? { firstName: credential.fullName.givenName } : {}),
    ...(credential.fullName?.familyName ? { lastName: credential.fullName.familyName } : {}),
  };
  const response = await fetch(`${checked.issuer}/native/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      provider: 'apple',
      idToken: credential.identityToken,
      nonce,
      authorizationCode: credential.authorizationCode,
      oauth_query: login.search.slice(1),
      ...(Object.keys(name).length ? { name } : {}),
    }),
  });
  const result = /** @type {{url?:unknown,error?:unknown}|null} */ (
    await response.json().catch(() => null)
  );
  if (!response.ok || typeof result?.url !== 'string')
    throw signInError(typeof result?.error === 'string' ? result.error : undefined);
  const callback = new URL(result.url);
  const code = callback.searchParams.get('code');
  if (
    callback.protocol !== 'myselfmd:' ||
    callback.searchParams.get('state') !== auth.state ||
    !code
  )
    throw signInError('state_mismatch');
  return finishSignIn(origin, checked, discovery, code, auth.codeVerifier);
}
/** @param {string} server @param {'apple'|'github'|'google'} provider @returns {Promise<Session>} */
export async function signIn(server, provider) {
  // Apple signs in with the system sheet where available; other providers open the provider page.
  if (
    provider === 'apple' &&
    Platform.OS === 'ios' &&
    (await AppleAuthentication.isAvailableAsync())
  )
    return signInWithAppleSheet(server);
  const { server: origin, checked, discovery } = await signInConfig(server);
  // The server sends a provider-hinted login straight to the provider's page.
  const auth = phoneAuthorization(checked, { prompt: 'select_account', kc_idp_hint: provider });
  const result = await auth.promptAsync(discovery);
  if (result.type === 'error')
    throw signInError(result.error?.code ?? result.params.error, result.error);
  if (result.type !== 'success' || !result.params.code || !auth.codeVerifier)
    throw new Error('Sign-in was cancelled or unsuccessful.');
  return finishSignIn(origin, checked, discovery, result.params.code, auth.codeVerifier);
}
/** Renew login without changing the paired owner, server or phone partition.
 * @param {Session} previous @param {'apple'|'github'|'google'} provider */
export async function reauthenticateSession(previous, provider) {
  activeSession(previous);
  const next = await signIn(previous.server, provider);
  activeSession(previous);
  if (currentSession !== previous)
    throw new Error('The account connection changed during sign-in. Try again.');
  if (next.owner !== previous.owner || next.server !== previous.server)
    throw new Error(
      'This is a different account. If the original account was deleted, sign out before connecting this one. Saved phone data stays with its original account.',
    );
  if (previous.deviceId && next.deviceId !== previous.deviceId)
    throw new Error('The connected phone is no longer registered. Review its connection first.');
  // This is a fresh OAuth lineage, not pairing with the old credentials.
  await saveSession(next);
  return next;
}
/** @template T @param {Session} session @param {string} path @param {RequestInit} [options] @returns {Promise<T>} */
export async function api(session, path, options) {
  activeSession(session);
  if (session.requiresSignIn) throw new Error('Sign in again to finish the myself.md upgrade.');
  if (session.authenticationRequired) throw signInRequired();
  if (session.lastActiveAt !== undefined && Date.now() - session.lastActiveAt >= idleTimeout)
    throw new Error('Your session expired after 365 days of inactivity. Please sign in again.');
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
    if (!isUnauthorized(error)) throw error;
    if (session.refreshToken) {
      await refreshSession(session, rejectedToken);
      try {
        body = await send();
      } catch (retryError) {
        if (!isUnauthorized(retryError)) throw retryError;
        await requireAuthentication(session);
        throw signInRequired(retryError);
      }
    } else {
      await requireAuthentication(session);
      throw signInRequired(error);
    }
  }
  activeSession(session);
  return /** @type {T} */ (body);
}

/** @param {unknown} error */
function isUnauthorized(error) {
  return Boolean(error && typeof error === 'object' && 'status' in error && error.status === 401);
}
/** @param {unknown} [cause] */
function signInRequired(cause) {
  return new Error('Your sign-in has expired. Sign in again to reconnect your agent.', { cause });
}
/** Preserve the paired partition while exposing an actionable login state.
 * @param {Session} session */
async function requireAuthentication(session) {
  activeSession(session);
  session.authenticationRequired = true;
  await updateSession(session);
}

/** Refresh a rejected token once; concurrent requests share its rotation.
 * @param {Session} session @param {string} [rejectedToken] */
async function refreshSession(session, rejectedToken) {
  activeSession(session);
  if (rejectedToken !== undefined && session.accessToken !== rejectedToken) return;
  if (!session.refreshToken) {
    await requireAuthentication(session);
    throw signInRequired();
  }
  const refreshKey = `${session.issuer}|${session.resource}|${session.refreshToken}`;
  let pending = refreshes.get(refreshKey);
  if (!pending) {
    pending = (async () => {
      const discovery = await AuthSession.fetchDiscoveryAsync(session.issuer);
      return AuthSession.refreshAsync(
        {
          clientId: 'myselfmd-phone',
          refreshToken: session.refreshToken,
          extraParams: { resource: session.resource },
        },
        discovery,
      );
    })().finally(() => refreshes.delete(refreshKey));
    refreshes.set(refreshKey, pending);
  }
  let token;
  try {
    token = await pending;
  } catch (error) {
    activeSession(session);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'invalid_grant') {
      // Retain the owner and paired data partition; only the revoked credentials retire.
      session.accessToken = '';
      session.refreshToken = '';
      session.expires = 0;
      await requireAuthentication(session);
      throw signInRequired(error);
    }
    throw error;
  }
  activeSession(session);
  session.accessToken = token.accessToken;
  session.refreshToken = token.refreshToken ?? session.refreshToken;
  session.expires = (token.issuedAt + (token.expiresIn ?? 300)) * 1000;
  await updateSession(session);
}
