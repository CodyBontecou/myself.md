import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

/** @param {boolean} enabled */
export async function reconcileExportNotificationTask(enabled) {
  const task = 'profile-export-notifications';
  const registered = await TaskManager.isTaskRegisteredAsync(task);
  if (enabled && !registered) await Notifications.registerTaskAsync(task);
  else if (!enabled && registered) await Notifications.unregisterTaskAsync(task);
}
