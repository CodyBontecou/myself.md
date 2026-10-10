import { requireOptionalNativeModule } from 'expo';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { z } from 'zod';
import { qaEnabled } from './qa-runtime.js';

/** @type {{setReporter?:(key:string)=>Promise<void>}|null} */
const bridge = requireOptionalNativeModule('MyselfGripe');
const origin = 'https://gripe.isolated.tech';
const eventSchema = z.object({
  id: z.string().max(100),
  kind: z.enum(['pr', 'merged', 'released']),
  url: z
    .string()
    .url()
    .regex(
      /^https:\/\/(github\.com\/CodyBontecou\/myself\.md\/pull\/\d+|apps\.apple\.com\/app\/id\d+)$/,
    ),
  version: z.string().max(30).optional(),
  at: z.number().int(),
});
const reportUpdateSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  created: z.number().int(),
  status: z.enum(['submitted', 'pr', 'merged', 'released']),
  events: z.array(eventSchema).max(3),
});
/** @typedef {z.infer<typeof reportUpdateSchema>} ReportUpdate */
/** @type {{enabled:boolean,reports:ReportUpdate[],cursor:string|null,checkedAt:number|null,error:string|null}} */
let snapshot = { enabled: false, reports: [], cursor: null, checkedAt: null, error: null };
/** @type {Promise<string>|null} */
let keyPromise = null;
async function reporterKey() {
  if (!keyPromise)
    keyPromise = (async () => {
      const saved = await SecureStore.getItemAsync('gripe-reporter-key');
      if (saved && /^[a-f0-9]{64}$/.test(saved)) return saved;
      const key = Array.from(await Crypto.getRandomBytesAsync(32), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      await SecureStore.setItemAsync('gripe-reporter-key', key);
      return key;
    })().catch((error) => {
      keyPromise = null;
      throw error;
    });
  return keyPromise;
}
export async function configureReportReporter() {
  if (qaEnabled || Platform.OS !== 'ios' || !__DEV__ || !bridge?.setReporter) return;
  await bridge.setReporter(await reporterKey());
}
/** @param {string} [query] @param {object} [body] */
async function request(query = '', body) {
  if (qaEnabled) throw new Error('Report updates are unavailable in QA fixtures.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${origin}/v1/report-updates${query}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${await reporterKey()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Report updates HTTP ${response.status}. Try again later.`);
    const text = await response.text();
    if (text.length > 128000) throw new Error('Report update response is too large.');
    return /** @type {unknown} */ (JSON.parse(text));
  } finally {
    clearTimeout(timeout);
  }
}
export function reportUpdatesSnapshot() {
  return snapshot;
}
export async function refreshReportUpdates() {
  try {
    const result = z
      .object({
        enabled: z.boolean(),
        reports: z.array(reportUpdateSchema).max(50),
        cursor: z.string().nullable(),
      })
      .parse(await request());
    snapshot = { ...result, checkedAt: Date.now(), error: null };
  } catch (error) {
    snapshot = {
      ...snapshot,
      error: error instanceof Error ? error.message : 'Report updates are unavailable.',
    };
    throw error;
  }
  return snapshot;
}
/** @param {string} id */
export async function getReportUpdate(id) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid report ID.');
  return reportUpdateSchema.parse(await request(`?id=${id}`));
}
/** The owner uses the UI to opt in. OS authorization and a token alone never enable this preference.
 * @param {boolean} enabled */
export async function setReportNotifications(enabled) {
  let token;
  if (enabled) {
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('support', {
        name: 'Support',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted)
      throw new Error('Allow notifications in your phone settings to receive report updates.');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== 'string') throw new Error('Notification project is not configured.');
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  }
  z.object({ enabled: z.boolean() }).parse(
    await request('', { enabled, ...(token ? { token } : {}) }),
  );
  await SecureStore.setItemAsync('gripe-notifications-enabled', enabled ? '1' : '0');
  snapshot = { ...snapshot, enabled };
  await configureReportReporter();
}
/** Refresh an already opted-in token without asking for OS permission. */
export async function refreshReportRegistration() {
  await configureReportReporter();
  if (qaEnabled || !(await SecureStore.getItemAsync('gripe-reporter-key'))) return false;
  if ((await SecureStore.getItemAsync('gripe-notifications-enabled')) !== '1') return true;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    await setReportNotifications(false);
    return true;
  }
  await setReportNotifications(true);
  return true;
}
