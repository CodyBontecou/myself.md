import { registerSupportNotifications } from '../../client/support-notifications.js';
import { Alert, AppState } from 'react-native';
import { useEffect, useState, useMemo } from 'react';
import { Stack, router, useIsFocused, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { NativeSupport } from '../../packages/support-chat/native.js';
import { createSupportClient } from '../../packages/support-chat/index.js';
import { usePhoneData } from '../../client/DataPanel.js';
import { usePhone } from '../../client/PhoneProvider.js';
import { api } from '../../client/session.js';
import { guestSupportApi } from '../../client/support-guest.js';
import { debugReport } from '../../client/debug-log.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme.js';
import { Screen, Copy, Button, Row, Group, Icon } from '../components/ui.js';
import { openPrivacyLink } from '../components/PrivacyLinks.js';
import { privacyPolicy } from '../../core/privacy.js';

export default function SupportScreen() {
  const { session } = usePhone();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SupportInbox session={session?.requiresSignIn ? null : session} />
    </>
  );
}
function SupportChannels() {
  return (
    <Group compact>
      <Row
        compact
        testID="support-github"
        title="Submit a GitHub issue"
        subtitle="Bugs and feature requests"
        icon={<Icon name="logo-github" />}
        onPress={() => void openPrivacyLink(`${privacyPolicy.issuesUrl}/new/choose`)}
      />
      <Row
        compact
        testID="support-discord"
        title="Join the Discord"
        subtitle="Chat with the community"
        icon={<Icon name="logo-discord" />}
        onPress={() => void openPrivacyLink(privacyPolicy.discordUrl)}
      />
      <Row
        compact
        testID="support-email"
        title="Send an email"
        subtitle={privacyPolicy.supportEmail}
        icon={<Icon name="mail-outline" />}
        onPress={() => void openPrivacyLink(`mailto:${privacyPolicy.supportEmail}`)}
      />
    </Group>
  );
}
/** @param {{session:import('../../client/session.js').Session|null}} props */
function SupportInbox({ session }) {
  const { session: logSession } = usePhoneData(),
    { colors, isDark } = useTheme(),
    focused = useIsFocused();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  const request = useMemo(
    () =>
      createSupportClient((path, options) =>
        session
          ? api(session, path, options)
          : guestSupportApi(
              process.env.EXPO_PUBLIC_ACCOUNT_SERVER ?? 'https://myself.md',
              path,
              options,
            ),
      ),
    [session],
  );
  const data = useMemo(
    () => ({
      /** @param {import('../../packages/support-chat/support-client.js').SupportDataRequest|null} dataRequest */
      collect: async (dataRequest) => {
        const now = Date.now();
        if (dataRequest && dataRequest.selector.category !== 'logs')
          return {
            category: dataRequest.selector.category,
            capturedAt: now,
            content: JSON.stringify({ requested: dataRequest.reason, data: null }, null, 2),
          };
        const report = debugReport(logSession),
          selection = dataRequest?.selector;
        const entries = report.entries.filter(
          (entry) =>
            entry.time >= (selection?.from ?? now - 86400000) &&
            entry.time <= (selection?.to ?? now) &&
            (!selection?.operations.length || selection.operations.includes(entry.operation)) &&
            (!selection?.issuesOnly ||
              ['failed', 'cancelled', 'interrupted', 'partial'].includes(entry.outcome)),
        );
        return {
          category: 'logs',
          capturedAt: now,
          content: JSON.stringify({ ...report, entries }, null, 2),
        };
      },
      /** @param {string} content */
      digest: (content) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, content),
    }),
    [logSession],
  );
  return (
    <>
      <NativeSupport
        key={session ? `${session.owner}:${session.deviceId}` : 'guest'}
        startInConversation
        allowAgentAccess={Boolean(session)}
        supportOptions={<SupportChannels />}
        request={request}
        active={focused && foreground}
        initialConversationId={
          typeof params.conversationId === 'string' ? params.conversationId : ''
        }
        {...(session
          ? {
              onEnableNotifications: () => {
                void registerSupportNotifications(session, true)
                  .then((enabled) => {
                    Alert.alert(
                      enabled ? 'Notifications enabled' : 'Notifications unavailable',
                      enabled
                        ? 'Support replies can notify you on this device.'
                        : 'Allow notifications in system settings to receive support replies.',
                    );
                    return undefined;
                  })
                  .catch(() =>
                    Alert.alert(
                      'Notifications unavailable',
                      'Could not register this phone for support replies. Please try again.',
                    ),
                  );
              },
            }
          : {})}
        {...(session ? { data } : {})}
        newId={Crypto.randomUUID}
        colors={{ ...colors, subtle: isDark ? colors.subtle : '#EEF1FC' }}
        bottomInset={insets.bottom}
        topInset={insets.top}
        projectLabel="myself.md"
        onExit={() => router.navigate('/profiles')}
        renderIcon={(name) => (
          <Icon
            name={name}
            size={name === 'folder-outline' ? 13 : 24}
            color={
              name === 'arrow-up'
                ? colors.surface
                : name === 'folder-outline'
                  ? colors.secondary
                  : colors.text
            }
          />
        )}
        components={{ Screen, Copy, Button, Row, Group }}
      />
    </>
  );
}
