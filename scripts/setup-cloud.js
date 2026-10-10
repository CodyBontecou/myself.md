import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const domain = process.argv[2];
if (!domain || !/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain))
  throw new Error('Usage: npm run cloud:setup -- exports.example.com');
if (existsSync('.env.cloud') || existsSync('.local/cloud-realm/myselfmd.json'))
  throw new Error('Cloud configuration exists; preserve its encryption key and edit it in place.');
const temporary = mkdtempSync(join(tmpdir(), 'cloud-realm-'));
try {
  const child = spawnSync(
    process.execPath,
    [new URL('./setup-auth.js', import.meta.url).pathname],
    { cwd: temporary, stdio: 'pipe' },
  );
  if (child.status !== 0) throw new Error('Failed to generate OAuth realm.');
  const realm = JSON.parse(readFileSync(join(temporary, '.local/realm/myselfmd.json'), 'utf8'));
  realm.users = [];
  realm.sslRequired = 'all';
  realm.registrationAllowed = false;
  const resource = `https://${domain}/mcp`;
  for (const scope of realm.clientScopes)
    for (const mapper of scope.protocolMappers ?? [])
      if (mapper.name === 'mcp-audience') mapper.config['included.custom.audience'] = resource;
  const dashboard = realm.clients.find(
    (/** @type {{clientId:string}} */ client) => client.clientId === 'myselfmd-dashboard',
  );
  dashboard.redirectUris = [`https://${domain}/dashboard/callback`];
  dashboard.webOrigins = [`https://${domain}`];
  dashboard.attributes['post.logout.redirect.uris'] = `https://${domain}/dashboard`;
  mkdirSync('.local/cloud-realm', { recursive: true });
  writeFileSync('.local/cloud-realm/myselfmd.json', JSON.stringify(realm, null, 2), {
    mode: 0o644,
  });
  writeFileSync(
    '.env.cloud',
    `SERVICE_DOMAIN=${domain}\nCLOUD_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nIDENTITY_DB_PASSWORD=${randomBytes(32).toString('base64url')}\nIDENTITY_ADMIN_PASSWORD=${randomBytes(32).toString('base64url')}\nIDENTITY_ADMIN_USER=admin\n`,
    { mode: 0o600 },
  );
  console.log(
    'Created production realm without development users and .env.cloud. Back up its encryption key before deploying.',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
