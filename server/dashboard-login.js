import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { PairingError } from './store.js';

/** @type {Map<string,{created:number,cookies:Map<string,string>,state:string}>} */
const attempts = new Map();
const inputSchema = z.object({
  url: z.string().url(),
  attempt: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(),
});

/** Relay the browser authorization form; never use password grants or retain credentials.
 * @param {unknown} body @param {string} issuer @param {string} publicUrl */
export async function dashboardLogin(body, issuer, publicUrl) {
  const input = inputSchema.parse(body);
  const target = new URL(input.url);
  const identity = new URL(issuer);
  const callback = `${new URL(publicUrl).origin}/dashboard/callback`;
  if (target.origin !== identity.origin)
    throw new PairingError(400, 'Invalid sign-in destination.');
  for (const [id, attempt] of attempts) {
    if (Date.now() - attempt.created > 600000) attempts.delete(id);
  }
  let id = input.attempt;
  let attempt = id ? attempts.get(id) : undefined;
  if (!id) {
    const query = target.searchParams;
    if (
      input.fields ||
      target.pathname !== `${identity.pathname}/protocol/openid-connect/auth` ||
      query.get('client_id') !== 'qr-dashboard' ||
      query.get('redirect_uri') !== callback ||
      query.get('response_type') !== 'code' ||
      query.get('code_challenge_method') !== 'S256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(query.get('code_challenge') ?? '') ||
      !/^[A-Za-z0-9_-]{43}$/.test(query.get('state') ?? '')
    )
      throw new PairingError(400, 'Invalid sign-in request.');
    if (attempts.size >= 1000) throw new PairingError(503, 'Please try signing in later.');
    id = randomBytes(32).toString('base64url');
    attempt = { created: Date.now(), cookies: new Map(), state: query.get('state') ?? '' };
    attempts.set(id, attempt);
  } else if (
    !attempt ||
    !input.fields ||
    target.pathname !== `${identity.pathname}/login-actions/authenticate` ||
    target.searchParams.get('client_id') !== 'qr-dashboard'
  ) {
    throw new PairingError(400, 'Sign-in expired. Please start again.');
  }
  if (!attempt) throw new PairingError(400, 'Sign-in expired. Please start again.');
  const response = await fetch(target, {
    method: input.fields ? 'POST' : 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    headers: {
      Cookie: [...attempt.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      ...(input.fields ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(input.fields ? { body: new URLSearchParams(input.fields) } : {}),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0] ?? '';
    const equals = pair.indexOf('=');
    if (equals > 0) attempt.cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
  }
  const redirect = response.headers.get('location');
  if (redirect) {
    const destination = new URL(redirect, target);
    if (
      destination.origin !== new URL(callback).origin ||
      destination.pathname !== '/dashboard/callback' ||
      destination.searchParams.get('state') !== attempt.state
    ) {
      attempts.delete(id);
      throw new PairingError(
        400,
        'This account needs an additional sign-in step. Use secure sign-in to continue.',
      );
    }
    attempts.delete(id);
    return { redirect: destination.href, attempt: id, html: '' };
  }
  if (!response.ok) {
    attempts.delete(id);
    throw new PairingError(502, 'Sign-in is unavailable. Please try again.');
  }
  return { html: await response.text(), attempt: id, redirect: null };
}
