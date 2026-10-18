import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { createAnalyticsClient } from '../core/analytics-client.js';
/** @typedef {{owner:string,server:string,issuer:string,resource:string,accessToken:string,refreshToken:string,expires:number,deviceId:string,account:string}} FixtureSession */
function ignoreHistory() {}
/** @param {'ios'|'android'} platform */
async function verifyNativeAnalytics(platform) {
  let saved = '',
    sequence = 0,
    enabled = false,
    decided = false;
  const deliveries = /** @type {{target:string,path:string,body:unknown}[]} */ ([]);
  const anonymous = /** @type {import('../core/analytics.js').AnalyticsBatch[]} */ ([]);
  /** @type {(name:import('../core/analytics.js').AnalyticsEventName)=>void} */
  let history = ignoreHistory;
  const context = createContext({
    __DEV__: false,
    process: { env: {} },
    setTimeout,
    clearTimeout,
    AbortController,
    Date,
    console,
    fetch: async (/** @type {string} */ url, /** @type {RequestInit} */ options) => {
      assert.equal(url, 'https://myself.md/api/analytics/anonymous');
      anonymous.push(JSON.parse(String(options.body)));
      return { ok: true, json: async () => ({ accepted: 1, enabled: true }) };
    },
  });
  const source = new SourceTextModule(
    await readFile(new URL('../client/analytics.js', import.meta.url), 'utf8'),
    { context },
  );
  const api = async (
    /** @type {FixtureSession} */ target,
    /** @type {string} */ path,
    /** @type {RequestInit|undefined} */ options,
  ) => {
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    deliveries.push({ target: target.owner, path, body });
    if (path.endsWith('/preferences')) {
      if (body) {
        assert.equal(body.confirmation, 'ALLOW_USAGE_ANALYTICS');
        enabled = body.enabled;
        decided = true;
      }
      return { enabled, decided };
    }
    assert.equal(path, '/api/analytics/events');
    return { enabled };
  };
  await source.link((specifier) => {
    const modules = /** @type {Record<string,Record<string,unknown>>} */ ({
      'expo-sqlite/kv-store': {
        default: {
          getItemSync: () => saved || null,
          setItemSync: (/** @type {string} */ _key, /** @type {string} */ value) => {
            saved = value;
          },
        },
      },
      'react-native': { Platform: { OS: platform } },
      '../core/analytics-client.js': { createAnalyticsClient },
      './phone-database.js': {
        phoneDatabase: () => ({
          getFirstSync: () => ({ id: (++sequence).toString(16).padStart(32, '0') }),
        }),
      },
      './session.js': { api },
      './qa-runtime.js': { qaEnabled: false },
      './history.js': {
        subscribeExportActivity: (/** @type {typeof history} */ listener) => {
          history = listener;
        },
      },
    });
    const values = modules[specifier];
    if (!values) throw new Error(`Unexpected native analytics dependency: ${specifier}`);
    return new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context },
    );
  });
  await source.evaluate();
  const analytics =
    /** @type {{syncAnalyticsSession:(value:FixtureSession|null)=>Promise<void>,setAnalyticsChoice:(enabled:boolean)=>Promise<void>,trackAnalytics:(name:import('../core/analytics.js').AnalyticsEventName)=>void,flushAnalytics:()=>Promise<void>,analyticsChoice:()=>boolean|null}} */ (
      source.namespace
    );
  analytics.trackAnalytics('app_opened');
  assert.equal(anonymous.length, 0);
  assert.equal(deliveries.length, 0);
  await analytics.syncAnalyticsSession(null);
  await analytics.setAnalyticsChoice(true);
  await new Promise((done) => setImmediate(done));
  assert.equal(anonymous[0]?.events[0]?.surface, platform);
  const owner = {
    server: 'https://myself.md',
    issuer: 'https://myself.md/auth/realms/myselfmd',
    resource: 'https://myself.md/mcp',
    accessToken: 'synthetic',
    refreshToken: '',
    expires: Date.now() + 600000,
    deviceId: 'fixture',
    account: 'fixture',
    owner: 'fixture-owner',
  };
  await analytics.syncAnalyticsSession(owner);
  await new Promise((done) => setImmediate(done));
  assert.ok(
    deliveries.some(
      (delivery) => delivery.target === owner.owner && delivery.path.endsWith('/events'),
    ),
  );
  assert.ok(
    deliveries.some((delivery) => delivery.path.endsWith('/preferences') && delivery.body !== null),
  );
  const posts = deliveries.filter((delivery) => delivery.path.endsWith('/events')).length;
  enabled = false;
  history('export_completed');
  await new Promise((done) => setImmediate(done));
  assert.equal(analytics.analyticsChoice(), false);
  assert.equal(deliveries.filter((delivery) => delivery.path.endsWith('/events')).length, posts);
  assert.equal(
    anonymous.length,
    1,
    'Authenticated opt-out must not fall back to anonymous delivery.',
  );
  const before = deliveries.length;
  await analytics.syncAnalyticsSession({ ...owner, owner: 'second-fixture-owner' });
  await analytics.setAnalyticsChoice(true);
  await new Promise((done) => setImmediate(done));
  assert.ok(
    deliveries.slice(before).every((delivery) => delivery.target === 'second-fixture-owner'),
  );
}
await Promise.all([verifyNativeAnalytics('ios'), verifyNativeAnalytics('android')]);
console.log(
  'Native analytics adapters: iOS/Android surfaces, anonymous consent, account linking, remote opt-out and account-switch isolation passed with synthetic native/network boundaries.',
);
