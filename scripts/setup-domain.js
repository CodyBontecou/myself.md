import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/** @typedef {{id:string,name:string,protocol:string,protocolMapper:string,config:Record<string,string>}} Mapper */
/** @typedef {{id:string,name:string,protocolMappers?:Mapper[]}} Scope */
/** @typedef {{id:string,clientId:string,redirectUris:string[],webOrigins:string[],attributes:Record<string,string>}} Client */
const origins = [
  ...new Set([
    process.env.PUBLIC_URL ?? '',
    ...(process.env.PUBLIC_URL_ALIASES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ]),
];
for (const origin of origins) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin)
    throw new Error('Set exact HTTPS service origins.');
}
const issuer = process.env.OAUTH_ISSUER;
if (!issuer?.startsWith('https://') || new URL(issuer).pathname !== '/auth/realms/qr-connect')
  throw new Error('Set OAUTH_ISSUER to the existing qr-connect issuer.');
const local = process.env.KEYCLOAK_ADMIN_URL ?? '';
const admin = new URL(local);
if (admin.hostname !== '127.0.0.1' || admin.protocol !== 'http:')
  throw new Error('Use the private HTTP loopback identity tunnel.');
const forwarding = {
  'X-Forwarded-Proto': 'https',
  'X-Forwarded-Host': new URL(issuer).host,
  'X-Forwarded-Port': '443',
};
const login = await fetch(`${local}/realms/master/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { ...forwarding, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: process.env.IDENTITY_ADMIN_USER ?? 'admin',
    password: process.env.IDENTITY_ADMIN_PASSWORD ?? '',
  }),
});
if (!login.ok) throw new Error(`Identity admin sign-in failed: ${login.status}`);
const token = /** @type {{access_token:string}} */ (await login.json());
const headers = {
  ...forwarding,
  Authorization: `Bearer ${token.access_token}`,
  'Content-Type': 'application/json',
};
/** @param {string} path @param {string} [method] @param {unknown} [body] */
async function request(path, method = 'GET', body) {
  const response = await fetch(`${local}/admin/realms/qr-connect${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Identity ${method} ${path}: ${response.status}`);
  return response;
}
const realm = /** @type {Record<string, unknown>} */ (await (await request('')).json());
const scopes = /** @type {Scope[]} */ (await (await request('/client-scopes')).json());
const scope = scopes.find((item) => item.name === 'qr-connect');
if (!scope) throw new Error('Existing qr-connect scope required.');
const mapperPath = `/client-scopes/${scope.id}/protocol-mappers/models`;
const mappers = /** @type {Mapper[]} */ (await (await request(mapperPath)).json());
const clients = /** @type {Client[]} */ (
  await (await request('/clients?clientId=qr-dashboard')).json()
);
const existing = clients.find((client) => client.clientId === 'qr-dashboard');
if (!existing) throw new Error('Provision the existing dashboard client first.');
const client = {
  ...existing,
  name: 'myself.md Dashboard',
  redirectUris: [
    ...new Set([
      ...existing.redirectUris,
      ...origins.map((origin) => `${origin}/dashboard/callback`),
    ]),
  ],
  webOrigins: [...new Set([...existing.webOrigins, ...origins])],
  attributes: {
    ...existing.attributes,
    'post.logout.redirect.uris': [
      ...new Set([
        ...(existing.attributes['post.logout.redirect.uris'] ?? '').split('##').filter(Boolean),
        ...origins.map((origin) => `${origin}/dashboard`),
      ]),
    ].join('##'),
  },
};
const additions = origins
  .filter(
    (origin) =>
      !mappers.some(
        (mapper) =>
          mapper.protocolMapper === 'oidc-audience-mapper' &&
          mapper.config['included.custom.audience'] === `${origin}/mcp` &&
          mapper.config['access.token.claim'] === 'true',
      ),
  )
  .map((origin) => ({
    name: `mcp-audience-${new URL(origin).host}`,
    protocol: 'openid-connect',
    protocolMapper: 'oidc-audience-mapper',
    config: {
      'included.custom.audience': `${origin}/mcp`,
      'access.token.claim': 'true',
      'introspection.token.claim': 'true',
    },
  }));
console.log(
  JSON.stringify(
    {
      issuer,
      origins,
      redirectUris: client.redirectUris,
      addedAudiences: additions.map((mapper) => mapper.config['included.custom.audience']),
    },
    null,
    2,
  ),
);
if (!process.argv.includes('--dry-run')) {
  mkdirSync('.local/domain-cutover', { recursive: true, mode: 0o700 });
  const backup = '.local/domain-cutover/identity-before.json';
  if (!existsSync(backup))
    writeFileSync(backup, JSON.stringify({ realm, client: existing, scope, mappers }, null, 2), {
      mode: 0o600,
      flag: 'wx',
    });
  // Retain every existing mapper and callback while adding the new service origin.
  for (const mapper of additions) {
    // Each mutation completes before the next one and before updating the dashboard.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await request(mapperPath, 'POST', mapper);
  }
  await request(`/clients/${existing.id}`, 'PUT', client);
  await request('', 'PUT', { ...realm, displayName: 'myself.md' });
  const seedPath = '.local/cloud-realm/qr-connect.json';
  const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
  seed.displayName = 'myself.md';
  const seedClient = seed.clients.find(
    (/** @type {{clientId:string}} */ item) => item.clientId === 'qr-dashboard',
  );
  if (seedClient)
    Object.assign(seedClient, {
      name: client.name,
      redirectUris: client.redirectUris,
      webOrigins: client.webOrigins,
      attributes: client.attributes,
    });
  const seedScope = seed.clientScopes.find(
    (/** @type {Scope} */ item) => item.name === 'qr-connect',
  );
  if (seedScope) seedScope.protocolMappers = [...(seedScope.protocolMappers ?? []), ...additions];
  writeFileSync(seedPath, JSON.stringify(seed, null, 2), { mode: 0o600 });
  console.log('Updated domain audiences and dashboard callbacks; retained issuer and users.');
}
