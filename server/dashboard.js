import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDashboardService } from './dashboard-service.js';
import { cloud, history } from './cloud.js';
import { devices } from './store.js';
import { cancelAgent } from './data.js';
import { assets } from './dashboard-assets.js';
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
  const content = readFileSync(new URL(`../dashboard/dist/${asset[0]}`, import.meta.url));
  res.end(
    asset[1] === 'text/html' ? content.toString('utf8').replace('__STYLE_NONCE__', nonce) : content,
  );
  return true;
}
export const { dashboardApi } = createDashboardService({ cloud, history, devices, cancelAgent });
