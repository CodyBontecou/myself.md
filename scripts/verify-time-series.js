import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as data from '../core/data.js';
import * as types from '../client/health-types.js';
import * as profiles from '../core/profiles.js';
import * as exportFiles from '../core/export-files.js';
/** @param {string} path @param {Record<string,Record<string,unknown>>} dependencies */
async function load(path, dependencies) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'));
  await module.link((specifier) => {
    const values = dependencies[specifier];
    assert.ok(values, `Missing dependency ${specifier}`);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
const start = '2026-10-08T00:00:00.000Z';
const sample = {
  uuid: '00000000-0000-4000-8000-000000000001',
  quantityType: 'HKQuantityTypeIdentifierHeartRate',
  startDate: start,
  endDate: '2026-10-08T00:00:01.000Z',
  quantity: 70,
  unit: 'count/min',
  metadata: { arbitrary: [false, 0, { private: 'original' }] },
};
const points = [
  { timestamp: start, timestampMs: Date.parse(start) + 0.125, value: 0, unit: sample.unit },
  { timestamp: start, timestampMs: Date.parse(start) + 0.125, value: 0, unit: sample.unit },
  { timestamp: '2026-10-08T00:00:00.500Z', value: 72, unit: sample.unit },
];
const preciseStart = '2026-10-08T00:00:00.000125170Z';
let failSeries = false;
let failDetails = false;
let partialSeries = false;
const fullWorkout = {
  allStatistics: { energy: { sum: { value: 23, unit: 'kcal' } } },
  activities: [
    {
      workoutConfiguration: { activityType: 37, locationType: 3, swimmingLocationType: 0 },
      events: [],
      typedMetadata: {},
    },
  ],
};
const nativeFailures = [
  {
    operation: 'workoutPlan',
    identifier: 'workout',
    status: 'failed',
    domain: 'WorkoutKit.ImportError',
    code: 3,
    nativeError: 'WorkoutKit.ImportError.unrecognizedDataFormat',
    message: 'Plan decode failed.',
  },
];
const series =
  /** @type {{captureHealthSamples:(samples:Record<string,unknown>[])=>Promise<Record<string,unknown>[]>}} */ (
    await load('../client/health-series.js', {
      expo: {
        requireOptionalNativeModule: () => ({
          sampleDetails: async (/** @type {string} */ _identifier, /** @type {string} */ id) => {
            if (failDetails) return JSON.stringify({ captureFailures: nativeFailures });
            return JSON.stringify({
              startDate: preciseStart,
              typedMetadata: {
                huge: { type: 'unsigned_integer', value: '18446744073709551615' },
                date: { type: 'date', value: preciseStart },
              },
              ...(id === 'workout' ? fullWorkout : {}),
            });
          },
          characteristic: async (/** @type {string} */ identifier) =>
            JSON.stringify({
              characteristicType: identifier,
              characteristicValue: 0,
              capturedAt: preciseStart,
              captureKind: 'current-snapshot',
            }),
          workoutRoutes: async () =>
            JSON.stringify({
              records: [
                {
                  uuid: 'route',
                  locations: [
                    {
                      date: preciseStart,
                      altitude: 1,
                      latitude: 2,
                      longitude: 3,
                      courseAccuracy: 0,
                      sourceInformation: { isSimulatedBySoftware: false },
                    },
                  ],
                },
              ],
              captureFailures: [],
            }),
          quantitySeries: async () => {
            if (failSeries) throw new Error('Native read failed');
            return JSON.stringify({
              sampleCount: 3,
              quantitySeries: partialSeries ? points.slice(0, 1) : points,
              ...(partialSeries ? { captureFailures: nativeFailures } : {}),
            });
          },
        }),
      },
    })
  );
const captured = (await series.captureHealthSamples([sample]))[0];
assert.ok(captured);
assert.deepEqual(captured.metadata, sample.metadata);
assert.deepEqual(captured.quantitySeries, points);
assert.equal(captured.startDate, preciseStart);
const preciseRow = data.record('health', sample.quantityType, 'healthkit', captured);
assert.equal(preciseRow.start, preciseStart);
assert.equal(
  data.record('health', sample.quantityType, 'healthkit', { startDate: preciseStart, value: 0 })
    .timeSeries?.samples?.[0]?.timestamp,
  preciseStart,
);
const row = data.record('health', sample.quantityType, 'healthkit', captured);
assert.equal(row.timeSeries?.quantitySeries?.length, 3);
assert.equal(
  row.timeSeries?.samples,
  undefined,
  'Do not present the parent aggregate as another measurement',
);
assert.equal(row.timeSeries?.quantitySeries?.[0]?.value, 0);
assert.equal(row.timeSeries?.quantitySeries?.[0]?.timestampMs, points[0]?.timestampMs);
const correlation = (
  await series.captureHealthSamples([{ uuid: 'correlation', objects: [sample, sample] }])
)[0];
assert.ok(correlation);
assert.equal(
  data.record('health', 'HKCorrelationTypeIdentifierBloodPressure', 'healthkit', correlation)
    .timeSeries?.objects?.length,
  6,
);
const many = await series.captureHealthSamples(
  Array.from({ length: 13 }, (_, index) => ({ ...sample, index })),
);
assert.deepEqual(
  many.map((value) => value.index),
  Array.from({ length: 13 }, (_, index) => index),
);
for (const format of /** @type {const} */ (['json', 'jsonl'])) {
  const content =
    exportFiles.fileHeader(format) +
    exportFiles.recordChunk(format, row, 0) +
    exportFiles.fileFooter(format, { recordCount: 1 });
  const restored = format === 'json' ? JSON.parse(content).records[0] : JSON.parse(content);
  assert.deepEqual(restored, row);
}
const android = data.record('health', 'HeartRate', 'health-connect', {
  startTime: start,
  samples: [
    { time: start, beatsPerMinute: 60 },
    { time: start, beatsPerMinute: 60 },
  ],
});
assert.equal(android.timeSeries?.samples?.length, 2);
assert.equal(android.timeSeries?.samples?.[0]?.value, 60);
assert.equal(android.timeSeries?.samples?.[0]?.unit, 'count/min');
const ecg = data.record('health', 'HKElectrocardiogramType', 'healthkit', {
  startDate: start,
  voltages: [{ timeSinceSampleStart: 0.000125, voltage: 0, lead: 'appleWatchSimilarToLeadI' }],
});
assert.equal(ecg.timeSeries?.voltages?.[0]?.offsetSeconds, 0.000125);
assert.equal(ecg.timeSeries?.voltages?.[0]?.value, 0);
const heartbeat = data.record('health', 'HKDataTypeIdentifierHeartbeatSeries', 'healthkit', {
  startDate: start,
  heartbeats: [{ timeSinceSeriesStart: 0.5, precededByGap: false }],
});
assert.equal(heartbeat.timeSeries?.heartbeats?.[0]?.timestamp, '2026-10-08T00:00:00.500Z');
assert.equal(heartbeat.timeSeries?.heartbeats?.[0]?.value, false);
const invalid = data.record('health', 'FutureSeries', 'health-connect', {
  startTime: start,
  samples: [{ time: 'invalid', value: null }],
});
assert.equal(invalid.timeSeries?.samples?.[0]?.timestamp, null);
assert.equal(invalid.timeSeries?.samples?.[0]?.value, null);
const unknownTime = data.record('health', 'FutureSeries', 'health-connect', {
  startTime: start,
  samples: [{ value: 0 }, { time: null, value: false }],
});
assert.ok(unknownTime.timeSeries?.samples?.every((point) => point.timestamp === null));
const nativeWorkout = {
  toJSON: () => ({
    startDate: start,
    workoutActivityType: 37,
    uuid: 'workout',
    sampleType: { identifier: 'HKWorkoutTypeIdentifier' },
  }),
  getWorkoutRoutes: async () => [
    { locations: [{ date: start, altitude: 1, latitude: 2, longitude: 3 }] },
  ],
  getWorkoutPlan: async () => undefined,
};
let childQueries = 0;
const hk = {
  WorkoutActivityType: { running: 37, cycling: 13 },
  isObjectTypeAvailable: () => true,
  isHealthDataAvailable: () => true,
  requestAuthorization: async (/** @type {{toRead:string[]}} */ request) => {
    assert.ok(request.toRead.includes('HKWorkoutRouteTypeIdentifier'));
    for (const type of types.characteristics) assert.ok(request.toRead.includes(type));
    assert.ok(!request.toRead.some((type) => type.startsWith('HKCorrelation')));
  },
  queryQuantitySamples: async (
    /** @type {string} */ identifier,
    /** @type {{filter:{workout:unknown},limit:number}} */ options,
  ) => {
    assert.equal(options.filter.workout, nativeWorkout, 'Use source association, not date overlap');
    assert.equal(options.limit, 0, 'Do not cap or truncate workout samples');
    childQueries++;
    return identifier === sample.quantityType || identifier === 'HKQuantityTypeIdentifierStepCount'
      ? [{ ...sample, quantityType: identifier }]
      : [];
  },
  queryQuantitySamplesWithAnchor: async () => ({
    samples: [sample],
    deletedSamples: [],
    newAnchor: 'next',
  }),
};
const workout = /** @type {{captureWorkout:(value:unknown)=>Promise<Record<string,unknown>>}} */ (
  await load('../client/workout-series.js', {
    '@kingstinct/react-native-healthkit': hk,
    './health-series.js': series,
    './health-types.js': types,
  })
);
const workoutCapture = await workout.captureWorkout(nativeWorkout);
assert.equal(childQueries, types.quantities.length);
assert.deepEqual(workoutCapture.allStatistics, fullWorkout.allStatistics);
assert.deepEqual(workoutCapture.activities, fullWorkout.activities);
const workoutRow = data.record('health', 'HKWorkoutTypeIdentifier', 'healthkit', workoutCapture);
assert.equal(workoutRow.timeSeries?.heartRate?.length, 3);
assert.equal(workoutRow.timeSeries?.HKQuantityTypeIdentifierStepCount?.length, 3);
assert.equal(workoutRow.timeSeries?.altitude?.[0]?.value, 1);
assert.deepEqual(workoutCapture.captureFailures, []);
partialSeries = true;
const partialChild = (await series.captureHealthSamples([sample]))[0];
assert.ok(partialChild);
assert.deepEqual(
  partialChild.quantitySeries,
  points.slice(0, 1),
  'Retain successfully read children when the stream fails',
);
assert.deepEqual(partialChild.captureFailures, nativeFailures);
partialSeries = false;
failSeries = true;
const failed = (await series.captureHealthSamples([sample]))[0];
assert.ok(failed);
assert.equal(failed.quantity, sample.quantity, 'Retain parent on nested failure');
assert.ok(failed.captureFailures);
const health =
  /** @type {{authorizeHealth:()=>Promise<void>,healthTypes:()=>Promise<string[]>,healthPage:(query:import('../core/data.js').DataQuery,token:string)=>Promise<import('../core/data.js').DataPage>}} */ (
    await load('../client/health.js', {
      'react-native': { Platform: { OS: 'ios' } },
      '@kingstinct/react-native-healthkit': hk,
      'react-native-health-connect': {},
      './health-types.js': types,
      '../core/data.js': data,
      './health-series.js': series,
      './workout-series.js': workout,
    })
  );
await health.authorizeHealth();
const snapshotQuery = {
  domain: /** @type {const} */ ('health'),
  type: types.characteristics[0] ?? '',
  source: /** @type {const} */ ('native'),
  start,
  end: '2026-10-09T00:00:00.000Z',
  cursor: '',
  limit: 1,
  format: /** @type {const} */ ('json'),
};
const snapshotPage = await health.healthPage(snapshotQuery, '');
const snapshotRow = snapshotPage.records[0];
assert.ok(snapshotRow);
assert.equal(snapshotPage.capture, 'current-characteristic-snapshot');
assert.equal(snapshotPage.records[0]?.start, null);
assert.deepEqual(snapshotPage.records[0]?.timeSeries, {});
assert.equal(snapshotPage.nextCursor, null);
assert.equal(/** @type {Record<string,unknown>} */ (snapshotRow.native).capturedAt, preciseStart);
await assert.rejects(health.healthPage(snapshotQuery, 'anchor'), /do not accept/);
failDetails = true;
const failedDetails = (await series.captureHealthSamples([sample]))[0];
assert.equal(failedDetails?.quantity, sample.quantity);
assert.ok(Array.isArray(failedDetails?.captureFailures));
assert.deepEqual(failedDetails.captureFailures[0], nativeFailures[0]);
failDetails = false;
const partial = await health.healthPage(
  {
    domain: 'health',
    type: sample.quantityType,
    source: 'native',
    start,
    end: '2026-10-09T00:00:00.000Z',
    cursor: '',
    limit: 1,
    format: 'json',
  },
  '',
);
assert.equal(partial.complete, false);
assert.equal(partial.nextCursor, 'next');
assert.equal(partial.records.length, 1);
assert.ok(partial.warnings.some((warning) => warning.includes('nested')));
const phone =
  /** @type {{readPage:(owner:string,query:import('../core/data.js').DataQuery,profile:import('../core/profiles.js').ExportProfile,forChat?:boolean)=>Promise<import('../core/data.js').DataPage>}} */ (
    await load('../client/data.js', {
      'expo-location': {},
      'react-native': { Platform: { OS: 'ios' } },
      '../core/profiles.js': profiles,
      '../core/data.js': data,
      './library.js': {
        localPage: () => {
          throw new Error('Unexpected location read');
        },
      },
      './health.js': health,
      './usage.js': {
        usageStatus: async () => 'unavailable',
        usagePage: async () => {
          throw new Error('Unexpected usage read');
        },
      },
    })
  );
const selectedProfile = {
  ...profiles.parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Snapshots',
    selection: { health: ['native:' + snapshotQuery.type], time: [], location: [] },
  }),
  id: 'snapshot-profile',
  agentAccess: true,
};
assert.equal((await phone.readPage('owner', snapshotQuery, selectedProfile)).records.length, 1);
await assert.rejects(
  phone.readPage('owner', snapshotQuery, { ...selectedProfile, agentAccess: false }),
  /not approved/,
);
await assert.rejects(
  phone.readPage(
    'owner',
    snapshotQuery,
    { ...selectedProfile, selection: { health: [], time: [], location: [] } },
    false,
  ),
  /disabled/,
);
await assert.rejects(
  phone.readPage('owner', { ...snapshotQuery, type: 'HKWorkoutTypeIdentifier' }, selectedProfile),
  /not approved/,
);
for (const format of /** @type {const} */ (['json', 'jsonl'])) {
  const restored = JSON.parse(data.exportPage(snapshotPage, format));
  assert.deepEqual(format === 'json' ? restored.records[0] : restored, snapshotRow);
}
console.log(
  'Time series: full child capture, duplicate/zero values, raw metadata, waveform precision, workout associations, serialization and partial failures verified.',
);
