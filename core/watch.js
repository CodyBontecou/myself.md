import { parseProfile } from './profiles.js';

const watchStepType = 'HKQuantityTypeIdentifierStepCount';
export const watchJobStates = /** @type {const} */ ([
  'accepted',
  'awaiting_user',
  'running',
  'completed',
  'failed',
  'cancelled',
  'expired',
]);
/** @typedef {typeof watchJobStates[number]} WatchJobState */
/** @typedef {{start:string,end:string,day:string,timezone:string}} WatchInterval */
/** @typedef {{id:string,revision:string,createdAt:number,updatedAt:number,expiresAt:number,status:WatchJobState,actor:'manual'|'agent',client:string|null,interval:WatchInterval|null,recordCount:number|null,bytes:number|null,httpStatus:number|null,partial:boolean,error:string|null}} WatchJob */
/** @typedef {{steps:number|null,observedAt:string|null,day:string|null,timezone:string,earliestAvailable:string|null,permissionRequested:boolean}} WatchSummary */
/** @typedef {{id:string,name:string,parentDeviceId:string,expiresAt:number,revision:string,profile:import('./profiles.js').ExportProfile,summary:WatchSummary,jobs:WatchJob[],lastSeenAt:number|null,revoked:boolean}} WatchDevice */
/** A narrow watch preset: today's available step samples, in original JSON.
 * @param {string} name @param {string} endpoint @returns {import('./profiles.js').ExportProfile} */
export function watchProfile(name, endpoint) {
  return {
    ...parseProfile({
      schema: 'myself.md.profile.v1',
      name,
      selection: { health: [`native:${watchStepType}`], time: [], location: [] },
      export: {
        destination: 'http',
        httpUrl: endpoint,
        formats: ['json'],
        includeToday: true,
        lookbackDays: 1,
      },
    }),
    id: 'watch-steps',
    agentAccess: false,
    agentPermissions: { health: false, time: false, location: false, logs: false },
  };
}
/** Validate frozen date bounds without trusting a watch clock or a remote caller.
 * @param {WatchInterval} interval @param {number} now */
export function validateWatchInterval(interval, now) {
  const start = Date.parse(interval.start),
    end = Date.parse(interval.end);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 26 * 3600000 ||
    end > now + 60000 ||
    start < now - 8 * 86400000 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(interval.day)
  )
    throw new Error('Watch exports require a valid recent local-day interval.');
}
