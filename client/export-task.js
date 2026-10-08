import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as SQLite from 'expo-sqlite';
import { dueOccurrences, occurrenceDays, addDays } from '../core/schedules.js';
import { loadExportContext } from './export-context.js';
import { loadProfiles } from './profiles.js';
import { localCalendar } from './calendar.js';
import { exportProfileDay } from './profile-export.js';
const task = 'profile-file-exports';
const db = SQLite.openDatabaseSync('phone-data.sqlite');
db.execSync(
  'CREATE TABLE IF NOT EXISTS profile_schedules (device TEXT, profile TEXT, value TEXT, PRIMARY KEY(device,profile))',
);
/** @typedef {{progress:import('../core/schedules.js').ScheduleProgress,fingerprint:string,job:null|{profile:import('../core/profiles.js').ExportProfile,occurrence:import('../core/schedules.js').Occurrence,days:{day:string,start:string,end:string}[]},files:string[],message:string,retryAt:number}} State */
/** @param {import('../core/profiles.js').ExportProfile} profile */
function fingerprint(profile) {
  return JSON.stringify(profile);
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
  try {
    state.files = [];
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
      );
      state.files.push(...result.files);
    }
    state.message = `Exported ${dates.length} days.`;
    if (!valid()) throw new Error('Export cancelled: profile changed.');
    const latest = scheduleState(session.deviceId, profile);
    latest.files = state.files;
    latest.message = state.message;
    store(session.deviceId, profile.id, latest);
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
      const valid = () => {
        if (epoch !== generation || loadExportContext()?.deviceId !== session.deviceId)
          return false;
        const current = loadProfiles(session.deviceId)?.profiles.find((p) => p.id === profile.id);
        if (!current || fingerprint(current) !== state.fingerprint) return false;
        const s = scheduleState(session.deviceId, current);
        return s.progress.enabled && s.progress.enabledAt === state.progress.enabledAt;
      };
      try {
        while (job.days.length && Date.now() < deadline) {
          const day = job.days[0];
          if (!day) break;
          // Checkpoint each completed daily replacement. A interrupted day is safely rebuilt.
          // oxlint-disable-next-line eslint/no-await-in-loop
          const result = await exportProfileDay(session, job.profile, day, valid, () => {});
          if (!valid()) break;
          job.days.shift();
          state.files = result.files;
          state.message = `Saved ${day.day} · ${result.count} records`;
          store(session.deviceId, profile.id, state);
        }
        if (valid() && !job.days.length) {
          if (job.occurrence.kind === 'completed-day')
            state.progress.lastCompleted = job.occurrence.fireDate;
          else state.progress.lastRefresh = job.occurrence.fireDate;
          state.job = null;
          state.retryAt = 0;
          store(session.deviceId, profile.id, state);
        }
      } catch (e) {
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
