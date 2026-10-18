import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { reviewerUserId } from './reviewer.js';
import { identityPageStyles } from './identity-page-style.js';
import { providerLogos } from './provider-logos.js';

export const loginProvider = z.enum(['apple', 'github', 'google']);
/** @param {string} issuer @param {string} subject @param {string[]} connected @param {string[]} available */
export function accountLogins(issuer, subject, connected, available) {
  const url = new URL(`${issuer}/connected-accounts`);
  url.searchParams.set('subject', subject);
  return {
    subject,
    providers: loginProvider.options.map((provider) => ({
      provider,
      connected: connected.includes(provider),
      available: available.includes(provider),
    })),
    handoff: { status: 'awaiting_user', url: url.href, requiresUser: true },
    verificationTool: 'get_account_logins',
  };
}
/** @param {string} text */
function escape(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
/** Browser session and provider authentication are required; bearer tokens cannot link a login.
 * @param {Request} request
 * @param {ReturnType<import('./identity.js').createIdentity>} auth
 * @param {{issuer:string,namespace:string,available:string[]}} config */
export async function connectedAccountsPage(request, auth, config) {
  const url = new URL(request.url);
  const expected = url.searchParams.get('subject');
  if (!expected?.startsWith(`${config.namespace}|`) || expected.length > 2000)
    return Response.json({ error: 'Open Connected logins from your account.' }, { status: 400 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.id === reviewerUserId)
    return Response.json(
      { error: 'Reviewer accounts cannot connect personal logins.' },
      { status: 403 },
    );
  const subject = session ? `${config.namespace}|${session.user.id}` : null;
  if (subject && subject !== expected)
    return Response.json(
      {
        error:
          'Your browser is signed into a different account. Sign out in the dashboard, then reopen Connected logins and sign in to the original account.',
      },
      { status: 409 },
    );
  const callbackURL = new URL(`${config.issuer}/connected-accounts`);
  callbackURL.searchParams.set('subject', expected);
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== new URL(config.issuer).origin)
      return Response.json({ error: 'Invalid account-linking origin.' }, { status: 403 });
    if (Number(request.headers.get('content-length') ?? 0) > 4096)
      return Response.json({ error: 'Request too large.' }, { status: 413 });
    const text = await request.text();
    if (text.length > 4096) return Response.json({ error: 'Request too large.' }, { status: 413 });
    const form = new URLSearchParams(text);
    const parsed = loginProvider.safeParse(form.get('provider'));
    if (!parsed.success || !config.available.includes(parsed.data))
      return Response.json({ error: 'Unsupported provider.' }, { status: 400 });
    const action = form.get('action');
    if (action !== 'sign-in' && action !== 'link')
      return Response.json({ error: 'Unsupported action.' }, { status: 400 });
    if (action === 'link' && !session)
      return Response.json({ error: 'Sign in to your original account first.' }, { status: 401 });
    // Reject a stale sign-in form instead of switching a browser that has since signed in.
    if (action === 'sign-in' && session)
      return Response.json(
        { error: 'Already signed in. Reload Connected logins.' },
        { status: 409 },
      );
    callbackURL.searchParams.set('result', action === 'link' ? parsed.data : 'signed-in');
    const target = new URL(
      config.issuer + (action === 'link' ? '/link-social' : '/sign-in/social'),
    );
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    const response = await auth.handler(
      new Request(target.href, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: parsed.data,
          callbackURL: callbackURL.href,
          errorCallbackURL: callbackURL.href,
        }),
      }),
    );
    if (!response.ok) return response;
    const result = z.object({ url: z.url() }).parse(await response.json());
    const outputHeaders = new Headers(response.headers);
    outputHeaders.set('Location', result.url);
    outputHeaders.set('Cache-Control', 'no-store');
    return new Response(null, { status: 302, headers: outputHeaders });
  }
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const accounts = session ? await auth.api.listUserAccounts({ headers: request.headers }) : [];
  const status = accountLogins(
    config.issuer,
    expected,
    accounts.map((account) => account.providerId),
    config.available,
  );
  const names = { apple: 'Apple', github: 'GitHub', google: 'Google' };
  const selected = loginProvider.safeParse(url.searchParams.get('provider'));
  const error = url.searchParams.has('error');
  const attempted = url.searchParams.get('result');
  const linked = status.providers.some(
    (provider) => provider.provider === attempted && provider.connected,
  );
  const message = error
    ? 'The login could not be connected. It may already belong to another myself.md account, or authorization was cancelled. No accounts were merged. Try again or sign in to the account that already uses that login.'
    : linked
      ? 'Login connected. Lifetime access, cloud storage, devices and history stay with this account.'
      : '';
  const content = `<p class="intro">${session ? 'Add another way to sign in to the same account.' : 'First sign in with the login you originally used for your myself.md account.'}</p>
    ${session ? `<div class="account-summary"><span>Signed in as</span><strong>${escape(session.user.email)}</strong></div>` : ''}
    ${message ? `<div class="notice ${error ? 'notice-error' : 'notice-success'}" role="status"><strong>${error ? 'Connection unsuccessful' : 'Login connected'}</strong><p>${message}</p></div>` : ''}
    ${session && selected.success ? `<p class="requested-login">Requested login: <strong>${names[selected.data]}</strong></p>` : ''}
    <form method="post"><input type="hidden" name="action" value="${session ? 'link' : 'sign-in'}"><ul class="provider-list">${status.providers
      .map((provider) => {
        const name = names[provider.provider];
        const connected = session && provider.connected;
        return `<li class="provider-row"><span class="provider-name">${providerLogos[provider.provider]}${name}</span>${connected ? '<span class="connected"><span aria-hidden="true">✓</span> Connected</span>' : provider.available ? `<button class="secondary" type="submit" name="provider" value="${provider.provider}">${session ? 'Connect' : 'Sign in with'} ${name}</button>` : '<span class="unavailable">Not available</span>'}</li>`;
      })
      .join('')}</ul></form>
    <aside class="account-note"><h2>One account, more ways to sign in</h2><p>Your lifetime access, cloud storage, devices and history stay with this account. Existing accounts cannot be merged here. Matching email addresses never connect accounts automatically.</p></aside>
    <nav class="return-links" aria-label="Return to myself.md"><a href="/dashboard">Return to dashboard</a><a href="myselfmd://connected-logins">Return to app <span aria-hidden="true">↗</span></a></nav>`;
  const nonce = randomBytes(16).toString('base64');
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connected logins · myself.md</title><style nonce="${nonce}">${identityPageStyles}${connectedLoginStyles}</style></head><body><header class="brand">myself<span>.md</span></header><main><h1>Connected logins</h1>${content}</main></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self' https://appleid.apple.com https://github.com https://accounts.google.com; base-uri 'none'; frame-ancestors 'none'`,
      },
    },
  );
}

const connectedLoginStyles = `
  .account-summary {
    padding: 16px 18px;
    margin-bottom: 24px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--inset);
  }
  .account-summary span { display: block; margin-bottom: 4px; color: var(--muted); font-size: 12px; }
  .account-summary strong { font-size: 14px; font-weight: 600; }
  .provider-list { list-style: none; padding: 0; margin: 0; }
  .provider-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 76px;
    padding: 14px 0;
  }
  .provider-row + .provider-row { border-top: 1px solid var(--border); }
  .provider-name { display: inline-flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; }
  .provider-name svg { flex-shrink: 0; }
  .provider-row button { width: auto; font-size: 13px; padding: 10px 14px; }
  .connected {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 5px 10px;
    background: var(--success-background);
    color: var(--success-foreground);
    font-size: 12px;
    font-weight: 600;
  }
  :root { --success-background: #edf7f0; --success-foreground: #27633c; --error-foreground: #9d3131; }
  .unavailable { color: var(--muted); font-size: 13px; }
  .requested-login { margin: 0 0 8px; font-size: 13px; color: var(--muted); }
  .requested-login strong { color: var(--foreground); font-weight: 600; }
  .account-note { border-top: 1px solid var(--border); margin-top: 12px; padding-top: 24px; }
  .account-note h2 { margin: 0 0 8px; color: var(--foreground); font-size: 14px; }
  .account-note p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--muted); }
  .return-links { display: flex; flex-wrap: wrap; gap: 4px 20px; margin-top: 20px; }
  a { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; font-size: 13px; font-weight: 500; color: var(--muted); text-decoration: none; }
  a:focus-visible { outline: 2px solid var(--foreground); outline-offset: 3px; border-radius: 3px; }
  @media (hover: hover) and (pointer: fine) { a:hover { color: var(--foreground); text-decoration: underline; text-underline-offset: 4px; } }
  .notice { padding: 16px; margin-bottom: 20px; border: 1px solid var(--border); border-radius: 12px; background: var(--inset); }
  .notice strong { font-size: 14px; font-weight: 600; }
  .notice p { margin: 6px 0 0; font-size: 13px; line-height: 1.6; color: var(--muted); }
  .notice-success strong { color: var(--success-foreground); }
  .notice-error strong { color: var(--error-foreground); }
  @media (prefers-color-scheme: dark) { :root { --success-background: #203629; --success-foreground: #a7dab5; --error-foreground: #f0aaaa; } }
`;
