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
import {createSupportClient} from './packages/support-chat/support-client.js';
const Copy=({children,...props})=><Text {...props}>{children}</Text>;
const Group=({children})=><View>{children}</View>;
const Row=({title,subtitle,onPress,disabled,testID})=><Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}><Text>{title}</Text><Text>{subtitle}</Text></Pressable>;
const Button=({label,onPress,disabled,testID})=><Pressable testID={testID} disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable>;
const request=createSupportClient(async(_path,options)=>{
 const response=await fetch('/fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:options.body});
 const value=await response.json();if(!response.ok)throw new Error(value.error);return value;
});
createRoot(document.getElementById('root')).render(<NativeSupport request={request} newId={()=>'new'} projectLabel="Fixture" colors={{text:'#111',surface:'#fff',border:'#ddd',secondary:'#666'}} components={{Copy,Group,Row,Button,Screen:Group}} />);
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
let unread = 0;
const server = createServer(async (request, response) => {
  if (request.url === '/bundle.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(code);
    return;
  }
  if (request.url !== '/fixture') {
    response.setHeader('Content-Type', 'text/html');
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
        conversations: unread
          ? [
              {
                id: 'a',
                title: 'Fixture reply',
                status: 'open',
                unreadCount: unread,
                updatedAt: '2026-10-10T10:00:00Z',
              },
            ]
          : [],
      }),
    );
    return;
  }
  if (input.action === 'readCursor') unread = 0;
  assert.equal(input.conversationId, 'a');
  response.end(
    JSON.stringify({
      id: 'a',
      title: 'Fixture reply',
      status: 'open',
      generation: 1,
      agentAccess: false,
      autoReply: false,
      readThrough: unread ? 0 : 1,
      messages: [
        {
          id: 'reply',
          sequence: 1,
          author: 'staff',
          text: 'Your support reply',
          createdAt: '2026-10-10T10:00:00Z',
        },
      ],
      requests: [],
      attachments: [],
      hasMore: false,
      before: null,
    }),
  );
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address === 'object');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByTestId('support-notifications').click();
  await page.getByTestId('support-notifications-empty').waitFor();
  assert.equal(
    await page.getByTestId('support-notifications-read-all').getAttribute('aria-disabled'),
    'true',
  );
  await page.getByTestId('support-notifications-close').click();
  unread = 1;
  await page.reload();
  await page.getByTestId('support-notifications').click();
  await page.getByTestId('support-notification-a').waitFor();
  await page.getByTestId('support-notifications-read-all').click();
  await page.getByText('Read', { exact: true }).waitFor();
  assert.equal(unread, 0);
  await page.getByTestId('support-notifications-clear-all').click();
  await page.getByTestId('support-notifications-empty').waitFor();
  await page.getByTestId('support-notifications-close').click();
  unread = 1;
  await page.reload();
  await page.getByTestId('support-notifications').click();
  await page.getByTestId('support-notification-a').click();
  await page.getByText('Your support reply', { exact: true }).waitFor();
  await page.getByTestId('support-notifications-panel').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Back to conversations' }).waitFor();
  console.log(
    'PASS actual mobile component: empty sheet, disabled empty actions, retained Read rows, clear-all and notification navigation.',
  );
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve(undefined))),
  );
}
