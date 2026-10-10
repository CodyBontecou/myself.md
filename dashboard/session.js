import { readJSONResponse } from '../packages/support-chat/errors.js';
import { demoApi } from './demo.js';
export const isDemo = /^\/demo\/?$/.test(location.pathname);
/** @type {{issuer:string,clientId:string}|null} */ let config = null;
/** @type {{access_token:string,refresh_token?:string,id_token?:string,expires_in:number}|null} */ let tokens =
  null;
let expires = 0;
/** @type {Promise<void>|null} */ let refreshing = null;
function reset() {
  tokens = null;
}
export function hasSession() {
  return isDemo || tokens !== null;
}
/** @param {Record<string,string>} parameters */
async function exchange(parameters) {
  if (!config) throw new Error('Sign-in is not ready.');
  const response = await fetch(`${config.issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, ...parameters }),
  });
  if (!response.ok) {
    reset();
  }
  tokens = /** @type {NonNullable<typeof tokens>} */ (await readJSONResponse(response));
  if (!tokens?.access_token || !Number.isFinite(tokens.expires_in)) {
    reset();
    throw new Error('Invalid sign-in response.');
  }
  expires = Date.now() + tokens.expires_in * 1000;
}
async function ensureToken() {
  if (!tokens) throw new Error('Sign in to continue.');
  if (expires > Date.now() + 30000) return;
  if (!refreshing) {
    if (!tokens.refresh_token) {
      reset();
      throw new Error('Your session expired. Please sign in again.');
    }
    refreshing = exchange({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }).finally(() => {
      refreshing = null;
    });
  }
  await refreshing;
}
/** @template T @param {string} path @param {string} [method] @param {unknown} [body] @returns {Promise<T>} */
export async function api(path, method = 'GET', body) {
  if (isDemo) return /** @type {T} */ (demoApi(path, method, body));
  await ensureToken();
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${tokens?.access_token}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  if (response.status === 401) reset();
  const data = /** @type {T} */ (await readJSONResponse(response));
  return data;
}
function random() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
async function authorizationUrl() {
  if (!config) throw new Error('Sign-in is not ready.');
  const verifier = random(),
    state = random();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  sessionStorage.setItem(
    'qr-dashboard-login',
    JSON.stringify({
      verifier,
      state,
      created: Date.now(),
      returnTo: `${location.pathname === '/login' || location.pathname === '/login/' ? '/dashboard' : location.pathname}${location.search}`,
    }),
  );
  const url = new URL(`${config.issuer}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: 'openid profile qr-connect',
    redirect_uri: `${location.origin}/dashboard/callback`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  return url;
}
/** @param {'apple'|'github'} provider */
export async function signIn(provider) {
  if (!config) throw new Error('Sign-in is not ready.');
  const query = new URLSearchParams(location.search);
  if (['/login', '/login/'].includes(location.pathname) && query.has('client_id')) {
    // Continue the provider-signed authorization without replacing the client's PKCE or callback.
    const response = await fetch(`${config.issuer}/sign-in/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        oauth_query: location.search.slice(1),
        callbackURL: `${location.origin}/dashboard`,
      }),
    });
    const result = /** @type {{url?:string}} */ (await readJSONResponse(response));
    if (!result.url) throw new Error('Sign-in could not continue. Please start again.');
    location.assign(new URL(result.url));
    return;
  }
  const url = await authorizationUrl();
  url.searchParams.set('kc_idp_hint', provider);
  location.assign(url);
}
export async function initializeSession() {
  if (isDemo) return true;
  const response = await fetch('/dashboard/config', { cache: 'no-store' });
  config = /** @type {NonNullable<typeof config>} */ (await readJSONResponse(response));
  if (location.pathname !== '/dashboard/callback') return false;
  const query = new URLSearchParams(location.search),
    stored = sessionStorage.getItem('qr-dashboard-login');
  sessionStorage.removeItem('qr-dashboard-login');
  history.replaceState(null, '', '/dashboard');
  if (query.has('error'))
    throw Object.assign(
      new Error(query.get('error_description') ?? query.get('error') ?? 'Sign-in failed.'),
      { code: query.get('error') ?? 'oauth_error' },
    );
  const login = stored
    ? /** @type {{verifier:string,state:string,created:number,returnTo?:string}} */ (
        JSON.parse(stored)
      )
    : null;
  if (
    !login ||
    query.get('state') !== login.state ||
    !query.get('code') ||
    Date.now() - login.created > 600000
  )
    throw new Error('Sign-in could not be verified. Please start again.');
  await exchange({
    grant_type: 'authorization_code',
    code: query.get('code') ?? '',
    code_verifier: login.verifier,
    redirect_uri: `${location.origin}/dashboard/callback`,
  });
  const destination = new URL(login.returnTo ?? '/dashboard', location.origin);
  if (
    destination.origin === location.origin &&
    ['/dashboard', '/claim', '/delete-account'].includes(destination.pathname)
  ) {
    history.replaceState(null, '', `${destination.pathname}${destination.search}`);
    window.dispatchEvent(new Event('popstate'));
  }
  return true;
}
export function signOut() {
  if (!config) return;
  const hint = tokens?.id_token;
  reset();
  sessionStorage.removeItem('qr-dashboard-login');
  const logout = new URL(`${config.issuer}/protocol/openid-connect/logout`);
  logout.search = new URLSearchParams({
    client_id: config.clientId,
    post_logout_redirect_uri: `${location.origin}/dashboard`,
    ...(hint ? { id_token_hint: hint } : {}),
  }).toString();
  location.assign(logout);
}
