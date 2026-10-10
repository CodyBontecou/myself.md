import * as HK from '@kingstinct/react-native-healthkit';
import { captureQuantitySeries } from './health-series.js';
import { quantities } from './health-types.js';
/** Query real workout associations, never infer membership from overlapping times.
 * @param {Awaited<ReturnType<typeof HK.queryWorkoutSamplesWithAnchor>>['workouts'][number]} workout */
export async function captureWorkout(workout) {
  const native = workout.toJSON();
  /** @type {Record<string,unknown[]>} */ const timeSeries = {};
  /** @type {Record<string,unknown[]>} */ const associatedSamples = {};
  /** @type {string[]} */ const captureFailures = [];
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
          const enriched = await captureQuantitySeries(
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
            captureFailures.push(`${key}: quantity-series detail could not be read.`);
        } catch {
          captureFailures.push(`${key}: associated samples could not be read.`);
        }
      }),
    );
  }
  let routes = /** @type {Awaited<ReturnType<typeof workout.getWorkoutRoutes>>} */ ([]);
  try {
    routes = await workout.getWorkoutRoutes();
    timeSeries.altitude = routes.flatMap((route) =>
      route.locations.map((location) => ({
        timestamp: location.date,
        value: location.altitude,
        unit: 'm',
        native: location,
      })),
    );
  } catch {
    captureFailures.push('Workout routes could not be read.');
  }
  let workoutPlan;
  try {
    workoutPlan = await workout.getWorkoutPlan();
  } catch {
    captureFailures.push('The associated workout plan could not be read.');
  }
  return {
    ...native,
    routes,
    associatedSamples,
    timeSeries,
    ...(workoutPlan ? { workoutPlan } : {}),
    captureFailures,
  };
}
