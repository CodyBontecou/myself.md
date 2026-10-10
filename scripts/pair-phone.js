import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const serverUrl = process.env.PUBLIC_URL;
const issuer = process.env.OAUTH_ISSUER;
if (!serverUrl || !issuer)
  throw new Error('Run auth:setup and start Keycloak and the server first.');
const verifier = randomBytes(32).toString('base64url');
const state = randomBytes(16).toString('hex');
const redirectUri = 'http://localhost:8765/callback';
const params = new URLSearchParams({
  client_id: 'myselfmd-mcp',
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'openid profile myselfmd',
  state,
  code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  code_challenge_method: 'S256',
});
/** @param {string} url */
function open(url) {
  spawn(
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'explorer.exe'
        : 'xdg-open',
    [url],
    { stdio: 'ignore' },
  ).on('error', () => console.log(`Open in your browser: ${url}`));
}
const callback = createServer();
try {
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Sign-in timed out. Run this command again.')),
      180000,
    );
    callback.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    callback.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', redirectUri);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }
      if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
        res.writeHead(400);
        res.end('Invalid OAuth callback.');
        return;
      }
      clearTimeout(timeout);
      res.end('Signed in. Return to your terminal.');
      resolve(url.searchParams.get('code'));
    });
    callback.listen(8765, 'localhost', () =>
      open(`${issuer}/protocol/openid-connect/auth?${params}`),
    );
  });
  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'myselfmd-mcp',
      redirect_uri: redirectUri,
      code: String(code),
      code_verifier: verifier,
    }),
  });
  const token = z.object({ access_token: z.string() }).parse(await response.json());
  if (!response.ok || !token.access_token) throw new Error('OAuth token exchange failed.');
  const client = new Client({ name: 'myselfmd-local', version: '1.0.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } },
      }),
    );
    const result = await client.callTool({
      name: process.argv[2] === 'list' ? 'list_connected_phones' : 'create_phone_pairing',
      arguments: {},
    });
    for (const item of result.content ?? []) {
      if (item.type === 'text') console.log(item.text);
      if (item.type === 'image')
        writeFileSync('.local/pairing.png', Buffer.from(item.data, 'base64'));
    }
    const parsed = z.object({ pairingUrl: z.string() }).safeParse(result.structuredContent);
    const url = parsed.success ? parsed.data.pairingUrl : undefined;
    if (typeof url === 'string') open(url);
  } finally {
    await client.close();
  }
} finally {
  callback.close();
}
