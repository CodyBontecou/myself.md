import { z } from 'zod';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createIdentity } from '../server/identity.js';
import { connectedAccountsPage } from '../server/account-links.js';
import { BillingStore } from '../server/billing-store.js';

const issuer = 'http://localhost:3000/auth/realms/myselfmd';
const namespace = 'fixture';
const secret = 'account-linking-fixture-secret-at-least-32-characters';
const database = new DatabaseSync(':memory:');
database.exec(readFileSync('worker/identity.sql', 'utf8'));
const auth = createIdentity(database, {
  issuer,
  secret,
  resource: 'http://localhost:3000/mcp',
  githubId: 'fixture',
  githubSecret: 'fixture',
  appleId: 'fixture',
  appleSecret: 'fixture',
  googleId: 'fixture',
  googleSecret: 'fixture',
});
const context = await auth.$context;
const config = { issuer, namespace, available: ['apple', 'github', 'google'] };
await Promise.all(
  [
    { id: 'paid', email: 'paid@example.test' },
    { id: 'other', email: 'other@example.test' },
  ].map(async ({ id, email }) => {
    await context.adapter.create({
      model: 'user',
      forceAllowId: true,
      data: {
        id,
        email,
        name: id,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await context.internalAdapter.createAccount({
      userId: id,
      providerId: 'github',
      accountId: id,
    });
  }),
);
const billing = new BillingStore(':memory:');
billing.unlock(`${namespace}|paid`, { store: 'ios', id: 'fixture-lifetime', proof: 'fixture' });
/** @param {string} id */
async function cookieFor(id) {
  const session = await context.internalAdapter.createSession(id);
  assert.ok(session);
  return `${context.authCookies.sessionToken.name}=${encodeURIComponent(session.token + '.' + createHmac('sha256', secret).update(session.token).digest('base64'))}`;
}
const paidCookie = await cookieFor('paid');
const otherCookie = await cookieFor('other');
const url = `${issuer}/connected-accounts?subject=${encodeURIComponent(`${namespace}|paid`)}`;
/** @param {string} cookie @param {string|undefined} [body] @param {string} [origin] */
function page(cookie, body, origin = 'http://localhost:3000') {
  return connectedAccountsPage(
    new Request(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Cookie: cookie,
        Origin: origin,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      ...(body === undefined ? {} : { body }),
    }),
    auth,
    config,
  );
}
assert.match(await (await page('')).text(), /First sign in/);
assert.equal((await page(otherCookie)).status, 409);
assert.equal((await page('', 'action=link&provider=google')).status, 401);
assert.equal(
  (await page(paidCookie, 'action=link&provider=google', 'https://attacker.test')).status,
  403,
);
assert.equal((await page(paidCookie, 'action=link&provider=unknown')).status, 400);
assert.equal((await page(paidCookie, 'action=sign-in&provider=google')).status, 409);
assert.match(await (await page(paidCookie)).text(), /GitHub<\/span><span class="connected">/);
// Only provider transport is stubbed. Better Auth creates and validates real state,
// callback cookies, account ownership and database writes.
const providers = await context.socialProviders;
assert.ok(Array.isArray(providers));
/** @type {Record<string,{id:string,email:string,emailVerified:boolean,name:string}>} */
const identities = {
  google: {
    id: 'new-google',
    email: 'different@example.test',
    emailVerified: true,
    name: 'Google',
  },
  apple: {
    id: 'new-apple',
    email: 'relay@privaterelay.appleid.test',
    emailVerified: true,
    name: 'Apple',
  },
  github: { id: 'other', email: 'other@example.test', emailVerified: true, name: 'Other' },
};
for (const provider of providers) {
  provider.validateAuthorizationCode = async () => ({
    accessToken: 'fixture-access-token',
    scopes: [],
  });
  provider.getUserInfo = async () => {
    const user = identities[provider.id];
    assert.ok(user);
    return {
      user: { email: user.email, emailVerified: user.emailVerified, name: user.name },
      data: { sub: user.id, id: user.id },
    };
  };
}
/** @param {string} provider @param {string} [cookie] */
async function link(provider, cookie = paidCookie) {
  const started = await page(cookie, `action=link&provider=${provider}`);
  assert.equal(started.status, 302, await started.clone().text());
  const state = new URL(started.headers.get('location') ?? '').searchParams.get('state');
  assert.ok(state);
  const stateCookies = started.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const callback = `${issuer}/callback/${provider}?code=fixture&state=${encodeURIComponent(state)}`;
  const response = await auth.handler(
    new Request(callback, { headers: { Cookie: `${cookie}; ${stateCookies}` } }),
  );
  return { response, callback, stateCookies };
}
/** @param {string} provider */
async function verifyProvider(provider) {
  const linked = await link(provider);
  assert.equal(linked.response.status, 302);
  assert.equal(
    new URL(linked.response.headers.get('location') ?? '').searchParams.get('error'),
    null,
  );
  const account = await context.internalAdapter.findAccountByKey({
    providerId: provider,
    accountId: identities[provider]?.id ?? '',
  });
  assert.equal(account?.userId, 'paid');
  assert.equal(billing.snapshot(`${namespace}|${account?.userId}`).unlocked, true);
  const replay = await auth.handler(
    new Request(linked.callback, { headers: { Cookie: `${paidCookie}; ${linked.stateCookies}` } }),
  );
  assert.ok(new URL(replay.headers.get('location') ?? '').searchParams.has('error'));
}
await Promise.all(['google', 'apple'].map(verifyProvider));
const duplicate = await link('google');
assert.equal(
  new URL(duplicate.response.headers.get('location') ?? '').searchParams.get('error'),
  null,
);
assert.equal(
  database
    .prepare("SELECT count(*) count FROM account WHERE providerId='google' AND userId='paid'")
    .get()?.count,
  1,
);
const conflict = await link('github');
assert.ok(new URL(conflict.response.headers.get('location') ?? '').searchParams.has('error'));
assert.equal(
  (await context.internalAdapter.findAccountByKey({ providerId: 'github', accountId: 'other' }))
    ?.userId,
  'other',
);
assert.equal(billing.snapshot(`${namespace}|other`).unlocked, false);
assert.throws(
  () =>
    database
      .prepare(
        "INSERT INTO account (id,accountId,providerId,userId,createdAt,updatedAt) VALUES ('duplicate','new-google','google','other',0,0)",
      )
      .run(),
  /UNIQUE/,
);
assert.equal(context.options.account?.accountLinking?.disableImplicitLinking, true);
// Signing in with each newly linked provider resolves to the original paid account.
let signInSequence = 0;
/** @param {string} provider @param {number} [elapsedMinutes] */
async function signInWith(provider, elapsedMinutes = 0) {
  const started = await auth.handler(
    new Request(`${issuer}/sign-in/social`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': `192.0.2.${++signInSequence}`,
      },
      body: JSON.stringify({
        provider,
        callbackURL: 'http://localhost:3000/dashboard',
        errorCallbackURL: 'http://localhost:3000/dashboard',
      }),
    }),
  );
  assert.equal(started.status, 200);
  assert.ok(started.headers.getSetCookie().some((cookie) => /\.state=.*Max-Age=900/.test(cookie)));
  const target = new URL(z.object({ url: z.string() }).parse(await started.json()).url);
  const stateCookies = started.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const clock = Date.now;
  const startedAt = clock();
  Date.now = () => startedAt + elapsedMinutes * 60 * 1000;
  try {
    return await auth.handler(
      new Request(
        `${issuer}/callback/${provider}?code=fixture&state=${encodeURIComponent(target.searchParams.get('state') ?? '')}`,
        { headers: { Cookie: stateCookies } },
      ),
    );
  } finally {
    Date.now = clock;
  }
}
/** @param {string} provider */
async function verifySignIn(provider) {
  const response = await signInWith(provider);
  const cookies = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const signedIn = await auth.api.getSession({ headers: new Headers({ Cookie: cookies }) });
  assert.equal(signedIn?.user.id, 'paid');
  assert.equal(billing.snapshot(`${namespace}|${signedIn?.user.id}`).unlocked, true);
}
identities.github = {
  id: 'paid',
  email: 'paid@example.test',
  emailVerified: true,
  name: 'Original',
};
await Promise.all(['apple', 'github', 'google'].map(verifySignIn));
// Exercise the real state parser beyond its old ten-minute deadline, then
// confirm that retaining a cookie cannot authorize an expired attempt.
const delayedGoogle = await signInWith('google', 14);
assert.equal(delayedGoogle.headers.get('location'), 'http://localhost:3000/dashboard');
assert.ok(delayedGoogle.headers.getSetCookie().some((cookie) => cookie.includes('session_token=')));
const expiredGoogle = await signInWith('google', 16);
assert.equal(
  expiredGoogle.headers.get('location'),
  'http://localhost:3000/dashboard?error=state_mismatch',
);
// A new provider subject with the same verified email must not implicitly link.
identities.google = {
  id: 'unlinked-google',
  email: 'paid@example.test',
  emailVerified: true,
  name: 'Unlinked',
};
const implicit = await signInWith('google');
assert.ok(new URL(implicit.headers.get('location') ?? '').searchParams.has('error'));
assert.equal(
  await context.internalAdapter.findAccountByKey({
    providerId: 'google',
    accountId: 'unlinked-google',
  }),
  null,
);
const cancelledStart = await page(paidCookie, 'action=link&provider=google');
const cancelledState = new URL(cancelledStart.headers.get('location') ?? '').searchParams.get(
  'state',
);
assert.ok(cancelledState);
const cancelledCookies = cancelledStart.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
const cancelled = await auth.handler(
  new Request(
    `${issuer}/callback/google?error=access_denied&state=${encodeURIComponent(cancelledState)}`,
    { headers: { Cookie: `${paidCookie}; ${cancelledCookies}` } },
  ),
);
assert.ok(new URL(cancelled.headers.get('location') ?? '').searchParams.has('error'));
assert.equal(
  await context.internalAdapter.findAccountByKey({
    providerId: 'google',
    accountId: 'unlinked-google',
  }),
  null,
);
assert.equal(billing.snapshot(`${namespace}|paid`).unlocked, true);
const connected = await page(paidCookie);
const html = await connected.text();
assert.match(html, /Apple<\/span><span class="connected">/);
assert.match(html, /Google<\/span><span class="connected">/);
assert.ok(!html.includes('fixture-access-token'));
console.log(
  'PASS account linking: real OAuth state/callbacks, different emails, Apple relay, stable lifetime owner, replay denial, duplicate retries, cross-account conflict, CSRF and unique provider ownership.',
);
database.close();
billing.db.close();
