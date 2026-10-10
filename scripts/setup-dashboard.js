import { readFileSync, writeFileSync } from 'node:fs';
const cloud = process.argv.includes('--cloud');
const origin =
  process.env.PUBLIC_URL ?? (cloud ? `https://${process.env.SERVICE_DOMAIN}` : undefined);
if (!origin || new URL(origin).origin !== origin) throw new Error('Set the exact service origin.');
const origins = [
  origin,
  ...(process.env.PUBLIC_URL_ALIASES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
];
if (origins.some((value) => new URL(value).origin !== value))
  throw new Error('Service aliases must be exact origins.');
const authOrigin = process.env.OAUTH_ISSUER ? new URL(process.env.OAUTH_ISSUER).origin : origin;
const local = process.env.KEYCLOAK_ADMIN_URL;
if (!local || new URL(local).hostname !== '127.0.0.1' || new URL(local).protocol !== 'http:')
  throw new Error('Set KEYCLOAK_ADMIN_URL to the private HTTP loopback identity tunnel.');
const proxyHeaders =
  cloud || process.env.AUTH_PROXY === '1'
    ? {
        'X-Forwarded-Proto': new URL(authOrigin).protocol.slice(0, -1),
        'X-Forwarded-Host': new URL(authOrigin).host,
        'X-Forwarded-Port': new URL(authOrigin).port || '443',
      }
    : {};
const login = await fetch(`${local}/realms/master/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { ...proxyHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username:
      (cloud ? process.env.IDENTITY_ADMIN_USER : process.env.KC_BOOTSTRAP_ADMIN_USERNAME) ??
      'admin',
    password:
      (cloud ? process.env.IDENTITY_ADMIN_PASSWORD : process.env.KC_BOOTSTRAP_ADMIN_PASSWORD) ?? '',
  }),
});
if (!login.ok) throw new Error(`Identity admin sign-in failed: ${login.status}`);
const token = /** @type {{access_token:string}} */ (await login.json());
const headers = {
  ...proxyHeaders,
  Authorization: `Bearer ${token.access_token}`,
  'Content-Type': 'application/json',
};
const endpoint = `${local}/admin/realms/myselfmd/clients`;
const clients = await fetch(`${endpoint}?clientId=myselfmd-dashboard`, { headers });
if (!clients.ok) throw new Error(`Cannot inspect dashboard client: ${clients.status}`);
const existing = /** @type {{id:string,clientId:string}[]} */ (await clients.json());
const id = existing.find((c) => c.clientId === 'myselfmd-dashboard')?.id;
const client = {
  clientId: 'myselfmd-dashboard',
  name: 'myself.md Dashboard',
  protocol: 'openid-connect',
  enabled: true,
  publicClient: true,
  standardFlowEnabled: true,
  directAccessGrantsEnabled: false,
  implicitFlowEnabled: false,
  serviceAccountsEnabled: false,
  redirectUris: origins.map((value) => `${value}/dashboard/callback`),
  webOrigins: origins,
  defaultClientScopes: ['profile', 'myselfmd'],
  attributes: {
    'pkce.code.challenge.method': 'S256',
    'post.logout.redirect.uris': origins.map((value) => `${value}/dashboard`).join('##'),
  },
};
const saved = await fetch(id ? `${endpoint}/${id}` : endpoint, {
  method: id ? 'PUT' : 'POST',
  headers,
  body: JSON.stringify(client),
});
if (!saved.ok) throw new Error(`Dashboard client configuration failed: ${saved.status}`);
const path = cloud ? '.local/cloud-realm/myselfmd.json' : '.local/realm/myselfmd.json';
const realm = JSON.parse(readFileSync(path, 'utf8'));
realm.clients = realm.clients.filter(
  (/** @type {{clientId:string}} */ c) => c.clientId !== 'myselfmd-dashboard',
);
realm.clients.push(client);
writeFileSync(path, JSON.stringify(realm, null, 2), { mode: 0o600 });
console.log(`Dashboard client ready: ${origin}/dashboard (same myselfmd realm).`);
