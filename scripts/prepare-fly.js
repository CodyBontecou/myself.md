import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
const values = Object.fromEntries(
  readFileSync('.env.cloud', 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
for (const key of ['CLOUD_ENCRYPTION_KEY', 'IDENTITY_DB_PASSWORD', 'IDENTITY_ADMIN_PASSWORD'])
  if (!values[key]) throw new Error(`Missing ${key} in .env.cloud.`);
const r2Keys = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
if (r2Keys.some((key) => values[key]) && !r2Keys.every((key) => values[key]))
  throw new Error('Configure all four R2 settings before preparing Fly secrets.');
const r2Secrets = r2Keys
  .filter((key) => values[key])
  .map((key) => `${key}=${values[key]}\n`)
  .join('');
if (r2Secrets) writeFileSync('.local/fly-r2.secrets', r2Secrets, { mode: 0o600 });
mkdirSync('.local/fly-identity', { recursive: true });
copyFileSync('.local/cloud-realm/qr-connect.json', '.local/fly-identity/qr-connect.json');
for (const [name, value] of Object.entries({
  service: `CLOUD_ENCRYPTION_KEY=${values.CLOUD_ENCRYPTION_KEY}\n${r2Secrets}`,
  identity: `KC_DB_PASSWORD=${values.IDENTITY_DB_PASSWORD}\nKC_BOOTSTRAP_ADMIN_PASSWORD=${values.IDENTITY_ADMIN_PASSWORD}\n`,
  database: `POSTGRES_PASSWORD=${values.IDENTITY_DB_PASSWORD}\n`,
}))
  writeFileSync(`.local/fly-${name}.secrets`, value, { mode: 0o600 });
console.log('Prepared production realm context and private Fly secret files.');
