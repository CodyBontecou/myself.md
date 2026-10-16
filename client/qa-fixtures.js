import { parseProfile } from '../core/profiles.js';

export const qaScenarios = [
  'populated',
  'empty',
  'save-error',
  'permission-denied',
  'loading',
  'location-tracking',
  'location-tracking-off',
  'cloud-included',
  'cloud-10gb',
  'cloud-grace',
  'cloud-billing-retry',
  'cloud-lapse',
  'cloud-no-lifetime',
];
/** Cloud scenarios differ only in synthetic cloud storage status; see client/cloud-storage.js.
 * @typedef {'populated'|'empty'|'save-error'|'permission-denied'|'loading'|'location-tracking'|'location-tracking-off'|'cloud-included'|'cloud-10gb'|'cloud-grace'|'cloud-billing-retry'|'cloud-lapse'|'cloud-no-lifetime'} QaScenario */
/** @typedef {{scenario:QaScenario,revision:number,onboarding:boolean,accountSignedIn?:boolean,profiles:import('../core/profiles.js').ProfileState,permissions:Record<string,string>}} QaState */

/** Synthetic metadata only: no credentials, native records, destinations, or shareable files.
 * @param {QaScenario} scenario @param {number} revision @returns {QaState} */
export function qaFixture(scenario, revision = 0) {
  const profile = {
    ...parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'QA profile',
      selection: {
        health: [],
        time: [],
        location: scenario.startsWith('location-tracking') ? ['native:points'] : [],
      },
    }),
    id: 'qa-profile',
    agentAccess: false,
  };
  return {
    scenario,
    revision,
    onboarding: true,
    profiles: { profiles: [profile] },
    permissions: { health: 'denied', time: 'denied', location: 'denied' },
  };
}
