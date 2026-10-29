import { catalogMapTileResponse } from '../server/chatgpt-catalog.js';
import { createAnalytics } from './analytics.js';
import { chatgptMcpPath } from '../server/chatgpt-tools.js';
import {
  publicResponse,
  unknownPublicPath,
  notFoundResponse,
  publicApiPath,
  createPublicReadLimiter,
} from '../server/public-site.js';
import { publicHTML, publicPages } from '../core/public-site.js';
import { datasetDocument } from '../server/dataset-pages.js';
import { z } from 'zod';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import { verifyMigrationPurchase } from '../server/migration-purchases.js';
import { PairingError } from '../server/errors.js';
import { handleStoreNotification, storeSubscriptions } from '../server/store-subscriptions.js';
import { pairingPage } from '../server/pairing-page.js';
import { assets } from '../server/dashboard-assets.js';
import { readBytes } from './request.js';
import { migrationRequest } from './import.js';
import { digest, findTicket, registerTicket } from './tickets.js';
import { identityRequest, identityJwks, reviewerActive } from './identity.js';
import { reviewerUserId } from '../server/reviewer.js';
export { Account as MyselfAccount } from './account.js';
export { Purchase as MyselfPurchase } from './claims.js';
/** @param {unknown} data @param {number} [status] */
function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
/** @param {Request} request @param {Env} env */
async function publicAsset(request, env) {
  const asset = assets.get(new URL(request.url).pathname);
  if (!asset) return null;
  const url = new URL(request.url);
  url.pathname = `/${asset[0]}`;
  const response = await env.ASSETS.fetch(new Request(url, request));
  if (!response.ok) return response;
  const nonce = randomBytes(18).toString('base64');
  const headers = new Headers({
    'Content-Type': `${asset[1]}; charset=utf-8`,
    'Cache-Control': 'no-store',
    Vary: 'Accept',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; connect-src 'self' ${new URL(env.OAUTH_ISSUER).origin} https://cloudflareinsights.com; img-src 'self' https:; media-src 'self'; frame-src https://www.youtube-nocookie.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  });
  const body =
    request.method === 'HEAD'
      ? null
      : asset[1] === 'text/html'
        ? datasetDocument(await response.text(), new URL(request.url).pathname)
            .replace('__STYLE_NONCE__', nonce)
            .replace(
              '__PUBLIC_CONTENT__',
              publicHTML(
                publicPages.get(new URL(request.url).pathname.replace(/\/$/, '') || '/') ??
                  publicPages.get('/') ??
                  '',
              ),
            )
        : response.body;
  for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const value = response.headers.get(name);
    if (value && asset[1] !== 'text/html') headers.set(name, value);
  }
  return new Response(body, { status: response.status, headers });
}
/** @param {Request} request @param {number} limit */
async function boundedJson(request, limit) {
  const bytes = await readBytes(request, limit);
  return /** @type {unknown} */ (JSON.parse(new TextDecoder().decode(bytes)));
}
const limitPublicRead = createPublicReadLimiter();
export default {
  /** @param {ScheduledController} _controller @param {Env} env */
  async scheduled(_controller, env) {
    await createAnalytics(env).cleanup();
    await env.DIRECTORY.prepare('DELETE FROM tickets WHERE expires<?').bind(Date.now()).run();
    if (env.IDENTITY_ENABLED === '1') {
      const now = new Date().toISOString();
      await env.IDENTITY.batch([
        env.IDENTITY.prepare('DELETE FROM verification WHERE expiresAt<?').bind(now),
        env.IDENTITY.prepare('DELETE FROM oauthAccessToken WHERE expiresAt<?').bind(now),
        env.IDENTITY.prepare('DELETE FROM oauthRefreshToken WHERE expiresAt<?').bind(now),
        env.IDENTITY.prepare('DELETE FROM session WHERE expiresAt<?').bind(now),
        env.IDENTITY.prepare('DELETE FROM rateLimit WHERE lastRequest<?').bind(
          Date.now() - 86400000,
        ),
      ]);
    }
  },
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' || request.method === 'HEAD') {
        const limit =
          publicApiPath(url.pathname) ||
          url.pathname.startsWith('/apps/chatgpt/tiles/') ||
          url.pathname.startsWith('/apps/chatgpt/map-tiles/')
            ? limitPublicRead(request.headers.get('cf-connecting-ip') ?? 'unknown')
            : null;
        if (limit && !limit.allowed)
          return Response.json(
            { error: 'Public read rate limit exceeded. Retry after the indicated delay.' },
            {
              status: 429,
              headers: {
                ...limit.headers,
                'Retry-After': limit.headers['RateLimit-Reset'],
                'Cache-Control': 'no-store',
              },
            },
          );
        const mapTile = await catalogMapTileResponse(request, caches.default);
        if (mapTile) return mapTile;
        const page = publicResponse(
          url.pathname,
          request.headers.get('accept') ?? '',
          env.OAUTH_ISSUER,
          `${publicOrigin(request, env)}/mcp`,
          url.searchParams,
        );
        if (
          page?.status === 302 &&
          env.IDENTITY_ENABLED === '1' &&
          'Location' in page.headers &&
          page.headers.Location?.startsWith(`${env.OAUTH_ISSUER}/.well-known/`)
        ) {
          // RFC 8414 discovery clients may not follow metadata redirects.
          const discovery = await identityRequest(
            new Request(page.headers.Location, { headers: request.headers }),
            env,
          );
          const headers = new Headers(discovery.headers);
          if (limit)
            for (const [name, value] of Object.entries(limit.headers)) headers.set(name, value);
          return new Response(request.method === 'HEAD' ? null : discovery.body, {
            status: discovery.status,
            headers,
          });
        }
        if (page && publicApiPath(url.pathname) === '/health')
          page.body = JSON.stringify({ ok: true, platform: 'cloudflare' });
        if (page && limit) Object.assign(page.headers, limit.headers);
        if (page) return new Response(request.method === 'HEAD' ? null : page.body, page);
      }
      if (url.pathname === '/api/analytics/anonymous') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(env.PUBLIC_URL).origin && origin !== url.origin)
          return json({ error: 'Origin denied.' }, 403);
        if (request.headers.get('sec-fetch-site') === 'cross-site')
          return json({ error: 'Origin denied.' }, 403);
        const limited = await env.ANALYTICS_LIMITER.limit({
          key: request.headers.get('cf-connecting-ip') ?? 'local',
        });
        if (!limited.success) return json({ error: 'Retry later.' }, 429);
        return json(await createAnalytics(env).anonymous(await boundedJson(request, 16384)));
      }
      if (url.pathname === '/__migration' && request.method === 'POST') {
        if (env.MIGRATION_ENABLED !== '1') return json({ error: 'Not found.' }, 404);
        return json(await migrationRequest(request, env, await boundedJson(request, 1024 * 1024)));
      }
      if (url.pathname.startsWith('/auth/')) {
        if (
          (!url.pathname.startsWith('/auth/realms/myselfmd/') &&
            !url.pathname.startsWith('/auth/resources/')) ||
          /[%\\;]/.test(url.pathname)
        )
          return json({ error: 'Not found.' }, 404);
        if (
          env.IDENTITY_ENABLED === 'freeze' &&
          !url.pathname.endsWith('/certs') &&
          !url.pathname.endsWith('/.well-known/openid-configuration')
        )
          return json({ error: 'Sign-in migration in progress. Retry shortly.' }, 503);
        if (env.IDENTITY_ENABLED === '1') return await identityRequest(request, env);
        const target = new URL(url.pathname + url.search, env.AUTH_ORIGIN);
        return await fetch(new Request(target, request), { redirect: 'manual' });
      }
      if (url.pathname.startsWith('/api/account-deletion/') && request.method === 'GET') {
        const ticket = url.pathname.slice('/api/account-deletion/'.length);
        if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) return json({ error: 'Invalid receipt.' }, 400);
        const route = await findTicket(env, ticket);
        if (typeof route?.subject !== 'string')
          return json({ error: 'Deletion receipt expired.' }, 410);
        const result = await env.ACCOUNTS.getByName(digest(route.subject)).deletionReceipt(ticket);
        return result ? json(result) : json({ error: 'Deletion receipt expired.' }, 410);
      }
      if (url.pathname === '/health') return json({ ok: true, platform: 'cloudflare' });
      if (url.pathname === '/config')
        return json({
          issuer: env.OAUTH_ISSUER,
          clientId: 'myselfmd-phone',
          resource: `${publicOrigin(request, env)}/mcp`,
        });
      if (url.pathname === '/dashboard/config')
        return json({ issuer: env.OAUTH_ISSUER, clientId: 'myselfmd-dashboard' });
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource'))
        return json({
          resource: `${publicOrigin(request, env)}/mcp`,
          authorization_servers: [env.OAUTH_ISSUER],
          scopes_supported: ['myselfmd', 'offline_access'],
          bearer_methods_supported: ['header'],
        });
      if (url.pathname === '/.well-known/apple-app-site-association')
        return json({
          applinks: {
            details: env.IOS_APP_ID
              ? [{ appIDs: [env.IOS_APP_ID], components: [{ '/': '/pair' }] }]
              : [],
          },
        });
      if (request.method === 'GET' || request.method === 'HEAD') {
        const asset = await publicAsset(request, env);
        if (asset) return asset;
      }
      if (unknownPublicPath(url.pathname)) {
        const missing = notFoundResponse(request.headers.get('accept') ?? '');
        return new Response(request.method === 'HEAD' ? null : missing.body, {
          status: 404,
          headers: missing.headers,
        });
      }
      if (url.pathname === '/pair')
        return new Response(pairingPage, {
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy':
              "default-src 'none'; img-src 'self'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
          },
        });
      if (env.MIGRATION_ENABLED === '1')
        return json({ error: 'Migration in progress. Retry shortly.' }, 503);
      const storeSource =
        url.pathname === '/api/store/apple/notifications'
          ? 'apple'
          : url.pathname === '/api/store/google/notifications'
            ? 'google'
            : null;
      if (storeSource) {
        if (request.method !== 'POST') throw new PairingError(405, 'Method not allowed.');
        return json(
          await handleStoreNotification(
            storeSource,
            await readBytes(request, 300000),
            request.headers.get('authorization'),
            `${env.PUBLIC_URL}/api/store/${storeSource}/notifications`,
            {
              ownerOf: (key) => env.PURCHASES.getByName(digest(key)).owner(key),
              purchaseOwner: (store, id) =>
                env.PURCHASES.getByName(digest(`${store}|${id}`)).purchaseOwner(store, id),
              read: storeSubscriptions.read,
              deliver: async (subject, event) => {
                if (subject !== 'deleted')
                  await env.ACCOUNTS.getByName(digest(subject)).storeNotification(subject, event);
              },
            },
          ),
        );
      }
      if (url.pathname === '/api/migration/proof' && request.method === 'POST') {
        const proof = await verifyMigrationPurchase(await boundedJson(request, 40000));
        const purchase = digest(`${proof.source}|${proof.reference}`);
        const ticket = await env.PURCHASES.getByName(purchase).createClaim(proof);
        await registerTicket(env, ticket, null, purchase, Date.now() + 900000);
        return json({ claimUrl: `${env.PUBLIC_URL}/claim#${ticket}` });
      }
      const watch = request.headers.get('authorization')?.match(/^Watch ([A-Za-z0-9_-]{43})$/)?.[1];
      if (watch && url.pathname === '/api/watch/runtime' && request.method === 'POST') {
        const route = await findTicket(env, watch);
        if (typeof route?.subject !== 'string')
          return json({ error: 'Watch session expired or revoked.' }, 401);
        return await env.ACCOUNTS.getByName(digest(route.subject)).fetch(request);
      }
      const upload = request.headers
        .get('authorization')
        ?.match(/^Upload ([A-Za-z0-9_-]{43})$/)?.[1];
      const qr = url.pathname.startsWith('/qr/') ? url.pathname.slice(4) : null;
      const pairingStatus =
        request.method === 'GET' && url.pathname.startsWith('/api/pairing-status/')
          ? url.pathname.slice('/api/pairing-status/'.length)
          : null;
      if (pairingStatus !== null && !/^[A-Za-z0-9_-]{43}$/.test(pairingStatus))
        return json({ error: 'Invalid pairing link.' }, 400);
      if ((upload && url.pathname.startsWith('/api/cloud/uploads')) || qr || pairingStatus) {
        const route = await findTicket(env, upload ?? qr ?? pairingStatus ?? '');
        if (typeof route?.subject !== 'string' && pairingStatus) return json({ status: 'expired' });
        if (typeof route?.subject !== 'string')
          return json({ error: 'Credential expired or revoked.' }, 410);
        return await env.ACCOUNTS.getByName(digest(route.subject)).fetch(request);
      }
      const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return unauthorized(env, url.pathname === chatgptMcpPath);
      let payload;
      try {
        const jwks = createRemoteJWKSet(
          new URL(`${env.OAUTH_ISSUER}/protocol/openid-connect/certs`),
          env.IDENTITY_ENABLED === '1'
            ? {
                [customFetch]: () => identityJwks(env),
              }
            : {},
        );
        ({ payload } = await jwtVerify(token, jwks, {
          issuer: env.OAUTH_ISSUER,
          audience: [
            `${env.PUBLIC_URL}${url.pathname === chatgptMcpPath ? chatgptMcpPath : '/mcp'}`,
            ...env.PUBLIC_URL_ALIASES.split(',')
              .filter(Boolean)
              .map(
                (origin) => `${origin}${url.pathname === chatgptMcpPath ? chatgptMcpPath : '/mcp'}`,
              ),
          ],
        }));
      } catch {
        return unauthorized(env, url.pathname === chatgptMcpPath);
      }
      if (
        !payload.sub ||
        typeof payload.scope !== 'string' ||
        !payload.scope.split(' ').includes('myselfmd')
      )
        return json({ error: 'myselfmd scope required.' }, 403);
      if (
        payload.sub === reviewerUserId &&
        (typeof payload.iat !== 'number' || !(await reviewerActive(env, payload.iat)))
      )
        return json({ error: 'Reviewer access is revoked.' }, 401);
      const subject = `${env.ACCOUNT_NAMESPACE}|${payload.sub}`;
      if (url.pathname === '/api/claim' && request.method === 'POST') {
        const input = z
          .object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
          .parse(await boundedJson(request.clone(), 4096));
        const route = await findTicket(env, input.ticket);
        if (typeof route?.subject === 'string' && route.subject !== subject)
          return json({ error: 'Sign in with the account that generated this QR code.' }, 403);
      }
      const account = env.ACCOUNTS.getByName(digest(subject));
      await account.ensureAccount(subject);
      return await account.fetch(request);
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return json({ error: 'Invalid request.' }, 400);
      if (error instanceof PairingError) return json({ error: error.message }, error.status);
      if (env.ALLOW_HTTP_DEV === '1') console.error(error);
      console.error('Worker request failed.', {
        path: /^\/(qr|api\/pairing-status)\//.test(new URL(request.url).pathname)
          ? '/qr/[ticket]'
          : new URL(request.url).pathname,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return json({ error: 'Request could not be completed. Retry later.' }, 503);
    }
  },
};
/** @param {Env} env @param {boolean} [chatgpt] */
function unauthorized(env, chatgpt = false) {
  return Response.json(
    { error: 'OAuth sign-in required or token expired.' },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
        'WWW-Authenticate': `Bearer resource_metadata="${env.PUBLIC_URL}/.well-known/oauth-protected-resource${chatgpt ? chatgptMcpPath : '/mcp'}"`,
      },
    },
  );
}

/** @param {Request} request @param {Env} env */
function publicOrigin(request, env) {
  const host = new URL(request.url).host;
  return (
    [env.PUBLIC_URL, ...env.PUBLIC_URL_ALIASES.split(',')].find(
      (origin) => origin && new URL(origin).host === host,
    ) ?? env.PUBLIC_URL
  );
}
