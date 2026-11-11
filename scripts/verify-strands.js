import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  parseStrandsExperiment,
  strandsDay,
  strandsExperimentReview,
  strandsPatterns,
} from '../core/strands.js';
import { parseProfile } from '../core/profiles.js';
import { BillingStore } from '../server/billing-store.js';
import { CloudStore } from '../server/cloud-store.js';
import { HistoryStore } from '../server/history-store.js';
import { createCloudService } from '../server/cloud-service.js';
import { restrictChatgptTools, chatgptToolNames } from '../server/chatgpt-tools.js';
import { screenTimeHourSlots } from '../server/screen-time-hours.js';
import { reviewToolMetadata } from './mcp-review-metadata.js';

/** All fixtures are fictional and relative to the current UTC date so days are completed. */
const dayMs = 86400000;
/** @param {string} date @param {number} offset */
const shift = (date, offset) =>
  new Date(Date.parse(date) + offset * dayMs).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);
const first = shift(today, -40);
const home = { latitude: 18.4, longitude: -66.1 },
  cafe = { latitude: 18.45, longitude: -66.05 };
/** @param {string} date @param {string} time */
const at = (date, time) => `${date}T${time}:00.000Z`;
/** @type {import('../core/data.js').DataRecord[]} */
const records = [];
for (let index = 0; index < 40; index++) {
  const date = shift(first, index),
    next = shift(date, 1),
    even = index % 2 === 0;
  /** @param {string} time @param {{latitude:number,longitude:number}} place */
  const point = (time, place) =>
    records.push({
      domain: 'location',
      type: 'points',
      source: 'fictional-location',
      start: at(date, time),
      end: at(date, time),
      native: { coords: { ...place, accuracy: 10 }, fictional: true },
    });
  point('10:00', home);
  for (const time of ['18:30', '19:30', '20:30']) point(time, even ? home : cafe);
  /** @param {string} hour @param {number} minutes */
  const usage = (hour, minutes) =>
    records.push({
      domain: 'time',
      type: 'applications',
      source: 'fictional-time',
      start: at(date, `${hour}:00`),
      end: at(date, `${hour}:59`),
      native: {
        displayName: 'Fictional Reader',
        identifier: 'com.fictional.reader',
        durationMs: minutes * 60000,
        granularity: 'hour',
        fictional: true,
      },
    });
  usage('10', 15);
  usage('22', even ? 50 : 5);
  records.push({
    domain: 'health',
    type: 'HKCategoryTypeIdentifierSleepAnalysis',
    source: 'fictional-sleep',
    start: even ? at(date, '23:30') : at(date, '22:30'),
    end: even ? at(next, '07:00') : at(next, '06:30'),
    native: { value: 3, fictional: true },
  });
  for (const [time, bpm] of /** @type {const} */ ([
    ['12:00', 70],
    ['18:45', 110 + (index % 5)],
  ]))
    records.push({
      domain: 'health',
      type: 'HKQuantityTypeIdentifierHeartRate',
      source: 'fictional-heart',
      start: at(date, time),
      end: at(date, time),
      native: { quantity: bpm, unit: 'count/min', fictional: true },
    });
}
const rows = records.map((record) => ({ record, exportId: 'fixture' }));
/** @param {string} start @param {string} end */
const utcDays = (start, end) =>
  Array.from({ length: (Date.parse(end) - Date.parse(start)) / dayMs + 1 }, (_, k) => {
    const date = shift(start, k);
    return { date, start: at(date, '00:00'), end: at(shift(date, 1), '00:00') };
  });

// Core: one day, patterns, validation and experiment progress.
const dayDate = shift(first, 35); // odd: evening at the café
const oneDay = utcDays(dayDate, dayDate);
const coreDay = strandsDay(
  /** @type {import('../core/strands.js').ReviewDay} */ (oneDay[0]),
  rows,
  screenTimeHourSlots(oneDay, 'UTC'),
  'UTC',
);
assert.equal(coreDay.attention.hours.find((h) => h.hour === 22)?.minutes, 5);
assert.equal(coreDay.attention.hours.find((h) => h.hour === 10)?.minutes, 15);
assert.equal(coreDay.attention.hours.find((h) => h.hour === 3)?.minutes, 0, 'observed day → 0');
assert.equal(coreDay.attention.totalMinutes, 20);
assert.equal(coreDay.body.peak?.bpm, 110);
assert.equal(coreDay.place.runs.length, 2);
assert.equal(coreDay.place.places[0]?.points, 3, 'most-recorded place is Place 1');
const blank = strandsDay(
  /** @type {import('../core/strands.js').ReviewDay} */ (oneDay[0]),
  [],
  screenTimeHourSlots(oneDay, 'UTC'),
  'UTC',
);
assert.equal(blank.attention.totalMinutes, null, 'no usage records → unknown');
assert.ok(blank.attention.hours.every((h) => h.minutes === null));
assert.equal(blank.body.peak, null);
assert.deepEqual([blank.body.sleep, blank.body.steps, blank.body.resting], [[], [], null]);
assert.ok(blank.warnings.some((w) => w.startsWith('No heart-rate samples, steps or sleep')));
assert.equal(
  coreDay.body.sleep[0]?.start,
  oneDay[0]?.start,
  'overnight sleep is clipped to the day',
);
assert.ok((coreDay.coverage.sleepMinutes ?? 0) > 0);

// Body without heart rate: sleep, hourly steps from one source, resting heart rate.
/** @param {string} source @param {string} start @param {string} end @param {number} count */
const step = (source, start, end, count) => ({
  record: {
    domain: /** @type {const} */ ('health'),
    type: 'HKQuantityTypeIdentifierStepCount',
    source: 'native',
    start: at(dayDate, start),
    end: at(dayDate, end),
    native: { quantity: count, unit: 'count', sourceRevision: source, fictional: true },
  },
  exportId: 'fixture',
});
const bodyOnly = strandsDay(
  /** @type {import('../core/strands.js').ReviewDay} */ (oneDay[0]),
  [
    step('phone', '08:30', '09:30', 600),
    step('phone', '14:00', '14:10', 50),
    step('watch', '08:00', '08:10', 40),
    {
      record: {
        domain: 'health',
        type: 'HKQuantityTypeIdentifierRestingHeartRate',
        source: 'native',
        start: at(dayDate, '03:47'),
        end: at(dayDate, '03:47'),
        native: { quantity: 62, unit: 'count/min', fictional: true },
      },
      exportId: 'fixture',
    },
  ],
  screenTimeHourSlots(oneDay, 'UTC'),
  'UTC',
);
assert.deepEqual(
  bodyOnly.body.steps.map((h) => [h.start.slice(11, 16), h.count]),
  [
    ['08:00', 300],
    ['09:00', 300],
    ['14:00', 50],
  ],
  'steps are split across hours from the source with most steps only',
);
assert.equal(bodyOnly.body.stepsTotal, 650);
assert.deepEqual(bodyOnly.body.resting, { time: at(dayDate, '03:47'), bpm: 62 });
assert.equal(bodyOnly.body.samples.length, 0);
assert.ok(bodyOnly.warnings.some((w) => w.includes('None of these is a heart-rate trace')));
assert.ok(bodyOnly.warnings.some((w) => w.includes('1 other step source is not added')));
console.log(
  'PASS Body falls back to sleep, hourly steps and resting heart rate without heart rate.',
);
const patternDays = utcDays(shift(first, 2), shift(first, 16));
const corePatterns = strandsPatterns(
  patternDays,
  rows,
  screenTimeHourSlots(patternDays, 'UTC'),
  'UTC',
);
assert.equal(corePatterns.nights.length, 14);
const onset = corePatterns.patterns.find((p) => p.id === 'late-phone-onset');
assert.equal(onset?.delta, 60, 'heavy-use nights start sleep 60 min later in the fixture');
assert.ok(corePatterns.patterns.some((p) => p.id.startsWith('place-sleep:')));
assert.ok(corePatterns.patterns.every((p) => p.claim === 'observed' && p.caveat));
assert.throws(() => parseStrandsExperiment({ rule: { kind: 'phone_down', cutoffHour: 17 } }));
assert.throws(() => parseStrandsExperiment({ rule: { kind: 'limit_app', cutoffHour: 22 } }));
assert.equal(
  parseStrandsExperiment({
    rule: { kind: 'phone_down', cutoffHour: 22 },
    startDate: today,
    timezone: 'UTC',
  }).title,
  'Phone down by 22:00',
);
const completeStart = shift(today, -10);
const reviewDays = utcDays(shift(completeStart, -28), shift(completeStart, 7));
const coreReview = strandsExperimentReview(
  {
    id: randomUUID(),
    ...parseStrandsExperiment({
      rule: { kind: 'phone_down', cutoffHour: 22, allowanceMinutes: 10 },
      startDate: completeStart,
      timezone: 'UTC',
    }),
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  },
  reviewDays,
  rows,
  screenTimeHourSlots(reviewDays, 'UTC'),
  today,
);
assert.equal(coreReview.status, 'complete');
assert.equal(coreReview.observed, 7);
assert.equal(coreReview.baseline.nights, 28);
assert.ok(coreReview.kept >= 3 && coreReview.kept <= 4, 'alternating fixture keeps every other');

// In-process MCP over a real CloudStore with metered, audited reads.
const cloud = new CloudStore(':memory:', randomBytes(32)),
  billing = new BillingStore(':memory:'),
  history = new HistoryStore(':memory:', cloud);
const subject = 'strands-fictional-owner',
  device = randomUUID();
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Fictional strands',
    selection: {
      health: [
        'native:HKQuantityTypeIdentifierHeartRate',
        'native:HKCategoryTypeIdentifierSleepAnalysis',
      ],
      time: ['native:applications'],
      location: ['native:points'],
    },
    export: { destination: 'cloud', formats: ['jsonl'] },
  }),
  id: 'strands-test',
};
const allowAll = { health: true, time: true, location: true, logs: false };
cloud.access(subject, device, profile, true);
cloud.syncAgentPermissions(subject, device, [
  { ...profile, agentAccess: true, agentPermissions: allowAll },
]);
billing.grant(subject, 'strands-fixture', 'fictional');
const file = cloud.begin(subject, device, profile.id, {
  day: today,
  format: 'jsonl',
  profile,
  manifest: {
    schema: profile.export.schema,
    profileId: profile.id,
    recordCount: records.length,
    interval: { start: at(first, '00:00'), end: at(today, '00:00') },
  },
});
await cloud.commit(
  subject,
  device,
  profile.id,
  file.id,
  Buffer.from(records.map((r) => JSON.stringify(r)).join('\n') + '\n'),
);
const service = createCloudService({ cloud, billing, history, refreshEntitlement: async () => {} });
/** @param {string} owner */
async function connect(owner) {
  const server = new McpServer({ name: 'strands-test', version: '1' });
  restrictChatgptTools(server);
  service.registerCloudTools(server, owner, 'strands-test');
  const client = new Client({ name: 'strands-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return { server, client };
}
const owner = await connect(subject),
  other = await connect('strands-other-owner');
/** @param {{client:Client}} who @param {string} name @param {Record<string,unknown>} args */
async function call(who, name, args) {
  return who.client.callTool({ name, arguments: args });
}
/** @param {Awaited<ReturnType<typeof call>>} response @returns {any} */
function ok(response) {
  assert.ok(!response.isError, JSON.stringify(response.content));
  return response.structuredContent;
}
const strandsTools = [
  'review_strands_day',
  'review_strands_patterns',
  'save_strands_experiment',
  'list_strands_experiments',
  'cancel_strands_experiment',
  'review_strands_experiment',
];
const all = { healthExportIds: [file.id], timeExportIds: [file.id], locationExportIds: [file.id] };
try {
  const tools = (await owner.client.listTools()).tools;
  reviewToolMetadata(tools.filter((t) => strandsTools.includes(t.name)));
  for (const name of strandsTools) {
    assert.ok(chatgptToolNames.includes(name), `${name} is on the restricted surface`);
    assert.ok(
      tools.some((t) => t.name === name),
      `${name} is listed`,
    );
  }
  const accessBefore = history.list(subject, device, 0).events.length;
  const day = ok(
    await call(owner, 'review_strands_day', { ...all, date: dayDate, timezone: 'UTC' }),
  );
  assert.deepEqual(
    { ...day, scope: undefined, exports: undefined },
    { ...coreDay, scope: undefined, exports: undefined },
    'MCP and phone use the same core computation',
  );
  assert.deepEqual(day.scope, {
    deviceId: device,
    profiles: { health: profile.id, time: profile.id, location: profile.id },
  });
  assert.ok(
    history.list(subject, device, 0).events.length > accessBefore,
    'reads are recorded in access history',
  );
  const timeOnly = ok(
    await call(owner, 'review_strands_day', {
      timeExportIds: [file.id],
      date: dayDate,
      timezone: 'UTC',
    }),
  );
  assert.equal(timeOnly.body.peak, null, 'unselected strands stay unknown');
  assert.equal(timeOnly.coverage.placePoints, 0);
  assert.equal(timeOnly.scope.profiles.health, null);
  assert.equal(
    (await call(owner, 'review_strands_day', { date: dayDate, timezone: 'UTC' })).isError,
    true,
    'at least one export list is required',
  );
  assert.equal(
    (await call(owner, 'review_strands_day', { ...all, date: today, timezone: 'UTC' })).isError,
    true,
    'today is not a completed day',
  );
  assert.equal(
    (await call(other, 'review_strands_day', { ...all, date: dayDate, timezone: 'UTC' })).isError,
    true,
    'other accounts cannot read these exports',
  );
  const patterns = ok(
    await call(owner, 'review_strands_patterns', {
      ...all,
      start: patternDays[0]?.date,
      end: shift(first, 15),
      timezone: 'UTC',
    }),
  );
  assert.deepEqual(patterns.patterns, corePatterns.patterns);
  assert.deepEqual(patterns.nights, corePatterns.nights);
  for (const [start, end] of [
    [shift(first, 2), shift(first, 6)],
    [shift(today, -10), shift(today, -1)],
  ])
    assert.equal(
      // Sequential calls keep billing and history assertions ordered.
      // oxlint-disable-next-line eslint/no-await-in-loop
      (await call(owner, 'review_strands_patterns', { ...all, start, end, timezone: 'UTC' }))
        .isError,
      true,
      'fewer than seven nights or an incomplete closing day is rejected',
    );

  // Experiments: MCP lifecycle, idempotency, validation and ownership.
  const requestId = randomUUID();
  const input = {
    requestId,
    rule: { kind: 'phone_down', cutoffHour: 22, allowanceMinutes: 10 },
    startDate: completeStart,
    nights: 7,
    timezone: 'UTC',
    sourcePattern: 'late-phone-onset',
  };
  const saved = ok(await call(owner, 'save_strands_experiment', input));
  assert.equal(saved.experiments[0].id, requestId);
  assert.equal(saved.experiments[0].phase, 'complete');
  assert.equal(saved.experiments[0].title, 'Phone down by 22:00');
  const retry = ok(await call(owner, 'save_strands_experiment', input));
  assert.equal(retry.experiments[0].createdAt, saved.experiments[0].createdAt);
  assert.equal(
    (await call(owner, 'save_strands_experiment', { ...input, nights: 8 })).isError,
    true,
    'requestId cannot be reused for a different experiment',
  );
  for (const invalid of [
    { ...input, requestId: randomUUID(), timezone: 'Mars/Olympus' },
    { ...input, requestId: randomUUID(), startDate: '2026-02-30' },
    { ...input, requestId: randomUUID(), rule: { kind: 'phone_down', cutoffHour: 2 } },
  ])
    // Sequential calls keep the stored-experiment count deterministic.
    // oxlint-disable-next-line eslint/no-await-in-loop
    assert.equal((await call(owner, 'save_strands_experiment', invalid)).isError, true);
  const sealed = cloud.db
    .prepare('SELECT value FROM strands_experiments WHERE subject=? AND id=?')
    .get(subject, requestId);
  assert.ok(!Buffer.from(/** @type {Uint8Array} */ (sealed?.value)).includes('late-phone-onset'));
  assert.equal(ok(await call(other, 'list_strands_experiments', {})).experiments.length, 0);
  assert.equal(
    (await call(other, 'cancel_strands_experiment', { experimentId: requestId })).isError,
    true,
  );
  assert.equal(
    (await call(other, 'review_strands_experiment', { experimentId: requestId, ...all })).isError,
    true,
  );
  const review = ok(
    await call(owner, 'review_strands_experiment', { experimentId: requestId, ...all }),
  );
  assert.deepEqual(review.nights, coreReview.nights);
  assert.equal(review.kept, coreReview.kept);
  assert.deepEqual(review.baseline, coreReview.baseline);
  assert.deepEqual(review.warnings, []);
  const running = ok(
    await call(owner, 'save_strands_experiment', {
      ...input,
      requestId: randomUUID(),
      startDate: shift(today, -2),
      nights: 5,
      sourcePattern: undefined,
    }),
  ).experiments[0];
  assert.equal(running.phase, 'running');
  const progress = ok(
    await call(owner, 'review_strands_experiment', { experimentId: running.id, ...all }),
  );
  assert.equal(progress.status, 'running');
  assert.deepEqual(
    progress.nights.map((/** @type {{state:string}} */ n) => n.state),
    [progress.nights[0].state, progress.nights[1].state, 'tonight', 'upcoming', 'upcoming'],
  );
  assert.ok(['kept', 'slipped'].includes(progress.nights[0].state));
  assert.equal(progress.warnings.length, 1, 'open closing day is disclosed');
  const listed = ok(await call(owner, 'list_strands_experiments', {}));
  assert.deepEqual(
    new Set(listed.experiments.map((/** @type {{id:string}} */ e) => e.id)),
    new Set([requestId, running.id]),
  );
  const cancelled = ok(
    await call(owner, 'cancel_strands_experiment', { experimentId: running.id }),
  );
  assert.equal(cancelled.cancelledId, running.id);
  assert.equal(cancelled.experiments[0].phase, 'cancelled');
  const again = ok(await call(owner, 'cancel_strands_experiment', { experimentId: running.id }));
  assert.equal(again.experiments[0].cancelledAt, cancelled.experiments[0].cancelledAt);
  assert.equal(
    (await call(owner, 'review_strands_experiment', { experimentId: running.id, ...all })).isError,
    true,
    'cancelled experiments are not reviewed',
  );

  // Revocation: removing a selected type hides its records; a deleted profile denies reads.
  cloud.syncAgentPermissions(subject, device, [
    {
      ...profile,
      selection: { ...profile.selection, location: [] },
      agentAccess: true,
      agentPermissions: allowAll,
    },
  ]);
  const unselected = ok(
    await call(owner, 'review_strands_day', { ...all, date: dayDate, timezone: 'UTC' }),
  );
  assert.equal(unselected.coverage.placePoints, 0, 'deselected location records are not read');
  cloud.syncAgentPermissions(subject, device, [{ ...profile, id: 'replacement-profile' }]);
  assert.equal(
    (await call(owner, 'review_strands_day', { ...all, date: dayDate, timezone: 'UTC' })).isError,
    true,
    'a removed profile blocks reads',
  );
  cloud.syncAgentPermissions(subject, device, [
    { ...profile, agentAccess: true, agentPermissions: allowAll },
  ]);
  const originalBytes = cloud.bytes.bind(cloud);
  cloud.bytes = async (row) => {
    const bytes = await originalBytes(row);
    cloud.syncAgentPermissions(subject, device, [{ ...profile, id: 'replacement-profile' }]);
    return bytes;
  };
  const revokedDuringRead = await call(owner, 'review_strands_day', {
    ...all,
    date: dayDate,
    timezone: 'UTC',
  });
  assert.equal(revokedDuringRead.isError, true);
  assert.equal(revokedDuringRead.structuredContent, undefined, 'no partial result');
  cloud.bytes = originalBytes;
} finally {
  await owner.client.close();
  await other.client.close();
  await owner.server.close();
  await other.server.close();
  history.db.close();
  cloud.db.close();
  billing.db.close();
}

// Persistence and the 100-experiment limit on a file-backed store.
const directory = mkdtempSync(join(tmpdir(), 'strands-'));
try {
  const key = randomBytes(32);
  const durable = new CloudStore(join(directory, 'cloud.sqlite'), key);
  const created = durable.strandsExperiments.create('limit-owner', {
    requestId: randomUUID(),
    rule: { kind: 'phone_down', cutoffHour: 21 },
    startDate: today,
    timezone: 'America/Puerto_Rico',
  }).experiment;
  durable.db.close();
  const reopened = new CloudStore(join(directory, 'cloud.sqlite'), key);
  assert.deepEqual(reopened.strandsExperiments.get('limit-owner', created.id), created);
  for (let index = 1; index < 100; index++)
    reopened.strandsExperiments.create('limit-owner', {
      requestId: randomUUID(),
      rule: { kind: 'phone_down', cutoffHour: 21 },
      startDate: today,
      timezone: 'UTC',
    });
  assert.throws(
    () =>
      reopened.strandsExperiments.create('limit-owner', {
        requestId: randomUUID(),
        rule: { kind: 'phone_down', cutoffHour: 21 },
        startDate: today,
        timezone: 'UTC',
      }),
    /100 experiments/,
  );
  reopened.db.close();
} finally {
  rmSync(directory, { recursive: true, force: true });
}

// Phone HTTP API and hosted MCP route through the shared application, as the Worker does.
const dataDirectory = mkdtempSync(join(tmpdir(), 'strands-http-'));
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'fixture' };
const identity = createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});
identity.listen(0, '127.0.0.1');
await once(identity, 'listening');
const identityAddress = identity.address();
assert.ok(identityAddress && typeof identityAddress !== 'string');
const issuer = `http://127.0.0.1:${identityAddress.port}/realms/test`;
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const reserved = reservation.address();
assert.ok(reserved && typeof reserved !== 'string');
const port = reserved.port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    DATA_DIR: dataDirectory,
    CLOUD_ENCRYPTION_KEY: 'b'.repeat(64),
    PUBLIC_URL: origin,
    PUBLIC_URL_ALIASES: '',
    OAUTH_ISSUER: issuer,
    ACCOUNT_NAMESPACE: 'https://strands.example/realms/test',
    ALLOW_HTTP_DEV: '1',
    AUTH_PROXY: '0',
    HOST: '127.0.0.1',
    PORT: String(port),
  },
  stdio: 'ignore',
});
/** @param {string} sub @param {string} azp */
const token = (sub, azp) =>
  new SignJWT({ scope: 'openid profile email myselfmd', azp })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(issuer)
    .setAudience(`${origin}/mcp`)
    .setSubject(sub)
    .setExpirationTime('5m')
    .sign(privateKey);
const phone = await token('alice', 'myselfmd-phone'),
  agent = await token('alice', 'fixture-agent'),
  dashboard = await token('alice', 'myselfmd-dashboard'),
  bob = await token('bob', 'myselfmd-phone');
/** @param {string} path @param {string|null} bearer @param {string} [method] @param {unknown} [body] */
async function request(path, bearer, method = 'GET', body) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, value: /** @type {any} */ (await response.json()) };
}
const mcp = new Client({ name: 'strands-http-agent', version: '1' });
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      // Each health poll follows the previous startup attempt.
      // oxlint-disable-next-line eslint/no-await-in-loop
      if ((await request('/health', null)).status === 200) break;
    } catch {}
    if (attempt === 99) throw new Error('Fixture service did not start.');
    // Wait for the child server to bind its port.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const base = '/api/strands/experiments';
  const body = {
    requestId: randomUUID(),
    rule: { kind: 'phone_down', cutoffHour: 22 },
    startDate: shift(today, 1),
    nights: 7,
    timezone: 'America/Puerto_Rico',
  };
  assert.equal((await request(base, null)).status, 401);
  assert.equal((await request(base, agent)).status, 403, 'agents use MCP, not the phone API');
  assert.equal((await request(base, dashboard)).status, 403);
  const created = await request(base, phone, 'POST', body);
  assert.equal(created.status, 201);
  assert.equal(created.value.id, body.requestId);
  assert.equal(created.value.rule.allowanceMinutes, 10);
  assert.equal(created.value.cancelledAt, null);
  const repeated = await request(base, phone, 'POST', body);
  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.value, created.value);
  assert.equal((await request(base, phone, 'POST', { ...body, nights: 9 })).status, 409);
  assert.equal(
    (await request(base, phone, 'POST', { ...body, requestId: randomUUID(), nights: 2 })).status,
    400,
  );
  assert.equal((await request(base, phone, 'POST', { ...body, requestId: 'x' })).status, 400);
  assert.equal((await request(base, phone, 'DELETE')).status, 405);
  assert.deepEqual((await request(base, phone)).value, { experiments: [created.value] });
  assert.deepEqual((await request(base, bob)).value, { experiments: [] });
  assert.equal((await request(`${base}/${body.requestId}/cancel`, bob, 'POST')).status, 404);

  await mcp.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${agent}` } },
    }),
  );
  const listed = /** @type {any} */ (
    (await mcp.callTool({ name: 'list_strands_experiments', arguments: {} })).structuredContent
  );
  assert.deepEqual(
    listed.experiments.map((/** @type {{phase:string}} */ { phase: _phase, ...e }) => e),
    [created.value],
    'phone-created experiments are visible to agents',
  );
  assert.equal(listed.experiments[0].phase, 'upcoming');
  const agentId = randomUUID();
  const agentSaved = await mcp.callTool({
    name: 'save_strands_experiment',
    arguments: { ...body, requestId: agentId, rule: { ...body.rule, cutoffHour: 21 } },
  });
  assert.ok(!agentSaved.isError, JSON.stringify(agentSaved.content));
  const phoneList = (await request(base, phone)).value.experiments;
  assert.deepEqual(
    new Set(phoneList.map((/** @type {{id:string}} */ e) => e.id)),
    new Set([agentId, body.requestId]),
  );
  const cancelled = await request(`${base}/${agentId}/cancel`, phone, 'POST');
  assert.equal(cancelled.status, 200);
  assert.ok(cancelled.value.cancelledAt);
  assert.deepEqual(
    (await request(`${base}/${agentId}/cancel`, phone, 'POST')).value,
    cancelled.value,
  );
  await mcp.callTool({
    name: 'cancel_strands_experiment',
    arguments: { experimentId: body.requestId },
  });
  assert.ok(
    (await request(base, phone)).value.experiments.every(
      (/** @type {{cancelledAt:string|null}} */ e) => e.cancelledAt,
    ),
    'agent cancellation is visible on the phone',
  );
  assert.equal((await request(`${base}/${randomUUID()}/cancel`, phone, 'POST')).status, 404);
  console.log(
    'Strands: core day/patterns/experiment calculations, MCP reads (billing, history, ownership, revocation), shared experiment store (encryption, idempotency, limit, persistence) and phone HTTP API/MCP parity passed.',
  );
} finally {
  await mcp.close();
  child.kill();
  identity.close();
  rmSync(dataDirectory, { recursive: true, force: true });
}
