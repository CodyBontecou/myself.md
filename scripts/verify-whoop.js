import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { randomBytes, randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { whoopOAuth } from '../server/whoop.js';
import * as whoop from '../core/whoop.js';
import * as profiles from '../core/profiles.js';
import * as data from '../core/data.js';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { createDataService } from '../server/data-service.js';

const config = { WHOOP_CLIENT_ID: 'fixture-client', WHOOP_CLIENT_SECRET: 'fixture-secret' };
const token = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 3600,
  token_type: 'bearer',
  scope: whoop.whoopScopes.join(' '),
};
const authorization = await whoopOAuth(config, { action: 'authorize', state: '1234abcd' });
assert.ok('authorization_url' in authorization);
const authURL = new URL(authorization.authorization_url);
assert.equal(authURL.searchParams.get('redirect_uri'), whoop.whoopRedirect);
assert.equal(authURL.searchParams.get('scope'), token.scope);
await assert.rejects(
  () => whoopOAuth({}, { action: 'authorize', state: '1234abcd' }),
  /not configured/,
);
await assert.rejects(() => whoopOAuth(config, { action: 'authorize', state: 'too-long-state' }));
await assert.rejects(() =>
  whoopOAuth(config, { action: 'exchange', code: 'fixture', redirect_uri: 'foreign://callback' }),
);
await Promise.all(
  ['exchange', 'refresh'].map(async (action) => {
    await whoopOAuth(
      config,
      action === 'exchange'
        ? { action, code: 'fixture-code' }
        : { action, refreshToken: 'refresh-1' },
      async (
        /** @type {string|URL|Request} */ url,
        /** @type {RequestInit|undefined} */ options,
      ) => {
        assert.equal(url, 'https://api.prod.whoop.com/oauth/oauth2/token');
        assert.equal(
          options?.redirect,
          'manual',
          'Workers must reject redirects without unsupported error mode',
        );
        const body = new URLSearchParams(String(options?.body));
        assert.equal(body.get('client_secret'), 'fixture-secret');
        assert.equal(body.get('scope'), action === 'refresh' ? 'offline' : null);
        assert.equal(body.get('redirect_uri'), action === 'exchange' ? whoop.whoopRedirect : null);
        return Response.json(token);
      },
    );
  }),
);
await assert.rejects(
  () =>
    whoopOAuth(config, { action: 'refresh', refreshToken: 'r' }, async () =>
      Response.json({ ...token, refresh_token: undefined }),
    ),
  /invalid token/,
);
await assert.rejects(
  () =>
    whoopOAuth(
      config,
      { action: 'refresh', refreshToken: 'r' },
      async () => new Response('provider-secret-error', { status: 429 }),
    ),
  /rate limiting/,
);

await assert.rejects(
  () =>
    whoopOAuth(
      config,
      { action: 'exchange', code: 'fixture-code' },
      async () =>
        new Response(null, { status: 302, headers: { Location: 'https://foreign.example/token' } }),
    ),
  /authorization failed/,
);

/** @type {(input:string|URL|Request,options?:RequestInit)=>Promise<Response>} */
let providerFetch = async () => {
  throw new Error('Provider fetch is not installed.');
};
/** @param {string} path @param {Record<string,Record<string,unknown>>} dependencies */
async function load(path, dependencies) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    context: createContext({
      URL,
      URLSearchParams,
      AbortController,
      setTimeout,
      clearTimeout,
      fetch: (
        /** @type {string|URL|Request} */ input,
        /** @type {RequestInit|undefined} */ options,
      ) => providerFetch(input, options),
    }),
  });
  await module.link((specifier) => {
    const values = dependencies[specifier];
    assert.ok(values, `Missing dependency ${specifier}`);
    return new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [name, value] of Object.entries(values)) this.setExport(name, value);
      },
      { context: module.context },
    );
  });
  await module.evaluate();
  return module.namespace;
}
let owner = 'fixture-owner',
  refreshCount = 0,
  exchanged = 0;
let browserMode = 'success';
let storeUnavailable = false;
let mode = 'collection';
let providerCalls = 0;
/** @type {Map<string,string>} */ const secure = new Map();
const native = {
  id: 'sleep-fixture',
  cycle_id: 5,
  start: '2026-10-17T00:00:00Z',
  end: '2026-10-17T07:00:00Z',
  score_state: 'SCORED',
  score: { stage_summary: { total_in_bed_time_milli: 25200001 }, respiratory_rate: 15.2 },
};
const session = () => ({
  owner,
  deviceId: 'fixture-device',
  server: 'https://fixture.test',
  issuer: '',
  resource: '',
  accessToken: '',
  refreshToken: '',
  account: '',
  expires: 0,
});
const adapter =
  /** @type {{connectWhoop:(owner:string)=>Promise<{status:string}>,disconnectWhoop:(owner:string)=>Promise<{status:string}>,whoopStatus:(owner:string)=>Promise<{connected:boolean}>,whoopPage:(owner:string,query:import('../core/data.js').DataQuery,cursor:string)=>Promise<import('../core/data.js').DataPage>}} */ (
    await load('../client/whoop.js', {
      '../core/whoop.js': whoop,
      './qa-runtime.js': { qaEnabled: false },
      'expo-auth-session': {
        AuthRequest: class {
          state = '1234abcdmore';
        },
      },
      'expo-secure-store': {
        AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device',
        getItemAsync: async (/** @type {string} */ key) => {
          if (storeUnavailable) throw new Error('Fixture secure storage unavailable');
          return secure.get(key) ?? null;
        },
        setItemAsync: async (/** @type {string} */ key, /** @type {string} */ value) => {
          secure.set(key, value);
        },
        deleteItemAsync: async (/** @type {string} */ key) => {
          secure.delete(key);
        },
      },
      'expo-web-browser': {
        openAuthSessionAsync: async () =>
          browserMode === 'cancel'
            ? { type: 'cancel' }
            : {
                type: 'success',
                url: `${whoop.whoopRedirect}?state=${browserMode === 'mismatch' ? 'other123' : '1234abcd'}${browserMode === 'denied' ? '&error=access_denied' : browserMode === 'unknown-error' ? '&error=fixture-private-value&error_description=private-provider-detail' : browserMode === 'missing-code' ? '' : '&code=fixture'}`,
              },
      },
      './session.js': {
        loadSession: async () => session(),
        api: async (
          /** @type {unknown} */ _session,
          /** @type {string} */ _path,
          /** @type {{body:string}} */ options,
        ) => {
          const input = JSON.parse(options.body);
          if (input.action === 'authorize') return authorization;
          if (input.action === 'exchange') {
            exchanged++;
            return token;
          }
          refreshCount++;
          await new Promise((resolve) => setImmediate(resolve));
          return {
            ...token,
            access_token: `access-${refreshCount + 1}`,
            refresh_token: `refresh-${refreshCount + 1}`,
          };
        },
      },
    })
  );
providerFetch = async (
  /** @type {string|URL|Request} */ input,
  /** @type {RequestInit|undefined} */ options,
) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://api.prod.whoop.com');
  providerCalls++;
  if (options?.method === 'DELETE')
    return new Response(null, { status: mode === 'revoke-failed' ? 503 : 204 });
  if (mode === 'rate-limit') return new Response(null, { status: 429 });
  if (mode === 'changed-owner') owner = 'foreign-owner';
  if (mode === 'oversized') return new Response('x'.repeat(262145));
  if (url.pathname.endsWith('/body'))
    return Response.json({ weight_kilogram: 72, max_heart_rate: 190 });
  if (mode === 'recovery')
    return Response.json({
      records: [
        {
          cycle_id: 5,
          sleep_id: 'sleep-fixture',
          score_state: 'SCORED',
          score: { hrv_rmssd_milli: 54.3 },
        },
      ],
    });
  assert.equal(url.searchParams.get('limit'), '25');
  return Response.json({
    records: [native],
    next_token: url.searchParams.has('nextToken') ? '' : 'fixture-next',
  });
};
const query = {
  domain: /** @type {const} */ ('health'),
  type: 'whoop.sleep',
  source: /** @type {const} */ ('native'),
  start: '2026-10-17T00:00:00Z',
  end: '2026-10-18T00:00:00Z',
  cursor: '',
  limit: 50,
  format: /** @type {const} */ ('json'),
};
storeUnavailable = true;
assert.ok(
  'error' in (await adapter.whoopStatus(owner)),
  'Optional secure-storage failure becomes discoverable status',
);
storeUnavailable = false;
browserMode = 'mismatch';
await assert.rejects(() => adapter.connectWhoop(owner), /did not match/);
assert.equal(exchanged, 0);
browserMode = 'cancel';
assert.equal((await adapter.connectWhoop(owner)).status, 'cancelled');
browserMode = 'denied';
await assert.rejects(() => adapter.connectWhoop(owner), /authorization \(access_denied\)/);
browserMode = 'unknown-error';
await assert.rejects(() => adapter.connectWhoop(owner), /authorization \(unknown_error\)/);
browserMode = 'missing-code';
await assert.rejects(() => adapter.connectWhoop(owner), /without an authorization code/);
assert.equal(exchanged, 0);
browserMode = 'success';
await adapter.connectWhoop(owner);
assert.equal((await adapter.whoopStatus(owner)).connected, true);
assert.equal((await adapter.whoopStatus('foreign-owner')).connected, false);
const page = await adapter.whoopPage(owner, query, '');
assert.equal(JSON.stringify(page.records[0]?.native), JSON.stringify(native));
assert.equal(page.records[0]?.source, 'whoop');
assert.equal(page.records[0]?.start, native.start);
assert.equal(page.nextCursor, 'fixture-next');
assert.equal((await adapter.whoopPage(owner, query, 'fixture-next')).nextCursor, null);
const [credentialKey, value] = [...secure.entries()][0] ?? [];
assert.ok(credentialKey && value);
secure.set(credentialKey, JSON.stringify({ ...JSON.parse(value), expires: 0 }));
await Promise.all([adapter.whoopPage(owner, query, ''), adapter.whoopPage(owner, query, '')]);
assert.equal(refreshCount, 1, 'Concurrent reads share rotating refresh');
assert.equal(JSON.parse(secure.get(credentialKey) ?? '{}').refresh_token, 'refresh-2');
mode = 'recovery';
const recovery = await adapter.whoopPage(owner, { ...query, type: 'whoop.recovery' }, '');
assert.equal(recovery.records[0]?.start, null, 'Never invent recovery measurement time');
const body = await adapter.whoopPage(owner, { ...query, type: 'whoop.body' }, '');
assert.ok(JSON.stringify(body.records).includes('current_profile_snapshot'));
mode = 'rate-limit';
await assert.rejects(() => adapter.whoopPage(owner, query, ''), /rate limit/);
mode = 'oversized';
await assert.rejects(() => adapter.whoopPage(owner, query, ''), /decode limit/);
mode = 'changed-owner';
await assert.rejects(() => adapter.whoopPage('fixture-owner', query, ''), /same account/);
owner = 'fixture-owner';
mode = 'collection';

const reader =
  /** @type {{readPage:(owner:string,query:import('../core/data.js').DataQuery,profile:import('../core/profiles.js').ExportProfile,forChat?:boolean)=>Promise<import('../core/data.js').DataPage>,catalog:(owner:string,grants:Record<import('../core/data.js').Domain,boolean>,profile:import('../core/profiles.js').ExportProfile)=>Promise<{domains:{types:string[]}[]}>}} */ (
    await load('../client/data.js', {
      './whoop.js': { ...adapter },
      '../core/data.js': data,
      '../core/profiles.js': profiles,
      'react-native': { Platform: { OS: 'ios' } },
      'expo-location': { getForegroundPermissionsAsync: async () => ({ granted: false }) },
      './health.js': {
        healthTypes: async () => ['steps'],
        healthPage: async () => {
          throw new Error('Wrong adapter');
        },
      },
      './usage.js': {
        usageStatus: async () => 'required',
        usagePage: async () => {
          throw new Error('Wrong adapter');
        },
      },
      './location-task.js': { locationStatus: async () => ({ tracking: false }) },
      './library.js': {
        localPage: () => {
          throw new Error('Wrong adapter');
        },
      },
    })
  );
const profile = {
  ...profiles.parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'WHOOP fixture',
    selection: { health: ['native:whoop.sleep'], time: [], location: [] },
  }),
  id: 'fixture',
  agentAccess: false,
  agentPermissions: { health: false, time: false, location: false, logs: false },
};
const before = providerCalls;
await assert.rejects(() => reader.readPage(owner, query, profile), /not approved/);
assert.equal(providerCalls, before, 'Denied profile never calls WHOOP');
const local = await reader.readPage(owner, query, profile, false);
assert.equal(local.records[0]?.source, 'whoop');
profile.agentAccess = true;
profile.agentPermissions.health = true;
const permitted = await reader.readPage(owner, query, profile);
assert.equal(permitted.records.length, 1);
await assert.rejects(
  () => reader.readPage(owner, { ...query, type: 'whoop.workouts' }, profile),
  /not approved/,
);
assert.ok(
  (
    await reader.catalog(owner, { health: true, time: false, location: false }, profile)
  ).domains[0]?.types.includes('native:whoop.sleep'),
);
storeUnavailable = true;
assert.equal(
  (await reader.catalog(owner, { health: true, time: false, location: false }, profile)).domains[0]
    ?.types.length,
  0,
  'Unavailable WHOOP never blocks the OS catalog',
);
storeUnavailable = false;
mode = 'revoke-failed';
await assert.rejects(() => adapter.disconnectWhoop(owner), /revoke/);
assert.equal(
  (await adapter.whoopStatus(owner)).connected,
  true,
  'Failed revocation retains retry credential',
);
mode = 'collection';
await adapter.disconnectWhoop(owner);
assert.equal((await adapter.whoopStatus(owner)).connected, false);
assert.equal(secure.size, 0);

const cloud = new CloudStore(':memory:', randomBytes(32));
const billing = new BillingStore(':memory:');
const history = new HistoryStore(':memory:', cloud);
const deviceId = randomUUID();
const account = 'whoop-mcp-owner';
const service = createDataService({
  cloud,
  billing,
  history,
  refreshEntitlement: async () => {},
  devices: (subject) =>
    subject === account ? [{ id: deviceId, name: 'Fictional phone', created: 0 }] : [],
});
const pollBody = {
  profiles: [
    {
      ...profiles.parseProfile({
        schema: 'myself.md.profile.v1',
        name: 'WHOOP',
        selection: { health: ['native:whoop.sleep'], time: [], location: [] },
      }),
      id: 'fixture',
      agentAccess: false,
      agentPermissions: { health: false, time: false, location: false, logs: false },
    },
  ],
  whoop: {
    provider: 'whoop',
    connected: false,
    scopes: [],
    handoff: whoop.whoopRedirect,
    instructions: 'Fixture',
  },
  domains: data.domains.map((domain) => ({
    domain,
    enabled: false,
    types: /** @type {string[]} */ ([]),
    availableTypes: /** @type {string[]} */ ([]),
    selectableTypes: domain === 'health' ? ['native:whoop.sleep'] : [],
    notes: [],
  })),
};
const poll = () => {
  const pollResult = service.phoneApi(`/api/phones/${deviceId}/poll`, 'POST', account, pollBody);
  assert.ok(pollResult && 'whoopRequest' in pollResult);
  return pollResult;
};
poll();
const handler = createMcpHandler(() => {
  const mcp = new McpServer({ name: 'whoop-fixture', version: '1' });
  service.registerDataTools(mcp, account, 'fixture-agent');
  return mcp;
});
const client = new Client({ name: 'whoop-fixture', version: '1' });
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    }),
  );
  const requestId = randomUUID();
  const requestArgs = { deviceId, requestId, operation: 'connect' };
  const call = (/** @type {Record<string,unknown>} */ args) =>
    /** @type {Promise<{isError?:boolean,structuredContent?:Record<string,unknown>}>} */ (
      client.callTool({ name: 'manage_phone_whoop', arguments: args })
    );
  const accepted = await call(requestArgs);
  assert.equal(accepted.structuredContent?.status, 'accepted');
  assert.equal((await call(requestArgs)).structuredContent?.requestId, requestId);
  assert.equal((await call({ ...requestArgs, operation: 'disconnect' })).isError, true);
  assert.equal((await call({ ...requestArgs, deviceId: randomUUID() })).isError, true);
  assert.ok(poll()?.whoopRequest);
  assert.throws(
    () =>
      service.phoneApi(`/api/phones/${deviceId}/whoop`, 'POST', account, {
        requestId,
        action: 'complete',
      }),
    /owner-approved/,
  );
  service.phoneApi(`/api/phones/${deviceId}/whoop`, 'POST', account, {
    requestId,
    action: 'start',
  });
  service.phoneApi(`/api/phones/${deviceId}/whoop`, 'POST', account, {
    requestId,
    action: 'complete',
  });
  assert.equal(
    (await call({ ...requestArgs, action: 'status' })).structuredContent?.status,
    'completed',
  );
  assert.equal(pollBody.profiles[0]?.agentAccess, false);
  const queryArgs = {
    deviceId,
    profileId: 'fixture',
    domain: 'health',
    type: 'whoop.sleep',
    start: query.start,
    end: query.end,
  };
  assert.equal(
    (await client.callTool({ name: 'query_phone_data', arguments: queryArgs })).isError,
    true,
    'MCP denies private WHOOP profile',
  );
  const selected = pollBody.profiles[0];
  assert.ok(selected);
  selected.agentAccess = true;
  selected.agentPermissions.health = true;
  const health = pollBody.domains[0];
  assert.ok(health);
  health.enabled = true;
  health.availableTypes = ['native:whoop.sleep'];
  health.types = ['native:whoop.sleep'];
  poll();
  const queued = await client.callTool({ name: 'query_phone_data', arguments: queryArgs });
  assert.ok(!queued.isError);
  const queryId = /** @type {Record<string,unknown>|undefined} */ (queued.structuredContent)
    ?.requestId;
  assert.equal(typeof queryId, 'string');
  assert.equal(poll().request?.id, queryId);
  service.phoneApi(`/api/phones/${deviceId}/result`, 'POST', account, {
    id: queryId,
    page: permitted,
  });
  const completed = await client.callTool({
    name: 'get_phone_request',
    arguments: { requestId: queryId },
  });
  assert.ok(
    !completed.isError && JSON.stringify(completed).includes('sleep-fixture'),
    'WHOOP phone record reaches authorized MCP result',
  );
  selected.agentAccess = false;
  selected.agentPermissions.health = false;
  poll();
  assert.equal(
    (await client.callTool({ name: 'get_phone_request', arguments: { requestId: queryId } }))
      .isError,
    true,
    'Revoking Health denies retained WHOOP result',
  );
  const next = { ...requestArgs, requestId: randomUUID(), operation: 'disconnect' };
  await call(next);
  assert.equal((await call({ ...next, action: 'cancel' })).structuredContent?.status, 'cancelled');
  assert.equal(poll()?.whoopRequest, null);
  const blocked = { ...next, requestId: randomUUID() };
  await call(blocked);
  cloud.setAgent(account, 'fixture-agent', true);
  service.cancelAgent(account, 'fixture-agent');
  assert.equal((await call({ ...blocked, action: 'status' })).isError, true);
} finally {
  await client.close();
  cloud.db.close();
  billing.db.close();
  history.db.close();
}
console.log('WHOOP broker, phone adapter, profile authorization and MCP lifecycle passed.');
