import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { dashboardLogin } from '../server/dashboard-login.js';

const callback = 'http://localhost:3000/dashboard/callback';
const state = 's'.repeat(43);
let origin = '';
const identity = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', origin);
  if (url.pathname.endsWith('/auth')) {
    res.setHeader('Set-Cookie', 'AUTH_SESSION_ID=fixture; Path=/realm; HttpOnly');
    res.end(
      '<form id="kc-form-login" action="/realm/login-actions/authenticate?client_id=qr-dashboard"></form>',
    );
    return;
  }
  assert.equal(req.headers.cookie, 'AUTH_SESSION_ID=fixture');
  assert.equal(req.headers['content-type'], 'application/x-www-form-urlencoded');
  let body = '';
  for await (const chunk of req) body += chunk;
  const fields = new URLSearchParams(body);
  assert.equal(fields.get('username'), 'fixture');
  if (fields.get('password') === 'incorrect') {
    res.end('<form id="kc-form-login"></form><span id="input-error">Invalid credentials</span>');
    return;
  }
  res.writeHead(302, {
    Location:
      fields.get('password') === 'unsafe'
        ? 'https://example.com/steal'
        : `${callback}?code=fixture&state=${state}`,
  });
  res.end();
});
identity.listen(0, '127.0.0.1');
await once(identity, 'listening');
const address = identity.address();
assert.ok(address && typeof address !== 'string');
origin = `http://127.0.0.1:${address.port}`;
const issuer = `${origin}/realm`;
const authorization = new URL(`${issuer}/protocol/openid-connect/auth`);
authorization.search = new URLSearchParams({
  client_id: 'qr-dashboard',
  redirect_uri: callback,
  response_type: 'code',
  code_challenge_method: 'S256',
  code_challenge: 'c'.repeat(43),
  state,
}).toString();
const action = `${issuer}/login-actions/authenticate?client_id=qr-dashboard`;
try {
  const initial = await dashboardLogin(
    { url: authorization.href },
    issuer,
    'http://localhost:3000',
  );
  assert.ok(initial.html.includes('kc-form-login'));
  const invalid = await dashboardLogin(
    {
      url: action,
      attempt: initial.attempt,
      fields: { username: 'fixture', password: 'incorrect' },
    },
    issuer,
    'http://localhost:3000',
  );
  assert.ok(invalid.html.includes('Invalid credentials'));
  assert.equal(invalid.attempt, initial.attempt);
  const success = await dashboardLogin(
    {
      url: action,
      attempt: initial.attempt,
      fields: { username: 'fixture', password: 'correct' },
    },
    issuer,
    'http://localhost:3000',
  );
  assert.equal(success.redirect, `${callback}?code=fixture&state=${state}`);
  await assert.rejects(
    dashboardLogin(
      {
        url: action,
        attempt: initial.attempt,
        fields: { username: 'fixture', password: 'correct' },
      },
      issuer,
      'http://localhost:3000',
    ),
    /expired/,
  );
  const unsafe = await dashboardLogin({ url: authorization.href }, issuer, 'http://localhost:3000');
  await assert.rejects(
    dashboardLogin(
      {
        url: action,
        attempt: unsafe.attempt,
        fields: { username: 'fixture', password: 'unsafe' },
      },
      issuer,
      'http://localhost:3000',
    ),
    /additional sign-in step/,
  );
  await assert.rejects(
    dashboardLogin({ url: 'http://example.com/auth' }, issuer, 'http://localhost:3000'),
    /destination/,
  );
  const wrongClient = new URL(authorization);
  wrongClient.searchParams.set('client_id', 'qr-phone');
  await assert.rejects(
    dashboardLogin({ url: wrongClient.href }, issuer, 'http://localhost:3000'),
    /Invalid sign-in/,
  );
  console.log(
    'Dashboard login: cookie continuity, invalid credentials, callback, single-use attempts and destination/client validation passed.',
  );
} finally {
  await new Promise((resolve) => identity.close(resolve));
}
