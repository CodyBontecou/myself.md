/** @typedef {{server: string, ticket: string}} PairingQr */
/** @param {string} server @param {string} ticket */
export function createPairingUrl(server, ticket) {
  return `${server}/pair#${ticket}`;
}
/** @param {string} server @param {string} ticket */
export function createPairingDeepLink(server, ticket) {
  return `myselfmd://pair?url=${encodeURIComponent(createPairingUrl(server, ticket))}`;
}
/** @param {string} value @returns {PairingQr} */
export function parsePairingQr(value) {
  const prefix = /^myselfmd:\/\/pair\?url=/.exec(value)?.[0];
  if (prefix) value = decodeURIComponent(value.slice(prefix.length));
  const match = /^(https?:\/\/[^/\s?#]+)\/pair#([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match?.[1] || !match[2]) throw new Error('Scan a myself.md pairing code.');
  return { server: match[1], ticket: match[2] };
}
