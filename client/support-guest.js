import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { readJSONResponse } from '../packages/support-chat/errors.js';
import { qaEnabled } from './qa-runtime.js';

/** @type {Promise<string>|null} */
let credential = null;
async function loadCredential() {
  const key = 'myselfmd-support-guest-v1';
  const saved = await SecureStore.getItemAsync(key);
  if (saved) {
    if (!/^[a-f0-9]{64}$/.test(saved))
      throw new Error('The saved guest support credential is invalid.');
    return saved;
  }
  const token = Array.from(await Crypto.getRandomBytesAsync(32), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  await SecureStore.setItemAsync(key, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return token;
}
/** Support-only transport. Never writes guest credentials to app logs or account state.
 * @param {string} server @param {string} path @param {{method:string,body?:string}} options */
export async function guestSupportApi(server, path, options) {
  if (qaEnabled) {
    if (JSON.parse(options.body ?? '{}').action === 'list') return { conversations: [] };
    throw new Error('Sending support messages requires a normal build. No message was sent.');
  }
  if (path !== '/api/support/v1') throw new Error('Guest credentials are limited to support.');
  const origin = new URL(server);
  if (origin.protocol !== 'https:') throw new Error('Guest support requires a secure server.');
  credential ??= loadCredential().catch((error) => {
    credential = null;
    throw error;
  });
  const token = await credential;
  const response = await fetch(`${origin.origin}/api/support/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Guest ${token}` },
    body: options.body,
    redirect: 'error',
  });
  const result = await readJSONResponse(response);
  if (!response.ok)
    throw new Error(
      result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error
        : 'Support is unavailable. Please try again.',
    );
  return result;
}
