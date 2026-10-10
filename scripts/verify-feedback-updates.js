import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const storage = new Map();
let granted = false;
let prompts = 0;
let enabled = false;
let registrations = 0;
let configured = '';
const requests = [];
let unauthorized = false;
const id = 'b'.repeat(64);
const context = createContext({
  __DEV__: true,
  Date,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: async (/** @type {string} */ url, /** @type {RequestInit} */ options) => {
    requests.push({ url, options });
    assert.equal(options.redirect, 'error');
    assert.match(new Headers(options.headers).get('Authorization') ?? '', /^Bearer [a-f0-9]{64}$/);
    if (unauthorized) return new Response(null, { status: 404 });
    if (options.method === 'POST') {
      const body = JSON.parse(String(options.body));
      enabled = body.enabled;
      if (enabled) {
        assert.equal(body.token, 'ExpoPushToken[fixture]');
        registrations++;
      } else assert.equal(body.token, undefined);
      return Response.json({ enabled });
    }
    if (url.includes('?id='))
      return Response.json({
        id,
        created: 1,
        status: 'pr',
        events: [
          {
            id: `${id}:pr`,
            kind: 'pr',
            url: 'https://github.com/CodyBontecou/myself.md/pull/7',
            at: 2,
          },
        ],
      });
    return Response.json({ enabled, reports: [], cursor: null });
  },
});
const source = new SourceTextModule(
  await readFile(new URL('../client/feedback-updates.js', import.meta.url), 'utf8'),
  { context },
);
await source.link((specifier) => {
  const values =
    specifier === 'expo'
      ? {
          requireOptionalNativeModule: () => ({
            setReporter: async (/** @type {string} */ key) => {
              configured = key;
            },
          }),
        }
      : specifier === 'expo-secure-store'
        ? {
            getItemAsync: async (/** @type {string} */ key) => storage.get(key) ?? null,
            setItemAsync: async (/** @type {string} */ key, /** @type {string} */ value) => {
              storage.set(key, value);
            },
          }
        : specifier === 'expo-crypto'
          ? { getRandomBytesAsync: async () => randomBytes(32) }
          : specifier === 'expo-notifications'
            ? {
                getPermissionsAsync: async () => ({ granted }),
                requestPermissionsAsync: async () => {
                  prompts++;
                  return { granted };
                },
                getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[fixture]' }),
              }
            : specifier === 'expo-constants'
              ? { default: { expoConfig: { extra: { eas: { projectId: 'fixture' } } } } }
              : specifier === 'react-native'
                ? { Platform: { OS: 'ios' } }
                : specifier === 'zod'
                  ? { z }
                  : { qaEnabled: false };
  return new SyntheticModule(
    Object.keys(values),
    function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    },
    { context },
  );
});
await source.evaluate();
const client =
  /** @type {{configureReportReporter:()=>Promise<void>,setReportNotifications:(enabled:boolean)=>Promise<void>,refreshReportRegistration:()=>Promise<void>,refreshReportUpdates:()=>Promise<unknown>,getReportUpdate:(id:string)=>Promise<unknown>,reportUpdatesSnapshot:()=>{enabled:boolean}}} */ (
    source.namespace
  );
await client.configureReportReporter();
assert.match(configured, /^[a-f0-9]{64}$/);
await client.configureReportReporter();
assert.equal(storage.get('gripe-reporter-key'), configured);
await client.refreshReportRegistration();
assert.equal(requests.length, 0);
await assert.rejects(client.setReportNotifications(true), /Allow notifications/);
assert.equal(prompts, 1);
assert.equal(requests.length, 0);
granted = true;
await client.setReportNotifications(true);
assert.equal(registrations, 1);
assert.equal(client.reportUpdatesSnapshot().enabled, true);
assert.equal(storage.get('gripe-notifications-enabled'), '1');
await client.refreshReportRegistration();
assert.equal(prompts, 1);
assert.equal(registrations, 2);
await client.refreshReportUpdates();
await client.getReportUpdate(id);
unauthorized = true;
await assert.rejects(client.getReportUpdate(id), /404/);
unauthorized = false;
await client.setReportNotifications(false);
assert.equal(client.reportUpdatesSnapshot().enabled, false);
assert.equal(storage.get('gripe-notifications-enabled'), '0');
const before = requests.length;
await client.refreshReportRegistration();
assert.equal(requests.length, before);
assert.ok(!JSON.stringify(client.reportUpdatesSnapshot()).includes(configured));
console.log(
  'Report update client: persistent private ownership, OS denial, explicit opt-in, silent token refresh, opt-out and unauthorized receipt denial pass.',
);
