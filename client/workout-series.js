import * as HK from '@kingstinct/react-native-healthkit';
import { captureHealthSamples, captureFailure, readWorkoutRoutes } from './health-series.js';
import { quantities } from './health-types.js';
/** Query real workout associations, never infer membership from overlapping times.
 * @param {Awaited<ReturnType<typeof HK.queryWorkoutSamplesWithAnchor>>['workouts'][number]} workout */
export async function captureWorkout(workout) {
  const native = workout.toJSON();
  const details =
    (
      await captureHealthSamples([
        /** @type {Record<string,unknown>} */ (JSON.parse(JSON.stringify(native))),
      ])
    )[0] ?? /** @type {Record<string,unknown>} */ (JSON.parse(JSON.stringify(native)));
  /** @type {Record<string,unknown[]>} */ const timeSeries = {};
  /** @type {Record<string,unknown[]>} */ const associatedSamples = {};
  /** @type {unknown[]} */ const detailFailures =
    'captureFailures' in details && Array.isArray(details.captureFailures)
      ? [...details.captureFailures]
      : [];
  // WorkoutKit's optional import is separate from the captured HealthKit workout.
  // Keep the omission diagnostic; never reclassify sample/permission failures.
  const planImportFailures = detailFailures.filter((failure) => {
    if (!Array.isArray(details.activities) || !details.allStatistics) return false;
    if (!failure || typeof failure !== 'object') return false;
    const value = /** @type {Record<string,unknown>} */ (failure);
    return value.operation === 'workoutPlan' && value.domain === 'WorkoutKit.ImportError';
  });
  const captureFailures = detailFailures.filter((failure) => !planImportFailures.includes(failure));
  const namedMetrics = [
    ['heartRate', 'HKQuantityTypeIdentifierHeartRate'],
    ...(native.workoutActivityType === HK.WorkoutActivityType.running
      ? [
          ['speed', 'HKQuantityTypeIdentifierRunningSpeed'],
          ['power', 'HKQuantityTypeIdentifierRunningPower'],
          ['strideLength', 'HKQuantityTypeIdentifierRunningStrideLength'],
          ['groundContactTime', 'HKQuantityTypeIdentifierRunningGroundContactTime'],
          ['verticalOscillation', 'HKQuantityTypeIdentifierRunningVerticalOscillation'],
        ]
      : native.workoutActivityType === HK.WorkoutActivityType.cycling
        ? [
            ['speed', 'HKQuantityTypeIdentifierCyclingSpeed'],
            ['power', 'HKQuantityTypeIdentifierCyclingPower'],
            ['cadence', 'HKQuantityTypeIdentifierCyclingCadence'],
          ]
        : []),
  ];
  const names = new Map(namedMetrics.map(([key, identifier]) => [identifier, key]));
  const metrics = quantities
    .filter((identifier) => {
      try {
        return HK.isObjectTypeAvailable(
          /** @type {import('@kingstinct/react-native-healthkit').QuantityTypeIdentifier} */ (
            identifier
          ),
        );
      } catch {
        return false;
      }
    })
    .map((identifier) => [names.get(identifier) ?? identifier, identifier]);
  for (let offset = 0; offset < metrics.length; offset += 5) {
    // Bound native child reads while retaining every associated readable metric.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await Promise.all(
      metrics.slice(offset, offset + 5).map(async ([key, identifier]) => {
        if (!key || !identifier) return;
        try {
          const samples = await HK.queryQuantitySamples(
            /** @type {import('@kingstinct/react-native-healthkit').QuantityTypeIdentifier} */ (
              identifier
            ),
            { filter: { workout }, ascending: true, limit: 0 },
          );
          const enriched = await captureHealthSamples(
            /** @type {Record<string,unknown>[]} */ (JSON.parse(JSON.stringify(samples))),
          );
          associatedSamples[key] = enriched;
          timeSeries[key] = enriched.flatMap((sample) =>
            Array.isArray(sample.quantitySeries)
              ? sample.quantitySeries.map((point) => ({
                  ...point,
                  metadata: sample.metadata,
                  sampleId: sample.uuid,
                }))
              : [
                  {
                    timestamp: sample.startDate,
                    value: sample.quantity,
                    unit: sample.unit,
                    metadata: sample.metadata,
                    sampleId: sample.uuid,
                  },
                ],
          );
          if (enriched.some((sample) => sample.captureFailures))
            captureFailures.push(
              captureFailure(
                'associatedSamples',
                identifier,
                new Error('Inspect associated sample captureFailures.'),
              ),
            );
        } catch (error) {
          captureFailures.push(captureFailure('associatedSamples', identifier, error));
        }
      }),
    );
  }
  /** @type {Record<string,unknown>[]} */ let routes = [];
  try {
    const result = await readWorkoutRoutes(native.uuid);
    routes = result.records;
    captureFailures.push(...result.captureFailures);
    for (const route of routes)
      if (Array.isArray(route.captureFailures)) captureFailures.push(...route.captureFailures);
    timeSeries.altitude = routes.flatMap((route) =>
      (Array.isArray(route.locations) ? route.locations : []).map((location) => ({
        timestamp: location.date,
        value: location.altitude,
        unit: 'm',
        native: location,
      })),
    );
  } catch (error) {
    captureFailures.push(captureFailure('workoutRoutes', native.uuid, error));
  }
  return {
    ...native,
    ...details,
    routes,
    associatedSamples,
    timeSeries,
    captureFailures,
    ...(planImportFailures.length
      ? {
          workoutPlanCapture: {
            status: 'unavailable',
            optional: true,
            message:
              'WorkoutKit could not import the optional structured plan. Inspect diagnostics; the captured HealthKit workout and samples are retained.',
            diagnostics: planImportFailures,
          },
        }
      : {}),
  };
}
