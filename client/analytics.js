import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';
import { createAnalyticsClient } from '../core/analytics-client.js';
import { phoneDatabase } from './phone-database.js';
import { api } from './session.js';
import { qaEnabled } from './qa-runtime.js';
import { subscribeExportActivity } from './history.js';
const key = 'myself-usage-analytics-v1';
/** @type {import('./session.js').Session|null} */
let session = null;
let ready = false;
const listeners = new Set(/** @type {(()=>void)[]} */ ([]));
const notify = () => {
  for (const listener of listeners) listener();
};
export const analyticsAvailable =
  !qaEnabled &&
  Platform.OS !== 'web' &&
  (!__DEV__ || process.env.EXPO_PUBLIC_ANALYTICS_ENABLED === '1');
const collector = createAnalyticsClient({
  read: () => (analyticsAvailable ? Storage.getItemSync(key) : null),
  write: (value) => {
    if (analyticsAvailable) Storage.setItemSync(key, value);
  },
  id: () => {
    const row = /** @type {{id:string}|null} */ (
      phoneDatabase().getFirstSync('SELECT lower(hex(randomblob(16))) id')
    );
    if (!row) throw new Error('Analytics identity unavailable.');
    return row.id;
  },
  surface: Platform.OS === 'android' ? 'android' : 'ios',
  now: Date.now,
  send: async (batch) => {
    if (!ready || !analyticsAvailable) throw new Error('Analytics unavailable.');
    const target = session;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      if (target?.owner) {
        const preference = /** @type {{enabled:boolean}} */ (
          await api(target, '/api/analytics/preferences', { signal: controller.signal })
        );
        if (!preference.enabled) return { enabled: false };
        return await api(target, '/api/analytics/events', {
          method: 'POST',
          body: JSON.stringify(batch),
          signal: controller.signal,
        });
      }
      const response = await fetch('https://myself.md/api/analytics/anonymous', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!response.ok) throw new Error('Analytics unavailable.');
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  },
});
/** @param {import('./session.js').Session|null} value */
export async function syncAnalyticsSession(value) {
  ready = true;
  const previous = session?.owner ?? '';
  session = value && !value.requiresSignIn && value.server === 'https://myself.md' ? value : null;
  collector.identify(session?.owner ?? '');
  const target = session;
  if (target) {
    const preference = /** @type {import('../core/analytics.js').AnalyticsPreference} */ (
      await api(target, '/api/analytics/preferences')
    );
    if (session !== target) return;
    // Carry explicit local consent only into an account with no prior choice.
    if (!preference.decided && collector.choice() === true)
      await api(target, '/api/analytics/preferences', {
        method: 'PUT',
        body: JSON.stringify({ enabled: true, confirmation: 'ALLOW_USAGE_ANALYTICS' }),
      });
    else if (!preference.enabled && collector.choice() === true) collector.choose(false);
    if (preference.enabled && collector.choice() === null) collector.choose(true);
    if (session !== target) return;
    if (target.owner !== previous) collector.track('signed_in');
  }
  notify();
  await collector.flush();
}
/** @param {boolean} enabled */
export async function setAnalyticsChoice(enabled) {
  if (!analyticsAvailable) return;
  if (!enabled) {
    collector.choose(false);
    notify();
  }
  const target = session;
  if (target?.owner)
    await api(target, '/api/analytics/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        enabled,
        ...(enabled ? { confirmation: 'ALLOW_USAGE_ANALYTICS' } : {}),
      }),
    });
  if (session !== target) return;
  collector.choose(enabled);
  notify();
  if (enabled) collector.track('app_opened');
}
export function analyticsChoice() {
  return collector.choice();
}
/** @param {()=>void} listener */
export function subscribeAnalytics(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** @param {import('../core/analytics.js').AnalyticsEventName} name @param {string} [step] */
export function trackAnalytics(name, step) {
  if (analyticsAvailable) collector.track(name, step);
}
export async function flushAnalytics() {
  await collector.flush();
  notify();
}
subscribeExportActivity((name) => trackAnalytics(name));
