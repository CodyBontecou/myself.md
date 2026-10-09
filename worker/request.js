import { PairingError } from '../server/errors.js';
/** Consume the original request before the Node adapter can respond early.
 * @param {Request} request @param {number} limit */
export async function readBytes(request, limit) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  try {
    await next();
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
  async function next() {
    const { done, value } = await reader.read();
    if (done) return;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new PairingError(413, 'Request exceeds upload limit.');
    }
    chunks.push(value);
    return next();
  }
}
