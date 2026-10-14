import { z } from 'zod';
import { PairingError } from './errors.js';

const userInfo = z.object({
  sub: z.string().min(1),
  name: z.string().nullish(),
  email: z.string().nullish(),
  picture: z.string().nullish(),
});

/** Read only the profile the caller's token authorizes, never a subject supplied by the client.
 * @param {string} issuer @param {string} token @param {string} subject @param {string[]} scopes */
export async function readAccountProfile(issuer, token, subject, scopes) {
  // MCP clients may request only myselfmd. OIDC userinfo requires openid, and
  // profile/email details must remain absent when those scopes were not granted.
  if (!scopes.includes('openid') || (!scopes.includes('profile') && !scopes.includes('email')))
    return { name: null, email: null, picture: null };
  const response = await fetch(`${issuer}/protocol/openid-connect/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new PairingError(502, 'Account profile could not be loaded.');
  const parsed = userInfo.safeParse(await response.json());
  if (!parsed.success || parsed.data.sub !== subject)
    throw new PairingError(502, 'Account profile could not be verified.');
  const profile = parsed.data;
  const picture = z.url().safeParse(profile.picture);
  return {
    name: scopes.includes('profile') ? profile.name?.trim() || null : null,
    email: scopes.includes('email') ? profile.email?.trim() || null : null,
    picture:
      scopes.includes('profile') && picture.success && new URL(picture.data).protocol === 'https:'
        ? picture.data
        : null,
  };
}
