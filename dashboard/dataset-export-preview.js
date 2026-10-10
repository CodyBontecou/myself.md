import { domains, record } from '../core/data.js';
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
  record('time', 'sessions', 'native-usage', {
    identifier: 'com.example.reader',
    startMs: Date.parse(start),
    endMs: Date.parse(end),
    durationMs: Date.parse(end) - Date.parse(start),
    observedStartMs: Date.parse(start),
    startClipped: false,
    endReason: 'pause',
    granularity: 'foreground-session',
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
const samples = nativeRecords;
/** Build the exact JSON file format used by daily exports, from selected mock readings.
 * @param {import('../core/profiles.js').ResolvedDraft} profile */
export function datasetExportPreview(profile) {
  const storedProfile = { ...profile, id: 'example-profile' };
  const records = samples.filter((sample) =>
    profileAllows(storedProfile, {
      domain: sample.domain,
      type: sample.type,
      source: /** @type {const} */ ('native'),
    }),
  );
  const captures = domains.flatMap((domain) =>
    profile.selection[domain].map((key) => {
      const source = /** @type {const} */ ('native');
      const type = key.slice(key.indexOf(':') + 1);
      return {
        domain,
        type,
        source,
        capture:
          domain === 'health'
            ? type.startsWith('HKCharacteristic')
              ? 'current-characteristic-snapshot'
              : 'native-readable-samples'
            : domain === 'location'
              ? 'recorded-location-points'
              : type === 'sessions'
                ? 'native-usage-sessions'
                : 'native-usage-aggregates',
        warnings: [],
      };
    }),
  );
  const emptyTypes = captures.filter(
    ({ domain, type }) =>
      !records.some((sample) => sample.domain === domain && sample.type === type),
  );
  const manifest = {
    schema: profile.export.schema,
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
    fileHeader('json', profile.export.schema) +
    records
      .map((sample, index) => recordChunk('json', sample, index, profile.export.schema))
      .join('') +
    fileFooter('json', manifest);
  return { value: /** @type {Record<string,unknown>} */ (JSON.parse(json)), emptyTypes };
}
