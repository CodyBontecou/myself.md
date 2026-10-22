import { Platform } from 'react-native';
import * as HK from '@kingstinct/react-native-healthkit';
import * as HC from 'react-native-health-connect';
import { quantities, categories, androidTypes, special, characteristics } from './health-types.js';
import { record } from '../core/data.js';
import { captureHealthSamples, readHealthCharacteristic } from './health-series.js';
import { captureWorkout } from './workout-series.js';
/** @typedef {import('@kingstinct/react-native-healthkit').ObjectTypeIdentifier} HKType */
/** @param {boolean} [selectable] Include Android types awaiting system consent.
 * @returns {Promise<string[]>} */
export async function healthTypes(selectable = false) {
  if (Platform.OS === 'ios') {
    if (!HK.isHealthDataAvailable()) return [];
    return [...quantities, ...categories, ...special, ...characteristics].filter((type) => {
      try {
        return HK.isObjectTypeAvailable(/** @type {HKType} */ (type));
      } catch {
        return false;
      }
    });
  }
  if (Platform.OS === 'android' && (await HC.initialize())) {
    if (selectable) return [...androidTypes];
    const permissions = await HC.getGrantedPermissions();
    return androidTypes.filter((type) =>
      permissions.some((p) => p.accessType === 'read' && p.recordType === type),
    );
  }
  return [];
}
/** @param {string[]} [selected] Profile source keys; omitted for source-wide review. */
export async function authorizeHealth(selected) {
  const chosen = selected
    ?.filter((key) => key.startsWith('native:') && !key.startsWith('native:whoop.'))
    .map((key) => key.slice(7));
  if (chosen && !chosen.length)
    throw new Error(
      'Select a native Health data type in this profile before reviewing permissions.',
    );
  if (Platform.OS === 'ios') {
    const available = await healthTypes();
    const requested = chosen ? new Set(chosen) : null;
    if (requested?.has('HKCorrelationTypeIdentifierBloodPressure')) {
      requested.add('HKQuantityTypeIdentifierBloodPressureSystolic');
      requested.add('HKQuantityTypeIdentifierBloodPressureDiastolic');
    }
    if (requested?.has('HKCorrelationTypeIdentifierFood'))
      for (const identifier of quantities.filter((type) =>
        type.startsWith('HKQuantityTypeIdentifierDietary'),
      ))
        requested.add(identifier);
    // Workouts preserve genuinely associated quantity samples and routes.
    if (requested?.has('HKWorkoutTypeIdentifier'))
      for (const type of quantities) requested.add(type);
    const types = available.filter((type) => !requested || requested.has(type));
    if (!types.length)
      throw new Error(
        'HealthKit is unavailable on this device. You can still import health exports.',
      );
    // Correlations are readable through their constituent quantity permissions.
    // Requesting a correlation itself raises an Objective-C HealthKit exception.
    await HK.requestAuthorization({
      toRead: /** @type {HKType[]} */ ([
        ...types.filter((t) => !t.startsWith('HKCorrelation')),
        ...(!chosen || chosen.includes('HKWorkoutTypeIdentifier')
          ? ['HKWorkoutRouteTypeIdentifier']
          : []),
      ]),
    });
  } else if (Platform.OS === 'android') {
    if (!(await HC.initialize())) throw new Error('Install or update Health Connect, then retry.');
    await HC.requestPermission(
      androidTypes
        .filter((type) => !chosen || chosen.includes(type))
        .map((type) => ({
          accessType: 'read',
          recordType: /** @type {import('react-native-health-connect').RecordType} */ (type),
        })),
    );
  }
}
/** Check only the requested iOS type; availability is rechecked on every page.
 * Android retains its dynamic per-type permission lookup.
 * @param {string} type */
async function readableHealthType(type) {
  if (Platform.OS !== 'ios') return (await healthTypes()).includes(type);
  if (![...quantities, ...categories, ...special, ...characteristics].includes(type)) return false;
  if (!HK.isHealthDataAvailable()) return false;
  try {
    return HK.isObjectTypeAvailable(/** @type {HKType} */ (type));
  } catch {
    return false;
  }
}
/** @param {import('../core/data.js').DataQuery} query @param {string} token @returns {Promise<import('../core/data.js').DataPage>} */
export async function healthPage(query, token) {
  if (!(await readableHealthType(query.type)))
    throw new Error('This health type is unavailable or not permitted.');
  if (Platform.OS === 'android') {
    const result = await HC.readRecords(
      /** @type {import('react-native-health-connect').RecordType} */ (query.type),
      {
        timeRangeFilter: { operator: 'between', startTime: query.start, endTime: query.end },
        pageSize: query.limit,
        ascendingOrder: true,
        ...(token ? { pageToken: token } : {}),
      },
    );
    return {
      records: result.records.map((r) => record('health', query.type, 'health-connect', r)),
      nextCursor: result.pageToken ?? null,
      capture: 'native-readable-samples',
      warnings: [
        'Health Connect can limit historical reads to 30 days unless historical access is granted. Exercise routes may require separate consent; a route is not inferred from an exercise summary.',
      ],
    };
  }
  if (characteristics.includes(query.type)) {
    if (token) throw new Error('Characteristic snapshots do not accept an anchor.');
    const snapshot = await readHealthCharacteristic(query.type);
    return {
      records: [record('health', query.type, 'healthkit', snapshot)],
      nextCursor: null,
      capture: 'current-characteristic-snapshot',
      complete: true,
      warnings: [
        'Current characteristic captured at read time; the requested interval is not its historical effective date.',
      ],
    };
  }
  const options = {
    limit: query.limit,
    filter: {
      date: {
        startDate: new Date(query.start),
        endDate: new Date(query.end),
        strictStartDate: true,
      },
    },
    ...(token ? { anchor: token } : {}),
  };
  let result;
  if (quantities.includes(query.type))
    result = await HK.queryQuantitySamplesWithAnchor(
      /** @type {import('@kingstinct/react-native-healthkit').QuantityTypeIdentifier} */ (
        query.type
      ),
      options,
    );
  else if (categories.includes(query.type))
    result = await HK.queryCategorySamplesWithAnchor(
      /** @type {import('@kingstinct/react-native-healthkit').CategoryTypeIdentifier} */ (
        query.type
      ),
      options,
    );
  else if (query.type === 'HKWorkoutTypeIdentifier') {
    const workouts = await HK.queryWorkoutSamplesWithAnchor(options);
    // Workout proxies must be explicitly serialized to preserve fields.
    const samples = await Promise.all(workouts.workouts.map(captureWorkout));
    result = { ...workouts, samples };
  } else if (query.type.startsWith('HKCorrelation')) {
    const correlations = await HK.queryCorrelationSamplesWithAnchor(
      /** @type {import('@kingstinct/react-native-healthkit').CorrelationTypeIdentifier} */ (
        query.type
      ),
      options,
    );
    result = { ...correlations, samples: correlations.correlations };
  } else if (query.type === 'HKElectrocardiogramType')
    result = await HK.queryElectrocardiogramSamplesWithAnchor({
      ...options,
      includeVoltages: true,
    });
  else if (query.type === 'HKDataTypeIdentifierHeartbeatSeries')
    result = await HK.queryHeartbeatSeriesSamplesWithAnchor(options);
  else if (query.type === 'HKStateOfMindTypeIdentifier')
    result = await HK.queryStateOfMindSamplesWithAnchor(options);
  else throw new Error('Unsupported HealthKit query.');
  // JSON serialization turns Date values into ISO instants; units and metadata remain native.
  let samples = /** @type {Record<string,unknown>[]} */ (
    JSON.parse(JSON.stringify(result.samples))
  );
  if (query.type !== 'HKWorkoutTypeIdentifier') samples = await captureHealthSamples(samples);
  const complete = !samples.some(
    (sample) => Array.isArray(sample.captureFailures) && sample.captureFailures.length,
  );
  const full = samples.length >= query.limit || result.deletedSamples.length >= query.limit;
  return {
    records: samples
      .map((r) => record('health', query.type, 'healthkit', r))
      .filter(
        (r) =>
          r.start === null ||
          (Date.parse(r.start) >= Date.parse(query.start) &&
            Date.parse(r.start) < Date.parse(query.end)),
      ),
    nextCursor: full ? result.newAnchor : null,
    capture: 'native-readable-samples',
    complete,
    warnings: [
      'HealthKit hides read denial. An empty result can mean no data or no authorization; it is not proof of full access.',
      'This adapter does not capture clinical FHIR, attachments, audiograms, medications or vision prescriptions. Those fields are unavailable through this adapter.',
      ...(!complete
        ? [
            'Some nested health detail could not be captured. Parent samples are retained; inspect native.captureFailures.',
          ]
        : []),
      ...(result.deletedSamples.length
        ? [`Deleted native sample IDs: ${JSON.stringify(result.deletedSamples)}`]
        : []),
    ],
  };
}
