import { parseProfile } from '../core/profiles.js';
import { exportEvent, parseHistoryEvent } from '../core/history.js';

export const qaScenarios = [
  'populated',
  'empty',
  'save-error',
  'history-error',
  'permission-denied',
  'loading',
];
/** @typedef {'populated'|'empty'|'save-error'|'history-error'|'permission-denied'|'loading'} QaScenario */
/** @typedef {{scenario:QaScenario,revision:number,onboarding:boolean,profiles:import('../core/profiles.js').ProfileState,events:import('../core/history.js').HistoryEvent[],permissions:Record<string,string>}} QaState */

/** Synthetic metadata only: no credentials, native records, destinations, or shareable files.
 * @param {QaScenario} scenario @param {number} revision @returns {QaState} */
export function qaFixture(scenario, revision = 0) {
  const profile = {
    ...parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'QA profile',
      selection: { health: [], time: [], location: [] },
    }),
    id: 'qa-profile',
    agentAccess: false,
  };
  const stamp = '2026-10-01T12:00:00.000Z';
  const base = exportEvent({
    id: 'qa-export',
    profile,
    actor: 'manual',
    interval: { start: '2026-09-30T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' },
    stamp,
    timezone: 'UTC',
  });
  const events =
    scenario === 'empty'
      ? []
      : [
          parseHistoryEvent({ ...base, status: 'complete', recordCount: 0 }),
          parseHistoryEvent({
            ...base,
            id: 'qa-failed-export',
            startedAt: '2026-10-01T11:00:00.000Z',
            status: 'failed',
            error: 'Synthetic export failure. No data was sent.',
          }),
          parseHistoryEvent({
            ...base,
            id: 'qa-access',
            kind: 'access',
            actor: 'agent',
            client: 'qa-client',
            target: 'phone',
            destination: 'Synthetic phone',
            startedAt: '2026-10-01T10:00:00.000Z',
            status: 'complete',
            recordCount: 0,
            request: { domain: 'location', source: 'native', type: 'points' },
          }),
        ];
  return {
    scenario,
    revision,
    onboarding: true,
    profiles: { profiles: [profile] },
    events,
    permissions: { health: 'denied', time: 'denied', location: 'denied' },
  };
}
