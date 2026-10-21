import { chatgptMcpPath } from '../server/chatgpt-tools.js';
import { accountLogins, connectedAccountsPage } from '../server/account-links.js';
import { revokeAppleToken } from '../server/apple-revocation.js';
import { decryptOAuthToken } from 'better-auth/oauth2';
import { PairingError } from '../server/errors.js';
import { importPKCS8, SignJWT } from 'jose';
import { createIdentity } from '../server/identity.js';
import { recordPhoneTokenExchange } from '../server/auth-diagnostics.js';
import { readBytes } from './request.js';
import { z } from 'zod';
import { reviewerLoginPage, reviewerUserId } from '../server/reviewer.js';
import { identityPageStyles } from '../server/identity-page-style.js';
import { providerLogos } from '../server/provider-logos.js';

/** @param {Env} env */
async function identity(env) {
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
    resources: [`${env.PUBLIC_URL}/mcp`, `${env.PUBLIC_URL}${chatgptMcpPath}`],
    googleId: env.GOOGLE_AUTH_CLIENT_ID,
    googleSecret: env.GOOGLE_AUTH_CLIENT_SECRET,
    githubId: env.GITHUB_AUTH_CLIENT_ID,
    githubSecret: env.GITHUB_AUTH_CLIENT_SECRET,
    appleId: env.APPLE_AUTH_CLIENT_ID,
    appleSecret: secret,
    reviewerEnabled: env.REVIEWER_LOGIN_ENABLED === '1',
  });
  // Keep the adapter and its initialization promises inside the current request.
  // A canceled request must not leave later requests awaiting its unfinished D1 I/O.
  const context = await auth.$context;
  await context.checkSchema?.();
  return auth;
}
/** Internal signature verification must not use the public HTTP rate-limit bucket.
 * The provider API retains the same published-key selection and rotation policy.
 * @param {Env} env */
export async function identityJwks(env) {
  const auth = await identity(env);
  const api =
    /** @type {typeof auth.api & {getJwks:(options:{asResponse:true})=>Promise<Response>}} */ (
      auth.api
    );
  return api.getJwks({ asResponse: true });
}
/** @param {string} value */
function escape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
/** @param {string} title @param {string} content @param {string[]} [formDestinations] @param {string} [styles] */
function page(title, content, formDestinations = [], styles = '') {
  const nonce = styles ? crypto.randomUUID() : '';
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · myself.md</title>${styles ? `<style nonce="${nonce}">${styles}</style>` : ''}</head><body>${styles ? '<header class="brand">myself<span>.md</span></header>' : ''}<main><h1>${escape(title)}</h1>${content}</main></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        // Keep the Origin header on same-origin form POSTs without leaking OAuth queries externally.
        'Referrer-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': `default-src 'none'; ${nonce ? `style-src 'nonce-${nonce}'; ` : ''}form-action 'self' ${formDestinations.join(' ')}; base-uri 'none'; frame-ancestors 'none'`,
      },
    },
  );
}
/** @param {Request} request @param {Env} env */
export async function identityRequest(request, env) {
  const url = new URL(request.url);
  const base = new URL(env.OAUTH_ISSUER).pathname;
  const path = url.pathname.slice(base.length);
  if (path === '/error') {
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const error = url.searchParams.get('error');
    const title =
      error === 'account_not_linked'
        ? 'Connect your sign-in method'
        : error === 'state_mismatch'
          ? 'Start a new sign-in attempt'
          : 'Sign-in could not finish';
    const guidance =
      error === 'account_not_linked'
        ? '<p class="intro">An account already exists with this email, but this sign-in method is not connected to it.</p><section class="permissions" aria-labelledby="recovery-title"><h2 id="recovery-title">How to connect it</h2><div class="permission-detail"><h3>Sign in with your original method</h3><p>Use the Apple, Google or GitHub login you used to create your account.</p></div><div class="permission-detail"><h3>Open Connected logins</h3><p>From your dashboard account menu, open Connected logins and connect the provider you want to use.</p></div></section><p class="decision-note">Matching email addresses never connect accounts automatically.</p>'
        : error === 'state_mismatch'
          ? '<p class="intro">This sign-in attempt could not be verified. It may have expired, already been used, or been replaced by another attempt.</p><section class="permissions" aria-labelledby="recovery-title"><h2 id="recovery-title">Try a fresh attempt</h2><div class="permission-detail"><h3>Keep sign-in in one browser</h3><p>Start again below and complete sign-in within 15 minutes. Use one sign-in tab at a time and allow cookies for myself.md.</p></div></section><p class="decision-note">If you started from the app or an AI agent, restart sign-in there to continue that connection.</p>'
          : '<p class="intro">We could not complete sign-in. Start a fresh attempt, or return to the app or AI agent that opened sign-in.</p>';
    return page(
      title,
      `${guidance}${error === 'state_mismatch' ? '<p class="decision-note">Close this window and start sign-in again in the app or AI agent that opened it.</p>' : '<a class="action-link primary" href="/login">Try sign-in again</a>'}<nav class="sign-in-footer" aria-label="Other options"><a href="/">Back to myself.md</a></nav>`,
      [],
      identityPageStyles,
    );
  }
  const auth = await identity(env);
  if (path === '/reviewer-login') {
    const client = await env.IDENTITY.prepare(
      'SELECT redirectUris FROM oauthClient WHERE clientId=?',
    )
      .bind(url.searchParams.get('client_id') ?? '')
      .first();
    const redirect = url.searchParams.get('redirect_uri');
    const registered = z.array(z.string()).parse(JSON.parse(String(client?.redirectUris ?? '[]')));
    // Chromium checks redirects after form POSTs too; query text alone grants no destination.
    const callback = redirect && registered.includes(redirect) ? new URL(redirect) : null;
    const bounded =
      request.method === 'POST'
        ? new Request(request, { method: 'POST', body: await readBytes(request, 16384) })
        : request;
    return reviewerLoginPage(
      bounded,
      auth,
      await reviewerActive(env),
      callback ? [callback.origin === 'null' ? callback.protocol : callback.origin] : [],
    );
  }
  if (path === '/connected-accounts') {
    const ownershipIndex = await env.IDENTITY.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='account_provider_identity_unique'",
    ).first();
    if (!ownershipIndex)
      return Response.json(
        {
          error:
            'Connected logins are unavailable until the identity ownership migration is applied.',
        },
        { status: 503 },
      );
    const boundedRequest =
      request.method === 'POST'
        ? new Request(request, { method: 'POST', body: await readBytes(request, 4096) })
        : request;
    return connectedAccountsPage(boundedRequest, auth, {
      issuer: env.OAUTH_ISSUER,
      namespace: env.ACCOUNT_NAMESPACE || env.OAUTH_ISSUER,
      available: availableLogins(env),
    });
  }
  if (path === '/login' || path === '/consent') {
    if (request.method === 'GET') {
      const query = escape(url.search.slice(1));
      if (path === '/login')
        return page(
          'Sign in to myself.md',
          `<p class="intro">Use the same account as the myself.md app to keep your exports and purchases together.</p><form class="sign-in-form" method="post"><input type="hidden" name="oauth_query" value="${query}"><button class="secondary" type="submit" name="provider" value="apple">${providerLogos.apple}<span>Continue with Apple</span></button><button class="secondary" type="submit" name="provider" value="github">${providerLogos.github}<span>Continue with GitHub</span></button><button class="secondary" type="submit" name="provider" value="google">${providerLogos.google}<span>Continue with Google</span></button></form><nav class="sign-in-footer" aria-label="Other sign-in options"><a href="${base}/reviewer-login?${query}">Reviewer sign-in</a><a href="/">Back to myself.md</a></nav>`,
          ['https://appleid.apple.com', 'https://github.com', 'https://accounts.google.com'],
          identityPageStyles,
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
        `<p class="intro"><strong>${escape(typeof client?.name === 'string' ? client.name : 'This application')}</strong> requests access to your myself.md account.</p>
        <section class="permissions" aria-labelledby="permissions-title">
          <h2 id="permissions-title">Requested permissions</h2>
          <p class="scope">${escape(url.searchParams.get('scope')?.trim() || 'No additional permissions requested.')}</p>
          <div class="permission-detail"><h3>Your sharing choices stay in place</h3><p>This application can receive data from profiles you have already approved for agent access, including shared cloud exports. Your existing device selections and data grants still limit what it can read.</p></div>
          <div class="permission-detail"><h3>AI providers may keep copies</h3><p>Your approved data can reach this application and any AI providers it uses. They use their own privacy and retention policies. Revoking access stops future reads; it cannot recall copies already received.</p></div>
          <div class="permission-detail"><h3>Queries use your export allowance</h3><p>Agent queries count toward your export allowance.</p></div>
        </section>
        <p class="decision-note">Only allow access if you trust this application and its data policies. <a href="/privacy">Read the myself.md privacy policy</a>.</p>
        <form method="post"><input type="hidden" name="oauth_query" value="${query}"><button class="primary" type="submit" name="accept" value="true">Allow access</button><button class="secondary" type="submit" name="accept" value="false">Cancel</button></form>`,
        callback ? [callback.origin === 'null' ? callback.protocol : callback.origin] : [],
        identityPageStyles,
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
    if (path === '/login' && !['apple', 'github', 'google'].includes(provider ?? ''))
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
    ['/broker/google/endpoint', '/callback/google'],
  ]);
  const targetPath = aliases.get(path) ?? path;
  if (targetPath === '/sign-in/email' && !(await reviewerActive(env)))
    return Response.json({ error: 'Reviewer access is unavailable.' }, { status: 404 });
  if (
    ![
      '/.well-known/openid-configuration',
      '/.well-known/oauth-authorization-server',
      '/jwks',
      '/sign-in/social',
      '/sign-in/email',
      '/callback/github',
      '/callback/apple',
      '/callback/google',
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
      '/oauth2/end-session/confirm',
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
      .object({
        redirect_uris: z.array(z.url()).min(1).max(8),
        application_type: z.enum(['web', 'native']).optional(),
      })
      .passthrough()
      .parse(JSON.parse(new TextDecoder().decode(body)));
    const hosts = new Set(['localhost', '127.0.0.1', 'chatgpt.com', 'claude.ai', 'grok.com']);
    if (
      registration.redirect_uris.some((uri) => {
        const callback = new URL(uri);
        return (
          (!hosts.has(callback.hostname) &&
            callback.href !== 'https://connect.smithery.ai/oauth/callback' &&
            callback.href !== 'https://connect.vercel.com/callback' &&
            callback.origin !== 'https://zapier.com' &&
            callback.origin !== 'https://glama.ai') ||
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
    ) {
      return Response.json({ error: 'Unsupported client callback.' }, { status: 400 });
    }
    if (
      registration.application_type === undefined &&
      registration.redirect_uris.some((uri) => {
        const callback = new URL(uri);
        return (
          callback.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(callback.hostname)
        );
      })
    ) {
      // An omitted type defaults to web in the provider, which rejects even allowed loopback callbacks.
      // Classify that callback shape as native; preserve every URI and explicit client declaration.
      body = new TextEncoder().encode(
        JSON.stringify({ ...registration, application_type: 'native' }),
      );
    }
  }
  if (targetPath === '/oauth2/authorize') {
    const client = url.searchParams.get('client_id');
    if (client === 'myselfmd-phone' || client === 'myselfmd-dashboard') {
      if (!url.searchParams.has('resource'))
        url.searchParams.set('resource', `${env.PUBLIC_URL}/mcp`);
      const scopes = new Set((url.searchParams.get('scope') ?? '').split(' ').filter(Boolean));
      scopes.add('offline_access');
      url.searchParams.set('scope', [...scopes].join(' '));
    }
  }
  url.pathname = base + targetPath;
  const response = await auth.handler(
    new Request(url, { method: request.method, headers, ...(body ? { body } : {}) }),
  );
  if (
    targetPath === '/oauth2/token' &&
    body &&
    new URLSearchParams(new TextDecoder().decode(body)).get('client_id') === 'myselfmd-phone'
  )
    recordPhoneTokenExchange(response.status);
  if (
    ['/oauth2/end-session', '/oauth2/end-session/confirm'].includes(targetPath) &&
    response.headers.get('content-type')?.includes('text/html')
  ) {
    return logoutPage(response);
  }
  // Browser clients use both the OAuth endpoint and the legacy native/dashboard alias.
  if (
    targetPath === '/oauth2/authorize' &&
    response.status === 200 &&
    (path === '/protocol/openid-connect/auth' ||
      request.headers.get('sec-fetch-mode') === 'navigate' ||
      request.headers.get('accept')?.includes('text/html'))
  ) {
    const result = /** @type {{redirect?:boolean,url?:string}} */ (await response.clone().json());
    if (result.redirect && result.url) {
      const redirectHeaders = new Headers(response.headers);
      redirectHeaders.set('Location', result.url);
      redirectHeaders.set('Cache-Control', 'no-store');
      return new Response(null, { status: 302, headers: redirectHeaders });
    }
  }
  return response;
}

/** Style the provider's browser result while retaining its form, cookies and protocol decisions.
 * @param {Response} response */
function logoutPage(response) {
  const nonce = crypto.randomUUID();
  const headers = new Headers(response.headers);
  headers.set(
    'Content-Security-Policy',
    `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  );
  headers.set('Referrer-Policy', 'same-origin');
  headers.delete('Content-Length');
  const footer =
    '<nav class="sign-in-footer" aria-label="Other options"><a href="/">Back to myself.md</a></nav>';
  return new HTMLRewriter()
    .on('html', {
      element: (element) => {
        element.setAttribute('lang', 'en');
      },
    })
    .on('title', {
      element: (element) => {
        element.setInnerContent('Sign out · myself.md');
      },
    })
    .on('head', {
      element: (element) => {
        element.append(
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style nonce="${nonce}">${identityPageStyles}
        .logout-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: 24px; border: 1px solid var(--border); border-radius: 14px; background: var(--inset); }
        .logout-actions .action-link { margin: 0; }
        .logout-note { margin: 0 0 24px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--inset); color: var(--muted); font-size: 13px; line-height: 1.6; }
        </style>`,
          { html: true },
        );
      },
    })
    .on('body', {
      element: (element) => {
        element.prepend('<header class="brand">myself<span>.md</span></header>', { html: true });
      },
    })
    .on('main', {
      element: (element) => {
        element.prepend(
          '<div class="logout-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H5v14h4M14 8l4 4-4 4M9 12h9"/></svg></div>',
          { html: true },
        );
        element.append(footer, { html: true });
      },
    })
    .on('h1', {
      element: (element) => {
        element.setInnerContent(
          response.ok ? 'Sign out of myself.md?' : 'Sign-out could not finish',
        );
      },
    })
    .on('main > p', {
      element: (element) => {
        element.setAttribute('class', 'intro');
      },
    })
    .on('form[data-oidc-logout-confirmation]', {
      element: (element) => {
        element.setAttribute('class', 'logout-actions');
        element.before(
          '<p class="logout-note">Signing out won’t delete your account or saved exports.</p>',
          { html: true },
        );
        element.append('<a class="action-link secondary" href="/dashboard">Cancel</a>', {
          html: true,
        });
      },
    })
    .on('form[data-oidc-logout-confirmation] button', {
      element: (element) => {
        element.setAttribute('class', 'primary');
        element.setInnerContent('Sign out');
      },
    })
    .on('[data-oidc-logout-state="logged-out"]', {
      element: (element) => {
        element.before('<h1>You’re signed out</h1>', { html: true });
        element.after('<a class="action-link primary" href="/login">Sign in again</a>', {
          html: true,
        });
      },
    })
    .on('[data-oidc-logout-state="error"]', {
      element: (element) => {
        element.after('<a class="action-link primary" href="/dashboard">Back to dashboard</a>', {
          html: true,
        });
      },
    })
    .transform(new Response(response.body, { status: response.status, headers }));
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
  await env.IDENTITY.batch([
    env.IDENTITY.prepare(
      `DELETE FROM verification WHERE CASE WHEN json_valid(value) THEN
        (json_extract(value,'$.type')='authorization_code' AND (
          (json_type(value,'$.userId')='text' AND json_extract(value,'$.userId')=?) OR
          (json_type(value,'$.sessionId')='text' AND json_extract(value,'$.sessionId') IN
            (SELECT id FROM session WHERE userId=?))
        )) OR (
          json_type(value,'$.oauthState')='text' AND
          identifier='auth-state:' || json_extract(value,'$.oauthState') AND
          json_type(value,'$.callbackURL')='text' AND
          json_type(value,'$.codeVerifier')='text' AND
          json_type(value,'$.expiresAt') IN ('integer','real') AND
          json_type(value,'$.link')='object' AND
          json_type(value,'$.link.email')='text' AND
          json_type(value,'$.link.userId')='text' AND json_extract(value,'$.link.userId')=?
        ) ELSE 0 END`,
    ).bind(id, id, id),
    env.IDENTITY.prepare('DELETE FROM "user" WHERE id=?').bind(id),
  ]);
}

/** @param {Env} env */
function availableLogins(env) {
  return [
    'apple',
    'github',
    ...(env.GOOGLE_AUTH_CLIENT_ID && env.GOOGLE_AUTH_CLIENT_SECRET ? ['google'] : []),
  ];
}
/** Read only provider names for the authenticated account; never expose credentials or provider subjects.
 * @param {Env} env @param {string} subject */
export async function identityLogins(env, subject) {
  if (env.IDENTITY_ENABLED !== '1')
    throw new PairingError(503, 'Connected logins require the hosted identity service.');
  const namespace = env.ACCOUNT_NAMESPACE || env.OAUTH_ISSUER;
  if (!subject.startsWith(`${namespace}|`)) throw new PairingError(403, 'Invalid account.');
  const userId = subject.slice(namespace.length + 1);
  const user = await env.IDENTITY.prepare('SELECT id FROM user WHERE id=?').bind(userId).first();
  if (!user) throw new PairingError(410, 'Account no longer exists.');
  const rows = await env.IDENTITY.prepare('SELECT providerId FROM account WHERE userId=?')
    .bind(userId)
    .all();
  if (userId === reviewerUserId)
    return {
      ...accountLogins(env.OAUTH_ISSUER, subject, [], []),
      kind: 'reviewer',
      socialLinkingAllowed: false,
    };
  return accountLogins(
    env.OAUTH_ISSUER,
    subject,
    rows.results.map((row) => String(row.providerId)),
    availableLogins(env),
  );
}

/** Revocation is checked at the resource boundary, including already-issued JWTs.
 * @param {Env} env @param {number} [issuedAt] */
export async function reviewerActive(env, issuedAt) {
  if (env.REVIEWER_LOGIN_ENABLED !== '1') return false;
  const row = await env.IDENTITY.prepare(
    'SELECT enabled, token_valid_after FROM reviewer_access WHERE user_id=?',
  )
    .bind(reviewerUserId)
    .first();
  return (
    row?.enabled === 1 && (issuedAt === undefined || issuedAt >= Number(row.token_valid_after))
  );
}
