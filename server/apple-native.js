import { decodeJwt, importPKCS8, SignJWT } from 'jose';
import { PairingError } from './errors.js';

/** Sign in with Apple client secret for one client: the web Services ID or the iOS bundle ID.
 * @param {{teamId:string,keyId:string,privateKey:string,clientId:string}} key */
export async function appleClientSecret(key) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: key.keyId })
    .setIssuer(key.teamId)
    .setSubject(key.clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await importPKCS8(key.privateKey, 'ES256'));
}

/** Redeem the native sheet's one-time authorization code for an Apple access token, which account
 * deletion can later revoke. The code must belong to the same Apple user as the signed-in ID token.
 * @param {{clientId:string,clientSecret:string,code:string,subject:string}} grant @param {typeof fetch} [transport] */
export async function exchangeAppleCode(grant, transport = fetch) {
  const response = await transport('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: grant.clientId,
      client_secret: grant.clientSecret,
      code: grant.code,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new PairingError(401, 'Apple sign-in expired. Please try again.');
  const body = /** @type {{access_token?:unknown,id_token?:unknown}} */ (await response.json());
  if (typeof body.access_token !== 'string' || typeof body.id_token !== 'string')
    throw new PairingError(401, 'Apple sign-in could not be confirmed. Please try again.');
  // The token response is from Apple over TLS; it only needs to name the same user.
  if (decodeJwt(body.id_token).sub !== grant.subject)
    throw new PairingError(401, 'Apple sign-in could not be confirmed. Please try again.');
  return { accessToken: body.access_token };
}

/** The Apple client that issued an account's tokens, read from its stored ID token audience.
 * @param {string|null|undefined} idToken @param {string} bundleId */
export function issuedToBundle(idToken, bundleId) {
  if (!idToken) return false;
  try {
    const { aud } = decodeJwt(idToken);
    return Array.isArray(aud) ? aud.includes(bundleId) : aud === bundleId;
  } catch {
    return false;
  }
}
