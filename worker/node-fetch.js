import { Buffer } from 'node:buffer';

// Apple's CommonJS SDK requires a default export and node-fetch's buffer() response method.
// Wrangler's automatic shim exports a bare function to require(), losing that default.
const NativeHeaders = Headers;
export { NativeHeaders as Headers };
export const Request = globalThis.Request;
export const Response = globalThis.Response;
const NativeAbortController = AbortController;
export { NativeAbortController as AbortController };
export const FetchError = Error;
export const AbortError = Error;
/** @param {number} status */
export const isRedirect = (status) => [301, 302, 303, 307, 308].includes(status);

/** @param {RequestInfo|URL} input @param {RequestInit & {timeout?:number}} [options] */
export default async function fetch(input, options = {}) {
  const { timeout, ...init } = options;
  const signal = timeout ? AbortSignal.timeout(timeout) : undefined;
  const response = await globalThis.fetch(input, {
    ...init,
    ...(signal ? { signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal } : {}),
  });
  return Object.assign(response, {
    buffer: async () => Buffer.from(await response.arrayBuffer()),
  });
}
