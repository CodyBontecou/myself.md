import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as data from '../core/data.js';
import * as types from '../client/health-types.js';
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
let failSeries = false;
const series =
  /** @type {{captureQuantitySeries:(samples:Record<string,unknown>[])=>Promise<Record<string,unknown>[]>}} */ (
    await load('../client/health-series.js', {
      expo: {
        requireOptionalNativeModule: () => ({
          quantitySeries: async () => {
            if (failSeries) throw new Error('Native read failed');
            return JSON.stringify({ sampleCount: 3, quantitySeries: points });
          },
        }),
      },
    })
  );
const captured = (await series.captureQuantitySeries([sample]))[0];
assert.ok(captured);
assert.deepEqual(captured.metadata, sample.metadata);
assert.deepEqual(captured.quantitySeries, points);
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
  await series.captureQuantitySeries([{ uuid: 'correlation', objects: [sample, sample] }])
)[0];
assert.ok(correlation);
assert.equal(
  data.record('health', 'HKCorrelationTypeIdentifierBloodPressure', 'healthkit', correlation)
    .timeSeries?.objects?.length,
  6,
);
const many = await series.captureQuantitySeries(
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
  toJSON: () => ({ startDate: start, workoutActivityType: 37, uuid: 'workout' }),
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
const workoutRow = data.record('health', 'HKWorkoutTypeIdentifier', 'healthkit', workoutCapture);
assert.equal(workoutRow.timeSeries?.heartRate?.length, 3);
assert.equal(workoutRow.timeSeries?.HKQuantityTypeIdentifierStepCount?.length, 3);
assert.equal(workoutRow.timeSeries?.altitude?.[0]?.value, 1);
assert.deepEqual(workoutCapture.captureFailures, []);
failSeries = true;
const failed = (await series.captureQuantitySeries([sample]))[0];
assert.ok(failed);
assert.equal(failed.quantity, sample.quantity, 'Retain parent on nested failure');
assert.ok(failed.captureFailures);
const health =
  /** @type {{healthPage:(query:import('../core/data.js').DataQuery,token:string)=>Promise<import('../core/data.js').DataPage>}} */ (
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
console.log(
  'Time series: full child capture, duplicate/zero values, raw metadata, waveform precision, workout associations, serialization and partial failures verified.',
);
