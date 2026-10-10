import {
  publicResponse,
  unknownPublicPath,
  notFoundMarkdown,
  publicApiPath,
  createPublicReadLimiter,
} from './public-site.js';
import { accountDeletionNotice } from '../core/account-deletion.js';
import { privacyPolicy } from '../core/privacy.js';
import { existingCustomerGuide } from '../core/billing.js';
import { parseHistoryEvent } from '../core/history.js';
import { Buffer } from 'node:buffer';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import { Client } from '@modelcontextprotocol/client';
import { McpServer, createMcpHandler, InMemoryTransport } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { z } from 'zod';
import { parseProfile } from '../core/profiles.js';
import { createPairingUrl, createPairingDeepLink } from '../core/index.js';
import { pairingPage } from './pairing-page.js';
import { proxyWorker } from './worker-proxy.js';
import { PairingError } from './errors.js';
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
/** @typedef {{supportV1Api?:ReturnType<typeof import('./support-remote.js').createRemoteSupport>['supportV1Api'],registerSupportV1Tools?:ReturnType<typeof import('./support-remote.js').createRemoteSupport>['registerSupportV1Tools'],supportApi?:ReturnType<typeof import('./support-service.js').createSupportService>['supportApi'],registerSupportTools?:ReturnType<typeof import('./support-service.js').createSupportService>['registerSupportTools'],accountApi?:(subject:string,action:'status'|'delete')=>Promise<import('../core/account-deletion.js').DeletionStatus>,qrPng:(value:string,options:{width:number,margin?:number})=>Promise<import('node:buffer').Buffer>,billing:import('./billing-store.js').BillingStore,billingApi:ReturnType<import('./billing-service.js').createBillingService>['billingApi'],refreshEntitlement:(subject:string)=>Promise<void>,verifyMigrationPurchase:typeof import('./migration-purchases.js').verifyMigrationPurchase,createMigrationClaim:(proof:{source:string,reference:string})=>string|Promise<string>,claimMigration:(subject:string,ticket:string)=>unknown|Promise<unknown>,registerTicket:(ticket:string,subject:string,expires:number)=>Promise<void>,registerDataTools:ReturnType<import('./data-service.js').createDataService>['registerDataTools'],phoneApi:ReturnType<import('./data-service.js').createDataService>['phoneApi'],cancelPhone:ReturnType<import('./data-service.js').createDataService>['cancelPhone'],cloud:import('./cloud-store.js').CloudStore,history:import('./history-store.js').HistoryStore,registerCloudTools:ReturnType<import('./cloud-service.js').createCloudService>['registerCloudTools'],ownCloudDevice:(subject:string,id:string)=>void,dashboardAsset:(path:string,res:import('node:http').ServerResponse,issuer:string)=>boolean|Promise<boolean>,dashboardApi:ReturnType<import('./dashboard-service.js').createDashboardService>['dashboardApi'],proxyAuth:typeof import('./auth-proxy.js').proxyAuth,createPairing:import('./pairing-store.js').PairingStore['createPairing'],claim:import('./pairing-store.js').PairingStore['claim'],devices:import('./pairing-store.js').PairingStore['devices'],disconnect:import('./pairing-store.js').PairingStore['disconnect'],pending:import('./pairing-store.js').PairingStore['pending'],status:import('./pairing-store.js').PairingStore['status']}} ApplicationServices */
/** Shared HTTP authorization and routes for Node and Workers.
 * @param {Record<string,string|undefined>} config @param {ApplicationServices} services
 * @param {{jwksFetch?:import('jose').FetchImplementation}} [options]
 * @returns {import('node:http').RequestListener} */
export function createApplication(
  config,
  {
    supportApi,
    registerSupportTools,
    supportV1Api,
    registerSupportV1Tools,
    accountApi,
    qrPng,
    billing,
    billingApi,
    refreshEntitlement,
    verifyMigrationPurchase,
    createMigrationClaim,
    claimMigration,
    registerTicket,
    registerDataTools,
    phoneApi,
    cancelPhone,
    cloud,
    history,
    registerCloudTools,
    ownCloudDevice,
    dashboardAsset,
    dashboardApi,
    proxyAuth,
    createPairing,
    claim,
    devices,
    disconnect,
    pending,
    status,
  },
  options = {},
) {
  const publicUrl = config.PUBLIC_URL ?? 'http://localhost:3000';
  const issuer = config.OAUTH_ISSUER;
  if (!issuer) throw new Error('Run npm run auth:setup, then start Keycloak.');
  // A hostname migration keeps the same realm users and encrypted account partitions.
  const accountNamespace = config.ACCOUNT_NAMESPACE ?? issuer;
  if (!accountNamespace || accountNamespace.includes('|'))
    throw new Error('Account namespace must be a nonempty value without a subject delimiter.');
  if (
    config.ALLOW_HTTP_DEV !== '1' &&
    (!publicUrl.startsWith('https://') || !issuer.startsWith('https://'))
  )
    throw new Error('OAuth and server URLs require HTTPS.');
  const resource = `${publicUrl}/mcp`;
  const publicUrls = [
    publicUrl,
    ...(config.PUBLIC_URL_ALIASES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ];
  for (const origin of publicUrls) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || (parsed.protocol !== 'https:' && config.ALLOW_HTTP_DEV !== '1'))
      throw new Error('Public service URLs must be exact HTTPS origins.');
  }
  const resources = publicUrls.map((origin) => `${origin}/mcp`);
  const iosAppId = config.IOS_APP_ID;
  if (iosAppId && !/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(iosAppId))
    throw new Error('Invalid IOS_APP_ID for Universal Links.');
  const jwks = createRemoteJWKSet(
    new URL(`${issuer}/protocol/openid-connect/certs`),
    options.jwksFetch ? { [customFetch]: options.jwksFetch } : {},
  );
  const limitPublicRead = createPublicReadLimiter();
  const limitAgentRest = createPublicReadLimiter();
  const metadata = {
    resource,
    authorization_servers: [issuer],
    scopes_supported: ['myselfmd'],
    bearer_methods_supported: ['header'],
  };
  /** @param {string} subject @returns {Promise<import('../core/account-deletion.js').DeletionStatus>} */
  async function deletionStatus(subject) {
    return accountApi
      ? accountApi(subject, 'status')
      : {
          state: /** @type {const} */ ('unavailable'),
          subject,
          notice: accountDeletionNotice,
          error:
            'Account deletion requires the hosted identity service. Contact the service operator to enable it.',
        };
  }
  /** @param {string} subject @param {string|null} client */
  async function makeMcp(subject, client) {
    const mcp = new McpServer({ name: 'myself.md', version: '1.0.0' });
    mcp.registerTool(
      'get_public_dataset_catalog',
      {
        description:
          'Read the public dataset adapter catalog. Contains no personal records. Follow nextCursor until hasMore is false.',
        inputSchema: z
          .object({
            limit: z.number().int().min(1).max(3).optional(),
            cursor: z
              .string()
              .regex(/^catalog-v1:[0-3]$/)
              .optional(),
          })
          .strict(),
        annotations: { readOnlyHint: true },
      },
      async (input) => {
        const params = new URLSearchParams();
        if (input.limit !== undefined) params.set('limit', String(input.limit));
        if (input.cursor !== undefined) params.set('cursor', input.cursor);
        const result = JSON.parse(
          publicResponse('/dataset-catalog', '', issuer ?? '', resource, params)?.body ?? '{}',
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );
    mcp.registerTool(
      'get_public_documentation',
      {
        description: 'Read the public getting-started guide and full API reference.',
        inputSchema: z.object({}).strict(),
        annotations: { readOnlyHint: true },
      },
      async () => ({
        content: [
          {
            type: 'text',
            text: `${publicResponse('/docs', 'text/markdown', issuer ?? '')?.body ?? ''}\n\n${publicResponse('/docs/reference', 'text/markdown', issuer ?? '')?.body ?? ''}`,
          },
        ],
      }),
    );
    for (const name of ['get_account_deletion', 'request_account_deletion']) {
      mcp.registerTool(
        name,
        {
          description:
            name === 'get_account_deletion'
              ? 'Inspect account deletion status, permanent effects and retained purchase identifiers.'
              : 'Initiate account deletion by handing off to the authenticated owner for permanent-deletion confirmation. This tool cannot confirm on the owner’s behalf. Read status to verify completion.',
          inputSchema: z.object({}).strict(),
        },
        async () => {
          const deletion = await deletionStatus(subject);
          const result = {
            ...deletion,
            handoff: {
              status: deletion.state === 'active' ? 'awaiting_user' : deletion.state,
              url:
                deletion.statusUrl ??
                `${publicUrl}/delete-account?subject=${encodeURIComponent(subject)}`,
              requiresUser: ['active', 'failed'].includes(deletion.state),
              verificationTool: 'get_account_deletion',
            },
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result,
          };
        },
      );
    }

    mcp.registerTool(
      'delete_account',
      {
        description:
          'Permanently delete the authenticated myself.md account and associated cloud data. Obtain the user’s explicit deletion confirmation first; inspect get_account_deletion for the effects and exact subject. Account-linked lifetime access is lost. Safe to retry with the same subject. Completion requires all cleanup to succeed; the receipt verifies pending cleanup after tokens are revoked.',
        inputSchema: z
          .object({ subject: z.literal(subject), confirmation: z.literal('DELETE') })
          .strict(),
        annotations: { destructiveHint: true, idempotentHint: true },
      },
      async () => {
        if (!accountApi)
          throw new PairingError(503, 'Account deletion requires the hosted identity service.');
        const result = await accountApi(subject, 'delete');
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    );
    if (!['active', 'unavailable'].includes((await deletionStatus(subject)).state)) return mcp;
    mcp.registerTool(
      'get_privacy_policy',
      {
        description:
          'Read the public privacy policy and support contact, including health/location collection, cloud retention, deletion and copies held by AI providers. No data grant or user data is needed.',
        inputSchema: z.object({}).strict(),
        annotations: { readOnlyHint: true },
      },
      async () => ({
        content: [{ type: 'text', text: JSON.stringify(privacyPolicy) }],
        structuredContent: privacyPolicy,
      }),
    );
    mcp.registerTool(
      'get_lifetime_access',
      {
        description:
          'Check lifetime access and export allowance for this account, and guide eligible existing customers through a user-completed claim. This read does not consume an export or grant access. Sign-in and purchase verification require the user; call again to verify the resulting entitlement.',
        inputSchema: z.object({}).strict(),
      },
      async () => {
        await refreshEntitlement(subject);
        const allowance = billing.snapshot(subject);
        const result = {
          allowance,
          checkedAt: Date.now(),
          scope: 'authenticated-account',
          handoff: {
            status: allowance.unlocked ? 'completed' : 'awaiting_user',
            ...existingCustomerGuide(),
            requiresUser: !allowance.unlocked,
            verificationTool: 'get_lifetime_access',
            instructions:
              'Use the same account as this MCP connection when claiming and signing into myself.md.',
          },
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );
    mcp.registerTool(
      'create_phone_pairing',
      {
        description:
          'Generate a five-minute, one-use QR image. Scan with myself.md and sign in with this same account.',
        inputSchema: z.object({}),
      },
      async () => {
        const pairing = createPairing(subject);
        await registerTicket(pairing.ticket, subject, pairing.expires);
        const url = createPairingUrl(publicUrl, pairing.ticket);
        const png = await qrPng(url, { width: 512, margin: 4 });
        return {
          content: [
            { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
            {
              type: 'text',
              text: `Scan this QR with myself.md. View it in a browser: ${url}\nPairing ID: ${pairing.id}`,
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
    registerDataTools(mcp, subject, client);
    registerCloudTools(mcp, subject, client);
    registerSupportTools?.(mcp, subject, client);
    if (registerSupportV1Tools) registerSupportV1Tools(mcp, subject, client);
    return mcp;
  }
  const handler = toNodeHandler(
    createMcpHandler((ctx) => {
      const subject = ctx.authInfo?.extra?.subject;
      if (typeof subject !== 'string') throw new Error('Authentication required.');
      return makeMcp(subject, ctx.authInfo?.clientId ?? null);
    }),
  );
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', publicUrl);
      const requestOrigin =
        publicUrls.find((origin) => new URL(origin).host === req.headers.host) ?? publicUrl;
      const requestResource = `${requestOrigin}/mcp`;
      if (req.method === 'GET' || req.method === 'HEAD') {
        const limit = publicApiPath(url.pathname)
          ? limitPublicRead(req.socket.remoteAddress ?? 'unknown')
          : null;
        if (limit)
          for (const [name, value] of Object.entries(limit.headers)) res.setHeader(name, value);
        if (limit && !limit.allowed) {
          res.setHeader('Retry-After', limit.headers['RateLimit-Reset']);
          json(res, 429, {
            error: 'Public read rate limit exceeded. Retry after the indicated delay.',
          });
          return;
        }
        const page = publicResponse(
          url.pathname,
          req.headers.accept ?? '',
          issuer,
          requestResource,
          url.searchParams,
        );
        if (page) {
          res.writeHead(page.status, page.headers);
          res.end(req.method === 'HEAD' ? undefined : page.body);
          return;
        }
      }
      if (config.AUTH_PROXY === '1' && url.pathname.startsWith('/auth/')) {
        proxyAuth(req, res, url, new URL(issuer).origin);
        return;
      }
      const isApplication =
        url.pathname === '/mcp' ||
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/qr/');
      if (isApplication && config.WORKER_CUTOVER_MODE === 'freeze') {
        res.setHeader('Retry-After', '60');
        json(res, 503, { error: 'Cloud migration in progress. Retry shortly.' });
        return;
      }
      if (isApplication && config.WORKER_ORIGIN) {
        await proxyWorker(req, res, config.WORKER_ORIGIN);
        return;
      }
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
        json(res, 200, { ...metadata, resource: requestResource });
        return;
      }
      if (url.pathname === '/api/migration/proof' && req.method === 'POST') {
        const verified = await verifyMigrationPurchase(
          JSON.parse((await bodyBytes(req, 40000)).toString()),
        );
        const ticket = await createMigrationClaim(verified);
        res.setHeader('Cache-Control', 'no-store');
        json(res, 200, { claimUrl: `${requestOrigin}/claim#${ticket}` });
        return;
      }
      if (url.pathname === '/health') {
        json(res, 200, { ok: true });
        return;
      }
      if (
        (req.method === 'GET' || req.method === 'HEAD') &&
        (await dashboardAsset(url.pathname, res, issuer))
      )
        return;
      if (unknownPublicPath(url.pathname)) {
        res.writeHead(404, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'no-store',
          Vary: 'Accept',
        });
        res.end(req.method === 'HEAD' ? undefined : notFoundMarkdown);
        return;
      }
      if (url.pathname === '/dashboard/config') {
        json(res, 200, { issuer, clientId: 'myselfmd-dashboard' });
        return;
      }
      if (url.pathname === '/config') {
        json(res, 200, { issuer, clientId: 'myselfmd-phone', resource: requestResource });
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
          'Content-Security-Policy':
            "default-src 'none'; img-src 'self'; script-src 'unsafe-inline'",
        });
        res.end(pairingPage);
        return;
      }
      if (url.pathname.startsWith('/qr/')) {
        const ticket = url.pathname.slice(4);
        pending(ticket);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        res.end(await qrPng(createPairingUrl(publicUrl, ticket), { width: 512 }));
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
        if (url.pathname === '/api/cloud/uploads' && req.method === 'POST') {
          const input = JSON.parse(bytes.toString());
          const operationId = z.string().min(1).max(200).parse(input.manifest?.billingOperationId);
          billing.requireUpload(
            credential.subject,
            operationId,
            credential.profile,
            input.day,
            input.format,
          );
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
        } else if (
          /^\/api\/cloud\/uploads\/[a-f0-9-]+$/.test(url.pathname) &&
          req.method === 'PUT'
        ) {
          const uploadId = url.pathname.slice('/api/cloud/uploads/'.length);
          const uploadMetadata = cloud.metadata(cloud.row(credential.subject, uploadId));
          const operationId = z
            .string()
            .min(1)
            .max(200)
            .parse(uploadMetadata.manifest.billingOperationId);
          const row = cloud.row(credential.subject, uploadId);
          billing.requireUpload(
            credential.subject,
            operationId,
            credential.profile,
            row.day,
            row.format,
          );
          const result = await cloud.commit(
            credential.subject,
            credential.device,
            credential.profile,
            url.pathname.slice('/api/cloud/uploads/'.length),
            bytes,
            () => {
              cloud.credential(uploadToken);
              ownCloudDevice(credential.subject, credential.device);
              billing.requireUpload(
                credential.subject,
                operationId,
                credential.profile,
                row.day,
                row.format,
              );
            },
          );
          billing.complete(credential.subject, operationId);
          json(res, 200, result);
        } else json(res, 404, { error: 'Not found.' });
        return;
      }
      const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) {
        res.setHeader(
          'WWW-Authenticate',
          `Bearer resource_metadata="${requestOrigin}/.well-known/oauth-protected-resource/mcp"`,
        );
        json(res, 401, { error: 'OAuth sign-in required.' });
        return;
      }
      let payload;
      try {
        ({ payload } = await jwtVerify(token, jwks, { issuer, audience: resources }));
        // Keycloak used azp; RFC 9068 OAuth access tokens use client_id.
        payload.azp ??= payload.client_id;
      } catch {
        res.setHeader(
          'WWW-Authenticate',
          `Bearer error="invalid_token", resource_metadata="${requestOrigin}/.well-known/oauth-protected-resource/mcp"`,
        );
        json(res, 401, { error: 'Invalid or expired access token.' });
        return;
      }
      if (
        !payload.sub ||
        typeof payload.scope !== 'string' ||
        !payload.scope.split(' ').includes('myselfmd')
      ) {
        json(res, 403, { error: 'myselfmd scope required.' });
        return;
      }
      const subject = `${accountNamespace}|${payload.sub}`;
      if (url.pathname === '/api/account' && req.method === 'GET') {
        json(res, 200, await deletionStatus(subject));
        return;
      }
      if (url.pathname === '/api/account' && req.method === 'DELETE') {
        if (!['myselfmd-phone', 'myselfmd-dashboard'].includes(String(payload.azp)))
          throw new PairingError(403, 'Account owner confirmation required.');
        const input = z
          .object({ confirmation: z.literal('DELETE'), subject: z.literal(subject) })
          .strict()
          .parse(JSON.parse((await bodyBytes(req, 4096)).toString()));
        if (!accountApi)
          throw new PairingError(503, 'Account deletion requires the hosted identity service.');
        json(res, 200, await accountApi(input.subject, 'delete'));
        return;
      }
      if (
        url.pathname !== '/mcp' &&
        !['active', 'unavailable'].includes((await deletionStatus(subject)).state)
      )
        throw new PairingError(410, 'This account is being deleted or has been deleted.');

      if (url.pathname === '/api/v1/queries' || url.pathname.startsWith('/api/v1/queries/')) {
        if (
          typeof payload.azp !== 'string' ||
          ['myselfmd-phone', 'myselfmd-dashboard'].includes(payload.azp)
        )
          throw new PairingError(403, 'Agent OAuth client required.');
        cloud.observeAgent(subject, payload.azp);
        const quota = limitAgentRest(JSON.stringify([subject, payload.azp]));
        for (const [name, value] of Object.entries(quota.headers)) res.setHeader(name, value);
        if (!quota.allowed) {
          res.setHeader('Retry-After', quota.headers['RateLimit-Reset']);
          json(res, 429, { error: 'Agent REST rate limit exceeded. Honor Retry-After.' });
          return;
        }
        let name;
        let args;
        if (url.pathname === '/api/v1/queries' && req.method === 'POST') {
          const requestKey = z.string().min(1).max(200).parse(req.headers['idempotency-key']);
          const input = z
            .record(z.string(), z.unknown())
            .parse(JSON.parse((await bodyBytes(req, 16384)).toString()));
          if ('requestKey' in input) throw new PairingError(400, 'Use the Idempotency-Key header.');
          name = 'query_phone_data';
          args = { ...input, requestKey };
        } else if (req.method === 'GET' && url.pathname.startsWith('/api/v1/queries/')) {
          name = 'get_phone_request';
          args = {
            requestId: z.string().uuid().parse(url.pathname.slice('/api/v1/queries/'.length)),
          };
        } else {
          res.setHeader('Allow', url.pathname === '/api/v1/queries' ? 'POST' : 'GET');
          json(res, 405, { error: 'Method not allowed.' });
          return;
        }
        const server = await makeMcp(subject, payload.azp);
        const agent = new Client({ name: 'myself-rest-adapter', version: '1.0.0' });
        const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
        try {
          await server.connect(serverTransport);
          await agent.connect(clientTransport);
          const result = await agent.callTool({ name, arguments: args });
          if (result.isError) {
            json(res, 422, {
              error: result.content
                .filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join('\n'),
            });
          } else {
            const output = result.structuredContent;
            if (
              name === 'query_phone_data' &&
              output &&
              typeof output === 'object' &&
              'requestId' in output &&
              typeof output.requestId === 'string'
            )
              res.setHeader('Location', `/api/v1/queries/${output.requestId}`);
            json(res, name === 'query_phone_data' ? 202 : 200, output);
          }
        } finally {
          await agent.close();
          await server.close();
        }
        return;
      }

      if (url.pathname === '/api/migration/claim' && req.method === 'POST') {
        if (payload.azp !== 'myselfmd-dashboard' && payload.azp !== 'myselfmd-phone')
          throw new PairingError(403, 'First-party sign-in required.');
        const input = z
          .object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
          .parse(JSON.parse((await bodyBytes(req, 1024)).toString()));
        json(res, 200, await claimMigration(subject, input.ticket));
        return;
      }
      if (url.pathname === '/api/billing' && req.method === 'POST') {
        if (payload.azp !== 'myselfmd-phone')
          throw new PairingError(403, 'Phone OAuth client required.');
        json(
          res,
          200,
          await billingApi(subject, JSON.parse((await bodyBytes(req, 40000)).toString())),
        );
        return;
      }
      if (url.pathname === '/api/support/v1') {
        if (!['myselfmd-phone', 'myselfmd-dashboard'].includes(String(payload.azp)))
          throw new PairingError(403, 'Use the support MCP tools with an agent client.');
        if (!supportV1Api) throw new PairingError(503, 'Isobot support is not configured.');
        const input =
          req.method === 'POST' ? JSON.parse((await bodyBytes(req, 200000)).toString()) : null;
        json(res, 200, await supportV1Api(subject, req.method ?? 'GET', url.searchParams, input));
        return;
      }
      if (url.pathname === '/api/support') {
        if (!['myselfmd-phone', 'myselfmd-dashboard'].includes(String(payload.azp)))
          throw new PairingError(403, 'Use the support MCP tools with an agent client.');
        if (!supportApi) throw new PairingError(503, 'Support chat is not configured yet.');
        const body =
          req.method === 'POST' || req.method === 'PUT'
            ? JSON.parse((await bodyBytes(req, 16384)).toString())
            : null;
        json(res, 200, await supportApi(subject, req.method ?? 'GET', url.searchParams, body));
        return;
      }
      if (url.pathname === '/api/dashboard' || url.pathname.startsWith('/api/dashboard/')) {
        if (payload.azp !== 'myselfmd-dashboard')
          throw new PairingError(403, 'Dashboard OAuth client required.');
        const body =
          req.method === 'PUT' || req.method === 'POST'
            ? JSON.parse((await bodyBytes(req, 16384)).toString())
            : null;
        json(
          res,
          200,
          await dashboardApi(
            subject,
            String(payload.preferred_username ?? payload.sub),
            url.pathname,
            req.method ?? 'GET',
            url.searchParams,
            body,
          ),
        );
        return;
      }
      if (url.pathname === '/api/history' && req.method === 'POST') {
        if (payload.azp !== 'myselfmd-phone')
          throw new PairingError(403, 'Phone OAuth client required.');
        const input = z
          .object({ deviceId: z.string().uuid(), events: z.array(z.unknown()).max(50) })
          .parse(JSON.parse((await bodyBytes(req, 1024 * 1024)).toString()));
        ownCloudDevice(subject, input.deviceId);
        const events = input.events.map(parseHistoryEvent);
        for (const event of events) {
          const previous = history.get(subject, event.id);
          if (
            event.kind !== 'export' ||
            event.actor === 'agent' ||
            (previous && (previous.device !== input.deviceId || previous.event.kind !== 'export'))
          )
            throw new PairingError(400, 'Invalid phone export history.');
        }
        for (const event of events) {
          const previous = history.get(subject, event.id);
          if (!previous || Date.parse(event.updatedAt) >= Date.parse(previous.event.updatedAt))
            history.record(subject, input.deviceId, {
              ...event,
              artifacts: event.artifacts.map((a) => Object.assign({}, a, { uri: null })),
            });
        }
        json(res, 200, { ok: true });
        return;
      }
      if (url.pathname === '/api/history' && req.method === 'GET') {
        if (payload.azp !== 'myselfmd-phone')
          throw new PairingError(403, 'Phone OAuth client required.');
        const deviceId = z.string().uuid().parse(url.searchParams.get('deviceId'));
        ownCloudDevice(subject, deviceId);
        json(
          res,
          200,
          history.list(subject, deviceId, Number(url.searchParams.get('offset') ?? 0)),
        );
        return;
      }
      if (url.pathname.startsWith('/api/cloud/')) {
        if (payload.azp !== 'myselfmd-phone')
          throw new PairingError(403, 'Cloud management requires the phone OAuth client.');
        if (url.pathname === '/api/cloud/credential/renew' && req.method === 'POST') {
          const input = z
            .object({
              deviceId: z.string().uuid(),
              profileId: z.string().min(1).max(100),
              token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
              expiresAt: z.number().int().positive(),
            })
            .parse(JSON.parse((await bodyBytes(req, 16384)).toString()));
          ownCloudDevice(subject, input.deviceId);
          const result = cloud.renewAuthorization(
            subject,
            input.deviceId,
            input.profileId,
            input.token,
            input.expiresAt,
          );
          await registerTicket(input.token, subject, result.expiresAt + 86400000);
          json(res, 200, result);
          return;
        }
        if (url.pathname === '/api/cloud/exports' && req.method === 'GET') {
          json(res, 200, cloud.list(subject));
          return;
        }
        if (url.pathname.startsWith('/api/cloud/exports/') && req.method === 'DELETE') {
          json(
            res,
            200,
            await cloud.delete(subject, url.pathname.slice('/api/cloud/exports/'.length)),
          );
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
        if (url.pathname === '/api/cloud/credential' && req.method === 'POST') {
          const uploadCredential = cloud.authorize(subject, input.deviceId, profile);
          await registerTicket(uploadCredential, subject, Date.now() + 86400000 * 31);
          json(res, 200, { token: uploadCredential });
        } else if (url.pathname === '/api/cloud/access' && req.method === 'PUT')
          json(res, 200, cloud.access(subject, input.deviceId, profile, input.shared ?? false));
        else if (url.pathname === '/api/cloud/access' && req.method === 'POST')
          json(res, 200, cloud.permission(subject, input.deviceId, id));
        else json(res, 404, { error: 'Not found.' });
        return;
      }
      if (url.pathname === '/mcp') {
        if (
          typeof payload.azp !== 'string' ||
          ['myselfmd-phone', 'myselfmd-dashboard'].includes(payload.azp)
        )
          throw new PairingError(403, 'Agent OAuth client required.');
        if (['active', 'unavailable'].includes((await deletionStatus(subject)).state))
          cloud.observeAgent(subject, payload.azp);
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
        payload.azp !== 'myselfmd-phone'
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
  };
}
