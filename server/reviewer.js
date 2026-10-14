/** Reserved application identity; never reuse or link a person's social identity. */
export const reviewerUserId = 'myselfmd-directory-reviewer-v1';
export const reviewerEmail = 'reviewer@myself.invalid';

/** Password entry is an owner/reviewer browser handoff, not an MCP credential input.
 * @param {Request} request @param {ReturnType<import('./identity.js').createIdentity>} auth
 * @param {boolean} enabled */
export async function reviewerLoginPage(request, auth, enabled) {
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
  if (request.method === 'GET')
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reviewer sign-in · myself.md</title><main><h1>Reviewer sign-in</h1><p>This separate account contains fictional directory-review data. It does not use Google, Apple or GitHub.</p><form method="post"><input type="hidden" name="oauth_query" value="${query}"><p><label>Username <input name="username" value="reviewer" autocomplete="username" required></label></p><p><label>Password <input name="password" type="password" autocomplete="current-password" minlength="16" maxlength="128" required></label></p><button type="submit">Sign in as reviewer</button></form><p>Credentials are supplied privately by the operator. Public signup and password reset are unavailable.</p><a href="/login">Return to sign-in</a></main></html>`,
      { headers },
    );
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
