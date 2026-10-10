import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { assets } from '../server/dashboard-assets.js';
import { sorted } from '../core/collections.js';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { CloudStore } from '../server/cloud-store.js';
import { HistoryStore } from '../server/history-store.js';
import { BillingStore } from '../server/billing-store.js';
import { PairingStore } from '../server/pairing-store.js';
import { createBillingService } from '../server/billing-service.js';
import { createDataService } from '../server/data-service.js';
import { createCloudService } from '../server/cloud-service.js';
import { createDashboardService } from '../server/dashboard-service.js';
import { createApplication } from '../server/application.js';
import { SupportStore } from '../server/support-store.js';
import { SupportDiscord } from '../server/support-discord.js';
import { createSupportService } from '../server/support-service.js';
import { verifyMigrationPurchase } from '../server/migration-purchases.js';
const guild = '100000000000000001',
  channel = '100000000000000002',
  bot = '100000000000000003',
  staff = '100000000000000004';
let counter = 200000000000000000n;
/** @type {Map<string,{id:string,parent_id:string,name:string}>} */
const threads = new Map();
/** @type {Map<string,Array<{id:string,content:string,timestamp:string,author:{id:string,bot?:boolean}}>>} */
const messages = new Map();
/** @type {Map<string,string>} */
const nonceOwners = new Map();
let privateChannel = true,
  failSend = false,
  uncertainSend = false,
  uncertainThread = false;
/** @type {typeof fetch} */
const discordFetch = async (input, init) => {
  const url = new URL(String(input));
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  if (url.pathname === '/api/v10/users/@me') return Response.json({ id: bot });
  if (url.pathname === `/api/v10/channels/${channel}`)
    return Response.json({
      id: channel,
      type: 0,
      guild_id: guild,
      permission_overwrites: [
        { id: guild, type: 0, allow: '0', deny: privateChannel ? '1024' : '0' },
        { id: bot, type: 1, allow: '1024', deny: '0' },
        { id: staff, type: 1, allow: '1024', deny: '0' },
      ],
    });
  if (url.pathname === `/api/v10/guilds/${guild}/threads/active`)
    return Response.json({ threads: [...threads.values()] });
  if (url.pathname === `/api/v10/channels/${channel}/threads/archived/public`)
    return Response.json({ threads: [], has_more: false });
  if (url.pathname === `/api/v10/channels/${channel}/threads`) {
    const thread = { id: String(++counter), parent_id: channel, name: String(body.name) };
    threads.set(thread.id, thread);
    messages.set(thread.id, []);
    if (uncertainThread) {
      uncertainThread = false;
      throw new Error('Lost thread creation response');
    }
    return Response.json(thread);
  }
  if (
    url.pathname.match(/^\/api\/v10\/channels\/\d+\/thread-members\/\d+$/) &&
    init?.method === 'PUT'
  ) {
    assert.ok(url.pathname.endsWith(`/${staff}`));
    return new Response(null, { status: 204 });
  }
  const target = url.pathname.match(/^\/api\/v10\/channels\/(\d+)(\/messages)?$/);
  if (!target || !threads.has(target[1] ?? '')) return Response.json({}, { status: 404 });
  const threadId = target[1] ?? '';
  if (!target[2]) {
    if (init?.method === 'DELETE') {
      threads.delete(threadId);
      messages.delete(threadId);
      return new Response(null, { status: 204 });
    }
    return Response.json(threads.get(threadId));
  }
  const history = messages.get(threadId) ?? [];
  if (init?.method === 'POST') {
    if (failSend) return Response.json({}, { status: 503 });
    const message = {
      id: String(++counter),
      content: String(body.content),
      timestamp: new Date().toISOString(),
      author: { id: bot, bot: true },
    };
    history.push(message);
    assert.deepEqual(body.allowed_mentions, { parse: [] });
    const nonce = String(body.nonce);
    assert.ok(nonce.length <= 25);
    const nonceOwner = nonceOwners.get(nonce);
    if (nonceOwner)
      assert.equal(nonceOwner, threadId, 'Discord nonces must be unique across account threads');
    nonceOwners.set(nonce, threadId);
    if (uncertainSend) {
      uncertainSend = false;
      throw new Error('Lost send response');
    }
    return Response.json(message);
  }
  const before = url.searchParams.get('before');
  return Response.json(
    sorted(
      history.filter((message) => !before || BigInt(message.id) < BigInt(before)).slice(-100),
      (a, b) => (BigInt(a.id) < BigInt(b.id) ? 1 : -1),
    ),
  );
};
const cloud = new CloudStore(':memory:', randomBytes(32));
const store = new SupportStore(':memory:', cloud);
const discord = new SupportDiscord(
  {
    SUPPORT_DISCORD_BOT_TOKEN: 'fixture',
    SUPPORT_DISCORD_CHANNEL_ID: channel,
    SUPPORT_DISCORD_STAFF_IDS: staff,
  },
  discordFetch,
);
const support = createSupportService({ store, discord, cloud });
const history = new HistoryStore(':memory:', cloud),
  billing = new BillingStore(':memory:'),
  pairing = new PairingStore(':memory:');
const billingService = createBillingService({
  billing,
  unlock: async () => {},
  verifyStorePurchase: async () => {
    throw new Error('Not used in support fixture');
  },
});
const data = createDataService({
  billing,
  history,
  refreshEntitlement: billingService.refreshEntitlement,
  devices: pairing.devices.bind(pairing),
});
const dashboard = createDashboardService({
  cloud,
  history,
  devices: pairing.devices.bind(pairing),
  cancelAgent: data.cancelAgent,
});
const cloudService = createCloudService({
  cloud,
  billing,
  history,
  refreshEntitlement: billingService.refreshEntitlement,
});
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'support-fixture';
const issuer = 'http://fixture/realm';
const server = createServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
server.on(
  'request',
  createApplication(
    { PUBLIC_URL: origin, OAUTH_ISSUER: issuer, ALLOW_HTTP_DEV: '1' },
    {
      ...billingService,
      ...data,
      ...cloudService,
      ...dashboard,
      ...support,
      billing,
      cloud,
      history,
      qrPng: async () => Buffer.alloc(0),
      verifyMigrationPurchase,
      createMigrationClaim: (proof) => billing.createClaim(proof),
      claimMigration: (subject, ticket) => billing.claim(subject, ticket),
      registerTicket: async () => {},
      ownCloudDevice: () => {},
      dashboardAsset: (path, res) => {
        const asset = assets.get(path);
        if (!asset) return false;
        res.setHeader('Content-Type', asset[1]);
        const content = readFileSync(new URL(`../dashboard/dist/${asset[0]}`, import.meta.url));
        res.end(
          asset[1] === 'text/html'
            ? content.toString().replace('__STYLE_NONCE__', 'fixture')
            : content,
        );
        return true;
      },
      proxyAuth: () => {},
      createPairing: pairing.createPairing.bind(pairing),
      claim: pairing.claim.bind(pairing),
      devices: pairing.devices.bind(pairing),
      disconnect: pairing.disconnect.bind(pairing),
      pending: pairing.pending.bind(pairing),
      status: pairing.status.bind(pairing),
    },
    { jwksFetch: async () => Response.json({ keys: [jwk] }) },
  ),
);
/** @param {string} subject @param {string} azp */
const token = (subject, azp) =>
  new SignJWT({ scope: 'myselfmd', azp })
    .setProtectedHeader({ alg: 'RS256', kid: 'support-fixture' })
    .setIssuer(issuer)
    .setAudience(`${origin}/mcp`)
    .setSubject(subject)
    .setExpirationTime('5m')
    .sign(privateKey);
const phone = await token('alice', 'myselfmd-phone'),
  web = await token('alice', 'myselfmd-dashboard'),
  other = await token('bob', 'myselfmd-phone'),
  agent = await token('alice', 'support-agent');
/** @param {string|null} bearer @param {string} [method] @param {unknown} [body] @param {string} [query] */
async function request(bearer, method = 'GET', body, query = '') {
  const response = await fetch(`${origin}/api/support${query}`, {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: z
      .object({
        available: z.boolean().optional(),
        messages: z.array(z.object({ delivery: z.string(), text: z.string() })).default([]),
        hasMore: z.boolean().optional(),
        before: z.number().nullable().optional(),
        warning: z.string().nullable().optional(),
      })
      .parse(await response.json()),
  };
}
const client = new Client({ name: 'support-fixture', version: '1' });
/** @param {string} name @param {Record<string,unknown>} [args] */
async function tool(name, args = {}) {
  const response = await client.callTool({ name, arguments: args });
  const content = z
    .array(z.object({ type: z.string(), text: z.string().optional() }))
    .parse(response.content);
  return {
    error: response.isError === true,
    value: response.isError ? { error: content[0]?.text } : JSON.parse(content[0]?.text ?? '{}'),
  };
}
try {
  assert.equal((await request(null)).status, 401);
  assert.equal((await request(agent)).status, 403);
  assert.equal((await request(phone)).body.available, true);
  assert.equal((await request(phone, 'POST', { id: randomUUID(), text: ' ' })).status, 400);
  const id = randomUUID();
  const sent = await request(phone, 'POST', { id, text: 'My support question' });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.messages[0]?.delivery, 'delivered');
  assert.equal((await request(web)).body.messages[0]?.text, 'My support question');
  assert.equal((await request(other)).body.messages.length, 0);
  await request(phone, 'POST', { id, text: 'My support question' });
  assert.equal(threads.size, 1);
  assert.equal((await request(phone, 'POST', { id, text: 'Changed text' })).status, 409);
  const thread = String(store.conversation(`${issuer}|alice`)?.thread);
  assert.equal(messages.get(thread)?.length, 1);
  const ciphertext = store.db.prepare('SELECT value FROM support_messages LIMIT 1').get()?.value;
  assert.ok(
    ciphertext instanceof Uint8Array && !Buffer.from(ciphertext).includes('My support question'),
  );
  for (let index = 0; index < 125; index++)
    messages.get(thread)?.push({
      id: String(++counter),
      content: `Reply ${index}`,
      timestamp: new Date().toISOString(),
      author: { id: staff },
    });
  messages.get(thread)?.push({
    id: String(++counter),
    content: 'Unauthorized reply',
    timestamp: new Date().toISOString(),
    author: { id: '100000000000000009' },
  });
  const historyPage = await request(phone);
  assert.equal(historyPage.body.messages.length, 50);
  assert.equal(historyPage.body.hasMore, true);
  assert.equal(historyPage.body.messages.at(-1)?.text, 'Reply 124');
  assert.equal(
    store.page(`${issuer}|alice`).messages.some((message) => message.text === 'Unauthorized reply'),
    false,
  );
  const older = await request(web, 'GET', undefined, `?before=${historyPage.body.before}`);
  assert.equal(older.body.messages.length, 50);
  const count = Number(
    store.db.prepare('SELECT COUNT(*) AS count FROM support_messages').get()?.count,
  );
  await request(phone);
  assert.equal(
    Number(store.db.prepare('SELECT COUNT(*) AS count FROM support_messages').get()?.count),
    count,
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${agent}` } },
    }),
  );
  const denied = await tool('get_support_conversation');
  assert.equal(denied.value.agentAccess, false);
  assert.equal(denied.value.messages, undefined);
  assert.equal(
    (await tool('send_support_message', { id: randomUUID(), text: 'Agent message' })).error,
    true,
  );
  await request(web, 'PUT', { agentAccess: true });
  assert.equal((await tool('get_support_conversation')).value.messages.length, 50);
  failSend = true;
  const agentMessageId = randomUUID();
  assert.equal(
    (await tool('send_support_message', { id: agentMessageId, text: 'Agent queued' })).error,
    false,
  );
  cloud.setAgent(`${issuer}|alice`, 'support-agent', true);
  failSend = false;
  await request(phone);
  assert.equal(store.message(`${issuer}|alice`, agentMessageId)?.delivery, 'cancelled');
  await assert.rejects(() => tool('get_support_conversation'), /blocked/);
  cloud.setAgent(`${issuer}|alice`, 'support-agent', false);
  assert.equal((await tool('revoke_support_agent_access')).value.agentAccess, false);
  assert.equal((await tool('get_support_conversation')).value.messages, undefined);
  uncertainSend = true;
  const retryId = randomUUID();
  const queued = await request(phone, 'POST', { id: retryId, text: 'Recover lost response' });
  assert.ok(queued.body.warning);
  await request(phone, 'POST', { id: retryId, text: 'Recover lost response' });
  assert.equal(
    messages.get(thread)?.filter((message) => message.content.includes(retryId)).length,
    1,
  );
  uncertainThread = true;
  const bobId = id;
  await request(other, 'POST', { id: bobId, text: 'Bob needs help' });
  await request(other);
  assert.equal(threads.size, 2);
  privateChannel = false;
  const privateId = randomUUID();
  const failed = await request(phone, 'POST', { id: privateId, text: 'Keep this private' });
  assert.ok(failed.body.warning?.includes('privacy'));
  assert.equal(
    messages.get(thread)?.filter((message) => message.content.includes(privateId)).length,
    0,
  );
  privateChannel = true;
  await request(phone);
  assert.equal(store.message(`${issuer}|alice`, privateId)?.delivery, 'delivered');
  const restarted = new SupportStore(store.db, cloud);
  assert.equal(restarted.message(`${issuer}|alice`, retryId)?.delivery, 'delivered');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const fixture = await build({
      stdin: {
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { WebChat } from './packages/support-chat/web.js';
          import { createSupportRequest } from './packages/support-chat/index.js';
          const request = createSupportRequest(async (path, options) => {
            const response = await fetch(path, { ...options, headers: {
              Authorization: 'Bearer ' + window.supportFixtureToken,
              'Content-Type': 'application/json',
            }});
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? 'Request failed');
            return result;
          });
          const Button = ({variant, ...props}) => React.createElement('button', props);
          createRoot(document.getElementById('root')).render(React.createElement(WebChat, {request, Button}));
        `,
        resolveDir: process.cwd(),
        loader: 'jsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      loader: { '.js': 'jsx' },
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    await page.addInitScript((fixtureToken) => {
      Object.assign(globalThis, { supportFixtureToken: fixtureToken });
    }, web);
    await page.route('**/__chat-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"></div><script src="/__chat-fixture.js"></script>',
      }),
    );
    await page.route('**/__chat-fixture.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: fixture.outputFiles[0]?.text ?? '',
      }),
    );
    await page.goto(`${origin}/__chat-fixture`);
    await page.getByLabel('Your message', { exact: true }).waitFor();
    await page
      .getByLabel('Your message', { exact: true })
      .fill('Sent through the dashboard composer');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page
      .getByRole('log')
      .getByText('Sent through the dashboard composer', { exact: true })
      .waitFor();
    assert.equal(await page.getByLabel('Your message', { exact: true }).inputValue(), '');
    assert.equal(
      store.page(`${issuer}|alice`).messages.at(-1)?.text,
      'Sent through the dashboard composer',
    );
    const toggle = page.getByLabel('Allow my connected agents to read and send support messages');
    await toggle.check();
    await page.locator('input[type=checkbox]:checked').waitFor();
    assert.equal(store.conversation(`${issuer}|alice`)?.agent_access, 1);
    await toggle.uncheck();
    await page.locator('input[type=checkbox]:not(:checked)').waitFor();
    await page.screenshot({ path: '/tmp/myself-support-dashboard.png', fullPage: true });
    console.log(
      'PASS extracted web composer, host transport, message persistence, draft clearing and support-access controls in Chromium.',
    );
  } finally {
    await browser.close();
  }
  await discord.deleteThread(thread);
  await discord.deleteThread(thread);
  store.deleteAccount(`${issuer}|alice`);
  assert.equal(store.page(`${issuer}|alice`).messages.length, 0);
  assert.equal(store.conversation(`${issuer}|alice`), undefined);
  assert.ok(store.conversation(`${issuer}|bob`));
  console.log(
    'PASS support HTTP ownership, mobile/dashboard sharing, real MCP grants/blocking/revocation, encryption, pagination, staff replies, private-channel enforcement, retry/restart recovery and thread/account cleanup. Discord transport is a deterministic fixture; no live messages sent.',
  );
} finally {
  await client.close();
  await new Promise((resolve) => server.close(resolve));
  for (const db of [store.db, cloud.db, history.db, billing.db, pairing.db]) db.close();
}
