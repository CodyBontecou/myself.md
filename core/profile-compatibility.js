import { domains } from './data.js';
import { parseProfile } from './profiles.js';

/** Explicit equivalents only; grouped records, rates and differing statistics are not aliases. */
const equivalents = [
  ['HKQuantityTypeIdentifierStepCount', 'Steps', 'Steps'],
  ['HKQuantityTypeIdentifierBodyMass', 'Weight', 'Weight'],
  ['HKQuantityTypeIdentifierHeight', 'Height', 'Height'],
  ['HKQuantityTypeIdentifierBodyFatPercentage', 'BodyFat', 'Body fat'],
  ['HKQuantityTypeIdentifierLeanBodyMass', 'LeanBodyMass', 'Lean body mass'],
  ['HKQuantityTypeIdentifierHeartRate', 'HeartRate', 'Heart rate'],
  ['HKQuantityTypeIdentifierRestingHeartRate', 'RestingHeartRate', 'Resting heart rate'],
  [
    'HKQuantityTypeIdentifierHeartRateVariabilityRMSSD',
    'HeartRateVariabilityRmssd',
    'Heart rate variability (RMSSD)',
  ],
  ['HKQuantityTypeIdentifierBloodGlucose', 'BloodGlucose', 'Blood glucose'],
  ['HKQuantityTypeIdentifierOxygenSaturation', 'OxygenSaturation', 'Blood oxygen'],
  ['HKQuantityTypeIdentifierRespiratoryRate', 'RespiratoryRate', 'Breathing rate'],
  ['HKQuantityTypeIdentifierBodyTemperature', 'BodyTemperature', 'Body temperature'],
  [
    'HKQuantityTypeIdentifierBasalBodyTemperature',
    'BasalBodyTemperature',
    'Basal body temperature',
  ],
  ['HKQuantityTypeIdentifierFlightsClimbed', 'FloorsClimbed', 'Floors climbed'],
  ['HKQuantityTypeIdentifierPushCount', 'WheelchairPushes', 'Wheelchair pushes'],
  ['HKQuantityTypeIdentifierVO2Max', 'Vo2Max', 'VO₂ max'],
];
/** @typedef {{domain:import('./data.js').Domain,from:string,to:string,label:string}} MappedType */
/** @typedef {{domain:import('./data.js').Domain,type:string,label:string,reason:string}} UnsupportedType */
/** @typedef {{profile:import('./profiles.js').ResolvedDraft,mapped:MappedType[],unsupported:UnsupportedType[]}} ProfileCompatibility */
/** @param {string} key */
function label(key) {
  if (key === 'native:websites') return 'Website usage';
  if (key === 'native:sessions') return 'App usage sessions';
  return key
    .replace(/^native:/, '')
    .replace(/^HK(Quantity|Category|Correlation|Data)TypeIdentifier/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}
/** Prepare an import against selectable types, never granted/readable types.
 * Unavailable selections are explicitly reported and excluded, never silently broadened.
 * @param {unknown} value
 * @param {Record<import('./data.js').Domain,string[]>} types
 * @returns {ProfileCompatibility} */
export function compatibleProfile(value, types) {
  const profile = parseProfile(value);
  /** @type {MappedType[]} */
  const mapped = [];
  /** @type {UnsupportedType[]} */
  const unsupported = [];
  for (const domain of domains) {
    if (
      !Array.isArray(types[domain]) ||
      types[domain].some((k) => typeof k !== 'string' || !k.startsWith('native:'))
    )
      throw new Error('A current selectable data catalog is required to review this import.');
    const available = new Set(types[domain]);
    const selection = new Set();
    for (const key of profile.selection[domain]) {
      if (available.has(key)) {
        selection.add(key);
        continue;
      }
      const pair =
        domain === 'health'
          ? equivalents.find(([a, b]) => key === `native:${a}` || key === `native:${b}`)
          : undefined;
      const alternate = pair ? `native:${key === `native:${pair[0]}` ? pair[1] : pair[0]}` : '';
      if (alternate && available.has(alternate)) {
        selection.add(alternate);
        mapped.push({ domain, from: key, to: alternate, label: pair?.[2] ?? label(key) });
      } else
        unsupported.push({
          domain,
          type: key,
          label: pair?.[2] ?? label(key),
          reason: pair
            ? 'The equivalent data type is unavailable on this phone.'
            : 'There is no supported equivalent on this phone.',
        });
    }
    profile.selection[domain] = [...selection];
  }
  return { profile, mapped, unsupported };
}
