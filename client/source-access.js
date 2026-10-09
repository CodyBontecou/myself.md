import * as Location from 'expo-location';
import { authorizeHealth } from './health.js';
import { authorizeUsage, usageStatus } from './usage.js';

/** Request OS access only; profile selection, agent grants and recording are separate.
 * @param {import('../core/data.js').Domain} domain */
export async function requestSourceAccess(domain) {
  if (domain === 'health') {
    await authorizeHealth();
    return { message: 'Health permissions reviewed. Read access is managed by the system.' };
  }
  if (domain === 'time') {
    const current = await usageStatus();
    let status = current;
    if (current !== 'authorized' && current !== 'unavailable') {
      try {
        status = await authorizeUsage();
      } catch (error) {
        if (!(error instanceof Error) || !/cancelled|canceled|denied/i.test(error.message))
          throw error;
        return { message: 'Screen time access was not granted. Review permissions to try again.' };
      }
    }
    return {
      message:
        status === 'authorized'
          ? 'Screen time access is allowed.'
          : status === 'settings-opened'
            ? 'Enable Usage Access in Settings, then return to myself.md.'
            : status === 'limited' || status === 'unavailable'
              ? 'Screen time data is unavailable. iOS requires 26.4+, EU eligibility and approved data access. Permission alone may not enable it.'
              : 'Screen time access was not granted. Review permissions to try again.',
    };
  }
  const permission = await Location.requestForegroundPermissionsAsync();
  return {
    message: permission.granted
      ? 'Location access is allowed. Start recording in Location to collect new points, or save a single point there.'
      : permission.canAskAgain
        ? 'Location access was not granted. Review permissions to try again.'
        : 'Allow location access in Settings, then return to myself.md.',
  };
}
