import { mkdirSync, writeFileSync } from 'node:fs';
const local = process.env.KEYCLOAK_ADMIN_URL ?? 'http://127.0.0.1:18080/auth';
const tunnel = new URL(local);
if (tunnel.protocol !== 'http:' || tunnel.hostname !== '127.0.0.1')
  throw new Error('Use the private HTTP loopback identity tunnel.');
const forwarded = {
  'X-Forwarded-Proto': 'https',
  'X-Forwarded-Host': 'myself.md',
  'X-Forwarded-Port': '443',
};
const login = await fetch(`${local}/realms/master/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { ...forwarded, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: process.env.IDENTITY_ADMIN_USER ?? '',
    password: process.env.IDENTITY_ADMIN_PASSWORD ?? '',
  }),
});
if (!login.ok) throw new Error(`Identity snapshot login failed: ${login.status}`);
const token = /** @type {{access_token:string}} */ (await login.json());
/** @param {string} path @returns {Promise<any>} */
async function get(path) {
  const response = await fetch(`${local}/admin/realms/qr-connect${path}`, {
    headers: { ...forwarded, Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Identity snapshot request failed: ${response.status}`);
  return response.json();
}
/** @param {number} first @returns {Promise<Array<{id:string,federatedIdentities?:unknown}>>} */
async function users(first = 0) {
  const page = /** @type {Array<{id:string,federatedIdentities?:unknown}>} */ (
    await get(`/users?first=${first}&max=500`)
  );
  return page.length === 500 ? [...page, ...(await users(first + 500))] : page;
}
const [realm, accounts, clients, providers, keys] = await Promise.all([
  get(''),
  users(),
  get('/clients'),
  get('/identity-provider/instances'),
  get('/keys'),
]);
await Promise.all(
  accounts.map(async (user) => {
    user.federatedIdentities = await get(`/users/${user.id}/federated-identity`);
  }),
);
if (accounts.length !== (await get('/users/count')))
  throw new Error('Identity users changed during snapshot. Freeze sign-in and retry.');
mkdirSync('.local/identity-migration', { recursive: true, mode: 0o700 });
writeFileSync(
  '.local/identity-migration/keycloak.json',
  JSON.stringify({ realm, users: accounts, clients, providers, keys }),
  { mode: 0o600 },
);
console.log(
  `Private identity snapshot saved: ${accounts.length} users. Provider secrets and identifiers were not printed.`,
);
