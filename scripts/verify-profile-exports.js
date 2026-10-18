import { exportSchemas, parseExportSchema } from '../core/export-schemas.js';
import { parseProfile, profileLink, profileFromLink } from '../core/profiles.js';
import { redirectSystemPath } from '../src/app/+native-intent.js';
import assert from 'node:assert/strict';
import {
  parseSchedule,
  dueOccurrences,
  nextOccurrence,
  occurrenceDays,
} from '../core/schedules.js';
import {
  parseExportSettings,
  exportBasename,
  fileHeader,
  recordChunk,
  fileFooter,
} from '../core/export-files.js';
import { localCalendar } from '../client/calendar.js';
const calendar = {
  day: (/** @type {string} */ s) => s.slice(0, 10),
  instant: (/** @type {string} */ d, /** @type {number} */ h, /** @type {number} */ m) =>
    `${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`,
};
const progress = {
  enabled: true,
  enabledAt: '2026-01-01T00:00:00.000Z',
  lastCompleted: null,
  lastRefresh: null,
};
const minuteCadence = parseSchedule({
  frequency: 'custom',
  unit: 'minute',
  interval: 1,
  todayRefresh: true,
});
const minuteProgress = { ...progress, enabledAt: '2026-10-16T12:00:30.000Z' };
assert.deepEqual(
  dueOccurrences(minuteCadence, minuteProgress, '2026-10-16T12:01:29.999Z', calendar),
  [],
);
assert.deepEqual(
  dueOccurrences(minuteCadence, minuteProgress, '2026-10-16T12:01:30.000Z', calendar),
  [{ kind: 'today-refresh', fireDate: '2026-10-16T12:01:30.000Z' }],
);
assert.equal(
  nextOccurrence(minuteCadence, minuteProgress, '2026-10-16T12:01:30.000Z', calendar),
  '2026-10-16T12:02:30.000Z',
);
assert.deepEqual(
  dueOccurrences(
    minuteCadence,
    { ...minuteProgress, lastRefresh: '2026-10-16T12:01:30.000Z' },
    '2026-10-16T12:01:59.000Z',
    calendar,
  ),
  [],
);
assert.deepEqual(
  dueOccurrences(minuteCadence, minuteProgress, '2026-10-17T13:10:59.000Z', calendar),
  [{ kind: 'today-refresh', fireDate: '2026-10-17T13:10:30.000Z' }],
  'Missed slots coalesce to one latest refresh, with no duplicate Today Refresh',
);
assert.equal(
  dueOccurrences(
    minuteCadence,
    { ...minuteProgress, enabled: false },
    '2026-10-17T13:10:59.000Z',
    calendar,
  ).length,
  0,
);
assert.equal(
  nextOccurrence(
    parseSchedule({ frequency: 'custom', unit: 'hour', interval: 2 }),
    minuteProgress,
    '2026-10-16T13:59:30.000Z',
    calendar,
  ),
  '2026-10-16T14:00:30.000Z',
);
assert.equal(
  nextOccurrence(minuteCadence, minuteProgress, '2026-10-15T12:00:30.000Z', calendar),
  '2026-10-16T12:01:30.000Z',
  'No runs before opt-in',
);
for (const interval of [0, -1, 0.5, 366])
  assert.throws(() => parseSchedule({ frequency: 'custom', unit: 'minute', interval }));
// Multiple daily runs share the same catch-up/checkpoint policy as single-time schedules.
const multiple = parseSchedule({ dailyTimes: ['18:45', '00:00', '08:15', '08:15'] });
assert.deepEqual(multiple.dailyTimes, ['00:00', '08:15', '18:45']);
assert.equal(
  parseSchedule({}).dailyTimes,
  undefined,
  'Legacy schedules keep their persisted fingerprint',
);
for (const dailyTimes of [['24:00'], ['8:00'], ['08:60'], [null], '08:00'])
  assert.throws(() => parseSchedule({ dailyTimes }));
for (const refreshHours of [0, 25, 1.5]) assert.throws(() => parseSchedule({ refreshHours }));
assert.equal(parseSchedule({ refreshHours: 1 }).refreshHours, 1);
assert.equal(parseSchedule({ refreshHours: 24 }).refreshHours, 24);
const morning = '2026-03-09T08:15:00.000Z';
assert.equal(nextOccurrence(multiple, progress, '2026-03-09T08:00:00.000Z', calendar), morning);
assert.deepEqual(dueOccurrences(multiple, progress, morning, calendar), [
  { kind: 'completed-day', fireDate: morning },
]);
assert.deepEqual(
  dueOccurrences(multiple, { ...progress, lastCompleted: morning }, morning, calendar),
  [],
);
assert.equal(
  nextOccurrence(multiple, progress, '2026-03-09T19:00:00.000Z', calendar),
  '2026-03-10T00:00:00.000Z',
);
assert.equal(
  dueOccurrences(multiple, progress, '2026-03-09T19:00:00.000Z', calendar)[0]?.fireDate,
  '2026-03-09T18:45:00.000Z',
);
assert.deepEqual(
  dueOccurrences(multiple, { ...progress, enabledAt: morning }, morning, calendar),
  [],
);
assert.deepEqual(
  occurrenceDays({ kind: 'completed-day', fireDate: morning }, 2, calendar, true).map(
    (day) => day.day,
  ),
  ['2026-03-07', '2026-03-08', '2026-03-09'],
);
assert.equal(
  occurrenceDays({ kind: 'today-refresh', fireDate: morning }, 7, calendar, true).length,
  1,
);
console.log(
  'Multiple daily times: validation, ordering, deduplication, midnight, catch-up, checkpoints and scheduled Include today passed.',
);
const monthly = parseSchedule({ frequency: 'custom', unit: 'month', anchorDate: '2026-01-31' });
assert.equal(
  dueOccurrences(monthly, progress, '2026-02-28T09:00:00.000Z', calendar)[0]?.fireDate,
  '2026-02-28T08:00:00.000Z',
);
assert.equal(
  nextOccurrence(monthly, progress, '2026-02-28T09:00:00.000Z', calendar),
  '2026-03-31T08:00:00.000Z',
);
const daily = parseSchedule({ todayRefresh: true });
const due = dueOccurrences(daily, progress, '2026-03-09T18:00:00.000Z', calendar);
assert.deepEqual(
  due.map((v) => v.kind),
  ['completed-day', 'today-refresh'],
);
assert.equal(due[1]?.fireDate, '2026-03-09T17:00:00.000Z');
assert.equal(
  dueOccurrences(
    daily,
    { ...progress, lastCompleted: due[0]?.fireDate ?? null },
    '2026-03-09T18:00:00.000Z',
    calendar,
  ).length,
  1,
);
assert.equal(
  dueOccurrences(
    daily,
    { ...progress, enabledAt: '2026-03-09T18:00:00.000Z' },
    '2026-03-09T18:00:00.000Z',
    calendar,
  ).length,
  0,
);
const completed = due[0];
assert.ok(completed);
assert.deepEqual(
  occurrenceDays(completed, 3, calendar).map((v) => v.day),
  ['2026-03-06', '2026-03-07', '2026-03-08'],
);
assert.equal(
  dueOccurrences(
    parseSchedule({ frequency: 'weekly', weekday: 1 }),
    progress,
    '2026-03-11T08:00:00.000Z',
    calendar,
  )[0]?.fireDate,
  '2026-03-09T08:00:00.000Z',
);
const originalTZ = process.env.TZ;
process.env.TZ = 'America/New_York';
for (const [day, hours] of [
  ['2026-03-08', 23],
  ['2026-11-01', 25],
]) {
  const occurrence = {
    kind: /** @type {const} */ ('today-refresh'),
    fireDate: localCalendar.instant(String(day), 12, 0),
  };
  const interval = occurrenceDays(occurrence, 1, localCalendar)[0];
  assert.ok(interval);
  assert.equal((Date.parse(interval.end) - Date.parse(interval.start)) / 3600000, hours);
}
if (originalTZ === undefined) delete process.env.TZ;
else process.env.TZ = originalTZ;
const record = {
  domain: /** @type {const} */ ('health'),
  type: 'sleep',
  source: 'native',
  start: null,
  end: null,
  native: { text: 'line\n"quote"', array: [1, 2] },
};
for (const format of /** @type {const} */ (['json', 'jsonl'])) {
  const content =
    fileHeader(format) +
    recordChunk(format, record, 0) +
    recordChunk(format, record, 1) +
    fileFooter(format, { recordCount: 2, warnings: ['partial'] });
  if (format === 'json') assert.deepEqual(JSON.parse(content).records, [record, record]);
  else
    assert.deepEqual(
      content
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
      [record, record],
    );
}
assert.equal(
  exportBasename(parseExportSettings({ filenameTemplate: '{year}_{month}_{day}' }), '2026-03-09'),
  '2026_03_09.v1',
);
for (const value of [
  { formats: ['csv'] },
  { formats: ['markdown'] },
  { folderName: '../escape' },
  { filenameTemplate: 'same' },
  { writeMode: 'unknown' },
])
  assert.throws(() => parseExportSettings(value));
console.log(
  'Profile exports: calendar cadence, opt-in, independent refresh, DST and JSON/JSONL verified.',
);

const registry = exportSchemas();
assert.deepEqual(
  registry.versions.map((v) => v.id),
  ['myself.md.export.v1'],
);
assert.equal(registry.recommended, 'myself.md.export.v1');
const firstSchema = registry.versions[0];
assert.ok(firstSchema);
firstSchema.title = 'mutated';
const originalSchema = exportSchemas().versions[0];
assert.ok(originalSchema);
assert.equal(originalSchema.title, 'Original');
const pinned = parseProfile({
  schema: 'myself.md.profile.v1',
  name: 'Pinned',
  selection: { health: [], time: [], location: [] },
});
assert.equal(pinned.export.schema, 'myself.md.export.v1');
const canonicalLink = profileLink(pinned);
assert.ok(canonicalLink.startsWith('myselfmd://profile?'));
assert.deepEqual(profileFromLink(canonicalLink), pinned);
for (const initial of [false, true]) {
  assert.equal(redirectSystemPath({ path: canonicalLink, initial }), '/profiles');
  assert.equal(redirectSystemPath({ path: 'myselfmd://oauth?code=test', initial }), '/account');
  assert.equal(
    redirectSystemPath({ path: 'myselfmd://pair?payload=test', initial }),
    'myselfmd://pair?payload=test',
  );
  assert.equal(
    redirectSystemPath({ path: 'myselfmd://profiles/example', initial }),
    'myselfmd://profiles/example',
  );
}
const shared = {
  ...pinned,
  id: 'sender-profile',
  agentAccess: true,
  agentPermissions: { health: false, time: true, location: false, logs: false },
};
assert.deepEqual(profileFromLink(profileLink(shared)), pinned);
assert.throws(() => profileFromLink(canonicalLink.replace('myselfmd://', 'qrconnect://')));
assert.equal(parseProfile({ ...pinned, schema: 'qr-connect.profile.v1' }).schema, pinned.schema);
for (const schema of ['myself.md.export.v2', 'latest', null, 'v1']) {
  assert.throws(() => parseExportSchema(schema), /Unsupported export schema/);
  assert.throws(() => parseExportSettings({ schema }), /Unsupported export schema/);
}
assert.equal(
  JSON.parse(
    fileHeader('json', pinned.export.schema) + fileFooter('json', { schema: pinned.export.schema }),
  ).schema,
  pinned.export.schema,
);
console.log(
  'Export schemas: released registry, immutable descriptors, profile pinning, share-link round trip and unsupported-version rejection passed.',
);

const { compatibleProfile } = await import('../core/profile-compatibility.js');
const imported = {
  ...pinned,
  selection: {
    health: [
      'native:HKQuantityTypeIdentifierStepCount',
      'native:Steps',
      'native:HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      'native:HKQuantityTypeIdentifierDietaryProtein',
    ],
    time: ['native:applications', 'native:websites'],
    location: ['native:points'],
  },
  export: { ...pinned.export, formats: ['json', 'jsonl'], lookbackDays: 14 },
  schedule: { ...pinned.schedule, hour: 9, minute: 30 },
  agentAccess: true,
};
const beforeImport = JSON.stringify(imported);
const androidCatalog = {
  health: ['native:Steps', 'native:HeartRateVariabilityRmssd', 'native:Nutrition'],
  time: ['native:applications', 'native:sessions'],
  location: ['native:points'],
};
const reviewed = compatibleProfile(imported, androidCatalog);
assert.deepEqual(reviewed.profile.selection, {
  health: ['native:Steps'],
  time: ['native:applications'],
  location: ['native:points'],
});
assert.equal(reviewed.mapped.length, 1);
assert.deepEqual(
  reviewed.unsupported.map((item) => item.type),
  [
    'native:HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    'native:HKQuantityTypeIdentifierDietaryProtein',
    'native:websites',
  ],
);
assert.equal(JSON.stringify(imported), beforeImport);
assert.deepEqual(reviewed.profile.export, imported.export);
assert.deepEqual(reviewed.profile.schedule, imported.schedule);
assert.equal('agentAccess' in reviewed.profile, false);
assert.deepEqual(compatibleProfile(reviewed.profile, androidCatalog).mapped, []);
const iosReviewed = compatibleProfile(
  {
    ...pinned,
    selection: { health: ['native:Steps'], time: ['native:sessions'], location: ['native:points'] },
  },
  {
    health: ['native:HKQuantityTypeIdentifierStepCount'],
    time: ['native:applications', 'native:websites'],
    location: ['native:points'],
  },
);
assert.deepEqual(iosReviewed.profile.selection.health, [
  'native:HKQuantityTypeIdentifierStepCount',
]);
assert.equal(iosReviewed.unsupported[0]?.type, 'native:sessions');
assert.equal(
  compatibleProfile(imported, { health: [], time: [], location: [] }).unsupported.length,
  7,
);
assert.throws(
  () =>
    compatibleProfile(
      imported,
      /** @type {Record<import('../core/data.js').Domain,string[]>} */ ({}),
    ),
  /catalog/,
);
console.log(
  'Profile compatibility: bidirectional steps, exact selections, deduplication, no grouped/SDNN guesses, unsupported exclusions, consent omission and original preservation passed.',
);
