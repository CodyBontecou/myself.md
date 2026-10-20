import { earliestHealthDate } from './health-history.js';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { api, loadSession } from './session.js';
import { qaEnabled } from './qa-runtime.js';
import { errorJSON } from '../packages/support-chat/errors.js';
import { reserveExport, settleExport } from './billing.js';
import { exportFailureMessage } from '../core/diagnostics.js';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { phoneDatabase } from './phone-database.js';
import { dueOccurrences, occurrenceDays, addDays, scheduleIntervalMs } from '../core/schedules.js';
import { deliveredFormats } from '../core/export-files.js';
import { loadExportContext } from './export-context.js';
import { loadProfiles } from './profiles.js';
import { localCalendar } from './calendar.js';
import { beginExport, recordArtifact, finishExport } from './history.js';
import { exportProfileDay } from './profile-export.js';
import { requireCloudAuthorization } from './destinations.js';
import { reconcileExportNotificationTask } from './export-notification-registration.js';
const task = 'profile-file-exports';
const db = phoneDatabase();
db.execSync(
  'CREATE TABLE IF NOT EXISTS profile_schedules (device TEXT, profile TEXT, value TEXT, PRIMARY KEY(device,profile))',
);
/** @typedef {{progress:import('../core/schedules.js').ScheduleProgress,fingerprint:string,job:null|{historyId?:string,profile:import('../core/profiles.js').ExportProfile,occurrence:import('../core/schedules.js').Occurrence,days:{day:string,start:string,end:string}[]},files:string[],message:string,retryAt:number,reminderError?:'token-unavailable'|'permission-required'|null}} State */
/** @param {import('../core/profiles.js').ExportProfile} profile */
function fingerprint(profile) {
  const configuration = { ...profile };
  delete configuration.agentAccess;
  return JSON.stringify(configuration);
}
/** @param {string} device @param {import('../core/profiles.js').ExportProfile} profile @returns {State} */
export function scheduleState(device, profile) {
  const row = /** @type {{value:string}|null} */ (
    db.getFirstSync(
      'SELECT value FROM profile_schedules WHERE device=? AND profile=?',
      device,
      profile.id,
    )
  );
  const state = row
    ? /** @type {State} */ (JSON.parse(row.value))
    : {
        progress: { enabled: false, enabledAt: null, lastCompleted: null, lastRefresh: null },
        fingerprint: fingerprint(profile),
        job: null,
        files: [],
        message: 'No exports yet.',
        retryAt: 0,
      };
  if (state.fingerprint !== fingerprint(profile)) {
    if (state.job?.historyId) {
      const context = loadExportContext();
      if (context?.deviceId === device) {
        finishExport(context, state.job.historyId, 'cancelled', 'The profile changed.');
        void settleExport(context, state.job.historyId, false).catch(() => {});
      }
    }
    state.fingerprint = fingerprint(profile);
    state.job = null;
    state.progress.enabledAt = state.progress.enabled ? new Date().toISOString() : null;
    state.retryAt = 0;
    state.files = [];
    state.message = 'Profile changed; pending exports cancelled.';
    store(device, profile.id, state);
  }
  return state;
}
/** @param {string} device @param {string} id @param {State} state */
function store(device, id, state) {
  db.runSync(
    'INSERT OR REPLACE INTO profile_schedules VALUES (?,?,?)',
    device,
    id,
    JSON.stringify(state),
  );
}
/** @param {string} device @param {import('../core/profiles.js').ExportProfile} profile @param {boolean} enabled */
export async function setScheduleEnabled(device, profile, enabled) {
  if (enabled && !qaEnabled) {
    const session = await loadSession();
    if (!session?.server || session.deviceId !== device)
      throw new Error('Connect this phone to enable cloud export notifications.');
    await requireCloudAuthorization(session, profile);
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('exports', {
        name: 'Scheduled exports',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain)
      permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted)
      throw new Error('Allow notifications in Settings to enable scheduled export reminders.');
  }
  const current = loadProfiles(device)?.profiles.find((p) => p.id === profile.id);
  if (!current || fingerprint(current) !== fingerprint(profile))
    throw new Error('The profile changed. Reopen it and try again.');
  const state = scheduleState(device, profile);
  if (state.job?.historyId) {
    const context = loadExportContext();
    if (context?.deviceId === device) {
      finishExport(context, state.job.historyId, 'cancelled', 'Automatic exports were changed.');
      await settleExport(context, state.job.historyId, false).catch(() => {});
    }
  }
  state.progress = {
    enabled,
    enabledAt: enabled ? new Date().toISOString() : null,
    lastCompleted: null,
    lastRefresh: null,
  };
  state.job = null;
  state.retryAt = 0;
  store(device, profile.id, state);
  await reconcileExports();
}
const reviewedScheduleRequests = new Set();
let notificationSync = /** @type {Promise<void>|null} */ (null);
/** Register cloud reminders independently of best-effort background execution. */
export function syncExportNotifications() {
  notificationSync ??= synchronizeExportNotifications().finally(() => {
    notificationSync = null;
  });
  return notificationSync;
}
/** Ask once for notification permission so cloud storage lapse reminders reach this phone. */
export async function enableCloudReminders() {
  if (qaEnabled) return;
  // Android 13 requires a channel before it can show the notification permission prompt.
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('cloud-storage', {
      name: 'Cloud storage',
      importance: Notifications.AndroidImportance.HIGH,
    });
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) await Notifications.requestPermissionsAsync();
  await syncExportNotifications();
}
async function synchronizeExportNotifications() {
  if (qaEnabled) return;
  const session = await loadSession();
  if (!session?.server || session.deviceId !== loadExportContext()?.deviceId) return;
  let token = null;
  /** @type {'token-unavailable'|'permission-required'|null} */
  let notificationError = 'permission-required';
  // The same token also receives cloud storage lapse reminders, so register it without schedules.
  try {
    if ((await Notifications.getPermissionsAsync()).granted) {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('exports', {
          name: 'Scheduled exports',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
        await Notifications.setNotificationChannelAsync('cloud-storage', {
          name: 'Cloud storage',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (typeof projectId !== 'string') throw new Error('Notification project is not configured.');
      /** @type {ReturnType<typeof setTimeout>|undefined} */
      let timeout;
      try {
        token = (
          await Promise.race([
            Notifications.getExpoPushTokenAsync({ projectId }),
            /** @type {Promise<never>} */ (
              new Promise((_, reject) => {
                timeout = setTimeout(
                  () => reject(new Error('Push registration timed out.')),
                  10000,
                );
              })
            ),
          ])
        ).data;
        notificationError = null;
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch {
    // Push delivery is optional; it must not block OS exports or cloud schedule metadata.
    notificationError = 'token-unavailable';
  }
  if (loadExportContext()?.deviceId !== session.deviceId) return;
  const profiles = (loadProfiles(session.deviceId)?.profiles ?? []).flatMap((profile) => {
    const { progress } = scheduleState(session.deviceId, profile);
    return progress.enabled && progress.enabledAt
      ? [
          {
            profileId: profile.id,
            schedule: profile.schedule,
            enabledAt: progress.enabledAt,
            lastCompleted: progress.lastCompleted,
            lastRefresh: progress.lastRefresh,
          },
        ]
      : [];
  });
  for (const profile of loadProfiles(session.deviceId)?.profiles ?? []) {
    const state = scheduleState(session.deviceId, profile);
    state.reminderError = notificationError;
    store(session.deviceId, profile.id, state);
  }
  const response =
    /** @type {{requests?:{requestId:string,profileId:string,enabled:boolean,expiresAt:number}[]}} */ (
      await api(session, '/api/export-schedules', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: session.deviceId,
          token,
          notificationError,
          backgroundNotifications: await TaskManager.isTaskRegisteredAsync(
            'profile-export-notifications',
          ),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          profiles,
        }),
      })
    );
  for (const request of response.requests ?? []) {
    if (reviewedScheduleRequests.has(request.requestId)) continue;
    reviewedScheduleRequests.add(request.requestId);
    const profile = loadProfiles(session.deviceId)?.profiles.find(
      (p) => p.id === request.profileId,
    );
    /** @param {'running'|'completed'|'failed'|'cancelled'} state @param {string} [message] */
    const report = (state, message = '') =>
      api(session, '/api/export-schedules', {
        method: 'PUT',
        body: JSON.stringify({
          deviceId: session.deviceId,
          requestId: request.requestId,
          state,
          message,
        }),
      });
    if (!profile) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Finish the failed request checkpoint before reviewing the next schedule.
      await report(
        'failed',
        'The saved profile no longer exists. Read the phone catalog and retry with an existing profile.',
      );
      continue;
    }
    Alert.alert(
      'Agent requested scheduled exports',
      `${request.enabled ? 'Enable' : 'Disable'} automatic exports for ${profile.name}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            void report('cancelled').catch(() => {});
          },
        },
        {
          text: 'Apply',
          onPress: () => {
            void (async () => {
              if (
                Date.now() > request.expiresAt ||
                loadExportContext()?.deviceId !== session.deviceId
              )
                return;
              await report('running');
              try {
                await setScheduleEnabled(session.deviceId, profile, request.enabled);
                await report('completed');
              } catch {
                await report(
                  'failed',
                  'Could not apply the schedule. Check notification permission, connectivity and the profile export settings on the phone.',
                );
              }
            })().catch(() => {});
          },
        },
      ],
      { cancelable: false },
    );
  }
}
/** Register one coalesced OS worker. Foreground runs provide catch-up when background execution is delayed. */
export function reconcileExports() {
  workerSync ??= reconcileExportWorker().finally(() => {
    workerSync = null;
  });
  // Publish wake capability only after registration settles; push lookup cannot hold up the worker.
  return workerSync.then(
    () => syncExportNotifications(),
    async (error) => {
      await syncExportNotifications();
      throw error;
    },
  );
}
let workerSync = /** @type {Promise<void>|null} */ (null);
async function reconcileExportWorker() {
  const session = loadExportContext();
  const profiles = session ? (loadProfiles(session.deviceId)?.profiles ?? []) : [];
  const enabled =
    session && profiles.some((p) => scheduleState(session.deviceId, p).progress.enabled);
  await Promise.all([
    reconcilePeriodicExportWorker(Boolean(enabled)),
    reconcileExportNotificationTask(Boolean(enabled)),
  ]);
}
/** @param {boolean} enabled */
async function reconcilePeriodicExportWorker(enabled) {
  const registered = await TaskManager.isTaskRegisteredAsync(task);
  if (enabled && !registered) {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available)
      return; // Cloud reminders still work when the OS restricts background tasks.
    await BackgroundTask.registerTaskAsync(task, { minimumInterval: 15 });
  } else if (!enabled && registered) await BackgroundTask.unregisterTaskAsync(task);
}
let running = false;
let generation = 0;
export function cancelExports() {
  generation++;
}
/** Wait for cancelled work to release its staging files before deleting local account data. */
export async function stopAccountExports() {
  cancelExports();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (!running) return;
    // oxlint-disable-next-line eslint/no-await-in-loop -- Wait for the single active export to finish cancellation.
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('An export is still stopping. Retry account cleanup shortly.');
}
/** @param {import('./export-context.js').ExportContext} session @param {import('../core/profiles.js').ExportProfile} profile @param {(message:string,percentage?:number)=>void} progress @param {{allTimeHealth?:boolean,requestId?:string,check?:()=>Promise<void>}} [options] */
export async function exportNow(session, profile, progress, options = {}) {
  if (running) throw new Error('An export is already running.');
  running = true;
  const epoch = generation;
  const stamp = new Date().toISOString(),
    day = localCalendar.day(stamp),
    state = scheduleState(session.deviceId, profile);
  const dates = Array.from({ length: profile.export.lookbackDays }, (_, i) =>
    addDays(day, i - profile.export.lookbackDays),
  );
  if (profile.export.includeToday) dates.push(day);
  const valid = () =>
    epoch === generation &&
    loadExportContext()?.deviceId === session.deviceId &&
    loadExportContext()?.owner === session.owner &&
    loadProfiles(session.deviceId)?.profiles.some(
      (p) => p.id === profile.id && fingerprint(p) === fingerprint(original),
    ) === true;
  let historyId = '';
  let billingId = '';
  let produced = false;
  let recordCount = 0;
  let batches = 1;
  const original = profile;
  const check = async () => {
    if (!valid()) throw new Error('Export cancelled: profile changed.');
    await options.check?.();
    if (!valid()) throw new Error('Export cancelled: profile changed.');
  };
  try {
    await check();
    await requireCloudAuthorization(session, profile);
    if (options.allTimeHealth) {
      if (!profile.selection.health.length) throw new Error('Select at least one Health type.');
      progress('Finding earliest readable Health data…', 0);
      const start = await earliestHealthDate(session.owner, profile.selection.health, stamp, check);
      dates.length = 0;
      for (let d = start ? localCalendar.day(start) : day; d <= day; d = addDays(d, 1)) {
        if (dates.length >= 100000)
          throw new Error('Health history exceeds the supported calendar range.');
        dates.push(d);
      }
      profile = {
        ...profile,
        selection: { health: profile.selection.health, time: [], location: [] },
      };
    }
    await check();
    historyId = beginExport(
      session,
      profile,
      'manual',
      {
        start: localCalendar.instant(dates[0] ?? day, 0, 0),
        end: options.allTimeHealth
          ? dates[30]
            ? localCalendar.instant(dates[30], 0, 0)
            : stamp
          : profile.export.includeToday
            ? stamp
            : localCalendar.instant(day, 0, 0),
      },
      options.requestId,
    );
    billingId = historyId;
    progress('Preparing export…', 0);
    await reserveExport(session, billingId, {
      profileId: profile.id,
      days: dates,
      formats: deliveredFormats(profile.export),
    });
    state.files = [];
    let failedSources = 0;
    for (const [index, d] of dates.entries()) {
      // Keep history events bounded even for decades of daily files.
      if (options.allTimeHealth && index > 0 && index % 30 === 0) {
        finishExport(session, historyId, 'complete');
        state.files = []; // Share controls show the final batch; all files remain in the destination.
        historyId = beginExport(
          session,
          profile,
          'manual',
          {
            start: localCalendar.instant(d, 0, 0),
            end: dates[index + 30] ? localCalendar.instant(dates[index + 30] ?? day, 0, 0) : stamp,
          },
          `${billingId}-part-${++batches}`,
        );
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- Revalidate each daily effect.
      await check();
      // Daily output must be written sequentially.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const result = await exportProfileDay(
        session,
        options.allTimeHealth && d !== day
          ? {
              ...profile,
              selection: {
                ...profile.selection,
                health: profile.selection.health.filter(
                  (key) =>
                    !key.startsWith('native:HKCharacteristicTypeIdentifier') &&
                    key !== 'native:whoop.body',
                ),
              },
            }
          : profile,
        {
          day: d,
          start: localCalendar.instant(d, 0, 0),
          end: d === day ? stamp : localCalendar.instant(addDays(d, 1), 0, 0),
        },
        valid,
        (message) => progress(message, Math.floor((index / dates.length) * 100)),
        (artifact) => {
          produced = true;
          recordArtifact(session, historyId, artifact);
        },
        billingId,
        check,
      );
      recordCount += result.count;
      state.files.push(...result.files);
      failedSources += result.failedSources;
      progress(`Saved ${d}`, Math.min(99, Math.floor(((index + 1) / dates.length) * 100)));
    }
    state.message = `Exported ${dates.length} days.${failedSources ? ` Partial export: ${failedSources} source failures across these days. See file metadata for details.` : ''}`;
    if (!valid()) throw new Error('Export cancelled: profile changed.');
    const latest = scheduleState(session.deviceId, original);
    latest.files = state.files;
    latest.message = state.message;
    store(session.deviceId, profile.id, latest);
    progress('Finishing export…', 99);
    await check();
    await settleExport(session, billingId, true);
    finishExport(session, historyId, 'complete');
    return {
      days: dates.length,
      failedSources,
      recordCount,
      historyId: billingId,
      batches,
      start: localCalendar.instant(dates[0] ?? day, 0, 0),
      end:
        options.allTimeHealth || profile.export.includeToday
          ? stamp
          : localCalendar.instant(day, 0, 0),
    };
  } catch (error) {
    if (billingId) await settleExport(session, billingId, produced).catch(() => {});
    if (historyId)
      finishExport(
        session,
        historyId,
        valid() ? 'failed' : 'cancelled',
        exportFailureMessage(error),
      );
    throw error;
  } finally {
    running = false;
  }
}
/** @type {Promise<void>|null} */
let scheduledRun = null;
/** Join scheduled work so an OS callback keeps its native background lifetime until delivery settles.
 * @param {string} [profileId] @param {import('../core/schedules.js').Occurrence} [requested] */
export function runScheduledExports(profileId, requested) {
  if (scheduledRun) return scheduledRun;
  if (running) return Promise.resolve();
  scheduledRun = executeScheduledExports(profileId, requested).finally(() => {
    scheduledRun = null;
  });
  return scheduledRun;
}
/** @param {string} [profileId] @param {import('../core/schedules.js').Occurrence} [requested] */
async function executeScheduledExports(profileId, requested) {
  running = true;
  try {
    const epoch = generation;
    const session = loadExportContext();
    if (!session) return;
    const deadline = Date.now() + 20000;
    for (const profile of loadProfiles(session.deviceId)?.profiles ?? []) {
      if (profileId && profile.id !== profileId) continue;
      const state = scheduleState(session.deviceId, profile);
      if (!state.progress.enabled || Date.now() < state.retryAt) continue;
      const now = new Date().toISOString();
      if (!state.job) {
        const occurrence =
          requested ?? dueOccurrences(profile.schedule, state.progress, now, localCalendar)[0];
        if (
          requested &&
          !dueOccurrences(profile.schedule, state.progress, requested.fireDate, localCalendar).some(
            (due) => due.kind === requested.kind && due.fireDate === requested.fireDate,
          )
        )
          continue;
        if (!occurrence) continue;
        state.job = {
          profile,
          occurrence,
          days: occurrenceDays(
            scheduleIntervalMs(profile.schedule) ? { ...occurrence, fireDate: now } : occurrence,
            profile.export.lookbackDays,
            localCalendar,
            profile.export.includeToday,
          ).map((d) => ({
            day: d.day,
            start: d.start,
            end: d.day === localCalendar.day(now) ? now : d.end,
          })),
        };
        store(session.deviceId, profile.id, state);
      }
      const job = state.job;
      const first = job.days[0],
        last = job.days.at(-1);
      if (!job.historyId && first && last) {
        job.historyId = beginExport(session, job.profile, 'schedule', {
          start: first.start,
          end: last.end,
        });
        store(session.deviceId, profile.id, state);
      }
      const historyId = job.historyId;
      if (!historyId) continue;
      const valid = () => {
        if (epoch !== generation || loadExportContext()?.deviceId !== session.deviceId)
          return false;
        const current = loadProfiles(session.deviceId)?.profiles.find((p) => p.id === profile.id);
        if (!current || fingerprint(current) !== state.fingerprint) return false;
        const s = scheduleState(session.deviceId, current);
        return s.progress.enabled && s.progress.enabledAt === state.progress.enabledAt;
      };
      let produced = false;
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Check approval before each scheduled profile.
        await requireCloudAuthorization(session, job.profile);
        // Reuse the occurrence ID across OS restarts and retries.
        // oxlint-disable-next-line eslint/no-await-in-loop
        await reserveExport(session, historyId, {
          profileId: profile.id,
          days: job.days.map((day) => day.day),
          formats: deliveredFormats(job.profile.export),
        });
        if (state.retryAt)
          beginExport(
            session,
            job.profile,
            'schedule',
            { start: job.days[0]?.start ?? now, end: job.days.at(-1)?.end ?? now },
            historyId,
          );
        while (job.days.length && Date.now() < deadline) {
          const day = job.days[0];
          if (!day) break;
          // Checkpoint each completed day after delivery.
          // oxlint-disable-next-line eslint/no-await-in-loop
          const result = await exportProfileDay(
            session,
            job.profile,
            day,
            valid,
            () => {},
            (artifact) => {
              produced = true;
              recordArtifact(session, historyId, artifact);
            },
            historyId,
          );
          // Count output even if the profile changes immediately after delivery.
          // oxlint-disable-next-line eslint/no-await-in-loop
          await settleExport(session, historyId, true);
          if (!valid()) {
            finishExport(
              session,
              historyId,
              'cancelled',
              'The profile, schedule, or connection changed.',
            );
            break;
          }
          job.days.shift();
          state.files = result.files;
          state.message = `Saved ${day.day} · ${result.count} records${result.failedSources ? ` · Partial export: ${result.failedSources} source failures. See file metadata for details.` : ''}`;
          store(session.deviceId, profile.id, state);
        }
        if (valid() && !job.days.length) {
          if (job.occurrence.kind === 'completed-day')
            state.progress.lastCompleted = job.occurrence.fireDate;
          else state.progress.lastRefresh = job.occurrence.fireDate;
          finishExport(session, historyId, 'complete');
          state.job = null;
          state.retryAt = 0;
          store(session.deviceId, profile.id, state);
        }
      } catch (e) {
        if (produced) {
          // Partial scheduled output still consumes this occurrence's single allowance.
          // oxlint-disable-next-line eslint/no-await-in-loop
          await settleExport(session, historyId, true).catch(() => {});
        }
        finishExport(session, historyId, valid() ? 'failed' : 'cancelled', exportFailureMessage(e));
        if (valid()) {
          state.message = errorJSON(e);
          state.retryAt = Date.now() + 300000;
          store(session.deviceId, profile.id, state);
        }
      }
    }
  } finally {
    running = false;
  }
}
/** A notification is a hint, never authority to export another account or changed profile.
 * @param {unknown} input */
export async function openScheduledExport(input) {
  if (!input || typeof input !== 'object') return false;
  const data = /** @type {Record<string,unknown>} */ (input);
  const session = loadExportContext();
  if (
    !session ||
    data.deviceId !== session.deviceId ||
    typeof data.profileId !== 'string' ||
    typeof data.fireDate !== 'string' ||
    !['completed-day', 'today-refresh'].includes(String(data.kind))
  )
    return false;
  const date = new Date(data.fireDate);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString() !== data.fireDate ||
    date.getTime() > Date.now()
  )
    return false;
  const profile = loadProfiles(session.deviceId)?.profiles.find((p) => p.id === data.profileId);
  if (!profile) return false;
  const state = scheduleState(session.deviceId, profile);
  if (!state.progress.enabled || data.enabledAt !== state.progress.enabledAt) return false;
  const occurrence = {
    kind: /** @type {import('../core/schedules.js').Occurrence['kind']} */ (data.kind),
    fireDate: data.fireDate,
  };
  if (!state.job) {
    if (
      !dueOccurrences(profile.schedule, state.progress, occurrence.fireDate, localCalendar).some(
        (due) => due.kind === occurrence.kind && due.fireDate === occurrence.fireDate,
      )
    )
      return false;
    const now = new Date().toISOString();
    state.job = {
      profile,
      occurrence,
      days: occurrenceDays(
        scheduleIntervalMs(profile.schedule) ? { ...occurrence, fireDate: now } : occurrence,
        profile.export.lookbackDays,
        localCalendar,
        profile.export.includeToday,
      ).map((day) =>
        Object.assign(day, { end: day.day === localCalendar.day(now) ? now : day.end }),
      ),
    };
  }
  // Explicit taps retry failed work immediately, preserving its checkpoint and billing identity.
  state.retryAt = 0;
  store(session.deviceId, profile.id, state);
  await runScheduledExports(profile.id, {
    kind: /** @type {import('../core/schedules.js').Occurrence['kind']} */ (data.kind),
    fireDate: data.fireDate,
  });
  return true;
}
TaskManager.defineTask(task, async () => {
  try {
    await runScheduledExports();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
