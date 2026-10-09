import { PairingError } from './errors.js';
/** @param {{clientId:string,clientSecret:string,token:string,hint:'refresh_token'|'access_token'}} grant @param {typeof fetch} [transport] */
export async function revokeAppleToken(grant, transport = fetch) {
  const response = await transport('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: grant.clientId,
      client_secret: grant.clientSecret,
      token: grant.token,
      token_type_hint: grant.hint,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new PairingError(503, 'Apple token revocation could not complete. Deletion will retry.');
}
