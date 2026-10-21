import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { openScheduledExport } from './export-task.js';

const task = 'profile-export-notifications';

/** Notification data is a hint; the export operation validates ownership, opt-in and occurrence.
 * @param {unknown} event */
async function receive(event) {
  if (!event || typeof event !== 'object') return;
  const payload = /** @type {Record<string,unknown>} */ (event);
  // User responses use the existing UI handler, which also navigates to the profile.
  if ('actionIdentifier' in payload || !payload.data || typeof payload.data !== 'object') return;
  let data = /** @type {Record<string,unknown>} */ (payload.data);
  if (typeof data.dataString === 'string') {
    const parsed = /** @type {unknown} */ (JSON.parse(data.dataString));
    if (!parsed || typeof parsed !== 'object') return;
    data = /** @type {Record<string,unknown>} */ (parsed);
  }
  const hints = Array.isArray(data.exportSchedules)
    ? data.exportSchedules.slice(0, 100)
    : data.exportSchedule
      ? [data.exportSchedule]
      : [];
  let failed = false;
  for (const hint of hints) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Preserve per-profile checkpoints and avoid concurrent exports.
      await openScheduledExport(hint);
    } catch {
      failed = true;
    }
  }
  if (failed) throw new Error('One or more scheduled exports failed.');
}

TaskManager.defineTask(task, async ({ data, error }) => {
  if (error) return Notifications.BackgroundNotificationTaskResult.Failed;
  try {
    await receive(data);
    // A hint's acceptance is not a claim of completed output; history/files record that effect.
    return Notifications.BackgroundNotificationTaskResult.NoData;
  } catch {
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
});
