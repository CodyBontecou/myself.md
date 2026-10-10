import { parseProfileState } from '../core/profiles.js';
import Storage from 'expo-sqlite/kv-store';
import { qaFixture, qaScenarios } from './qa-fixtures.js';

// Both conditions are required. A release bundle cannot activate fixtures via an app link.
export const qaEnabled = __DEV__ && process.env.EXPO_PUBLIC_QA === '1';
export const qaBannerEnabled = qaEnabled && process.env.EXPO_PUBLIC_QA_BANNER === '1';
const key = 'argent-qa-state-v1';
const listeners = new Set(/** @type {(()=>void)[]} */ ([]));
/** @type {import('./qa-fixtures.js').QaState} */
let state = qaFixture('populated');
if (qaEnabled) {
  const stored = Storage.getItemSync(key);
  if (stored) {
    const parsed = /** @type {import('./qa-fixtures.js').QaState} */ (JSON.parse(stored));
    if (!qaScenarios.includes(parsed.scenario)) throw new Error('Invalid saved QA scenario.');
    state = { ...parsed, profiles: parseProfileState(parsed.profiles) };
  }
}
/** @type {import('./session.js').Session} */
export const qaSession = {
  server: '',
  issuer: '',
  resource: '',
  accessToken: '',
  refreshToken: '',
  expires: 0,
  deviceId: 'argent-qa-device',
  owner: 'argent-qa-owner',
  account: 'Synthetic QA account',
};
export function qaSnapshot() {
  return state;
}
/** @param {()=>void} listener */
export function subscribeQa(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** @param {Partial<import('./qa-fixtures.js').QaState>} changes */
export function updateQa(changes) {
  if (!qaEnabled) throw new Error('QA requires an opt-in development bundle.');
  const next = { ...state, ...changes };
  Storage.setItemSync(key, JSON.stringify(next));
  state = next;
  for (const listener of listeners) listener();
  return { state: 'completed', scenario: state.scenario, revision: state.revision };
}
/** @param {unknown} [scenario] @param {boolean} [onboarding] */
export function resetQa(scenario = 'populated', onboarding = true) {
  if (typeof onboarding !== 'boolean') throw new Error('Use a boolean onboarding state.');
  if (typeof scenario !== 'string' || !qaScenarios.includes(scenario))
    throw new Error('Unknown QA scenario.');
  return updateQa({
    ...qaFixture(
      /** @type {import('./qa-fixtures.js').QaScenario} */ (scenario),
      state.revision + 1,
    ),
    onboarding,
  });
}
/** Validated, development-only semantic operations available through Argent debugger-evaluate.
 * UI buttons call these exact operations. Reads return synthetic state only. */
if (qaEnabled)
  Object.assign(globalThis, {
    __myselfQa: {
      getState: () => JSON.parse(JSON.stringify(state)),
      reset: resetQa,
      capabilities: () => ({
        scenarios: qaScenarios,
        operations: ['getState', 'reset'],
        nativeIntegration: false,
        synthetic: true,
      }),
    },
  });
