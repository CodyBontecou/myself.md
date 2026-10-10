import { Buffer } from 'node:buffer';
import { z } from 'zod';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { McpServer } from '@modelcontextprotocol/server';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createRemoteSupport } from '../server/support-remote.js';

// The host supplies roles; prompt fields and guest credentials cannot elevate them.
/** @type {'owner'|'lifetime'|'guest'} */
let verifiedRole = 'guest';
let roleResolutions = 0;
/** @type {typeof fetch} */
const roleTransport = async (_input, options) => {
  const headers = new Headers(options?.headers);
  return Response.json({ role: headers.get('X-Support-Role') });
};
const roleProxy = createRemoteSupport(
  { SUPPORT_ISOBOT_ORIGIN: 'https://support.fixture', SUPPORT_ISOBOT_TOKEN: 'fixture-secret' },
  () => {},
  roleTransport,
  async () => {
    roleResolutions++;
    return verifiedRole;
  },
);
for (const role of /** @type {const} */ (['guest', 'lifetime', 'owner', 'guest'])) {
  verifiedRole = role;
  // Each role change must settle before the next request verifies downgrade behavior.
  // oxlint-disable-next-line eslint/no-await-in-loop
  const response = await roleProxy.supportV1Api('verified-account', 'POST', new URLSearchParams(), {
    action: 'send',
    role: 'owner',
  });
  assert.equal(response.role, role);
}
verifiedRole = 'owner';
const beforeGuest = roleResolutions;
assert.equal(
  (
    await roleProxy.supportV1Api('support-guest:fixture', 'POST', new URLSearchParams(), {
      action: 'list',
    })
  ).role,
  'guest',
);
assert.equal(roleResolutions, beforeGuest);
const legacyProxy = createRemoteSupport(
  { SUPPORT_ISOBOT_ORIGIN: 'https://support.fixture', SUPPORT_ISOBOT_TOKEN: 'fixture-secret' },
  () => {},
  roleTransport,
);
assert.equal(
  (await legacyProxy.supportV1Api('verified-account', 'GET', new URLSearchParams(), null)).role,
  'guest',
);

let blocked = false;
/** @type {{agent:string|null,body:unknown}[]} */
const calls = [];
/** @type {typeof fetch} */
const transport = async (input, options) => {
  if (String(input).startsWith('https://support.fixture/')) {
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer fixture-secret');
    assert.equal(headers.get('X-Support-Owner'), 'alice');
    calls.push({ agent: headers.get('X-Support-Agent'), body: options?.body });
    return Response.json({ conversations: [] });
  }
  throw new Error('Unexpected remote fixture request');
};
const remote = createRemoteSupport(
  { SUPPORT_ISOBOT_ORIGIN: 'https://support.fixture', SUPPORT_ISOBOT_TOKEN: 'fixture-secret' },
  () => {
    if (blocked) throw new Error('Agent is blocked');
  },
  transport,
);
const mcp = new McpServer({ name: 'support-v1-fixture', version: '1' });
remote.registerSupportV1Tools(mcp, 'alice', 'test-agent');
const client = new Client({ name: 'fixture', version: '1' });
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
await mcp.connect(serverTransport);
await client.connect(clientTransport);
try {
  await remote.supportV1Api('alice', 'POST', new URLSearchParams(), {
    action: 'create',
    id: 'a',
    title: 'A',
  });
  assert.equal(calls.at(-1)?.agent, null);
  const listed = await client.callTool({
    name: 'support_conversations',
    arguments: { action: 'list' },
  });
  assert.notEqual(listed.isError, true);
  assert.equal(calls.at(-1)?.agent, 'test-agent');
  const denied = await client.callTool({
    name: 'support_conversations',
    arguments: { action: 'share', accepted: true },
  });
  assert.equal(denied.isError, true);
  const handoff = await client.callTool({
    name: 'support_conversations',
    arguments: { action: 'ownerHandoff', conversationId: 'a', ownerAction: 'share' },
  });
  const handoffState = z
    .object({ status: z.string(), requiresUser: z.boolean() })
    .parse(handoff.structuredContent);
  assert.equal(handoffState.status, 'awaiting_user');
  assert.equal(handoffState.requiresUser, true);
  const count = calls.length;
  blocked = true;
  assert.equal(
    (await client.callTool({ name: 'support_conversations', arguments: { action: 'list' } }))
      .isError,
    true,
  );
  assert.equal(calls.length, count);
} finally {
  await client.close();
  await mcp.close();
}

const now = Date.now();
const fixture = await build({
  stdin: {
    contents: `
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {WebSupport} from './packages/support-chat/web.js';
  import {createSupportClient} from './packages/support-chat/index.js';
  import {Button} from './dashboard/components/ui/button.js';
  const request=createSupportClient(async(path,options)=>{const response=await fetch(path,{...options,headers:{'Content-Type':'application/json'}});const value=await response.json();if(!response.ok)throw new Error(value.error);return value;});
  const data={collect:async(request)=>({category:request?.selector.category??'logs',capturedAt:Date.now(),content:'private fixture log'}),digest:async(content)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))),b=>b.toString(16).padStart(2,'0')).join('')};
  createRoot(document.getElementById('root')).render(React.createElement(WebSupport,{request,data,Button}));
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
/** @type {Map<string,import('../packages/support-chat/support-client.js').SupportConversation>} */
const conversations = new Map(
  /** @type {[string,import('../packages/support-chat/support-client.js').SupportConversation][]} */ (
    ['a', 'b'].map((id) => [
      id,
      {
        id,
        title: id === 'a' ? 'Export issue' : 'Usage question',
        status: 'open',
        generation: 1,
        agentAccess: false,
        autoReply: true,
        readThrough: 0,
        messages: [],
        attachments: [],
        hasMore: false,
        before: null,
        requests:
          id === 'a'
            ? [
                {
                  id: 'request-a',
                  reason: 'Inspect export errors',
                  selector: {
                    category: 'logs',
                    from: now - 86400000,
                    to: now,
                    operations: [],
                    issuesOnly: false,
                  },
                  status: 'pending',
                  expiresAt: now + 86400000,
                },
              ]
            : [],
      },
    ])
  ),
);
/** @type {{content:string,accepted:boolean,id:string,category:string}[]} */
const uploads = [];
const server = createServer(async (req, res) => {
  if (req.url === '/fixture.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(fixture.outputFiles[0]?.text);
    return;
  }
  if (req.url !== '/api/support/v1') {
    res.end('<div id="root"></div><script src="/fixture.js"></script>');
    return;
  }
  let input = '';
  for await (const chunk of req) input += chunk;
  const body = JSON.parse(input),
    c = conversations.get(body.conversationId);
  if (
    typeof body.conversationId === 'string' &&
    !/^[A-Za-z0-9_-]{1,100}$/.test(body.conversationId)
  ) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid identifier' }));
    return;
  }
  let result;
  assert.ok(body.action === 'list' || body.action === 'create' || c);
  if (!c && body.action !== 'list' && body.action !== 'create') return;
  if (body.action === 'list')
    result = {
      conversations: [...conversations.values()].map((item) =>
        Object.assign({}, item, {
          unreadCount: item.messages.filter(
            (message) => message.author !== 'user' && message.sequence > item.readThrough,
          ).length,
        }),
      ),
    };
  else if (body.action === 'create') {
    const template = conversations.get('b');
    assert.ok(template);
    result = {
      ...structuredClone(template),
      id: body.id,
      title: body.title,
      messages: [
        {
          id: body.id,
          author: /** @type {const} */ ('user'),
          sequence: 1,
          text: body.title,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    conversations.set(body.id, result);
  } else if (body.action === 'readCursor') {
    assert.ok(c);
    c.readThrough = body.readThrough;
    result = c;
  } else if (body.action === 'read') result = c;
  else if (body.action === 'share') {
    assert.ok(c);
    uploads.push(body);
    c.attachments.push({ id: body.id, category: body.category, removed: false });
    assert.ok(c.requests[0]);
    c.requests[0].status = 'accepted';
    result = c;
  } else if (body.action === 'send') {
    assert.ok(c);
    c.messages.push({
      id: body.id,
      sequence: c.messages.length + 1,
      author: 'user',
      text: body.text,
      createdAt: new Date().toISOString(),
    });
    result = c;
  } else if (body.action === 'archive') {
    assert.ok(c);
    c.status = 'archived';
    c.generation++;
    for (const a of c.attachments) a.removed = true;
    result = { archived: true };
  } else if (body.action === 'decline') {
    assert.ok(c);
    assert.ok(c.requests[0]);
    c.requests[0].status = 'declined';
    result = c;
  } else throw new Error('Unexpected fixture action');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(result));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByLabel('Conversation title', { exact: true }).fill('New support regression');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/support/v1') &&
      response.request().postDataJSON().action === 'create',
  );
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  assert.equal(
    (await createdResponse).status(),
    200,
    'Creating from an empty inbox must omit an empty conversation ID',
  );
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).waitFor();
  await page.getByRole('log').getByText('New support regression', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  assert.equal(await page.getByLabel('Conversation title', { exact: true }).inputValue(), '');
  await page.getByRole('button', { name: 'New support regression', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Export issue', exact: true }).click();
  assert.equal(uploads.length, 0);
  await page.getByRole('button', { name: 'Review requested data', exact: true }).click();
  await page
    .getByLabel('Data preview', { exact: true })
    .waitFor()
    .catch(async (error) => {
      console.error(await page.locator('body').innerText());
      throw error;
    });
  assert.equal(uploads.length, 0, 'Review collects locally without uploading');
  await page.getByLabel('Data preview', { exact: true }).fill('redacted fixture log');
  await page.getByRole('button', { name: 'Accept and share this snapshot', exact: true }).click();
  await page.getByText('logs attachment · Shared', { exact: true }).waitFor();
  assert.equal(uploads.length, 1);
  assert.ok(uploads[0]);
  assert.equal(uploads[0].content, 'redacted fixture log');
  assert.equal(uploads[0].accepted, true);
  await page.getByLabel('Your message', { exact: true }).fill('First support question');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('log').getByText('First support question', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Your message', { exact: true }).inputValue(), '');
  await page.getByText('Conversation details', { exact: true }).click();
  await page.getByRole('button', { name: 'Attach recent logs', exact: true }).last().click();
  await page
    .getByLabel('Data preview', { exact: true })
    .waitFor()
    .catch(async (error) => {
      console.error(await page.locator('body').innerText());
      throw error;
    });
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  await page.getByRole('button', { name: 'Usage question', exact: true }).click();
  assert.equal(
    await page.getByLabel('Data preview', { exact: true }).count(),
    0,
    'Preview must not cross conversations',
  );
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  await page.getByRole('button', { name: 'Export issue', exact: true }).click();
  await page.getByText('Conversation details', { exact: true }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Archive conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Export issue', exact: true }).click();
  await page.getByText('logs attachment · Removed when archived', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Your message', { exact: true }).isDisabled(),
    true,
    'Archived chats retain a disabled bottom composer',
  );
  assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), true);
  assert.equal(
    await page.getByRole('log').getByText('First support question', { exact: true }).count(),
    1,
  );
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  const unseen = conversations.get('b');
  assert.ok(unseen);
  unseen.messages.push({
    id: 'unseen-reply',
    sequence: 1,
    author: 'pi',
    text: 'A new Isobot reply\n\n**Bold reply** and *italic reply* with ~~removed~~ and `inline code`.\n\n[Open ticket](https://example.com/ticket)\n\n![Support screenshot](https://markdown.test/screenshot.png)\n\n- First item\n- Second item\n\n```js\nconst answer = 42;\n```\n\n<script>alert("unsafe")</script>\n\n[Unsafe link](javascript:alert(1))',
    createdAt: new Date().toISOString(),
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const unreadRow = page.getByRole('button', { name: /Usage question.*New message/ });
  await unreadRow.waitFor();
  const seenResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/support/v1') &&
      response.request().postDataJSON().action === 'readCursor',
  );
  await page.route('https://markdown.test/screenshot.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await unreadRow.click();
  await page.getByRole('log').getByText('A new Isobot reply', { exact: true }).waitFor();
  const messages = page.getByRole('log');
  assert.equal(await messages.locator('strong').textContent(), 'Bold reply');
  assert.equal(await messages.locator('em').textContent(), 'italic reply');
  assert.equal(
    await messages.getByRole('link', { name: 'Open ticket' }).getAttribute('href'),
    'https://example.com/ticket',
  );
  const screenshot = messages.getByRole('img', { name: 'Support screenshot' });
  await screenshot.waitFor();
  await page.waitForFunction("document.querySelector('img')?.naturalWidth === 1");
  assert.equal(await messages.locator('li').count(), 2);
  assert.equal(await messages.locator('pre code').textContent(), 'const answer = 42;');
  assert.equal(await messages.locator('script').count(), 0);
  assert.equal(await messages.getByRole('link', { name: 'Unsafe link' }).count(), 0);
  assert.equal((await seenResponse).status(), 200);
  assert.equal(unseen.readThrough, 1, 'Viewing the latest message acknowledges it');
  await page.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  await page.getByRole('button', { name: 'Usage question', exact: true }).waitFor();
  console.log(
    'PASS support v1 owner proxy, real MCP validation/blocking/handoffs, local preview, edited snapshot approval, conversation isolation, composer clearing and archive presentation. No live messages or data were sent.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
