import { socialAuth } from './social-auth.js';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
if (existsSync('.env'))
  throw new Error('.env already exists; edit it instead of replacing credentials.');
const ip =
  Object.values(networkInterfaces())
    .flat()
    .find((item) => item?.family === 'IPv4' && !item.internal)?.address ?? 'localhost';
const origin = `http://${ip}:3000`;
const adminPassword = randomBytes(18).toString('base64url');
mkdirSync('.local/realm', { recursive: true });
const realm = {
  realm: 'qr-connect',
  displayName: 'myself.md',
  enabled: true,
  sslRequired: 'none',
  ...socialAuth,
  defaultDefaultClientScopes: ['profile', 'qr-connect'],
  clientProfiles: {
    profiles: [
      {
        name: 'require-pkce',
        executors: [{ executor: 'pkce-enforcer', configuration: { 'auto-configure': true } }],
      },
    ],
  },
  clientPolicies: {
    policies: [
      {
        name: 'PKCE for OAuth clients',
        enabled: true,
        conditions: [
          { condition: 'client-access-type', configuration: { type: ['public', 'confidential'] } },
        ],
        profiles: ['require-pkce'],
      },
    ],
  },
  clientScopes: [
    {
      name: 'profile',
      protocol: 'openid-connect',
      attributes: { 'include.in.token.scope': 'true' },
      protocolMappers: [
        {
          name: 'username',
          protocol: 'openid-connect',
          protocolMapper: 'oidc-usermodel-property-mapper',
          config: {
            'user.attribute': 'username',
            'claim.name': 'preferred_username',
            'jsonType.label': 'String',
            'access.token.claim': 'true',
            'id.token.claim': 'true',
            'userinfo.token.claim': 'true',
          },
        },
      ],
    },
    {
      name: 'qr-connect',
      protocol: 'openid-connect',
      attributes: { 'include.in.token.scope': 'true' },
      protocolMappers: [
        {
          name: 'subject',
          protocol: 'openid-connect',
          protocolMapper: 'oidc-sub-mapper',
          config: { 'access.token.claim': 'true' },
        },
        {
          name: 'mcp-audience',
          protocol: 'openid-connect',
          protocolMapper: 'oidc-audience-mapper',
          config: { 'included.custom.audience': `${origin}/mcp`, 'access.token.claim': 'true' },
        },
      ],
    },
  ],
  clients: [
    {
      clientId: 'qr-phone',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: ['qrconnect://oauth'],
      defaultClientScopes: ['profile', 'qr-connect'],
      attributes: { 'pkce.code.challenge.method': 'S256' },
    },
    {
      clientId: 'qr-dashboard',
      name: 'myself.md Dashboard',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: [`${origin}/dashboard/callback`],
      webOrigins: [origin],
      defaultClientScopes: ['profile', 'qr-connect'],
      attributes: {
        'pkce.code.challenge.method': 'S256',
        'post.logout.redirect.uris': `${origin}/dashboard`,
      },
    },
    {
      clientId: 'qr-mcp',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: ['http://localhost:8765/callback'],
      defaultClientScopes: ['profile', 'qr-connect'],
      attributes: { 'pkce.code.challenge.method': 'S256' },
    },
  ],
  users: [],
  components: {
    'org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy': [
      {
        name: 'Require OAuth consent',
        providerId: 'consent-required',
        subType: 'anonymous',
        config: {},
      },
      {
        name: 'Limit registered clients',
        providerId: 'max-clients',
        subType: 'anonymous',
        config: { 'max-clients': ['200'] },
      },
      {
        name: 'Trusted callback hosts',
        providerId: 'trusted-hosts',
        subType: 'anonymous',
        config: {
          'trusted-hosts': ['localhost', '127.0.0.1', 'chatgpt.com', 'claude.ai', 'grok.com'],
          'host-sending-registration-request-must-match': ['false'],
          'client-uris-must-match': ['true'],
        },
      },
    ],
  },
};
writeFileSync('.local/realm/qr-connect.json', JSON.stringify(realm, null, 2));
writeFileSync(
  '.env',
  `PUBLIC_URL=${origin}\nOAUTH_ISSUER=http://${ip}:8080/realms/qr-connect\nALLOW_HTTP_DEV=1\nDEV_HOST=${ip}\nKEYCLOAK_URL=http://${ip}:8080\nEXPO_PUBLIC_ALLOW_HTTP=1\nKC_BOOTSTRAP_ADMIN_USERNAME=admin\nKC_BOOTSTRAP_ADMIN_PASSWORD=${adminPassword}\n`,
  { mode: 0o600 },
);
console.log(
  'Created .env and social-only realm. Start npm run auth:start and configure Apple/GitHub.',
);
