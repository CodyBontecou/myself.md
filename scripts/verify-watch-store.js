import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { PairingStore } from '../server/pairing-store.js';
import { createWatchService } from '../server/watch-service.js';
import { PairingError } from '../server/errors.js';

const db = new DatabaseSync(':memory:'),
  cloud = new CloudStore(db, Buffer.alloc(32, 1));
const billing = new BillingStore(db),
  history = new HistoryStore(db, cloud),
  pairing = new PairingStore(db);
const subject = 'fixture|owner',
  parent = pairing.claim(pairing.createPairing(subject).ticket, subject, 'Fixture phone');
const noop = () => {};
function makeBarrier() {
  let resume = noop,
    arrive = noop;
  const waiting = new Promise((resolve) => {
    arrive = () => resolve(undefined);
  });
  const blocked = new Promise((resolve) => {
    resume = () => resolve(undefined);
  });
  return { resume, arrive, waiting, blocked };
}
/** @type {ReturnType<typeof makeBarrier>|null} */ let barrier = null;
/** @type {{token:string,expires:number}[]} */ const tickets = [];
const service = createWatchService({
  source: db,
  cloud,
  billing,
  history,
  devices: pairing.devices.bind(pairing),
  refreshEntitlement: async () => {
    if (barrier) {
      barrier.arrive();
      await barrier.blocked;
    }
  },
  registerTicket: async (token, _subject, expires) => {
    tickets.push({ token, expires });
  },
});
const configuredSchema = z.object({
  deviceId: z.string(),
  token: z.string(),
  expiresAt: z.number(),
});
/** @param {boolean} [agentAccess] */
async function configure(agentAccess = true) {
  return configuredSchema.parse(
    await service.watchOwnerApi(subject, null, {
      action: 'configure',
      deviceId: randomUUID(),
      parentDeviceId: parent.id,
      name: 'Steps',
      endpoint: 'https://example.test/upload',
      agentAccess,
    }),
  );
}
const end = new Date(),
  start = new Date(end);
start.setUTCHours(0, 0, 0, 0);
const interval = {
  start: start.toISOString(),
  end: end.toISOString(),
  day: start.toISOString().slice(0, 10),
  timezone: 'UTC',
};
const device = await configure();
const job = randomUUID();
await service.watchOwnerApi(subject, 'fixture-agent', {
  action: 'request',
  deviceId: device.deviceId,
  requestId: job,
});
barrier = makeBarrier();
const first = service.watchRuntimeApi(device.token, { action: 'start', requestId: job, interval });
await barrier.waiting;
const second = service.watchRuntimeApi(device.token, {
  action: 'start',
  requestId: job,
  interval: { ...interval, end: new Date(end.getTime() - 1000).toISOString() },
});
barrier.resume();
const results = await Promise.allSettled([first, second]);
barrier = null;
assert.equal(results[0]?.status, 'fulfilled');
assert.equal(results[1]?.status, 'rejected');
if (results[1]?.status === 'rejected')
  assert.ok(
    results[1].reason instanceof PairingError && results[1].reason.status === 409,
    'A concurrent retry must not change the frozen interval.',
  );
assert.equal(billing.snapshot(subject).reserved, 1);
await service.watchOwnerApi(subject, null, {
  action: 'cancel',
  deviceId: device.deviceId,
  requestId: job,
});

const blocked = randomUUID();
await service.watchOwnerApi(subject, 'fixture-agent', {
  action: 'request',
  deviceId: device.deviceId,
  requestId: blocked,
});
barrier = makeBarrier();
const denied = service.watchRuntimeApi(device.token, {
  action: 'start',
  requestId: blocked,
  interval,
});
await barrier.waiting;
cloud.setAgent(subject, 'fixture-agent', true);
barrier.resume();
barrier = null;
await assert.rejects(denied, (error) => error instanceof PairingError && error.status === 403);
assert.equal(billing.snapshot(subject).reserved, 0);
cloud.setAgent(subject, 'fixture-agent', false);

/** @param {string} id @param {number} expires */
function setExpiry(id, expires) {
  const row = db.prepare('SELECT value FROM watches WHERE id=?').get(id);
  assert.ok(row);
  const state = /** @type {import('../core/watch.js').WatchDevice} */ (
    JSON.parse(
      cloud.open(/** @type {Uint8Array} */ (row.value), `${subject}|${id}|watch`).toString(),
    )
  );
  state.expiresAt = expires;
  db.prepare('UPDATE watches SET expires=?,value=? WHERE id=?').run(
    expires,
    cloud.seal(Buffer.from(JSON.stringify(state)), `${subject}|${id}|watch`),
    id,
  );
}
const shortExpiry = Date.now() + 86400000;
setExpiry(device.deviceId, shortExpiry);
const before = tickets.length;
assert.equal(
  z
    .object({ expiresAt: z.number() })
    .parse(await service.watchRuntimeApi(device.token, { action: 'poll' })).expiresAt,
  shortExpiry,
);
assert.equal(tickets.length, before, 'Passive work must not extend session lifetime.');
const renewed = z
  .object({ expiresAt: z.number() })
  .parse(await service.watchRuntimeApi(device.token, { action: 'poll', foreground: true }));
assert.ok(renewed.expiresAt > Date.now() + 29 * 86400000);
assert.equal(tickets.length, before + 1);
await service.watchRuntimeApi(device.token, { action: 'poll', foreground: true });
assert.equal(tickets.length, before + 1, 'Foreground renewal is coalesced to once per day.');
setExpiry(device.deviceId, Date.now() - 1);
await assert.rejects(
  service.watchRuntimeApi(device.token, { action: 'poll' }),
  (error) => error instanceof PairingError && error.status === 401,
);
assert.equal(
  z
    .object({ status: z.string() })
    .parse(await service.watchRuntimeApi(device.token, { action: 'revoke' })).status,
  'completed',
  'An expired credential may revoke only its own watch.',
);
assert.equal(
  z
    .object({ status: z.string() })
    .parse(await service.watchRuntimeApi(device.token, { action: 'revoke' })).status,
  'completed',
);

// A request ID on another watch must never release this watch's reservation.
/** @param {string} cleanup */
async function verifyBillingCleanup(cleanup) {
  const owner = await configure(false),
    other = await configure(false),
    requestId = randomUUID();
  await service.watchRuntimeApi(owner.token, { action: 'enqueue', requestId, interval });
  await service.watchRuntimeApi(owner.token, { action: 'start', requestId, interval });
  await service.watchRuntimeApi(other.token, { action: 'enqueue', requestId, interval });
  assert.equal(billing.snapshot(subject).reserved, 1);
  if (cleanup === 'expire') {
    const clock = Date.now;
    try {
      Date.now = () => clock() + 2 * 86400000;
      await service.watchRuntimeApi(other.token, { action: 'poll' });
    } finally {
      Date.now = clock;
    }
  } else if (cleanup === 'configure') {
    await service.watchOwnerApi(subject, null, {
      action: 'configure',
      deviceId: other.deviceId,
      parentDeviceId: parent.id,
      name: 'Replacement',
      endpoint: 'https://example.test/replacement',
      agentAccess: false,
    });
  } else {
    await service.watchOwnerApi(subject, null, {
      action: cleanup,
      deviceId: other.deviceId,
      ...(cleanup === 'cancel' ? { requestId } : {}),
    });
  }
  assert.equal(
    billing.snapshot(subject).reserved,
    1,
    `${cleanup} must preserve the other watch's reservation.`,
  );
  const settled = z.object({ status: z.string() }).parse(
    await service.watchRuntimeApi(owner.token, {
      action: 'settle',
      requestId,
      status: cleanup === 'cancel' ? 'completed' : 'failed',
      recordCount: 1,
      bytes: 100,
      httpStatus: cleanup === 'cancel' ? 200 : 500,
      partial: false,
      error: null,
    }),
  );
  assert.equal(settled.status, cleanup === 'cancel' ? 'completed' : 'failed');
  assert.equal(billing.snapshot(subject).reserved, 0);
}
await verifyBillingCleanup('cancel');
await verifyBillingCleanup('revoke');
await verifyBillingCleanup('configure');
await verifyBillingCleanup('expire');
// A colliding phone reservation has no watch authority either.
const phoneRequest = randomUUID(),
  collisionWatch = await configure(false);
billing.reserve(
  subject,
  phoneRequest,
  JSON.stringify({ profileId: 'phone', days: [interval.day], formats: ['json'] }),
);
await service.watchRuntimeApi(collisionWatch.token, {
  action: 'enqueue',
  requestId: phoneRequest,
  interval,
});
await service.watchOwnerApi(subject, null, {
  action: 'cancel',
  deviceId: collisionWatch.deviceId,
  requestId: phoneRequest,
});
assert.equal(
  billing.snapshot(subject).reserved,
  1,
  'Watch cancellation must preserve a phone reservation.',
);
billing.release(subject, phoneRequest);

// An already approved upload can retry its exact frozen interval after the new-request age limit.
const interrupted = await configure(false),
  retryId = randomUUID();
await service.watchRuntimeApi(interrupted.token, {
  action: 'enqueue',
  requestId: retryId,
  interval,
});
await service.watchRuntimeApi(interrupted.token, { action: 'start', requestId: retryId, interval });
const clock = Date.now,
  later = clock() + 9 * 86400000;
try {
  Date.now = () => later;
  await service.watchRuntimeApi(interrupted.token, { action: 'poll', foreground: true });
  const retried = z.object({ status: z.string() }).parse(
    await service.watchRuntimeApi(interrupted.token, {
      action: 'enqueue',
      requestId: retryId,
      interval,
    }),
  );
  assert.equal(retried.status, 'running');
  await assert.rejects(
    service.watchRuntimeApi(interrupted.token, {
      action: 'start',
      requestId: retryId,
      interval: { ...interval, end: new Date(end.getTime() - 1000).toISOString() },
    }),
    (error) => error instanceof PairingError && error.status === 409,
  );
  const restarted = z
    .object({ job: z.object({ status: z.string(), interval: z.unknown() }) })
    .parse(
      await service.watchRuntimeApi(interrupted.token, {
        action: 'start',
        requestId: retryId,
        interval,
      }),
    );
  assert.equal(restarted.job.status, 'running');
  assert.deepEqual(restarted.job.interval, interval);
  assert.equal(
    billing.snapshot(subject).reserved,
    1,
    'A retry must reuse its original reservation.',
  );
  await assert.rejects(
    service.watchRuntimeApi(interrupted.token, {
      action: 'enqueue',
      requestId: randomUUID(),
      interval,
    }),
    (error) => error instanceof PairingError && error.status === 400,
  );
  await service.watchRuntimeApi(interrupted.token, {
    action: 'settle',
    requestId: retryId,
    status: 'completed',
    recordCount: 1,
    bytes: 100,
    httpStatus: 200,
    partial: false,
    error: null,
  });
  assert.equal(billing.snapshot(subject).reserved, 0);
} finally {
  Date.now = clock;
}

const disconnected = await configure(false),
  pending = randomUUID();
await service.watchRuntimeApi(disconnected.token, {
  action: 'enqueue',
  requestId: pending,
  interval,
});
barrier = makeBarrier();
const inFlight = service.watchRuntimeApi(disconnected.token, {
  action: 'start',
  requestId: pending,
  interval,
});
await barrier.waiting;
pairing.disconnect(parent.id, subject);
service.cancelWatchParent(parent.id, subject);
barrier.resume();
barrier = null;
await assert.rejects(inFlight, (error) => error instanceof PairingError && error.status === 403);
assert.equal(billing.snapshot(subject).reserved, 0);
db.close();
console.log(
  'PASS watch concurrent interval freeze, agent blocking during entitlement verification, independent session renewal, expiry, self-revocation, scoped billing cleanup, frozen retries after nine days and parent disconnect race',
);
