import { exportSchemas, parseExportSchema } from '../core/export-schemas.js';
import { parseProfile, profileLink, profileFromLink } from '../core/profiles.js';
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
assert.equal(profileFromLink(profileLink(pinned)).export.schema, pinned.export.schema);
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
