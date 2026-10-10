import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { usageSessions } from '../core/usage-sessions.js';
import * as data from '../core/data.js';
import * as profiles from '../core/profiles.js';
import { normalizeRecord } from '../core/explorer.js';
import { fileHeader, recordChunk, fileFooter } from '../core/export-files.js';

/** @param {import('../core/usage-sessions.js').UsageEvent['kind']} kind @param {number} timeMs @param {string} [identifier] @param {string} [activity] */
function event(kind, timeMs, identifier = 'reader', activity = '1') {
  return { kind, timeMs, identifier, activity };
}
const events = [
  event('resume', 5),
  event('resume', 6),
  event('pause', 25),
  event('resume', 30),
  event('resume', 35, 'reader', '2'),
  event('pause', 40),
  event('resume', 42, 'chat'),
  event('pause', 50, 'reader', '2'),
  event('screen-off', 60),
  event('pause', 65, 'unknown'),
  event('resume', 70),
  event('shutdown', 80),
  event('resume', 85),
  event('startup', 90),
  event('resume', 95),
];
const sessions = usageSessions(events, 10, 100);
assert.deepEqual(
  sessions.map((row) => [row.identifier, row.startMs, row.endMs, row.endReason]),
  [
    ['reader', 10, 25, 'pause'],
    ['reader', 30, 50, 'pause'],
    ['chat', 42, 60, 'screen-off'],
    ['reader', 70, 80, 'shutdown'],
    ['reader', 95, 100, 'query-boundary'],
  ],
);
assert.equal(sessions[0]?.startClipped, true);
assert.equal(sessions[0]?.observedStartMs, 5);
assert.equal(
  sessions[1]?.durationMs,
  20,
  'Multiple activities and duplicate resumes do not inflate time',
);
assert.deepEqual(
  usageSessions([event('pause', 20)], 10, 30),
  [],
  'Unknown starts are not fabricated',
);
assert.deepEqual(usageSessions([event('resume', 10), event('pause', 10)], 10, 30), []);
assert.deepEqual(usageSessions(events, 100, 100), []);
assert.deepEqual(
  usageSessions(
    Array.from({ length: events.length }, (_, index) => events[events.length - index - 1]).filter(
      (row) => row !== undefined,
    ),
    10,
    100,
  ),
  sessions,
);

/** @param {string} path @param {Record<string,Record<string,unknown>>} dependencies */
async function load(path, dependencies) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'));
  await module.link((specifier) => {
    const values = dependencies[specifier];
    assert.ok(values, `Missing ${specifier}`);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
let authorized = true,
  reads = 0;
const usage =
  /** @type {{usagePage:(query:import('../core/data.js').DataQuery,token:string)=>Promise<import('../core/data.js').DataPage>,usageStatus:()=>Promise<string>}} */ (
    await load('../client/usage.js', {
      expo: {
        requireOptionalNativeModule: () => ({
          status: async () => (authorized ? 'authorized' : 'denied'),
          readEvents: async () => {
            reads++;
            return { events, observedEndMs: 100 };
          },
        }),
      },
      '../core/data.js': data,
      '../core/usage-sessions.js': { usageSessions },
    })
  );
const platform = { OS: 'android' };
const phone =
  /** @type {{catalog:(owner:string,grants:Record<import('../core/data.js').Domain,boolean>,profile?:import('../core/profiles.js').ExportProfile)=>Promise<{domains:{types:string[],selectableTypes:string[]}[]}>,readPage:(owner:string,query:import('../core/data.js').DataQuery,profile:import('../core/profiles.js').ExportProfile,forChat?:boolean)=>Promise<import('../core/data.js').DataPage>}} */ (
    await load('../client/data.js', {
      'expo-location': { getForegroundPermissionsAsync: async () => ({ granted: false }) },
      'react-native': { Platform: platform },
      '../core/profiles.js': profiles,
      '../core/data.js': data,
      './library.js': {
        localPage: () => {
          throw new Error('Unexpected location read');
        },
      },
      './health.js': {
        healthTypes: async () => [],
        healthPage: async () => {
          throw new Error('Unexpected health read');
        },
      },
      './usage.js': usage,
    })
  );
const query = /** @type {import('../core/data.js').DataQuery} */ ({
  domain: 'time',
  type: 'sessions',
  source: 'native',
  start: new Date(10).toISOString(),
  end: new Date(200).toISOString(),
  limit: 2,
  cursor: '',
  format: 'json',
});
const profile = {
  ...profiles.parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Sessions',
    selection: { health: [], time: ['native:sessions'], location: [] },
  }),
  id: 'sessions',
  agentAccess: true,
};
const grants = { health: false, time: true, location: false };
assert.ok(
  (await phone.catalog('alice', grants, profile)).domains[1]?.types.includes('native:sessions'),
);
platform.OS = 'ios';
assert.ok(
  !(await phone.catalog('alice', grants)).domains[1]?.selectableTypes.includes('native:sessions'),
);
platform.OS = 'android';
let page = await phone.readPage('alice', query, profile);
const rows = [...page.records];
while (page.nextCursor) {
  // Pagination is sequential because each page supplies the next query cursor.
  // oxlint-disable-next-line eslint/no-await-in-loop
  page = await phone.readPage('alice', { ...query, cursor: page.nextCursor }, profile);
  rows.push(...page.records);
}
assert.deepEqual(
  rows.map((row) => row.native),
  sessions,
);
assert.equal(page.capture, 'native-usage-sessions');
assert.ok(page.warnings.some((warning) => warning.includes('Missing events')));
const before = reads;
await assert.rejects(
  phone.readPage('alice', query, { ...profile, agentAccess: false }),
  /not approved/,
);
await assert.rejects(
  phone.readPage(
    'alice',
    query,
    { ...profile, selection: { health: [], time: [], location: [] } },
    false,
  ),
  /disabled/,
);
assert.equal(reads, before, 'Denied profiles never invoke native reads');
authorized = false;
await assert.rejects(phone.readPage('alice', query, profile), /unavailable/);
assert.equal(reads, before, 'OS denial never invokes event collection');
authorized = true;
await assert.rejects(usage.usagePage(query, '-1'), /Invalid usage cursor/);
await assert.rejects(
  phone.readPage(
    'alice',
    {
      ...query,
      cursor: JSON.stringify({
        domain: 'time',
        type: 'applications',
        source: 'native',
        start: query.start,
        end: query.end,
        token: '2',
      }),
    },
    profile,
  ),
  /different query/,
);
const json =
  fileHeader('json', profile.export.schema) +
  rows.map((row, i) => recordChunk('json', row, i, profile.export.schema)).join('') +
  fileFooter('json', { recordCount: rows.length });
assert.equal(JSON.parse(json).records.length, sessions.length);
assert.equal(
  data
    .exportPage({ ...page, records: rows }, 'jsonl')
    .trim()
    .split('\n').length,
  sessions.length,
);
const first = rows[0];
assert.ok(first);
const normalized = normalizeRecord(
  first,
  {
    exportId: 'file',
    index: 0,
    profileId: 'sessions',
    profileName: 'Sessions',
    deviceId: 'phone',
    day: '1970-01-01',
  },
  'file:0',
);
assert.equal(normalized.duration, 0.015);
assert.equal(normalized.fields['native.startClipped'], true);
assert.equal(normalized.fields['native.endReason'], 'pause');
console.log(
  'Session reconstruction, paging, profile/OS authorization, exports and dashboard records passed.',
);
