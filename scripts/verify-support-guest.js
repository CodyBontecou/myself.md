import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import vm from 'node:vm';
import { createGuestSupport } from '../server/support-guest.js';
import { PairingError } from '../server/errors.js';

/** @type {Map<string,{owner:string,text:string}>} */
const conversations = new Map();
const guest = createGuestSupport(async (owner, _method, _query, body) => {
  const input =
    /** @type {{action:string,id?:string,title?:string,conversationId?:string,text?:string}} */ (
      body
    );
  if (input.action === 'list')
    return {
      conversations: [...conversations.entries()].filter(([, value]) => value.owner === owner),
    };
  if (input.action === 'create') {
    conversations.set(input.id ?? '', { owner, text: input.title ?? '' });
    return { id: input.id };
  }
  const saved = conversations.get(input.conversationId ?? '');
  if (!saved || saved.owner !== owner) throw new PairingError(404, 'Conversation not found');
  if (input.action === 'send') saved.text = input.text ?? '';
  return saved;
});
const alice = `Guest ${randomBytes(32).toString('hex')}`;
const bob = `Guest ${randomBytes(32).toString('hex')}`;
await guest(alice, { action: 'create', id: 'conversation', title: 'Help' }, 'alice-ip');
await guest(
  alice,
  { action: 'send', conversationId: 'conversation', id: 'message', text: 'Hello' },
  'alice-ip',
);
assert.equal(
  (await guest(alice, { action: 'read', conversationId: 'conversation' }, 'alice-ip')).text,
  'Hello',
);
assert.deepEqual(await guest(bob, { action: 'list' }, 'bob-ip'), { conversations: [] });
await assert.rejects(
  guest(bob, { action: 'read', conversationId: 'conversation' }, 'bob-ip'),
  /not found/,
);
await assert.rejects(guest(undefined, { action: 'list' }, 'ip'), /credential/);
await assert.rejects(
  guest(alice, { action: 'update', conversationId: 'conversation', agentAccess: true }, 'ip'),
);
await assert.rejects(
  guest(alice, { action: 'share', conversationId: 'conversation', accepted: true }, 'ip'),
);
await assert.rejects(guest(alice, { action: 'send' }, 'ip'));
assert.ok(!conversations.get('conversation')?.owner.includes(alice.slice(6)));
await Promise.all(
  Array.from({ length: 10 }, (_, index) =>
    guest(
      alice,
      { action: 'send', conversationId: 'conversation', id: `retry-${index}`, text: 'Hi' },
      'limited-ip',
    ),
  ),
);
await assert.rejects(
  guest(bob, { action: 'create', id: 'rotated', title: 'Hi' }, 'limited-ip'),
  /wait a minute/,
);

// Real mobile credential/transport module; replace only OS and network boundaries.
const output = await build({
  entryPoints: ['client/support-guest.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  plugins: [
    {
      name: 'boundaries',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, kind }) =>
          kind === 'entry-point' ? undefined : { path, external: true },
        );
      },
    },
  ],
});
let stored = '';
let writes = 0;
let requests = 0;
/** @type {Record<string,unknown>} */
const boundaries = {
  'expo-secure-store': {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
    getItemAsync: async () => stored,
    /** @param {string} _key @param {string} value */
    setItemAsync: async (_key, value) => {
      writes++;
      stored = value;
    },
  },
  'expo-crypto': { getRandomBytesAsync: async () => randomBytes(32) },
  '../packages/support-chat/errors.js': {
    /** @param {Response} response */
    readJSONResponse: async (response) => response.json(),
  },
  './qa-runtime.js': { qaEnabled: false },
};
function loadClient() {
  const context = vm.createContext({
    module: { exports: {} },
    URL,
    /** @param {string} name */
    require: (name) => {
      assert.ok(name in boundaries);
      return boundaries[name];
    },
    /** @param {string} url @param {{headers:{Authorization:string}}} options */
    fetch: async (url, options) => {
      assert.equal(url, 'https://support.fixture/api/support/guest');
      assert.equal(options.headers.Authorization, `Guest ${stored}`);
      requests++;
      return Response.json({ conversations: [] });
    },
  });
  assert.ok(output.outputFiles[0]);
  vm.runInContext(output.outputFiles[0].text, context);
  return context.module.exports.guestSupportApi;
}
const request = loadClient();
await Promise.all([
  request('https://support.fixture', '/api/support/v1', {
    method: 'POST',
    body: '{"action":"list"}',
  }),
  request('https://support.fixture', '/api/support/v1', {
    method: 'POST',
    body: '{"action":"list"}',
  }),
]);
assert.equal(writes, 1);
await loadClient()('https://support.fixture', '/api/support/v1', {
  method: 'POST',
  body: '{"action":"list"}',
});
assert.equal(writes, 1);
assert.equal(requests, 3);
await assert.rejects(
  request('https://support.fixture', '/api/private', { method: 'POST' }),
  /limited to support/,
);
await assert.rejects(
  request('http://support.fixture', '/api/support/v1', { method: 'POST' }),
  /secure server/,
);
console.log(
  'PASS guest isolation, denied grants, validation, abuse limits, secure credential persistence and retries.',
);
