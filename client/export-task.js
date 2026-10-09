import { reserveExport, settleExport } from './billing.js';
import { exportFailureMessage } from '../core/diagnostics.js';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as SQLite from 'expo-sqlite';
import { dueOccurrences, occurrenceDays, addDays } from '../core/schedules.js';
import { loadExportContext } from './export-context.js';
import { loadProfiles } from './profiles.js';
import { localCalendar } from './calendar.js';
import { beginExport, recordArtifact, finishExport } from './history.js';
import { exportProfileDay } from './profile-export.js';
const task = 'profile-file-exports';
const db = SQLite.openDatabaseSync('phone-data.sqlite');
db.execSync(
  'CREATE TABLE IF NOT EXISTS profile_schedules (device TEXT, profile TEXT, value TEXT, PRIMARY KEY(device,profile))',
);
/** @typedef {{progress:import('../core/schedules.js').ScheduleProgress,fingerprint:string,job:null|{historyId?:string,profile:import('../core/profiles.js').ExportProfile,occurrence:import('../core/schedules.js').Occurrence,days:{day:string,start:string,end:string}[]},files:string[],message:string,retryAt:number}} State */
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
/** Register one coalesced OS worker. Foreground runs provide catch-up when background execution is delayed. */
export async function reconcileExports() {
  const session = loadExportContext();
  const profiles = session ? (loadProfiles(session.deviceId)?.profiles ?? []) : [];
  const enabled =
    session && profiles.some((p) => scheduleState(session.deviceId, p).progress.enabled);
  const registered = await TaskManager.isTaskRegisteredAsync(task);
  if (enabled && !registered) {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available)
      throw new Error('Background execution is restricted. Foreground catch-up still runs.');
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
/** @param {import('./export-context.js').ExportContext} session @param {import('../core/profiles.js').ExportProfile} profile @param {(message:string)=>void} progress */
export async function exportNow(session, profile, progress) {
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
    loadProfiles(session.deviceId)?.profiles.some(
      (p) => p.id === profile.id && fingerprint(p) === fingerprint(profile),
    ) === true;
  let historyId = '';
  let produced = false;
  try {
    historyId = beginExport(session, profile, 'manual', {
      start: localCalendar.instant(dates[0] ?? day, 0, 0),
      end: profile.export.includeToday ? stamp : localCalendar.instant(day, 0, 0),
    });
    await reserveExport(session, historyId, {
      profileId: profile.id,
      days: dates,
      formats: profile.export.formats,
    });
    state.files = [];
    let failedSources = 0;
    for (const d of dates) {
      // Daily output must be written sequentially.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const result = await exportProfileDay(
        session,
        profile,
        {
          day: d,
          start: localCalendar.instant(d, 0, 0),
          end: d === day ? stamp : localCalendar.instant(addDays(d, 1), 0, 0),
        },
        valid,
        progress,
        (artifact) => {
          produced = true;
          recordArtifact(session, historyId, artifact);
        },
        historyId,
      );
      state.files.push(...result.files);
      failedSources += result.failedSources;
    }
    state.message = `Exported ${dates.length} days.${failedSources ? ` Partial export: ${failedSources} source failures across these days. See file metadata for details.` : ''}`;
    if (!valid()) throw new Error('Export cancelled: profile changed.');
    const latest = scheduleState(session.deviceId, profile);
    latest.files = state.files;
    latest.message = state.message;
    store(session.deviceId, profile.id, latest);
    await settleExport(session, historyId, true);
    finishExport(session, historyId, 'complete');
  } catch (error) {
    if (historyId) await settleExport(session, historyId, produced).catch(() => {});
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
export async function runScheduledExports() {
  if (running) return;
  running = true;
  try {
    const epoch = generation;
    const session = loadExportContext();
    if (!session) return;
    const deadline = Date.now() + 20000;
    for (const profile of loadProfiles(session.deviceId)?.profiles ?? []) {
      const state = scheduleState(session.deviceId, profile);
      if (!state.progress.enabled || Date.now() < state.retryAt) continue;
      const now = new Date().toISOString();
      if (!state.job) {
        const occurrence = dueOccurrences(profile.schedule, state.progress, now, localCalendar)[0];
        if (!occurrence) continue;
        state.job = {
          profile,
          occurrence,
          days: occurrenceDays(occurrence, profile.export.lookbackDays, localCalendar).map((d) => ({
            day: d.day,
            start: d.start,
            end: occurrence.kind === 'today-refresh' ? now : d.end,
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
        // Reuse the occurrence ID across OS restarts and retries.
        // oxlint-disable-next-line eslint/no-await-in-loop
        await reserveExport(session, historyId, {
          profileId: profile.id,
          days: job.days.map((day) => day.day),
          formats: profile.export.formats,
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
          // Checkpoint each completed daily replacement. A interrupted day is safely rebuilt.
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
          state.message = e instanceof Error ? e.message : 'Export failed.';
          state.retryAt = Date.now() + 300000;
          store(session.deviceId, profile.id, state);
        }
      }
    }
  } finally {
    running = false;
  }
}
TaskManager.defineTask(task, async () => {
  try {
    await runScheduledExports();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
