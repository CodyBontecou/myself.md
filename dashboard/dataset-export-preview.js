import { domains, importRecords, record } from '../core/data.js';
import { fileHeader, recordChunk, fileFooter } from '../core/export-files.js';
import { profileAllows } from '../core/profiles.js';
import { healthMockReadings } from './health-mock-readings.js';

const start = '2026-10-08T08:00:00.000Z';
const end = '2026-10-08T08:30:00.000Z';
const interval = {
  day: '2026-10-08',
  start: '2026-10-08T00:00:00.000Z',
  end: '2026-10-09T00:00:00.000Z',
};
const nativeRecords = [
  ...healthMockReadings(start, end),
  record('time', 'applications', 'native-usage', {
    identifier: 'com.example.reader',
    displayName: 'Reader',
    category: 'Education',
    deviceName: 'Example iPhone',
    startMs: Date.parse(start),
    endMs: Date.parse(end),
    durationMs: 1200000,
    pickups: 2,
    notifications: 0,
    granularity: 'hourly-aggregate',
  }),
  record('time', 'websites', 'native-usage', {
    identifier: 'example.com',
    category: 'Education',
    deviceName: 'Example iPhone',
    startMs: Date.parse(start),
    endMs: Date.parse(end),
    durationMs: 300000,
    granularity: 'hourly-aggregate',
  }),
  record('location', 'points', 'expo-location', {
    timestamp: Date.parse(start),
    coords: {
      latitude: 38.7223,
      longitude: -9.1393,
      accuracy: 8,
      altitude: 24,
      altitudeAccuracy: 10,
      heading: null,
      speed: null,
    },
  }),
];
const archives = {
  health: {
    samples: [{ startDate: start, endDate: end, quantity: 1250, unit: 'count' }],
    records: [{ startDate: start, endDate: end, quantity: 72, unit: 'count/min' }],
    workouts: [{ startDate: start, endDate: end, activity: 'walking', duration: 1800 }],
    healthkit_record_archive: {
      records: [
        {
          object_type_identifier: 'HKQuantityTypeIdentifierStepCount',
          start_date: start,
          end_date: end,
          quantity: 1250,
          unit: 'count',
        },
      ],
    },
  },
  time: {
    rawScreenTime: [{ startMs: Date.parse(start), endMs: Date.parse(end), durationMs: 1200000 }],
    applications: [
      {
        startMs: Date.parse(start),
        endMs: Date.parse(end),
        identifier: 'com.example.reader',
        durationMs: 1200000,
      },
    ],
    websites: [
      {
        startMs: Date.parse(start),
        endMs: Date.parse(end),
        identifier: 'example.com',
        durationMs: 300000,
      },
    ],
    dailyTrends: [{ date: interval.day, durationMs: 3600000 }],
    hourlyActivity: [{ startMs: Date.parse(start), durationMs: 1200000 }],
  },
  location: {
    points: [{ timestamp: Date.parse(start), latitude: 38.7223, longitude: -9.1393 }],
    visits: [{ arrivedAt: start, departedAt: end, name: 'Example park' }],
    outings: [{ startDate: start, endDate: end, distanceMeters: 950 }],
  },
};
const samples = [
  ...nativeRecords,
  ...domains.flatMap((domain) => [
    ...importRecords(domain, archives[domain]).slice(1),
    record(domain, 'archive', 'imported-original', {
      archiveId: `example-${domain}`,
      name: `${domain}.json`,
      index: 0,
      total: 1,
      text: JSON.stringify(archives[domain]),
    }),
  ]),
];
/** Build the exact JSON file format used by daily exports, from selected mock readings.
 * @param {import('../core/profiles.js').ResolvedDraft} profile */
export function datasetExportPreview(profile) {
  const storedProfile = { ...profile, id: 'example-profile' };
  const records = samples.filter((sample) =>
    profileAllows(storedProfile, {
      domain: sample.domain,
      type: sample.type,
      source: sample.source.startsWith('imported') ? 'imported' : 'native',
    }),
  );
  const captures = domains.flatMap((domain) =>
    profile.selection[domain].map((key) => {
      const source = key.startsWith('imported:') ? 'imported' : 'native';
      const type = key.slice(key.indexOf(':') + 1);
      return {
        domain,
        type,
        source,
        capture:
          source === 'imported'
            ? type === 'archive'
              ? 'lossless-import-chunks'
              : 'recorded-or-imported'
            : domain === 'health'
              ? 'native-readable-samples'
              : domain === 'location'
                ? 'recorded-or-imported'
                : 'native-usage-aggregates',
        warnings: [],
      };
    }),
  );
  const emptyTypes = captures.filter(
    ({ domain, type, source }) =>
      !records.some(
        (sample) =>
          sample.domain === domain &&
          sample.type === type &&
          (sample.source.startsWith('imported') ? 'imported' : 'native') === source,
      ),
  );
  const manifest = {
    schema: 'myself.md.export.v1',
    profileId: storedProfile.id,
    profileName: profile.name,
    interval,
    recordCount: records.length,
    captures,
    status: 'complete',
    failures: [],
    exportedAt: '2026-10-09T00:00:00.000Z',
  };
  const json =
    fileHeader('json') +
    records.map((sample, index) => recordChunk('json', sample, index)).join('') +
    fileFooter('json', manifest);
  return { value: /** @type {Record<string,unknown>} */ (JSON.parse(json)), emptyTypes };
}
