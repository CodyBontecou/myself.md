import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { usePhoneData } from './DataPanel.js';
import { api } from './session.js';
import { qaEnabled } from './qa-runtime.js';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** @param {import('./session.js').Session} session @param {boolean} [ask] */
export async function registerSupportNotifications(session, ask = false) {
  if (!session.server || qaEnabled) return false;
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('support', {
      name: 'Support',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && ask) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string') throw new Error('Notification project is not configured.');
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await api(session, '/api/support/v1', {
    method: 'POST',
    body: JSON.stringify({ action: 'device', id: session.deviceId, token: token.data }),
  });
  return true;
}

export function SupportNotifications() {
  const { session } = usePhoneData();
  useEffect(() => {
    if (!session.server || qaEnabled) return undefined;
    let cancelled = false;
    /** @param {Notifications.NotificationResponse} response */
    function open(response) {
      if (cancelled) return;
      const id = response.notification.request.content.data?.conversationId;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return;
      // Verify current account ownership before navigating an old notification.
      void api(session, `/api/support/v1?conversationId=${encodeURIComponent(id)}`)
        .then(() => {
          if (!cancelled) router.push({ pathname: '/support', params: { conversationId: id } });
          return undefined;
        })
        .catch(() => {});
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void registerSupportNotifications(session).catch(() => {});
    });
    void registerSupportNotifications(session).catch(() => {});
    return () => {
      cancelled = true;
      subscription.remove();
      foreground.remove();
    };
  }, [session]);
  return null;
}
