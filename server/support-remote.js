import { PairingError } from './errors.js';
/** Cleanup of historical conversations during account deletion only. No inbox or messaging API.
 * @param {Record<string,string|undefined>} config
 * @param {typeof fetch} [transport]
 * @param {(subject:string)=>Promise<'owner'|'lifetime'|'guest'>} [resolveRole] */
export function createRemoteSupportCleanup(
  config,
  transport = fetch,
  resolveRole = async () => 'guest',
) {
  const origin = config.SUPPORT_ISOBOT_ORIGIN;
  const token = config.SUPPORT_ISOBOT_TOKEN;
  if (origin) {
    const url = new URL(origin);
    if (url.origin !== origin || url.protocol !== 'https:')
      throw new Error('Support origin must be an exact HTTPS origin.');
  }
  /** @param {string} subject */
  async function deleteRemoteSupport(subject) {
    if (!origin || !token) return;
    const role = await resolveRole(subject);
    const response = await transport(`${origin}/api/support/v1`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Support-Owner': subject,
        'X-Support-Role': role,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'deleteAccount' }),
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new PairingError(502, 'Support redirected unexpectedly.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new PairingError(503, 'Support returned an empty response.');
    let bytes = 0,
      value = '';
    const decoder = new TextDecoder();
    try {
      while (true) {
        // Sequential reads enforce the response size limit before accepting more bytes.
        // oxlint-disable-next-line eslint/no-await-in-loop
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 2000000) throw new PairingError(502, 'Support response exceeds its limit.');
        value += decoder.decode(next.value, { stream: true });
      }
    } finally {
      await reader.cancel();
    }
    const data = JSON.parse(value + decoder.decode());
    if (!response.ok)
      throw new PairingError(
        response.status,
        typeof data.error === 'string' ? data.error : 'Support is temporarily unavailable.',
      );
    return data;
  }
  return { deleteRemoteSupport };
}
