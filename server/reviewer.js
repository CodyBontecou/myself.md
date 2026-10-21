import { randomUUID } from 'node:crypto';
import { identityPageStyles } from './identity-page-style.js';

/** Reserved application identity; never reuse or link a person's social identity. */
export const reviewerUserId = 'myselfmd-directory-reviewer-v1';
export const reviewerEmail = 'reviewer@myself.invalid';

/** Password entry is an owner/reviewer browser handoff, not an MCP credential input.
 * @param {Request} request @param {ReturnType<import('./identity.js').createIdentity>} auth
 * @param {boolean} enabled @param {string[]} [formDestinations] Server-validated OAuth callback sources. */
export async function reviewerLoginPage(request, auth, enabled, formDestinations = []) {
  if (!enabled) return Response.json({ error: 'Reviewer access is unavailable.' }, { status: 404 });
  const url = new URL(request.url);
  const base = url.pathname.replace(/\/reviewer-login$/, '');
  const headers = {
    'Cache-Control': 'no-store',
    // Preserve Origin on same-origin form posts; reject null and foreign origins.
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Content-Type': 'text/html; charset=utf-8',
  };
  const query = url.search
    .slice(1)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
  if (request.method === 'GET') {
    const nonce = randomUUID();
    return new Response(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Reviewer sign-in · myself.md</title><style nonce="${nonce}">${identityPageStyles}
        .reviewer-label { margin: 0 0 12px; color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase; }
        .reviewer-form { gap: 20px; }
        .reviewer-form label { display: grid; gap: 8px; font-size: 13px; font-weight: 600; }
        .reviewer-form input { width: 100%; min-height: 48px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--foreground); font: inherit; font-size: 16px; font-weight: 400; }
        .reviewer-form input:focus-visible { outline: 2px solid var(--foreground); outline-offset: 3px; }
        .reviewer-notice { margin-top: 24px; padding: 16px; border-radius: 10px; background: var(--inset); border: 1px solid var(--border); }
        .reviewer-notice strong { font-size: 13px; font-weight: 600; }
        .reviewer-notice p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
      </style></head><body><header class="brand">myself<span>.md</span></header><main><p class="reviewer-label">Directory review</p><h1>Reviewer sign-in</h1><p class="intro">Access the separate review account with fictional data. Use the credentials supplied privately by the operator.</p><form class="reviewer-form" method="post"><input type="hidden" name="oauth_query" value="${query}"><label for="username">Username<input id="username" name="username" value="reviewer" autocomplete="username" autocapitalize="none" spellcheck="false" required></label><label for="password">Password<input id="password" name="password" type="password" autocomplete="current-password" minlength="16" maxlength="128" required></label><button class="primary" type="submit">Sign in as reviewer</button></form><aside class="reviewer-notice"><strong>Fictional data, separate account</strong><p>This account does not use Google, Apple or GitHub. Public signup and password reset are unavailable.</p></aside><nav class="sign-in-footer" aria-label="Other sign-in options"><a href="/login">Return to sign-in</a><a href="/">Back to myself.md</a></nav></main></body></html>`,
      {
        headers: {
          ...headers,
          'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'${formDestinations.length ? ` ${formDestinations.join(' ')}` : ''}; base-uri 'none'; frame-ancestors 'none'`,
        },
      },
    );
  }
  if (request.method !== 'POST' || request.headers.get('origin') !== url.origin)
    return Response.json({ error: 'Invalid reviewer sign-in request.' }, { status: 403 });
  const form = await request.formData();
  const password = form.get('password');
  if (
    form.get('username') !== 'reviewer' ||
    typeof password !== 'string' ||
    password.length < 16 ||
    password.length > 128
  )
    return Response.json({ error: 'Reviewer sign-in failed.' }, { status: 401 });
  const oauthQuery = form.get('oauth_query');
  const authHeaders = new Headers(request.headers);
  authHeaders.set('Content-Type', 'application/json');
  authHeaders.delete('Content-Length');
  const response = await auth.handler(
    new Request(`${url.origin}${base}/sign-in/email`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email: reviewerEmail,
        password,
        callbackURL: `${url.origin}/dashboard`,
        ...(typeof oauthQuery === 'string' && oauthQuery ? { oauth_query: oauthQuery } : {}),
      }),
    }),
  );
  if (response.status >= 300 && response.status < 400) {
    const redirectHeaders = new Headers(response.headers);
    redirectHeaders.set('Referrer-Policy', 'no-referrer');
    redirectHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers: redirectHeaders });
  }
  if (!response.ok) {
    return Response.json(
      { error: 'Reviewer sign-in failed. Check the credentials or contact the operator.' },
      { status: response.status },
    );
  }
  const result = /** @type {{url?:string}} */ (await response.json());
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Location', result.url ?? `${url.origin}/dashboard`);
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('Referrer-Policy', 'no-referrer');
  return new Response(null, { status: 302, headers: responseHeaders });
}
