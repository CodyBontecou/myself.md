// Keep these events independent of raw provider/native errors and request objects.
const errors = new Set([
  'state_mismatch',
  'state_not_found',
  'state_invalid',
  'account_not_linked',
  'account_already_linked_to_different_user',
  'access_denied',
  'invalid_code',
  'invalid_grant',
  'invalid_client',
  'invalid_request',
  'login_required',
]);
/** @param {unknown} value */
function errorCategory(value) {
  return typeof value === 'string' && errors.has(value) ? value : 'other';
}
/** Only callers with fixed event fields reach this sink. Logging must not affect authentication.
 * @param {Record<string,string|number|boolean>} event */
function emit(event) {
  try {
    console.info({ schema: 'myself.md.auth.v1', ...event });
  } catch {
    // Diagnostics are best effort; never retry or alter an authentication result.
  }
}
/** Better Auth's logger receives arbitrary error objects: inspect, never serialize them.
 * @param {string} _level @param {string} message @param {...unknown} args */
export function authDiagnosticLogger(_level, message, ...args) {
  try {
    if (message !== 'Failed to parse state') return;
    const error = args[0];
    const reason = error instanceof Error ? error.message : '';
    const categories = new Map([
      ['State mismatch: verification not found', 'verification_missing'],
      ['State mismatch: State not persisted correctly', 'browser_cookie_mismatch'],
      ['State mismatch: auth state cookie not found', 'browser_cookie_missing'],
      ['State mismatch: OAuth state parameter does not match stored state', 'state_value_mismatch'],
      ['Invalid state: request expired', 'expired'],
      ['State not found in OAuth callback', 'state_missing'],
      ['State invalid: Failed to decrypt or parse auth state', 'state_invalid'],
    ]);
    emit({ phase: 'state', reason: categories.get(reason) ?? 'other' });
  } catch {
    // Malformed library errors cannot affect the authentication response.
  }
}
/** @param {string|undefined} path @param {unknown} provider @param {string|undefined} method
 * @param {string|null|undefined} location @param {string} issuer */
export function recordAuthCallback(path, provider, method, location, issuer) {
  if (
    !path?.startsWith('/callback/') ||
    (provider !== 'apple' && provider !== 'github' && provider !== 'google') ||
    (method !== 'GET' && method !== 'POST') ||
    !location
  )
    return;
  try {
    const url = new URL(location, issuer);
    const base = new URL(issuer);
    const target =
      url.protocol === 'myselfmd:' && url.host === 'oauth'
        ? 'native'
        : url.origin === base.origin && url.pathname === `${base.pathname}/error`
          ? 'web_error'
          : url.origin === base.origin && url.pathname === `${base.pathname}/callback/${provider}`
            ? 'canonical_callback'
            : 'other';
    emit({
      phase: 'callback',
      provider,
      method,
      target,
      error: url.searchParams.has('error') ? errorCategory(url.searchParams.get('error')) : 'none',
      hasCode: url.searchParams.has('code'),
    });
  } catch {
    emit({
      phase: 'callback',
      provider,
      method,
      target: 'invalid',
      error: 'other',
      hasCode: false,
    });
  }
}
/** The caller selects only the fixed first-party phone token endpoint.
 * @param {number} status */
export function recordPhoneTokenExchange(status) {
  if (!Number.isInteger(status) || status < 100 || status > 599) return;
  emit({
    phase: 'phone_token',
    httpStatus: status,
    outcome: status === 200 ? 'issued' : 'rejected',
  });
}
