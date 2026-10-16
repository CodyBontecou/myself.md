import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { usePhone } from './PhoneProvider.js';
import { openScheduledExport } from './export-task.js';
import { qaEnabled } from './qa-runtime.js';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Cloud notice taps already routed; the last response is replayed whenever the session changes.
 * @type {Set<string>} */
const openedCloudNotices = new Set();

export default function PhoneNotifications() {
  const { session } = usePhone();
  useEffect(() => {
    if (qaEnabled) return undefined;
    let cancelled = false;
    /** @param {Notifications.NotificationResponse} response */
    function open(response) {
      if (cancelled) return;
      const data = response.notification.request.content.data;
      if (data?.type === 'cloud-storage') {
        // Lapse reminders carry no account data; the plans screen loads the signed-in status.
        const id = response.notification.request.identifier;
        if (openedCloudNotices.has(id)) return;
        openedCloudNotices.add(id);
        router.push('/cloud-storage');
        return;
      }
      const exportSchedule = data?.exportSchedule;
      if (exportSchedule && session?.deviceId) {
        if (
          typeof exportSchedule !== 'object' ||
          !('deviceId' in exportSchedule) ||
          exportSchedule.deviceId !== session.deviceId ||
          !('profileId' in exportSchedule) ||
          typeof exportSchedule.profileId !== 'string'
        )
          return;
        void openScheduledExport(exportSchedule)
          .then((accepted) => {
            if (accepted && !cancelled)
              router.push({
                pathname: '/profiles/[id]',
                params: { id: String(exportSchedule.profileId) },
              });
            return undefined;
          })
          .catch(() => {});
        return;
      }
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [session]);
  return null;
}
