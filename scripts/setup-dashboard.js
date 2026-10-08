import { readFileSync, writeFileSync } from 'node:fs';
const cloud = process.argv.includes('--cloud');
const origin = cloud ? `https://${process.env.SERVICE_DOMAIN}` : process.env.PUBLIC_URL;
if (!origin || new URL(origin).origin !== origin) throw new Error('Set the exact service origin.');
const local = process.env.KEYCLOAK_ADMIN_URL;
if (!local || new URL(local).hostname !== '127.0.0.1' || new URL(local).protocol !== 'http:')
  throw new Error('Set KEYCLOAK_ADMIN_URL to the private HTTP loopback identity tunnel.');
const proxyHeaders =
  cloud || process.env.AUTH_PROXY === '1'
    ? {
        'X-Forwarded-Proto': new URL(origin).protocol.slice(0, -1),
        'X-Forwarded-Host': new URL(origin).host,
        'X-Forwarded-Port': new URL(origin).port || '443',
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
const endpoint = `${local}/admin/realms/qr-connect/clients`;
const clients = await fetch(`${endpoint}?clientId=qr-dashboard`, { headers });
if (!clients.ok) throw new Error(`Cannot inspect dashboard client: ${clients.status}`);
const existing = /** @type {{id:string,clientId:string}[]} */ (await clients.json());
const id = existing.find((c) => c.clientId === 'qr-dashboard')?.id;
const client = {
  clientId: 'qr-dashboard',
  name: 'QR Connect Dashboard',
  protocol: 'openid-connect',
  enabled: true,
  publicClient: true,
  standardFlowEnabled: true,
  directAccessGrantsEnabled: false,
  implicitFlowEnabled: false,
  serviceAccountsEnabled: false,
  redirectUris: [`${origin}/dashboard/callback`],
  webOrigins: [origin],
  defaultClientScopes: ['profile', 'qr-connect'],
  attributes: {
    'pkce.code.challenge.method': 'S256',
    'post.logout.redirect.uris': `${origin}/dashboard`,
  },
};
const saved = await fetch(id ? `${endpoint}/${id}` : endpoint, {
  method: id ? 'PUT' : 'POST',
  headers,
  body: JSON.stringify(client),
});
if (!saved.ok) throw new Error(`Dashboard client configuration failed: ${saved.status}`);
const path = cloud ? '.local/cloud-realm/qr-connect.json' : '.local/realm/qr-connect.json';
const realm = JSON.parse(readFileSync(path, 'utf8'));
realm.clients = realm.clients.filter(
  (/** @type {{clientId:string}} */ c) => c.clientId !== 'qr-dashboard',
);
realm.clients.push(client);
writeFileSync(path, JSON.stringify(realm, null, 2), { mode: 0o600 });
console.log(`Dashboard client ready: ${origin}/dashboard (same qr-connect realm).`);
