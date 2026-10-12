import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { once } from 'node:events';

// Render the actual mobile component with React Native Web. Replace only host
// primitives and the toast boundary; support state, transport and actions stay real.
const output = await build({
  stdin: {
    contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Text,Pressable,View} from 'react-native';
import {NativeSupport} from './packages/support-chat/support-native.js';
import {WebSupport} from './packages/support-chat/support-web.js';
import {createSupportClient} from './packages/support-chat/support-client.js';
const Copy=({children,...props})=><Text {...props}>{children}</Text>;
const Group=({children})=><View>{children}</View>;
const Row=({title,subtitle,onPress,disabled,testID})=><Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}><Text>{title}</Text><Text>{subtitle}</Text></Pressable>;
const Button=({label,onPress,disabled,testID})=><Pressable testID={testID} disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable>;
const request=createSupportClient(async(_path,options)=>{
 const response=await fetch('/fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:options.body});
 const value=await response.json();if(!response.ok)throw new Error(value.error);return value;
});
const data={collect:async()=>{window.collected=(window.collected||0)+1;if(window.holdLogs)await new Promise(resolve=>window.releaseLogs=resolve);return {category:'logs',content:'fixture logs',capturedAt:1}},digest:async content=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));window.digestCount=(window.digestCount||0)+1;return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}};
const Component=location.search.includes('web')?WebSupport:NativeSupport;
createRoot(document.getElementById('root')).render(<Component data={data} request={request} newId={()=>crypto.randomUUID()} projectLabel="Fixture" colors={{text:'#111',surface:'#fff',border:'#ddd',secondary:'#666'}} Button={undefined} components={{Copy,Group,Row,Button,Screen:Group}} />);
`,
    resolveDir: process.cwd(),
    loader: 'jsx',
  },
  alias: { 'react-native': 'react-native-web' },
  plugins: [
    {
      name: 'toast-boundary',
      setup(builder) {
        builder.onResolve({ filter: /\/components\/Toast\.js$/ }, () => ({
          path: 'toast',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export function ErrorToast(){return null;}',
          loader: 'js',
        }));
      },
    },
  ],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
assert.ok(output.outputFiles[0]);
const code = output.outputFiles[0].text;
/** @type {import('../packages/support-chat/support-client.js').SupportConversation|null} */
let conversation = null;
let creates = 0;
let failCreate = false;
let supportsInitialLogs = true;
/** @type {unknown[]} */
const attempts = [];
const server = createServer(async (request, response) => {
  if (request.url === '/bundle.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(code);
    return;
  }
  if (request.url !== '/fixture') {
    response.end('<div id="root"></div><script src="/bundle.js"></script>');
    return;
  }
  let body = '';
  for await (const chunk of request) body += String(chunk);
  const input = JSON.parse(body);
  response.setHeader('Content-Type', 'application/json');
  if (input.action === 'list') {
    response.end(
      JSON.stringify({
        initialSnapshots: supportsInitialLogs,
        messageSnapshots: supportsInitialLogs,
        conversations: conversation
          ? [{ ...conversation, unreadCount: 0, updatedAt: '2026-10-11' }]
          : [],
      }),
    );
    return;
  }
  if (input.action === 'create') {
    creates++;
    attempts.push(input);
    assert.equal(input.initialSnapshot.accepted, true);
    assert.equal(input.initialSnapshot.content, 'fixture logs');
    if (failCreate) {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: 'Fixture failure' }));
      return;
    }
    conversation = {
      id: input.id,
      title: input.title,
      status: 'open',
      generation: 1,
      agentAccess: false,
      autoReply: false,
      readThrough: 0,
      messages: [],
      requests: [],
      attachments: [{ id: input.initialSnapshot.id, category: 'logs', removed: false }],
      hasMore: false,
      before: null,
    };
  }
  if (input.action === 'send') {
    assert.ok(conversation);
    assert.equal(input.snapshot.content, 'fixture logs');
    assert.equal(input.snapshot.accepted, true);
    assert.equal(input.snapshot.generation, conversation.generation);
    conversation.messages.push({
      id: input.id,
      sequence: 1,
      author: 'user',
      text: input.text,
      createdAt: '2026-10-11',
    });
    conversation.attachments.push({ id: input.snapshot.id, category: 'logs', removed: false });
  }
  assert.notEqual(input.action, 'share', 'Initial approval must not use a separate upload.');
  response.end(JSON.stringify(conversation));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address === 'object');
const fixtureUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
/** @param {'native'|'web'} surface */
async function verifySurface(surface) {
  conversation = null;
  creates = 0;
  attempts.length = 0;
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  await page.goto(`${fixtureUrl}/?${surface}`);
  const checkbox = page.getByRole('checkbox', { name: 'Include logs?' });
  const preview = page.getByRole('textbox', {
    name: surface === 'native' ? 'Data snapshot preview' : 'Data preview',
    exact: true,
  });
  const send = page.getByRole('button', { name: 'New conversation', exact: true });
  await page.evaluate('window.holdLogs=true');
  await checkbox.click();
  await page.waitForFunction('window.collected === 1');
  await preview.waitFor({ state: 'hidden' });
  assert.equal(creates, 0);
  await checkbox.click();
  await page.evaluate('window.holdLogs=false;window.releaseLogs()');
  await page.waitForFunction('window.digestCount === 1');
  if (surface === 'web') assert.equal(await checkbox.isChecked(), false);
  else assert.equal(await checkbox.getByText('✓').count(), 0);
  await checkbox.click();
  await page.waitForFunction('window.digestCount === 2');
  await preview.waitFor({ state: 'hidden' });
  await page
    .getByRole('textbox', { name: 'Conversation title', exact: true })
    .fill('Fixture question');
  supportsInitialLogs = false;
  const unsupportedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/fixture') && response.request().postDataJSON().action === 'list',
  );
  await send.click();
  assert.equal((await (await unsupportedResponse).json()).initialSnapshots, false);
  await page.waitForFunction(
    `!document.querySelector('button[aria-label="New conversation"]')?.hasAttribute('disabled')`,
  );
  assert.equal(creates, 0, 'An older server must not silently drop approved logs.');
  supportsInitialLogs = true;
  failCreate = true;
  const failedResponse = page.waitForResponse(
    (response) => response.url().endsWith('/fixture') && response.status() === 500,
  );
  await send.click();
  await failedResponse;
  assert.equal(creates, 1);
  await preview.waitFor({ state: 'hidden' });
  failCreate = false;
  await send.click();
  await page.getByText('logs attachment · Shared', { exact: true }).waitFor();
  assert.equal(creates, 2);
  assert.deepEqual(
    attempts[0],
    attempts[1],
    'Retries preserve both conversation ID and accepted snapshot.',
  );
  assert.equal(await page.evaluate('window.collected'), 2);
  await preview.waitFor({ state: 'hidden' });
  await checkbox.click();
  await page.waitForFunction('window.collected === 3');
  await preview.waitFor({ state: 'hidden' });
  await page
    .getByRole('textbox', {
      name: surface === 'native' ? 'Your support message' : 'Your message',
      exact: true,
    })
    .fill('Follow-up with logs');
  await page
    .getByRole('button', { name: surface === 'native' ? 'Send message' : 'Send', exact: true })
    .click();
  await page.getByText('Follow-up with logs', { exact: true }).waitFor();
  await page.getByText('logs attachment · Shared', { exact: true }).nth(1).waitFor();
  assert.equal(await page.getByText('logs attachment · Shared', { exact: true }).count(), 2);
  await preview.waitFor({ state: 'hidden' });
  await page.close();
  console.log(
    `PASS ${surface}: quiet log collection, uncheck cancellation, server-version gate, retry and logs attached to initial/follow-up messages.`,
  );
}
try {
  await verifySurface('native');
  await verifySurface('web');
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve(undefined))),
  );
}
