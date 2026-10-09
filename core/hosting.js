/** Resolve the retired hosted transport without changing account/data partition IDs.
 * @param {string} origin */
export function canonicalServiceOrigin(origin) {
  return origin === 'https://qr-connect-cloud-cody.fly.dev' ? 'https://myself.md' : origin;
}
