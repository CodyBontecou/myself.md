import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { cloud, history } from './cloud.js';
import { devices, PairingError } from './store.js';
import { cancelAgent } from './data.js';
import { explore, recordDetail } from './explorer.js';
const assets = new Map([
  ['/dashboard', ['index.html', 'text/html']],
  ['/dashboard/', ['index.html', 'text/html']],
  ['/dashboard/callback', ['index.html', 'text/html']],
  ['/dashboard/app.js', ['app.js', 'text/javascript']],
  ['/dashboard/style.css', ['style.css', 'text/css']],
  ['/dashboard/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
/** @param {string} path @param {import('node:http').ServerResponse} res @param {string} issuer */
export function dashboardAsset(path, res, issuer) {
  const asset = assets.get(path);
  if (!asset) return false;
  const nonce = randomBytes(18).toString('base64');
  res.writeHead(200, {
    'Content-Type': `${asset[1]}; charset=utf-8`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; connect-src 'self' ${new URL(issuer).origin}; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  });
  res.end(
    readFileSync(new URL(`../dashboard/dist/${asset[0]}`, import.meta.url), 'utf8').replace(
      '__STYLE_NONCE__',
      nonce,
    ),
  );
  return true;
}
/** @param {string} subject @param {string} account @param {string} path @param {string} method @param {URLSearchParams} query @param {unknown} body */
export function dashboardApi(subject, account, path, method, query, body) {
  if (path === '/api/dashboard' && method === 'GET') {
    return {
      account,
      exports: cloud.list(subject),
      profiles: cloud.profiles(subject),
      agents: cloud.agents(subject),
      devices: devices(subject),
    };
  }
  if (path === '/api/dashboard/history' && method === 'GET') {
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(50000)
      .parse(query.get('offset') ?? 0);
    return history.list(subject, null, offset);
  }
  if (path === '/api/dashboard/history/entry' && method === 'GET') {
    const id = z.string().min(1).max(2000).parse(query.get('id'));
    const stored = history.get(subject, id);
    if (!stored) throw new PairingError(404, 'Activity not found.');
    return { event: stored.event, related: history.related(subject, stored.event) };
  }
  if (path === '/api/dashboard/explore' && method === 'POST') return explore(subject, body);
  if (path === '/api/dashboard/record' && method === 'GET') return recordDetail(subject, query);
  const records = path.match(/^\/api\/dashboard\/exports\/([^/]+)$/);
  if (records) {
    const id = z.string().uuid().parse(records[1]);
    if (method === 'DELETE') return cloud.delete(subject, id);
    if (method === 'GET') {
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(50000)
        .parse(query.get('offset') ?? 0);
      cloud.cleanup();
      return cloud.page(subject, id, offset, 50);
    }
  }
  if (path === '/api/dashboard/permissions' && method === 'PUT') {
    const input = z
      .object({
        deviceId: z.string().uuid(),
        profileId: z.string().min(1).max(100),
        shared: z.boolean(),
      })
      .parse(body);
    return cloud.setSharing(subject, input.deviceId, input.profileId, input.shared);
  }
  if (path === '/api/dashboard/agents' && method === 'PUT') {
    const input = z
      .object({ client: z.string().min(1).max(200), blocked: z.boolean() })
      .parse(body);
    const result = cloud.setAgent(subject, input.client, input.blocked);
    if (input.blocked) cancelAgent(subject, input.client);
    return result;
  }
  throw new PairingError(404, 'Dashboard action not found.');
}
