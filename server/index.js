import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import QRCode from 'qrcode';
import { z } from 'zod';
import { registerDataTools, phoneApi, cancelPhone } from './data.js';
import { cloud, registerCloudTools, ownCloudDevice } from './cloud.js';
import { parseProfile } from '../core/profiles.js';
import { proxyAuth } from './auth-proxy.js';
import { createPairingUrl, createPairingDeepLink } from '../core/index.js';
import {
  claim,
  createPairing,
  devices,
  disconnect,
  pending,
  status,
  PairingError,
} from './store.js';
const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';
const issuer = process.env.OAUTH_ISSUER;
if (!issuer) throw new Error('Run npm run auth:setup, then start Keycloak.');
if (
  process.env.ALLOW_HTTP_DEV !== '1' &&
  (!publicUrl.startsWith('https://') || !issuer.startsWith('https://'))
)
  throw new Error('OAuth and server URLs require HTTPS.');
const resource = `${publicUrl}/mcp`;
const iosAppId = process.env.IOS_APP_ID;
if (iosAppId && !/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(iosAppId))
  throw new Error('Invalid IOS_APP_ID for Universal Links.');
const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
const metadata = {
  resource,
  authorization_servers: [issuer],
  scopes_supported: ['qr-connect'],
  bearer_methods_supported: ['header'],
};
/** @param {string} subject */
function makeMcp(subject) {
  const mcp = new McpServer({ name: 'qr-connect', version: '1.0.0' });
  mcp.registerTool(
    'create_phone_pairing',
    {
      description:
        'Generate a five-minute, one-use QR image. Scan with QR Connect and sign in with this same account.',
      inputSchema: z.object({}),
    },
    async () => {
      const pairing = createPairing(subject);
      const url = createPairingUrl(publicUrl, pairing.ticket);
      const png = await QRCode.toBuffer(url, { width: 512, margin: 4 });
      return {
        content: [
          { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
          {
            type: 'text',
            text: `Scan this QR with QR Connect. View it in a browser: ${url}\nPairing ID: ${pairing.id}`,
          },
        ],
        structuredContent: {
          pairingId: pairing.id,
          expiresAt: pairing.expires,
          pairingUrl: url,
          deepLink: createPairingDeepLink(publicUrl, pairing.ticket),
        },
      };
    },
  );
  mcp.registerTool(
    'get_pairing_status',
    {
      description: 'Check whether a QR pairing was confirmed.',
      inputSchema: z.object({ pairingId: z.string().uuid() }),
    },
    async ({ pairingId }) => ({
      content: [{ type: 'text', text: JSON.stringify(status(pairingId, subject)) }],
    }),
  );
  mcp.registerTool(
    'list_connected_phones',
    { description: 'List phones connected to your account.', inputSchema: z.object({}) },
    async () => ({ content: [{ type: 'text', text: JSON.stringify(devices(subject)) }] }),
  );
  mcp.registerTool(
    'disconnect_phone',
    {
      description: 'Disconnect a phone from your account.',
      inputSchema: z.object({ deviceId: z.string().uuid() }),
    },
    async ({ deviceId }) => {
      disconnect(deviceId, subject);
      cancelPhone(deviceId, subject);
      return { content: [{ type: 'text', text: 'Disconnected.' }] };
    },
  );
  registerDataTools(mcp, subject);
  registerCloudTools(mcp, subject);
  return mcp;
}
const handler = toNodeHandler(
  createMcpHandler((ctx) => {
    const subject = ctx.authInfo?.extra?.subject;
    if (typeof subject !== 'string') throw new Error('Authentication required.');
    return makeMcp(subject);
  }),
);
/** @param {import('node:http').ServerResponse} res @param {number} code @param {unknown} data */
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
/** @param {import('node:http').IncomingMessage} req @param {number} limit */
async function bodyBytes(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new PairingError(413, 'Request exceeds upload limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
createServer({ requestTimeout: 60000, headersTimeout: 15000 }, async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', publicUrl);
    if (process.env.AUTH_PROXY === '1' && url.pathname.startsWith('/auth/')) {
      proxyAuth(req, res, url, publicUrl);
      return;
    }
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
      json(res, 200, metadata);
      return;
    }
    if (url.pathname === '/health') {
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === '/config') {
      json(res, 200, { issuer, clientId: 'qr-phone', resource });
      return;
    }
    if (url.pathname === '/.well-known/apple-app-site-association') {
      json(res, 200, {
        applinks: {
          details: iosAppId ? [{ appIDs: [iosAppId], components: [{ '/': '/pair' }] }] : [],
        },
      });
      return;
    }
    if (url.pathname === '/pair') {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; script-src 'unsafe-inline'",
      });
      res.end(
        `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect your phone</title><h1>QR Connect</h1><p>Scan with your phone’s Camera or QR Connect. On your phone, tap the link below, sign in with the same account, and confirm.</p><p><a id="open-app" hidden>Open in QR Connect</a></p><img id="qr" width="320" alt="Pairing QR code"><script>const t=location.hash.slice(1);if(/^[A-Za-z0-9_-]{43}$/.test(t)){document.getElementById('qr').src='/qr/'+t;const a=document.getElementById('open-app');a.href='qrconnect://pair?url='+encodeURIComponent(location.origin+'/pair#'+t);a.hidden=false;}</script>`,
      );
      return;
    }
    if (url.pathname.startsWith('/qr/')) {
      const ticket = url.pathname.slice(4);
      pending(ticket);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(await QRCode.toBuffer(createPairingUrl(publicUrl, ticket), { width: 512 }));
      return;
    }
    const uploadToken = req.headers.authorization?.match(/^Upload ([A-Za-z0-9_-]{43})$/)?.[1];
    if (uploadToken && url.pathname.startsWith('/api/cloud/uploads')) {
      const credential = cloud.credential(uploadToken);
      ownCloudDevice(credential.subject, credential.device);
      const bytes = await bodyBytes(
        req,
        url.pathname === '/api/cloud/uploads' ? 1024 * 1024 : 16 * 1024 * 1024,
      );
      if (url.pathname === '/api/cloud/uploads' && req.method === 'POST')
        json(
          res,
          200,
          cloud.begin(
            credential.subject,
            credential.device,
            credential.profile,
            JSON.parse(bytes.toString()),
          ),
        );
      else if (/^\/api\/cloud\/uploads\/[a-f0-9-]+$/.test(url.pathname) && req.method === 'PUT')
        json(
          res,
          200,
          cloud.commit(
            credential.subject,
            credential.device,
            credential.profile,
            url.pathname.slice('/api/cloud/uploads/'.length),
            bytes,
          ),
        );
      else json(res, 404, { error: 'Not found.' });
      return;
    }
    const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) {
      res.setHeader(
        'WWW-Authenticate',
        `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp"`,
      );
      json(res, 401, { error: 'OAuth sign-in required.' });
      return;
    }
    let payload;
    try {
      ({ payload } = await jwtVerify(token, jwks, { issuer, audience: resource }));
    } catch {
      res.setHeader(
        'WWW-Authenticate',
        `Bearer error="invalid_token", resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp"`,
      );
      json(res, 401, { error: 'Invalid or expired access token.' });
      return;
    }
    if (
      !payload.sub ||
      typeof payload.scope !== 'string' ||
      !payload.scope.split(' ').includes('qr-connect')
    ) {
      json(res, 403, { error: 'qr-connect scope required.' });
      return;
    }
    const subject = `${issuer}|${payload.sub}`;
    if (url.pathname.startsWith('/api/cloud/')) {
      if (payload.azp !== 'qr-phone')
        throw new PairingError(403, 'Cloud management requires the phone OAuth client.');
      if (url.pathname === '/api/cloud/exports' && req.method === 'GET') {
        json(res, 200, cloud.list(subject));
        return;
      }
      if (url.pathname.startsWith('/api/cloud/exports/') && req.method === 'DELETE') {
        json(res, 200, cloud.delete(subject, url.pathname.slice('/api/cloud/exports/'.length)));
        return;
      }
      const input = z
        .object({
          deviceId: z.string().uuid(),
          profile: z.unknown(),
          shared: z.boolean().optional(),
        })
        .parse(JSON.parse((await bodyBytes(req, 1024 * 1024)).toString()));
      ownCloudDevice(subject, input.deviceId);
      const id = z.object({ id: z.string().min(1).max(100) }).parse(input.profile).id;
      const profile = Object.assign(parseProfile(input.profile), { id });
      if (url.pathname === '/api/cloud/credential' && req.method === 'POST')
        json(res, 200, { token: cloud.authorize(subject, input.deviceId, profile) });
      else if (url.pathname === '/api/cloud/access' && req.method === 'PUT')
        json(res, 200, cloud.access(subject, input.deviceId, profile, input.shared ?? false));
      else if (url.pathname === '/api/cloud/access' && req.method === 'POST')
        json(res, 200, cloud.permission(subject, input.deviceId, id));
      else json(res, 404, { error: 'Not found.' });
      return;
    }
    if (url.pathname === '/mcp') {
      await handler(
        Object.assign(req, {
          method: req.method ?? 'GET',
          url: req.url ?? '/',
          auth: {
            token,
            clientId: String(payload.azp),
            scopes: payload.scope.split(' '),
            extra: { subject },
          },
        }),
        res,
      );
      return;
    }
    if (url.pathname === '/api/devices' && req.method === 'GET') {
      json(res, 200, {
        devices: devices(subject),
        subject,
        account: payload.preferred_username ?? payload.sub,
      });
      return;
    }
    if (url.pathname.startsWith('/api/devices/') && req.method === 'DELETE') {
      disconnect(url.pathname.slice(13), subject);
      cancelPhone(url.pathname.slice(13), subject);
      json(res, 200, { ok: true });
      return;
    }
    if (
      (url.pathname.startsWith('/api/phones/') || url.pathname === '/api/claim') &&
      payload.azp !== 'qr-phone'
    ) {
      json(res, 403, {
        error: 'Phone OAuth client required. Chat clients cannot grant phone access.',
      });
      return;
    }
    if (url.pathname.startsWith('/api/phones/')) {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          json(res, 413, { error: 'Response exceeds 1 MB. Query a smaller page.' });
          return;
        }
        chunks.push(chunk);
      }
      const result = phoneApi(
        url.pathname,
        req.method ?? 'GET',
        subject,
        JSON.parse(Buffer.concat(chunks).toString() || '{}'),
      );
      json(res, result === undefined ? 404 : 200, result ?? { error: 'Not found.' });
      return;
    }
    if (url.pathname === '/api/claim' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) {
          json(res, 413, { error: 'Request too large.' });
          return;
        }
      }
      const input = z
        .object({
          ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          name: z.string().min(1).max(80),
        })
        .parse(JSON.parse(body));
      json(res, 200, claim(input.ticket, subject, input.name));
      return;
    }
    json(res, 404, { error: 'Not found.' });
  } catch (error) {
    json(res, error instanceof PairingError ? error.status : 400, {
      error: error instanceof Error ? error.message : 'Request failed.',
    });
  }
}).listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST ?? process.env.DEV_HOST ?? '127.0.0.1',
  () => console.log(`QR Connect: ${resource}`),
);
