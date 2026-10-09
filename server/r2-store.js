import { Buffer } from 'node:buffer';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { z } from 'zod';
import { PairingError } from './errors.js';
/** @typedef {{put:(key:string,bytes:Uint8Array)=>Promise<void>,get:(key:string)=>Promise<Uint8Array>,delete:(key:string)=>Promise<void>}} ObjectStore */
/** Private server-only storage. Credentials and object keys never reach clients.
 * @param {NodeJS.ProcessEnv} env @returns {ObjectStore|null} */
export function r2Store(env) {
  const names = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
  if (!names.some((name) => env[name])) return null;
  const config = z
    .object({
      R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/),
      R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
      R2_ACCESS_KEY_ID: z.string().min(1),
      R2_SECRET_ACCESS_KEY: z.string().min(1),
    })
    .safeParse(env);
  if (!config.success)
    throw new Error('Configure all four R2 settings before enabling R2 storage.');
  const values = config.data;
  let endpoint = `https://${values.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  // Only synthetic local HTTP fixtures may override the production endpoint.
  if (env.R2_TEST_ENDPOINT) {
    const fixture = new URL(env.R2_TEST_ENDPOINT);
    if (
      env.ALLOW_HTTP_DEV !== '1' ||
      fixture.protocol !== 'http:' ||
      fixture.hostname !== '127.0.0.1'
    )
      throw new Error('R2_TEST_ENDPOINT requires explicit local HTTP development mode.');
    endpoint = fixture.origin;
  }
  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: values.R2_ACCESS_KEY_ID,
      secretAccessKey: values.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
  });
  const Bucket = values.R2_BUCKET;
  return {
    async put(Key, bytes) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket,
            Key,
            Body: Buffer.from(bytes),
            ContentType: 'application/octet-stream',
          }),
        );
      } catch {
        throw new PairingError(503, 'Cloud storage upload failed. Retry the upload.');
      }
    },
    async get(Key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket, Key }));
        if (!object.Body) throw new Error('Missing object body.');
        return await object.Body.transformToByteArray();
      } catch {
        throw new PairingError(503, 'Cloud storage is unavailable. Retry later.');
      }
    },
    async delete(Key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket, Key }));
      } catch {
        throw new PairingError(503, 'Cloud storage deletion failed. Retry later.');
      }
    },
  };
}
