import { revokeAppleToken } from '../server/apple-revocation.js';
import { decryptOAuthToken } from 'better-auth/oauth2';
import { PairingError } from '../server/errors.js';
import { importPKCS8, SignJWT } from 'jose';
import { createIdentity } from '../server/identity.js';
import { readBytes } from './request.js';
import { z } from 'zod';

/** @type {WeakMap<object, {auth:ReturnType<typeof createIdentity>,expires:number}>} */
const instances = new WeakMap();
/** @param {Env} env */
async function identity(env) {
  const existing = instances.get(env.IDENTITY);
  if (existing && existing.expires > Date.now()) return existing.auth;
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_AUTH_KEY_ID })
    .setIssuer(env.APPLE_AUTH_TEAM_ID)
    .setSubject(env.APPLE_AUTH_CLIENT_ID)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await importPKCS8(env.APPLE_AUTH_PRIVATE_KEY, 'ES256'));
  const auth = createIdentity(env.IDENTITY, {
    issuer: env.OAUTH_ISSUER,
    secret: env.IDENTITY_SECRET,
    resource: `${env.PUBLIC_URL}/mcp`,
    githubId: env.GITHUB_AUTH_CLIENT_ID,
    githubSecret: env.GITHUB_AUTH_CLIENT_SECRET,
    appleId: env.APPLE_AUTH_CLIENT_ID,
    appleSecret: secret,
  });
  // Rotate Apple's short-lived client assertion before expiry in a warm isolate.
  instances.set(env.IDENTITY, { auth, expires: Date.now() + 45 * 60 * 1000 });
  return auth;
}
/** @param {string} value */
function escape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
/** @param {string} title @param {string} content @param {string[]} [formDestinations] */
function page(title, content, formDestinations = []) {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · myself.md</title><body><main><h1>${escape(title)}</h1>${content}</main></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        // Keep the Origin header on same-origin form POSTs without leaking OAuth queries externally.
        'Referrer-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': `default-src 'none'; form-action 'self' ${formDestinations.join(' ')}; base-uri 'none'; frame-ancestors 'none'`,
      },
    },
  );
}
/** @param {Request} request @param {Env} env */
export async function identityRequest(request, env) {
  const auth = await identity(env);
  const url = new URL(request.url);
  const base = new URL(env.OAUTH_ISSUER).pathname;
  const path = url.pathname.slice(base.length);
  if (path === '/login' || path === '/consent') {
    if (request.method === 'GET') {
      const query = escape(url.search.slice(1));
      if (path === '/login')
        return page(
          'Sign in to myself.md',
          `<p>Use your existing Apple or GitHub account to keep your exports and purchases.</p><form method="post"><input type="hidden" name="oauth_query" value="${query}"><button name="provider" value="apple">Continue with Apple</button><button name="provider" value="github">Continue with GitHub</button></form>`,
          ['https://appleid.apple.com', 'https://github.com'],
        );
      const client = await env.IDENTITY.prepare(
        'SELECT name, redirectUris FROM oauthClient WHERE clientId=?',
      )
        .bind(url.searchParams.get('client_id') ?? '')
        .first();
      const redirect = url.searchParams.get('redirect_uri');
      const registered = z
        .array(z.string())
        .parse(JSON.parse(String(client?.redirectUris ?? '[]')));
      // Chromium checks the form's redirect too. Trust registered callbacks, never query text alone.
      const callback = redirect && registered.includes(redirect) ? new URL(redirect) : null;
      return page(
        'Connect this application?',
        `<p>${escape(typeof client?.name === 'string' ? client.name : 'This application')} requests access to your myself.md account.</p><p>Requested permissions: ${escape(url.searchParams.get('scope') ?? '')}. Your existing device selections and data grants still apply. Agent queries count toward your export allowance.</p><form method="post"><input type="hidden" name="oauth_query" value="${query}"><button name="accept" value="true">Allow access</button><button name="accept" value="false">Cancel</button></form>`,
        callback ? [callback.origin === 'null' ? callback.protocol : callback.origin] : [],
      );
    }
    if (
      request.method !== 'POST' ||
      request.headers.get('origin') !== new URL(env.PUBLIC_URL).origin
    ) {
      return Response.json({ error: 'Invalid sign-in request.' }, { status: 403 });
    }
    const form = new URLSearchParams(new TextDecoder().decode(await readBytes(request, 16384)));
    const provider = form.get('provider');
    if (path === '/login' && provider !== 'apple' && provider !== 'github')
      return Response.json({ error: 'Unsupported provider.' }, { status: 400 });
    const target = new URL(
      env.OAUTH_ISSUER + (path === '/login' ? '/sign-in/social' : '/oauth2/consent'),
    );
    const headers = new Headers(request.headers);
    headers.set('Content-Type', 'application/json');
    const response = await auth.handler(
      new Request(target, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          oauth_query: form.get('oauth_query') ?? '',
          ...(path === '/login'
            ? { provider, callbackURL: `${env.PUBLIC_URL}/dashboard` }
            : { accept: form.get('accept') === 'true' }),
        }),
      }),
    );
    if (!response.ok || response.status === 302) return response;
    const result = /** @type {{url?:string,redirect_uri?:string}} */ (await response.json());
    const location = result.url ?? result.redirect_uri;
    if (!location) return Response.json({ error: 'Sign-in could not continue.' }, { status: 400 });
    const resultHeaders = new Headers(response.headers);
    resultHeaders.set('Location', location);
    resultHeaders.set('Cache-Control', 'no-store');
    return new Response(null, { status: 302, headers: resultHeaders });
  }
  const aliases = new Map([
    ['/protocol/openid-connect/auth', '/oauth2/authorize'],
    ['/protocol/openid-connect/token', '/oauth2/token'],
    ['/protocol/openid-connect/certs', '/jwks'],
    ['/protocol/openid-connect/userinfo', '/oauth2/userinfo'],
    ['/protocol/openid-connect/logout', '/oauth2/end-session'],
    ['/clients-registrations/openid-connect', '/oauth2/register'],
    ['/broker/github/endpoint', '/callback/github'],
    ['/broker/apple/endpoint', '/callback/apple'],
  ]);
  const targetPath = aliases.get(path) ?? path;
  if (
    ![
      '/.well-known/openid-configuration',
      '/.well-known/oauth-authorization-server',
      '/jwks',
      '/sign-in/social',
      '/callback/github',
      '/callback/apple',
      '/get-session',
      '/sign-out',
      '/oauth2/authorize',
      '/oauth2/token',
      '/oauth2/register',
      '/oauth2/consent',
      '/oauth2/continue',
      '/oauth2/userinfo',
      '/oauth2/revoke',
      '/oauth2/end-session',
    ].includes(targetPath)
  )
    return Response.json({ error: 'Not found.' }, { status: 404 });
  let body;
  const headers = new Headers(request.headers);
  if (request.method === 'POST') {
    body = await readBytes(request, 65536);
    headers.delete('Content-Length');
  }
  if (targetPath === '/oauth2/register' && body) {
    const registration = z
      .object({ redirect_uris: z.array(z.url()).min(1).max(8) })
      .parse(JSON.parse(new TextDecoder().decode(body)));
    const hosts = new Set(['localhost', '127.0.0.1', 'chatgpt.com', 'claude.ai', 'grok.com']);
    if (
      registration.redirect_uris.some((uri) => {
        const callback = new URL(uri);
        return (
          !hosts.has(callback.hostname) ||
          callback.username ||
          callback.password ||
          callback.hash ||
          (callback.protocol !== 'https:' &&
            !(
              callback.protocol === 'http:' &&
              ['localhost', '127.0.0.1'].includes(callback.hostname)
            ))
        );
      })
    )
      return Response.json({ error: 'Unsupported client callback.' }, { status: 400 });
  }
  if (targetPath === '/oauth2/authorize') {
    const client = url.searchParams.get('client_id');
    if (client === 'qr-phone' || client === 'qr-dashboard') {
      if (!url.searchParams.has('resource'))
        url.searchParams.set('resource', `${env.PUBLIC_URL}/mcp`);
      const scopes = new Set((url.searchParams.get('scope') ?? '').split(' ').filter(Boolean));
      scopes.add('offline_access');
      url.searchParams.set('scope', [...scopes].join(' '));
    }
  }
  url.pathname = base + targetPath;
  let response = await auth.handler(
    new Request(url, { method: request.method, headers, ...(body ? { body } : {}) }),
  );
  // The existing native/dashboard authorization URL is a browser handoff.
  if (path === '/protocol/openid-connect/auth' && response.status === 200) {
    const result = /** @type {{redirect?:boolean,url?:string}} */ (await response.clone().json());
    if (result.redirect && result.url) {
      const redirectHeaders = new Headers(response.headers);
      redirectHeaders.set('Location', result.url);
      redirectHeaders.set('Cache-Control', 'no-store');
      return new Response(null, { status: 302, headers: redirectHeaders });
    }
  }
  if (targetPath === '/jwks' && response.ok && env.LEGACY_IDENTITY_JWKS) {
    const current = /** @type {{keys:unknown[]}} */ (await response.json());
    const legacy = /** @type {{keys:unknown[]}} */ (JSON.parse(env.LEGACY_IDENTITY_JWKS));
    response = Response.json(
      { keys: [...current.keys, ...legacy.keys] },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  }
  return response;
}

/** Revoke Apple's stored grant before removing the identity and all cascading OAuth records.
 * @param {Env} env @param {string} subject */
export async function deleteIdentity(env, subject) {
  if (env.IDENTITY_ENABLED !== '1')
    throw new PairingError(503, 'Account deletion requires the hosted identity service.');
  const id = subject.slice(subject.indexOf('|') + 1);
  const auth = await identity(env);
  const context = await auth.$context;
  const accounts = await context.internalAdapter.findAccounts(id);
  await accounts
    .filter((account) => account.providerId === 'apple')
    .reduce(async (previous, account) => {
      await previous;
      const stored = account.refreshToken ?? account.accessToken;
      if (!stored)
        throw new PairingError(
          409,
          'Sign in with Apple again to authorize token revocation, then retry deletion.',
        );
      const token = await decryptOAuthToken(stored, context);
      const provider = context.socialProviders.find((value) => value.id === 'apple');
      if (!provider) throw new Error('Apple provider is unavailable.');
      await revokeAppleToken({
        clientId: env.APPLE_AUTH_CLIENT_ID,
        clientSecret: String(provider.options?.clientSecret),
        token,
        hint: account.refreshToken ? 'refresh_token' : 'access_token',
      });
    }, Promise.resolve());
  await env.IDENTITY.prepare('DELETE FROM "user" WHERE id=?').bind(id).run();
}
