import { PairingError } from '../server/errors.js';
/** @param {R2Bucket} bucket @returns {import('../server/r2-store.js').ObjectStore} */
export function objectStorage(bucket) {
  return {
    async get(key) {
      try {
        const object = await bucket.get(key);
        if (!object) throw new Error('Missing object.');
        return new Uint8Array(await object.arrayBuffer());
      } catch {
        throw new PairingError(503, 'Cloud storage is temporarily unavailable. Retry later.');
      }
    },
    async put(key, bytes) {
      try {
        await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/octet-stream' } });
      } catch {
        throw new PairingError(503, 'Cloud storage is temporarily unavailable. Retry later.');
      }
    },
    async delete(key) {
      try {
        await bucket.delete(key);
      } catch {
        throw new PairingError(503, 'Cloud storage is temporarily unavailable. Retry later.');
      }
    },
  };
}
