import { z } from 'zod';
import { PairingError } from './errors.js';
import { whoopRedirect, whoopScopes } from '../core/whoop.js';
const inputSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('authorize'), state: z.string().regex(/^[A-Za-z0-9]{8}$/) })
    .strict(),
  z.object({ action: z.literal('exchange'), code: z.string().min(1).max(4096) }).strict(),
  z.object({ action: z.literal('refresh'), refreshToken: z.string().min(1).max(8192) }).strict(),
]);
/** Stateless broker; provider credentials never enter mobile code or logs.
 * @param {Record<string,string|undefined>} config @param {unknown} input
 * @param {typeof fetch} [request] */
export async function whoopOAuth(config, input, request = fetch) {
  const parsed = inputSchema.parse(input);
  const clientId = config.WHOOP_CLIENT_ID;
  const clientSecret = config.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new PairingError(
      503,
      'WHOOP is not configured. Ask the server owner to configure WHOOP OAuth.',
    );
  if (parsed.action === 'authorize') {
    const url = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: whoopRedirect,
      response_type: 'code',
      scope: whoopScopes.join(' '),
      state: parsed.state,
    }).toString();
    return { authorization_url: url.href };
  }
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  if (parsed.action === 'exchange') {
    body.set('grant_type', 'authorization_code');
    body.set('code', parsed.code);
    body.set('redirect_uri', whoopRedirect);
  } else {
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', parsed.refreshToken);
    body.set('scope', 'offline');
  }
  const response = await request('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new PairingError(
      response.status === 429 ? 429 : response.status >= 500 ? 503 : 401,
      response.status === 429
        ? 'WHOOP is rate limiting requests. Try again later.'
        : 'WHOOP authorization failed. Reconnect WHOOP or retry later.',
    );
  }
  const token = z
    .object({
      access_token: z.string().min(1).max(8192),
      refresh_token: z.string().min(1).max(8192),
      expires_in: z.number().positive().finite().max(31536000),
      token_type: z.string().regex(/^bearer$/i),
      scope: z.string().max(2048),
    })
    .safeParse(await tokenJSON(response));
  if (!token.success)
    throw new PairingError(502, 'WHOOP returned an invalid token response. Reconnect WHOOP.');
  return token.data;
}

/** Bound token responses before parsing or returning any provider fields.
 * @param {Response} response */
async function tokenJSON(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new PairingError(502, 'WHOOP returned an empty token response.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Bound the stream before decoding provider tokens.
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 32768)
        throw new PairingError(502, 'WHOOP token response exceeds the safety limit.');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return /** @type {unknown} */ (JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new PairingError(502, 'WHOOP returned an invalid token response.');
  }
}
