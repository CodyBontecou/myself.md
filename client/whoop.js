import { AuthRequest } from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { api, loadSession } from './session.js';
import { whoopRedirect, whoopScopes, whoopTypes, whoopType } from '../core/whoop.js';
import { qaEnabled } from './qa-runtime.js';
/** @typedef {{access_token:string,refresh_token:string,expires_in:number,token_type:string,scope:string,expires:number}} Token */
/** Serialize all credential changes, including disconnect, with rotating refresh tokens. */
let persistence = Promise.resolve();
/** @type {Map<string,Promise<Token>>} */
const refreshes = new Map();
let authenticating = false;
/** @type {Map<string,number>} */
const revisions = new Map();
/** @param {()=>Promise<void>} operation */
function persist(operation) {
  const pending = persistence.then(operation);
  persistence = pending.catch(() => {});
  return pending;
}
/** @param {string} owner */
function key(owner) {
  // SecureStore accepts only alphanumeric characters, dot, dash and underscore.
  return `myselfmd-whoop-${qaEnabled ? 'qa-' : ''}${Array.from(owner, (c) => c.codePointAt(0)?.toString(16)).join('-')}`;
}
/** @param {string} owner */
async function current(owner) {
  const session = await loadSession();
  if (!session || session.requiresSignIn || session.owner !== owner)
    throw new Error('Sign in to the same account to use WHOOP.');
  return session;
}
/** @param {string} owner @returns {Promise<Token|null>} */
async function stored(owner) {
  const value = await SecureStore.getItemAsync(key(owner));
  return value ? /** @type {Token} */ (JSON.parse(value)) : null;
}
/** @param {string} owner @param {Token} token */
async function save(owner, token) {
  await current(owner);
  await SecureStore.setItemAsync(key(owner), JSON.stringify(token), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}
/** Metadata only; never publishes tokens or WHOOP account identity.
 * @param {string} owner */
export async function whoopStatus(owner) {
  const base = {
    provider: 'whoop',
    handoff: whoopRedirect,
    instructions:
      'Open Settings → WHOOP on this phone to connect or disconnect. WHOOP sign-in and consent require the owner. Select WHOOP types in a profile separately; paired online phones allow authenticated reads of selected types.',
  };
  try {
    await persistence;
    if (!qaEnabled && owner === 'local-device') owner = (await loadSession())?.owner ?? owner;
    const token = qaEnabled ? null : await stored(owner);
    return {
      ...base,
      connected: Boolean(token),
      scopes: token ? token.scope.split(/\s+/).filter((scope) => whoopScopes.includes(scope)) : [],
    };
  } catch {
    // An optional provider must not prevent OS catalog discovery or unrelated exports.
    return {
      ...base,
      connected: false,
      scopes: /** @type {string[]} */ ([]),
      error: 'secure_storage_unavailable',
      instructions:
        'WHOOP secure storage is unavailable. Reopen Settings → WHOOP on this phone to retry. OS Health exports remain available.',
    };
  }
}
/** @param {string} owner */
export async function connectWhoop(owner) {
  if (authenticating) throw new Error('Finish the current WHOOP connection first.');
  authenticating = true;
  const revision = revisions.get(owner) ?? 0;
  try {
    if (qaEnabled) throw new Error('WHOOP authentication requires a normal build.');
    const session = await current(owner);
    const state = new AuthRequest({
      clientId: 'whoop',
      redirectUri: whoopRedirect,
      scopes: whoopScopes,
      usePKCE: false,
    }).state.slice(0, 8);
    const authorization = /** @type {{authorization_url:string}} */ (
      await api(session, '/api/whoop/oauth', {
        method: 'POST',
        body: JSON.stringify({ action: 'authorize', state }),
      })
    );
    const url = new URL(authorization.authorization_url);
    if (
      url.origin !== 'https://api.prod.whoop.com' ||
      url.pathname !== '/oauth/oauth2/auth' ||
      url.searchParams.get('state') !== state ||
      url.searchParams.get('redirect_uri') !== whoopRedirect
    )
      throw new Error('Invalid WHOOP authorization URL.');
    const response = await WebBrowser.openAuthSessionAsync(url.href, whoopRedirect);
    if (response.type !== 'success') return { status: 'cancelled' };
    const callback = new URL(response.url);
    if (
      callback.protocol !== 'myselfmd:' ||
      callback.hostname !== 'whoop' ||
      callback.pathname ||
      callback.searchParams.get('state') !== state
    )
      throw new Error('WHOOP authorization did not match this request.');
    const code = callback.searchParams.get('code');
    if (callback.searchParams.has('error')) {
      const value = callback.searchParams.get('error');
      const known = [
        'access_denied',
        'invalid_request',
        'invalid_scope',
        'unauthorized_client',
        'unsupported_response_type',
        'server_error',
        'temporarily_unavailable',
        'login_required',
        'consent_required',
      ];
      const reason = value && known.includes(value) ? value : 'unknown_error';
      throw new Error(`WHOOP did not complete authorization (${reason}). Try connecting again.`);
    }
    if (!code)
      throw new Error('WHOOP returned without an authorization code. Try connecting again.');
    await persist(async () => {
      await current(owner);
      if ((revisions.get(owner) ?? 0) !== revision)
        throw new Error('WHOOP connection was cancelled.');
      const token = /** @type {Token} */ (
        await api(session, '/api/whoop/oauth', {
          method: 'POST',
          body: JSON.stringify({ action: 'exchange', code }),
        })
      );
      if ((revisions.get(owner) ?? 0) !== revision)
        throw new Error('WHOOP connection was cancelled.');
      revisions.set(owner, revision + 1);
      await save(owner, { ...token, expires: Date.now() + token.expires_in * 1000 });
    });
    return { status: 'completed' };
  } finally {
    authenticating = false;
  }
}
/** @param {string} owner @param {string} [forceToken] @returns {Promise<Token>} */
async function access(owner, forceToken = '') {
  const pending = refreshes.get(owner);
  if (pending) return pending;
  const operation = (async () => {
    await persistence;
    await current(owner);
    let token = await stored(owner);
    if (!token) throw new Error('Connect WHOOP in Settings first.');
    if ((forceToken && forceToken === token.access_token) || token.expires <= Date.now() + 60000) {
      await persist(async () => {
        const session = await current(owner);
        const previous = await stored(owner);
        if (!previous) throw new Error('WHOOP was disconnected.');
        token = /** @type {Token} */ (
          await api(session, '/api/whoop/oauth', {
            method: 'POST',
            body: JSON.stringify({ action: 'refresh', refreshToken: previous.refresh_token }),
          })
        );
        token = { ...token, expires: Date.now() + token.expires_in * 1000 };
        await save(owner, token);
      });
    }
    return token;
  })();
  refreshes.set(owner, operation);
  try {
    return await operation;
  } finally {
    if (refreshes.get(owner) === operation) refreshes.delete(owner);
  }
}
/** @param {string} owner */
export async function forgetWhoop(owner) {
  revisions.set(owner, (revisions.get(owner) ?? 0) + 1);
  await persist(() => SecureStore.deleteItemAsync(key(owner)));
}
/** Revoke at WHOOP before erasing credentials, so a failed revocation can be retried.
 * @param {string} owner */
export async function disconnectWhoop(owner) {
  await access(owner);
  revisions.set(owner, (revisions.get(owner) ?? 0) + 1);
  await persist(async () => {
    await current(owner);
    const token = await stored(owner);
    if (!token) return;
    const response = await providerRequest('https://api.prod.whoop.com/developer/v2/user/access', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.access_token}` },
      redirect: 'error',
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('WHOOP could not revoke access. Try disconnecting again.');
    await SecureStore.deleteItemAsync(key(owner));
  });
  return { status: 'completed' };
}
/** @param {string} owner @param {boolean} [selectable] */
export async function whoopHealthTypes(owner, selectable = false) {
  if (selectable) return Object.keys(whoopTypes);
  const status = await whoopStatus(owner);
  return status.connected
    ? Object.entries(whoopTypes)
        .filter(([, type]) => status.scopes.includes(type.scope))
        .map(([type]) => type)
    : [];
}
/** Private operation identity; never publish it in diagnostics or export metadata.
 * Refresh, disconnect, reconnect and scope changes invalidate empty export proofs.
 * @param {string} owner @param {string} name */
export async function whoopReadIdentity(owner, name) {
  if (owner === 'local-device') owner = (await loadSession())?.owner ?? owner;
  const revision = revisions.get(owner) ?? 0;
  const token = await access(owner);
  const type = whoopType(name);
  if (!type || !token.scope.split(/\s+/).includes(type.scope))
    throw new Error('Reconnect WHOOP and approve this data type.');
  if (revision !== (revisions.get(owner) ?? 0))
    throw new Error('WHOOP connection changed during this read. Retry the export.');
  return `${revision}|${token.access_token}|${token.scope}`;
}
/** Native fetch may not expose a response stream. Bound advertised and decoded payload size.
 * @param {Response} response */
async function boundedJSON(response) {
  const length = Number(response.headers.get('Content-Length'));
  if (length > 1024 * 1024) throw new Error('WHOOP response exceeds 1 MB. Query a smaller page.');
  const text = await response.text();
  if (text.length > 262144)
    throw new Error('WHOOP response exceeds the decode limit. Query a smaller page.');
  const value = /** @type {unknown} */ (JSON.parse(text));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('WHOOP returned invalid response data.');
  return /** @type {Record<string,unknown>} */ (value);
}
/** @param {string} url @param {RequestInit} options */
async function providerRequest(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
/** @param {string} owner @param {import('../core/data.js').DataQuery} query @param {string} cursor @param {()=>Promise<void>} [beforeRequest] @returns {Promise<import('../core/data.js').DataPage>} */
export async function whoopPage(owner, query, cursor, beforeRequest = async () => {}) {
  if (owner === 'local-device') owner = (await loadSession())?.owner ?? owner;
  const revision = revisions.get(owner) ?? 0;
  const type = whoopType(query.type);
  if (!type) throw new Error('Unknown WHOOP data type.');
  if (cursor.length > 8192 || (query.type === 'whoop.body' && cursor))
    throw new Error('Invalid WHOOP cursor.');
  let token = await access(owner);
  if (!token.scope.split(/\s+/).includes(type.scope))
    throw new Error('Reconnect WHOOP and approve this data type.');
  const url = new URL(`https://api.prod.whoop.com/developer/v2${type.path}`);
  const snapshot = query.type === 'whoop.body';
  if (!snapshot) {
    url.search = new URLSearchParams({
      start: query.start,
      end: query.end,
      limit: String(Math.min(25, query.limit)),
      ...(cursor ? { nextToken: cursor } : {}),
    }).toString();
  }
  const request = async () => {
    await beforeRequest();
    // Pacing can wait a minute. Reacquire refreshes and revalidate local consent at dispatch.
    token = await access(owner);
    await current(owner);
    if ((revisions.get(owner) ?? 0) !== revision)
      throw new Error('WHOOP connection changed during this read. Retry the export.');
    if (!token.scope.split(/\s+/).includes(type.scope))
      throw new Error('Reconnect WHOOP and approve this data type.');
    return providerRequest(url.href, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      redirect: 'error',
    });
  };
  let response = await request();
  if (response.status === 401) {
    await response.body?.cancel();
    token = await access(owner, token.access_token);
    response = await request();
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      response.status === 429
        ? 'WHOOP rate limit reached. Retry later.'
        : response.status === 401 || response.status === 403
          ? 'WHOOP access expired or was revoked. Reconnect in Settings.'
          : `WHOOP data request failed (HTTP ${response.status}). Retry later.`,
    );
  }
  const payload = await boundedJSON(response);
  await current(owner);
  // Do not deliver a request completed after local disconnection.
  const retained = await stored(owner);
  if (
    (revisions.get(owner) ?? 0) !== revision ||
    retained?.access_token !== token.access_token ||
    !retained.scope.split(/\s+/).includes(type.scope)
  )
    throw new Error('WHOOP connection changed during this read. Retry the query.');
  const rows = snapshot ? [payload] : payload.records;
  if (
    !Array.isArray(rows) ||
    (!snapshot &&
      payload.next_token !== null &&
      payload.next_token !== undefined &&
      typeof payload.next_token !== 'string')
  )
    throw new Error('WHOOP returned invalid collection data.');
  const fetchedAt = new Date().toISOString();
  const records = rows.map((native) => {
    if (!native || typeof native !== 'object' || Array.isArray(native))
      throw new Error('WHOOP returned an invalid record.');
    const start = snapshot ? fetchedAt : typeof native.start === 'string' ? native.start : null;
    const end = snapshot ? fetchedAt : typeof native.end === 'string' ? native.end : null;
    return {
      domain: /** @type {const} */ ('health'),
      type: query.type,
      source: 'whoop',
      start,
      end,
      native: snapshot
        ? { ...native, capture_kind: 'current_profile_snapshot', fetched_at: fetchedAt }
        : native,
    };
  });
  const next =
    typeof payload.next_token === 'string' && payload.next_token ? payload.next_token : null;
  if (next && next === cursor)
    throw new Error('WHOOP repeated a pagination cursor. Retry the query.');
  return {
    records,
    nextCursor: snapshot ? null : next,
    complete: true,
    capture: snapshot ? 'whoop-current-body-snapshot' : 'whoop-v2-provider-records',
    warnings: [
      'WHOOP records remain separate from HealthKit/Health Connect. Values may overlap with OS exports; no deduplication or score aggregation is applied. HRV is RMSSD, not HealthKit SDNN.',
      ...(snapshot
        ? [
            'Body measurements are the current profile snapshot; fetched_at is capture time, not measurement time or historical interval data.',
          ]
        : query.type === 'whoop.recovery'
          ? [
              'Recovery has no independent measurement timestamp; join cycle_id and sleep_id to WHOOP cycles and sleep. The requested interval uses WHOOP provider filtering.',
            ]
          : []),
    ],
  };
}
