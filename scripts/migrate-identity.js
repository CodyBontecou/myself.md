import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createIdentity, identityOptions } from '../server/identity.js';
import { getMigrations } from 'better-auth/db/migration';

const directory = '.local/identity-migration';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const snapshot = z
  .object({
    users: z.array(
      z.object({
        id: z.string(),
        enabled: z.literal(true),
        email: z.email(),
        emailVerified: z.boolean(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        username: z.string(),
        createdTimestamp: z.number(),
        federatedIdentities: z
          .array(z.object({ identityProvider: z.enum(['apple', 'github']), userId: z.string() }))
          .min(1),
      }),
    ),
    clients: z.array(
      z.object({
        id: z.string(),
        clientId: z.string(),
        publicClient: z.boolean(),
        name: z.string().optional(),
        redirectUris: z.array(z.string()).optional(),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync(`${directory}/keycloak.json`, 'utf8')));
if (new Set(snapshot.users.map((user) => user.email)).size !== snapshot.users.length)
  throw new Error(
    'Resolve duplicate identity emails explicitly before import; do not merge accounts.',
  );
const existing = JSON.parse(
  readFileSync(
    existsSync(`${directory}/worker-secrets.json`)
      ? `${directory}/worker-secrets.json`
      : '.local/worker-secrets.json',
    'utf8',
  ),
);
const secrets = {
  ...existing,
  IDENTITY_SECRET: existing.IDENTITY_SECRET ?? randomBytes(32).toString('hex'),
  GITHUB_AUTH_CLIENT_ID: process.env.GITHUB_OAUTH_CLIENT_ID,
  GITHUB_AUTH_CLIENT_SECRET: process.env.GITHUB_OAUTH_CLIENT_SECRET,
  APPLE_AUTH_CLIENT_ID: process.env.APPLE_SERVICE_ID,
  APPLE_AUTH_TEAM_ID: process.env.APPLE_TEAM_ID,
  APPLE_AUTH_KEY_ID: process.env.APPLE_KEY_ID,
  APPLE_AUTH_PRIVATE_KEY: readFileSync(process.env.APPLE_PRIVATE_KEY_PATH ?? '', 'utf8'),
};
for (const value of Object.values(secrets))
  if (typeof value !== 'string' || !value)
    throw new Error('Missing production identity credential.');
const issuer = process.env.OAUTH_ISSUER;
if (issuer !== 'https://myself.md/auth/realms/qr-connect')
  throw new Error('Preserve the existing production issuer.');
const keys = await fetch(`${issuer}/protocol/openid-connect/certs`);
if (!keys.ok) throw new Error('Cannot back up existing public verification keys.');
secrets.LEGACY_IDENTITY_JWKS = JSON.stringify(await keys.json());
writeFileSync(`${directory}/worker-secrets.json`, JSON.stringify(secrets), { mode: 0o600 });
const config = {
  issuer,
  secret: secrets.IDENTITY_SECRET,
  resource: 'https://myself.md/mcp',
  githubId: secrets.GITHUB_AUTH_CLIENT_ID,
  githubSecret: secrets.GITHUB_AUTH_CLIENT_SECRET,
  appleId: secrets.APPLE_AUTH_CLIENT_ID,
  appleSecret: 'schema-only-unused-credential',
};
const db = new DatabaseSync(':memory:');
const migrations = await getMigrations(identityOptions(db, config));
await migrations.runMigrations();
writeFileSync(
  'worker/identity.sql',
  await (
    await getMigrations(identityOptions(new DatabaseSync(':memory:'), config))
  ).compileMigrations(),
);
const auth = createIdentity(db, config);
const context = await auth.$context;
const adapter = context.adapter;
await Promise.all(
  snapshot.users.map(async (user) => {
    await adapter.create({
      model: 'user',
      forceAllowId: true,
      data: {
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: new Date(user.createdTimestamp),
        updatedAt: new Date(),
      },
    });
    await Promise.all(
      user.federatedIdentities.map((link) =>
        adapter.create({
          model: 'account',
          data: {
            accountId: link.userId,
            providerId: link.identityProvider,
            userId: user.id,
            createdAt: new Date(user.createdTimestamp),
            updatedAt: new Date(),
          },
        }),
      ),
    );
  }),
);
const clients = snapshot.clients.filter((client) => client.clientId.startsWith('qr-'));
await Promise.all(
  clients.map(async (client) => {
    if (!client.publicClient)
      throw new Error('Confidential OAuth clients need explicit secret migration.');
    await adapter.create({
      model: 'oauthClient',
      data: {
        clientId: client.clientId,
        name: client.name ?? client.clientId,
        disabled: false,
        skipConsent: ['qr-phone', 'qr-dashboard'].includes(client.clientId),
        enableEndSession: true,
        subjectType: 'public',
        scopes: ['openid', 'profile', 'email', 'qr-connect', 'offline_access'],
        redirectUris: (client.redirectUris ?? []).filter((uri) => !uri.includes('.fly.dev')),
        postLogoutRedirectUris:
          client.clientId === 'qr-dashboard' ? ['https://myself.md/dashboard'] : [],
        tokenEndpointAuthMethod: 'none',
        applicationType: client.clientId === 'qr-dashboard' ? 'web' : 'native',
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        requirePKCE: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await adapter.create({
      model: 'oauthClientResource',
      data: { clientId: client.clientId, resourceId: config.resource, createdAt: new Date() },
    });
  }),
);
/** @param {unknown} value */
function literal(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') throw new Error('Unexpected identity database field.');
  return `'${value.replaceAll("'", "''")}'`;
}
const tables = ['user', 'account', 'oauthClient', 'oauthResource', 'oauthClientResource'];
const statements = tables.flatMap((table) =>
  db
    .prepare(`SELECT * FROM "${table}"`)
    .all()
    .map(
      (row) =>
        `INSERT INTO "${table}" (${Object.keys(row)
          .map((key) => `"${key}"`)
          .join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`,
    ),
);
statements.push(
  `CREATE UNIQUE INDEX account_provider_identity_unique ON account(providerId,accountId);`,
);
writeFileSync(`${directory}/import.sql`, statements.join('\n'), { mode: 0o600 });
writeFileSync(
  `${directory}/manifest.json`,
  JSON.stringify({
    id: randomUUID(),
    users: snapshot.users.length,
    clients: clients.length,
    createdAt: new Date().toISOString(),
  }),
  { mode: 0o600 },
);
console.log(
  `Prepared private identity import: ${snapshot.users.length} users, ${clients.length} clients. No passwords or provider tokens imported.`,
);
