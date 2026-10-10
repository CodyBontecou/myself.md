import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { usePhone } from './PhoneProvider.js';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
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

let registrationId = /** @type {Promise<string>|null} */ (null);
function notificationInstallationId() {
  if (!registrationId)
    registrationId = (async () => {
      const key = 'support-notification-installation';
      const saved = await SecureStore.getItemAsync(key);
      if (saved && /^[A-Za-z0-9_-]{1,100}$/.test(saved)) return saved;
      const id = Crypto.randomUUID();
      await SecureStore.setItemAsync(key, id);
      return id;
    })().catch((error) => {
      registrationId = null;
      throw error;
    });
  return registrationId;
}

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
  const id = await notificationInstallationId();
  await api(session, '/api/support/v1', {
    method: 'POST',
    body: JSON.stringify({ action: 'device', id, token: token.data }),
  });
  return true;
}

export function SupportNotifications() {
  const { session } = usePhone();
  useEffect(() => {
    if (!session?.server || qaEnabled) return undefined;
    let cancelled = false;
    /** @param {Notifications.NotificationResponse} response */
    function open(response) {
      if (cancelled || !session) return;
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
