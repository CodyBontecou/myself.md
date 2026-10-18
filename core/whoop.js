/** WHOOP stays provider-native: RMSSD, strain and scores never replace OS metrics. */
export const whoopTypes = /** @type {const} */ ({
  'whoop.cycles': { path: '/cycle', scope: 'read:cycles', label: 'WHOOP Cycles' },
  'whoop.recovery': { path: '/recovery', scope: 'read:recovery', label: 'WHOOP Recovery' },
  'whoop.sleep': { path: '/activity/sleep', scope: 'read:sleep', label: 'WHOOP Sleep' },
  'whoop.workouts': { path: '/activity/workout', scope: 'read:workout', label: 'WHOOP Workouts' },
  'whoop.body': {
    path: '/user/measurement/body',
    scope: 'read:body_measurement',
    label: 'WHOOP Body measurements',
  },
});
export const whoopRedirect = 'myselfmd://whoop';
export const whoopScopes = ['offline', ...Object.values(whoopTypes).map((type) => type.scope)];
/** @param {string} type */
export function whoopType(type) {
  return Object.entries(whoopTypes).find(([key]) => key === type)?.[1];
}
