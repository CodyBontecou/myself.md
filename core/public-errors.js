/** Read only the user-facing message from a bounded error/diagnostic value. @param {unknown} value @param {number} depth @returns {string} */
function message(value, depth) {
  if (depth > 4) return '';
  if (typeof value === 'string') {
    try {
      return message(JSON.parse(value), depth + 1);
    } catch {
      return value.trim().slice(0, 1000);
    }
  }
  if (!value || typeof value !== 'object') return '';
  const record = /** @type {Record<string,unknown>} */ (value);
  return message(record.message ?? record.error, depth + 1);
}

/** Presentation only: diagnostics remain unchanged at their existing boundaries. @param {unknown} value */
export function publicErrorMessage(value) {
  const text = message(value, 0);
  if (/^invalid_signature$/i.test(text))
    return 'This sign-in link expired or could not be verified. Return to the app or assistant that started sign-in and connect again.';
  if (/deletion status receipt expired/i.test(text))
    return 'This deletion-status link has expired. Open account deletion again to check your account.';
  if (/failed to fetch|network|load failed/i.test(text))
    return 'We couldn’t connect. Check your internet connection and try again.';
  if (!text || /\bstack\b|\bsqlite\b|\bat https?:|\bTypeError\b|\bHTTP 5\d\d\b/i.test(text))
    return 'We couldn’t complete that request. Please try again.';
  return text;
}
