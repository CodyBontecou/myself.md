import { socialAuth } from './social-auth.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
const cloud = process.argv.includes('--cloud');
const issuer = cloud
  ? process.env.SERVICE_DOMAIN && `https://${process.env.SERVICE_DOMAIN}/auth/realms/myselfmd`
  : process.env.OAUTH_ISSUER;
if (!issuer?.startsWith('https://'))
  throw new Error('Social login requires a public HTTPS issuer.');
const local =
  process.env.KEYCLOAK_ADMIN_URL ??
  (cloud ? '' : `http://127.0.0.1:8080${process.env.AUTH_PROXY === '1' ? '/auth' : ''}`);
if (!local) throw new Error('Set KEYCLOAK_ADMIN_URL to your local private identity tunnel.');
const adminUrl = new URL(local);
if (adminUrl.hostname !== '127.0.0.1' || adminUrl.protocol !== 'http:')
  throw new Error('Keep the Keycloak admin API on HTTP loopback.');
const origin = new URL(issuer);
const proxyHeaders = {
  'X-Forwarded-Proto': 'https',
  'X-Forwarded-Host': origin.host,
  'X-Forwarded-Port': origin.port || '443',
};
const realmPath = cloud ? '.local/cloud-realm/myselfmd.json' : '.local/realm/myselfmd.json';
const realm = 'myselfmd';
const response = await fetch(`${local}/realms/master/protocol/openid-connect/token`, {
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
if (!response.ok) throw new Error(`Local admin sign-in failed: ${response.status}`);
const token = /** @type {{access_token:string}} */ (await response.json());
/** @param {string} path @param {string} [method] @param {unknown} [body] @returns {Promise<any>} */
async function admin(path, method = 'GET', body) {
  const res = await fetch(`${local}/admin/realms/${realm}${path}`, {
    method,
    headers: {
      ...proxyHeaders,
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Provider configuration failed (${method} ${path}): ${res.status}`);
  return res.status === 204 || res.status === 201 ? null : res.json();
}
/** @typedef {{alias:string,providerId:string,displayName:string,enabled:boolean,trustEmail:boolean,storeToken:boolean,firstBrokerLoginFlowAlias:string,config:Record<string,string>}} Provider */
const existing = /** @type {Provider[]} */ (await admin('/identity-provider/instances'));
const imported = JSON.parse(readFileSync(realmPath, 'utf8'));
/** @param {string} alias @param {string} displayName @param {Record<string,string>} config */
async function upsert(alias, displayName, config) {
  const old = existing.find((provider) => provider.alias === alias);
  const provider = {
    ...old,
    alias,
    providerId: alias,
    displayName,
    enabled: true,
    trustEmail: false,
    storeToken: false,
    firstBrokerLoginFlowAlias: 'social first login',
    config: { ...old?.config, ...config, hideOnLoginPage: 'false' },
  };
  await admin(
    `/identity-provider/instances${old ? `/${alias}` : ''}`,
    old ? 'PUT' : 'POST',
    provider,
  );
  imported.identityProviders = (imported.identityProviders ?? []).filter(
    (/** @type {Provider} */ item) => item.alias !== alias,
  );
  imported.identityProviders.push(provider);
  // Cloud secrets stay in the running identity database, outside the image's realm seed.
  if (!cloud) writeFileSync(realmPath, JSON.stringify(imported, null, 2), { mode: 0o600 });
  console.log(`${displayName} enabled. Callback: ${issuer}/broker/${alias}/endpoint`);
}
// Install the same flows for existing realms without replacing users or their subjects.
const flows = /** @type {{id:string,alias:string}[]} */ (await admin('/authentication/flows'));
await Promise.all(
  socialAuth.authenticationFlows.map(async (flow) => {
    if (!flows.some((item) => item.alias === flow.alias)) {
      await admin('/authentication/flows', 'POST', {
        alias: flow.alias,
        description: flow.description,
        providerId: flow.providerId,
        topLevel: true,
        builtIn: false,
      });
    }
    const path = `/authentication/flows/${flow.alias}`;
    const installed = /** @type {{providerId:string}[]} */ (await admin(`${path}/executions`));
    await flow.authenticationExecutions.reduce(async (previous, execution) => {
      await previous;
      if (!installed.some((item) => item.providerId === execution.authenticator))
        await admin(`${path}/executions/execution`, 'POST', {
          provider: execution.authenticator,
        });
    }, Promise.resolve());
    const executions =
      /** @type {{id:string,providerId:string,requirement:string,authenticationConfig?:string}[]} */ (
        await admin(`${path}/executions`)
      );
    await executions.reduce(async (previous, execution) => {
      await previous;
      const desired = flow.authenticationExecutions.find(
        (item) => item.authenticator === execution.providerId,
      );
      if (!desired)
        throw new Error(`Unexpected execution in ${flow.alias}: ${execution.providerId}`);
      await admin(`/authentication/flows/${flow.alias}/executions`, 'PUT', {
        ...execution,
        requirement: desired.requirement,
      });
      if (execution.providerId === 'identity-provider-redirector') {
        const config = socialAuth.authenticatorConfig[0];
        if (execution.authenticationConfig)
          await admin(`/authentication/config/${execution.authenticationConfig}`, 'PUT', config);
        else await admin(`/authentication/executions/${execution.id}/config`, 'POST', config);
      }
    }, Promise.resolve());
  }),
);

const githubId = process.env.GITHUB_OAUTH_CLIENT_ID,
  githubSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
if (githubId && githubSecret)
  await upsert('github', 'Continue with GitHub', {
    clientId: githubId,
    clientSecret: githubSecret,
    defaultScope: 'read:user user:email',
    guiOrder: '1',
  });
else
  console.log(
    'GitHub pending: set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET. Existing provider unchanged.',
  );
const googleId = process.env.GOOGLE_OAUTH_CLIENT_ID,
  googleSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if (googleId && googleSecret)
  await upsert('google', 'Continue with Google', {
    clientId: googleId,
    clientSecret: googleSecret,
    defaultScope: 'openid profile email',
    guiOrder: '2',
  });
else
  console.log(
    'Google pending: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET. Existing provider unchanged.',
  );
const serviceId = process.env.APPLE_SERVICE_ID,
  teamId = process.env.APPLE_TEAM_ID,
  keyId = process.env.APPLE_KEY_ID,
  keyPath = process.env.APPLE_PRIVATE_KEY_PATH;
if (serviceId && teamId && keyId && keyPath) {
  if (!/^[A-Z0-9]{10}$/.test(teamId) || !/^[A-Z0-9]{10}$/.test(keyId))
    throw new Error('Invalid Apple team/key ID.');
  const privateKey = readFileSync(keyPath, 'utf8');
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
    throw new Error('Apple requires a P-256 .p8 signing key.');
  await upsert('apple', 'Sign in with Apple', {
    clientId: serviceId,
    clientSecret: privateKey,
    teamId,
    keyId,
    defaultScope: 'name email',
    displayName: 'Sign in with Apple',
    tokenExchangeAccountLinkingEnabled: 'false',
    guiOrder: '2',
  });
} else
  console.log(
    'Apple pending: set APPLE_SERVICE_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_PATH. Existing provider unchanged.',
  );

const providers = /** @type {Provider[]} */ (await admin('/identity-provider/instances'));
await Promise.all(
  providers.map(async (provider) => {
    await admin(`/identity-provider/instances/${provider.alias}`, 'PUT', {
      ...provider,
      enabled: ['apple', 'github', 'google'].includes(provider.alias) && provider.enabled,
      firstBrokerLoginFlowAlias: 'social first login',
    });
  }),
);
const clients =
  /** @type {{id:string,authenticationFlowBindingOverrides?:Record<string,string>}[]} */ (
    await admin('/clients')
  );
await Promise.all(
  clients.map(async (client) => {
    const overrides = { ...client.authenticationFlowBindingOverrides };
    delete overrides.browser;
    delete overrides.direct_grant;
    await admin(`/clients/${client.id}`, 'PUT', {
      ...client,
      directAccessGrantsEnabled: false,
      authenticationFlowBindingOverrides: overrides,
    });
  }),
);
const settings = {
  browserFlow: socialAuth.browserFlow,
  directGrantFlow: socialAuth.directGrantFlow,
  registrationAllowed: false,
  resetPasswordAllowed: false,
};
await admin('', 'PUT', settings);
Object.assign(imported, socialAuth);
imported.identityProviders = providers.map((provider) =>
  Object.assign(provider, {
    enabled: ['apple', 'github', 'google'].includes(provider.alias) && provider.enabled,
    firstBrokerLoginFlowAlias: 'social first login',
  }),
);
// Persist policy without copying production provider secrets into the realm seed.
if (cloud) delete imported.identityProviders;
for (const client of imported.clients ?? []) {
  client.directAccessGrantsEnabled = false;
  delete client.authenticationFlowBindingOverrides?.browser;
  delete client.authenticationFlowBindingOverrides?.direct_grant;
}
writeFileSync(realmPath, JSON.stringify(imported, null, 2), { mode: cloud ? 0o644 : 0o600 });
console.log(
  'Apple/GitHub-only authentication enabled. Password login, registration and reset are disabled.',
);
