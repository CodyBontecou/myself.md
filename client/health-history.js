import { Platform } from 'react-native';
import * as HK from '@kingstinct/react-native-healthkit';
import * as HC from 'react-native-health-connect';
import { quantities, categories, characteristics } from './health-types.js';
import { record } from '../core/data.js';
import { whoopPage } from './whoop.js';

/** Find the earliest readable sample without loading its series or workout children.
 * Snapshots have no historical start. Any discovery failure stops the export rather than truncating it.
 * @param {string} owner @param {string[]} keys @param {string} end @param {()=>Promise<void>} check
 * @returns {Promise<string|null>} */
export async function earliestHealthDate(owner, keys, end, check) {
  let earliest = null;
  for (const key of keys) {
    // Discovery is deliberately sequential to respect provider query quotas and cancellation.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await check();
    const type = key.slice(key.indexOf(':') + 1);
    if (characteristics.includes(type) || type === 'whoop.body') continue;
    // oxlint-disable-next-line eslint/no-await-in-loop
    const start = await earliestType(owner, type, end, check);
    if (start && (!earliest || Date.parse(start) < Date.parse(earliest))) earliest = start;
  }
  return earliest;
}
/** @param {string} owner @param {string} type @param {string} end @param {()=>Promise<void>} check @returns {Promise<string|null>} */
async function earliestType(owner, type, end, check) {
  if (type.startsWith('whoop.')) {
    let cursor = '',
      earliest = null;
    const seen = new Set();
    do {
      if (seen.has(cursor)) throw new Error('WHOOP repeated a history cursor. Retry later.');
      seen.add(cursor);
      // WHOOP collections are reverse chronological; all pages are needed for discovery.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await check();
      // oxlint-disable-next-line eslint/no-await-in-loop
      const page = await whoopPage(
        owner,
        {
          domain: 'health',
          source: 'native',
          type,
          start: '1970-01-01T00:00:00.000Z',
          end,
          cursor: '',
          limit: 25,
          format: 'json',
        },
        cursor,
      );
      for (const row of page.records) {
        const native = /** @type {{created_at?:string}} */ (row.native);
        // WHOOP recovery has no start; provider filtering uses creation time.
        const date = row.start ?? native.created_at;
        if (!date || !Number.isFinite(Date.parse(date)))
          throw new Error(
            'WHOOP history has no usable date. Export this type separately with a recent window.',
          );
        if (!earliest || Date.parse(date) < Date.parse(earliest)) earliest = date;
      }
      cursor = page.nextCursor ?? '';
    } while (cursor);
    return earliest;
  }
  if (Platform.OS === 'android') {
    if (!(await HC.initialize())) throw new Error('Install or update Health Connect, then retry.');
    let permissions = await HC.getGrantedPermissions();
    if (
      !permissions.some((p) => p.recordType === 'ReadHealthDataHistory' && p.accessType === 'read')
    ) {
      await HC.requestPermission([{ accessType: 'read', recordType: 'ReadHealthDataHistory' }]);
      await check();
      permissions = await HC.getGrantedPermissions();
    }
    if (
      !permissions.some((p) => p.recordType === 'ReadHealthDataHistory' && p.accessType === 'read')
    )
      throw new Error(
        'All Time requires Health Connect past-data access. Enable it in Health Connect app permissions, then retry.',
      );
    const page = await HC.readRecords(
      /** @type {import('react-native-health-connect').RecordType} */ (type),
      {
        timeRangeFilter: { operator: 'before', endTime: end },
        ascendingOrder: true,
        pageSize: 1,
      },
    );
    return page.records.length
      ? record('health', type, 'health-connect', page.records[0]).start
      : null;
  }
  if (Platform.OS !== 'ios' || !HK.isHealthDataAvailable())
    throw new Error('Health data is unavailable on this device.');
  const options = { limit: 1, ascending: true, filter: { date: { endDate: new Date(end) } } };
  let samples;
  if (quantities.includes(type))
    samples = await HK.queryQuantitySamples(
      /** @type {import('@kingstinct/react-native-healthkit').QuantityTypeIdentifier} */ (type),
      options,
    );
  else if (categories.includes(type))
    samples = await HK.queryCategorySamples(
      /** @type {import('@kingstinct/react-native-healthkit').CategoryTypeIdentifier} */ (type),
      options,
    );
  else if (type === 'HKWorkoutTypeIdentifier') samples = await HK.queryWorkoutSamples(options);
  else if (type.startsWith('HKCorrelation'))
    samples = await HK.queryCorrelationSamples(
      /** @type {import('@kingstinct/react-native-healthkit').CorrelationTypeIdentifier} */ (type),
      options,
    );
  else if (type === 'HKElectrocardiogramType')
    samples = await HK.queryElectrocardiogramSamples({ ...options, includeVoltages: false });
  else if (type === 'HKDataTypeIdentifierHeartbeatSeries')
    samples = await HK.queryHeartbeatSeriesSamples(options);
  else if (type === 'HKStateOfMindTypeIdentifier')
    samples = await HK.queryStateOfMindSamples(options);
  else throw new Error('This health type does not support All Time discovery.');
  const first = samples[0];
  if (!first) return null;
  return new Date(first.startDate).toISOString();
}
