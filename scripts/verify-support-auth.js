import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSupportClient } from '../packages/support-chat/support-client.js';
const loadDependency = createRequire(import.meta.url);
const React = loadDependency('react');

// Render the actual host route with different account and data partitions.
// Native/OS boundaries are replaced; the route and transport adapter remain real.
const output = await build({
  entryPoints: ['src/app/support.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  plugins: [
    {
      name: 'host-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, kind }) =>
          kind === 'entry-point' ? undefined : { path, external: true },
        );
      },
    },
  ],
});
/** @typedef {{owner:string,deviceId:string,server:string,accessToken:string,expires:number}} FixtureSession */
/** @type {FixtureSession|null} */
let account = null;
/** @type {{captured:{request:import('../packages/support-chat/support-client.js').SupportClient}|null,used:FixtureSession|null}} */
const observed = { captured: null, used: null };
const local = {
  owner: 'local-device',
  deviceId: 'local-device',
  server: '',
  accessToken: '',
  expires: 0,
};
/** @param {{children:import('react').ReactNode}} props */
const Primitive = ({ children }) => React.createElement('div', null, children);
/** @type {Record<string,unknown>} */
const boundaries = {
  react: React,
  'react/jsx-runtime': await import('react/jsx-runtime'),
  'react-native': {
    Alert: { alert() {} },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  },
  'expo-router': {
    Stack: { Screen: () => null },
    useIsFocused: () => true,
    useLocalSearchParams: () => ({}),
    router: { push() {}, back() {} },
  },
  'expo-router/react-navigation': { useHeaderHeight: () => 0 },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) },
  'expo-crypto': { randomUUID: () => 'fixture' },
  '../../client/PhoneProvider.js': { usePhone: () => ({ session: account }) },
  '../../client/DataPanel.js': { usePhoneData: () => ({ session: local }) },
  '../../client/session.js': {
    /** @param {FixtureSession} session */
    api: async (session) => {
      observed.used = session;
      if (!session?.accessToken) throw new Error('Please sign in again.');
      return { conversations: [] };
    },
  },
  '../../client/debug-log.js': { debugReport: () => ({ entries: [] }) },
  '../../client/support-notifications.js': { registerSupportNotifications: async () => false },
  '../../packages/support-chat/errors.js': { errorJSON: () => '' },
  '../../packages/support-chat/index.js': { createSupportClient },
  '../../packages/support-chat/native.js': {
    /** @param {{request:import('../packages/support-chat/support-client.js').SupportClient}} props */
    NativeSupport: (props) => {
      observed.captured = props;
      return React.createElement('div', null, 'Support inbox');
    },
  },
  '../lib/theme.js': { useTheme: () => ({ colors: {} }) },
  '../components/ui.js': {
    Screen: Primitive,
    Copy: Primitive,
    /** @param {{label:string}} props */
    Button: ({ label }) => React.createElement('button', null, label),
    Row: Primitive,
  },
};
const context = vm.createContext({
  module: { exports: {} },
  /** @param {string} path */
  require: (path) => {
    assert.ok(path in boundaries, `Unexpected boundary: ${path}`);
    return boundaries[path];
  },
});
assert.ok(output.outputFiles[0]);
vm.runInContext(output.outputFiles[0].text, context);
const SupportScreen = context.module.exports.default;
const signedOut = renderToStaticMarkup(React.createElement(SupportScreen));
assert.equal(observed.captured, null, 'Signed-out support must not mount the authenticated inbox');
assert.match(signedOut, /Sign in/);
/** Read after React rendered the child. */
function capturedInbox() {
  return observed.captured;
}
/** @param {string} deviceId */
async function verifyAccount(deviceId) {
  observed.captured = null;
  observed.used = null;
  account = {
    owner: 'alice',
    deviceId,
    server: 'https://fixture.test',
    accessToken: 'fixture',
    expires: Date.now() + 60000,
  };
  renderToStaticMarkup(React.createElement(SupportScreen));
  const captured = capturedInbox();
  assert.ok(captured);
  await captured.request('list');
  assert.equal(
    observed.used,
    account,
    'Support must use account credentials even without MCP pairing',
  );
}
await verifyAccount('');
await verifyAccount('paired-phone');

console.log(
  'PASS actual support route: signed-out handoff, account-only and paired authentication.',
);

// Permission approval must register account-only phones, independently of agent pairing.
const pushBundle = await build({
  entryPoints: ['client/support-notifications.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  plugins: [
    {
      name: 'push-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, kind }) =>
          kind === 'entry-point' ? undefined : { path, external: true },
        );
      },
    },
  ],
});
const savedPushIds = new Map();
/** @type {{id:string,token:string}[]} */
const pushRegistrations = [];
let pushPermission = false;
/** @type {Record<string,unknown>} */
const pushBoundaries = {
  react: { useEffect() {} },
  'react-native': { AppState: {}, Platform: { OS: 'ios' } },
  'expo-constants': { expoConfig: { extra: { eas: { projectId: 'fixture' } } } },
  'expo-notifications': {
    setNotificationHandler() {},
    getPermissionsAsync: async () => ({ granted: pushPermission }),
    requestPermissionsAsync: async () => {
      pushPermission = true;
      return { granted: true };
    },
    getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[fixture]' }),
  },
  'expo-router': { router: {} },
  './PhoneProvider.js': { usePhone() {} },
  './qa-runtime.js': { qaEnabled: false },
  'expo-crypto': { randomUUID: () => 'fixture-notification-install' },
  'expo-secure-store': {
    /** @param {string} key */ getItemAsync: async (key) => savedPushIds.get(key) ?? null,
    /** @param {string} key @param {string} value */ setItemAsync: async (key, value) => {
      savedPushIds.set(key, value);
    },
  },
  './session.js': {
    /** @param {unknown} _session @param {string} path @param {{body:string}} options */
    api: async (_session, path, options) => {
      assert.equal(path, '/api/support/v1');
      const body = JSON.parse(options.body);
      assert.match(body.id, /^[A-Za-z0-9_-]{1,100}$/, 'Invalid identifier');
      pushRegistrations.push(body);
    },
  },
};
const pushContext = vm.createContext({
  module: { exports: {} },
  /** @param {string} path */ require: (path) => {
    assert.ok(path in pushBoundaries, path);
    return pushBoundaries[path];
  },
});
assert.ok(pushBundle.outputFiles[0]);
vm.runInContext(pushBundle.outputFiles[0].text, pushContext);
const registerPush = pushContext.module.exports.registerSupportNotifications;
const unpairedPushAccount = { server: 'https://fixture.test', deviceId: '' };
assert.equal(await registerPush(unpairedPushAccount), false);
assert.equal(pushRegistrations.length, 0, 'Denied permission must not register a token');
await registerPush(unpairedPushAccount, true);
await Promise.all([
  registerPush(unpairedPushAccount),
  registerPush({ ...unpairedPushAccount, deviceId: 'paired-device' }),
]);
assert.equal(pushRegistrations.length, 3);
assert.equal(
  new Set(pushRegistrations.map((row) => row.id)).size,
  1,
  'Notification ID survives pairing changes and concurrent registration',
);
assert.equal(
  unpairedPushAccount.deviceId,
  '',
  'Notification registration does not create an agent pairing',
);
assert.equal(pushRegistrations[0]?.token, 'ExpoPushToken[fixture]');
console.log(
  'PASS permission approval -> account-only push registration, concurrent retry and pairing independence.',
);
