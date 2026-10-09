import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
/** Workers use secrets; self-hosted Node deployments may retain certificate files. */
export function appleRoots() {
  if (process.env.APPLE_IAP_ROOT_CERTIFICATES_BASE64)
    return z
      .array(z.string())
      .parse(JSON.parse(process.env.APPLE_IAP_ROOT_CERTIFICATES_BASE64))
      .map((value) => Buffer.from(value, 'base64'));
  return (process.env.APPLE_IAP_ROOT_CERTIFICATES ?? '')
    .split(',')
    .filter(Boolean)
    .map((path) => readFileSync(path));
}
export function appleSigningKey() {
  if (process.env.APPLE_IAP_PRIVATE_KEY) return process.env.APPLE_IAP_PRIVATE_KEY;
  return process.env.APPLE_IAP_KEY_PATH
    ? readFileSync(process.env.APPLE_IAP_KEY_PATH, 'utf8')
    : null;
}
export function googleCredentials() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return undefined;
  const credentials = z
    .object({ client_email: z.string(), private_key: z.string() })
    .parse(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
  return { client_email: credentials.client_email, private_key: credentials.private_key };
}
