import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readHealthMdPlaySubscription } from '../server/health-md-subscriptions.js';
import { createApplication } from '../server/application.js';

const token = 'fixture-purchase-token-SECRET.with/slash';
/** @type {string[]} */
const requested = [];
/** @param {unknown} data */
const google = (data) => async () => ({
  /** @param {{url:string,timeout:number}} options */
  async request(options) {
    requested.push(options.url);
    assert.equal(options.timeout, 15000);
    return { data };
  },
});
/** @param {number} status */
const googleError = (status) => async () => ({
  async request() {
    throw Object.assign(new Error(`Google ${status}`), { status, response: { status } });
  },
});
/** @param {Promise<unknown>} promise @param {number} status @param {RegExp} [message] */
async function rejectsWith(promise, status, message) {
  await assert.rejects(promise, (error) => {
    assert.equal(/** @type {{status?:number}} */ (error).status, status);
    if (message) assert.match(String(/** @type {Error} */ (error).message), message);
    return true;
  });
}
const weekly = {
  productId: 'health_md_premium_weekly',
  expiryTime: '2026-12-01T10:00:00Z',
  autoRenewingPlan: { autoRenewEnabled: true },
  offerDetails: { basePlanId: 'weekly' },
};
const fullGoogleResponse = {
  kind: 'androidpublisher#subscriptionPurchaseV2',
  regionCode: 'US',
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
  linkedPurchaseToken: 'linked-SECRET',
  latestOrderId: 'GPA.0000-SECRET',
  externalAccountIdentifiers: { obfuscatedExternalAccountId: 'account-SECRET' },
  lineItems: [weekly],
};

// Contract shape, token URL encoding and no leakage of identifiers.
const result = await readHealthMdPlaySubscription(
  { purchaseToken: token },
  google(fullGoogleResponse),
);
assert.deepEqual(result, {
  productId: 'health_md_premium_weekly',
  state: 'active',
  expiresAt: '2026-12-01T10:00:00.000Z',
  autoRenewing: true,
  test: false,
});
assert.equal(
  requested.at(-1),
  `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.healthmd.android/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
);
assert.doesNotMatch(JSON.stringify(result), /SECRET|fixture-purchase-token/);

// State mapping.
const stateCases = [
  ['SUBSCRIPTION_STATE_ACTIVE', 'active'],
  ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'grace'],
  ['SUBSCRIPTION_STATE_ON_HOLD', 'on_hold'],
  ['SUBSCRIPTION_STATE_PAUSED', 'paused'],
  ['SUBSCRIPTION_STATE_CANCELED', 'canceled'],
  ['SUBSCRIPTION_STATE_EXPIRED', 'expired'],
  ['SUBSCRIPTION_STATE_PENDING', 'pending'],
  ['SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'expired'],
  ['SUBSCRIPTION_STATE_UNSPECIFIED', 'expired'],
  [undefined, 'expired'],
];
const mapped = await Promise.all(
  stateCases.map(([subscriptionState]) =>
    readHealthMdPlaySubscription(
      { purchaseToken: token },
      google({ subscriptionState, lineItems: [weekly] }),
    ),
  ),
);
assert.deepEqual(
  mapped.map((status) => status.state),
  stateCases.map(([, state]) => state),
);

// Latest Health.md line item wins; foreign products are ignored; test purchases are reported, not rejected.
const latest = await readHealthMdPlaySubscription(
  { purchaseToken: token },
  google({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    testPurchase: {},
    lineItems: [
      weekly,
      { productId: 'com.myself.md.cloud.yearly', expiryTime: '2030-01-01T00:00:00Z' },
      {
        productId: 'health_md_premium_yearly',
        expiryTime: '2027-06-01T00:00:00.123456Z',
        autoRenewingPlan: { autoRenewEnabled: false },
      },
      { productId: 'health_md_premium_weekly', expiryTime: 'not a date' },
    ],
  }),
);
assert.deepEqual(latest, {
  productId: 'health_md_premium_yearly',
  state: 'active',
  expiresAt: '2027-06-01T00:00:00.123Z',
  autoRenewing: false,
  test: true,
});
const undated = await readHealthMdPlaySubscription(
  { purchaseToken: token },
  google({
    subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
    lineItems: [{ productId: 'health_md_premium_weekly' }],
  }),
);
assert.deepEqual(undated, {
  productId: 'health_md_premium_weekly',
  state: 'pending',
  expiresAt: null,
  autoRenewing: false,
  test: false,
});

// Non-Health.md products and Google token denials are 403.
await rejectsWith(
  readHealthMdPlaySubscription(
    { purchaseToken: token },
    google({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{ productId: 'health_md_premium_lifetime', expiryTime: '2030-01-01T00:00:00Z' }],
    }),
  ),
  403,
);
await rejectsWith(
  readHealthMdPlaySubscription({ purchaseToken: token }, google({ lineItems: [] })),
  403,
);
await Promise.all(
  [400, 404, 410].map((status) =>
    rejectsWith(readHealthMdPlaySubscription({ purchaseToken: token }, googleError(status)), 403),
  ),
);
// Credential, outage and unexpected responses stay retryable.
await Promise.all(
  [401, 403, 429, 500, 503, 0].map((status) =>
    rejectsWith(readHealthMdPlaySubscription({ purchaseToken: token }, googleError(status)), 503),
  ),
);
await rejectsWith(
  readHealthMdPlaySubscription({ purchaseToken: token }, async () => {
    throw new SyntaxError('bad credentials JSON');
  }),
  503,
);
await rejectsWith(
  readHealthMdPlaySubscription({ purchaseToken: token }, google({ lineItems: 'nope' })),
  503,
);

// Unconfigured credentials are 503 without contacting Google.
const savedEnv = {
  file: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  json: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
};
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
try {
  await rejectsWith(readHealthMdPlaySubscription({ purchaseToken: token }), 503, /not configured/);
} finally {
  if (savedEnv.file !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = savedEnv.file;
  if (savedEnv.json !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_JSON = savedEnv.json;
}

// Malformed bodies are 400 before any Google call.
const before = requested.length;
const malformed = [
  null,
  'token',
  {},
  { purchaseToken: '' },
  { purchaseToken: 7 },
  { purchaseToken: 'x'.repeat(30001) },
];
await Promise.all(
  malformed.map((body) =>
    rejectsWith(readHealthMdPlaySubscription(body, google(fullGoogleResponse)), 400),
  ),
);
assert.equal(requested.length, before);
await readHealthMdPlaySubscription(
  { purchaseToken: 'x'.repeat(30000) },
  google(fullGoogleResponse),
);

// Node route: injected service, no-store, 400/413/429 and error JSON.
/** @type {unknown[]} */
const routed = [];
const server = createServer(
  createApplication(
    {
      OAUTH_ISSUER: 'http://127.0.0.1:1/auth/realms/myselfmd',
      PUBLIC_URL: 'http://127.0.0.1',
      ALLOW_HTTP_DEV: '1',
    },
    /** @type {import('../server/application.js').ApplicationServices} */ (
      /** @type {unknown} */ ({
        readHealthMdPlaySubscription: async (/** @type {unknown} */ body) => {
          routed.push(body);
          return readHealthMdPlaySubscription(body, google(fullGoogleResponse));
        },
      })
    ),
  ),
);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
const endpoint = `http://127.0.0.1:${address.port}/api/health-md/play-subscription`;
/** @param {string} body */
const post = (body) =>
  fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
try {
  const ok = await post(JSON.stringify({ purchaseToken: token }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const okBody = await ok.text();
  assert.deepEqual(JSON.parse(okBody), result);
  assert.doesNotMatch(okBody, /SECRET|fixture-purchase-token/);
  assert.deepEqual(routed, [{ purchaseToken: token }]);
  const rejected = await Promise.all(['{', '', JSON.stringify({ token })].map(post));
  assert.deepEqual(
    rejected.map((bad) => bad.status),
    [400, 400, 400],
  );
  const errors = await Promise.all(rejected.map((bad) => bad.json()));
  for (const value of errors)
    assert.equal(typeof (/** @type {{error?:unknown}} */ (value).error), 'string');
  assert.equal((await post('x'.repeat(40001))).status, 413);
  const burst = await Promise.all(Array.from({ length: 125 }, () => post('{')));
  assert.ok(
    burst.some((response) => response.status === 429),
    'Subscription checks must be rate limited per client.',
  );
} finally {
  server.close();
}
console.log('Health.md Play subscription status verified.');
