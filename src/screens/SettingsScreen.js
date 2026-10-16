import CloudStorageUsage from '../../client/CloudStorageUsage.js';
import { qaEnabled } from '../../client/qa-runtime.js';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useBilling } from '../../client/BillingPaywalls';
import { router, Stack, useFocusEffect } from 'expo-router';
import { usePhone } from '../../client/PhoneProvider.js';
import { usePhoneData } from '../../client/DataPanel.js';
import { debugReport, debugSharing, setDebugSharing } from '../../client/debug-log.js';
import { api } from '../../client/session.js';
import { errorMessage } from '../../packages/support-chat/errors.js';
import { showToast } from '../components/Toast.js';
import AccountAvatar from '../components/AccountAvatar.js';
import { Screen, Group, Row, Divider, SectionHeader, Checkbox } from '../components/ui';
import PrivacyLinks from '../components/PrivacyLinks';
export default function SettingsScreen() {
  const billing = useBilling();
  return (
    <Screen testID="settings-screen">
      <Stack.Screen options={{ headerRight: SettingsAccountAvatar }} />
      {qaEnabled && (
        <Row testID="settings-qa" title="QA fixtures" onPress={() => router.push('/qa')} />
      )}
      <SectionHeader title="Account & access" />
      <Group>
        <Row
          testID="settings-lifetime-access"
          title={billing.unlocked ? 'Lifetime access' : 'Unlock forever · $19.99'}
          subtitle={
            billing.unlocked
              ? 'Unlimited exports and queries'
              : `${billing.remaining} free exports remaining · one-time purchase`
          }
          {...(billing.unlocked ? { value: 'Unlocked' } : {})}
          onPress={() => router.push('/unlock')}
        />
      </Group>
      <CloudStorageUsage />
      {__DEV__ && (
        <Row
          testID="settings-cloud-debug"
          title="Cloud allowance QA"
          subtitle="Debug only · simulated accounts and files"
          onPress={() => router.push('/debug-cloud')}
        />
      )}

      <SectionHeader title="Data & connections" />
      <Group>
        <Row
          testID="settings-data-sources"
          title="Data sources"
          subtitle="Health, screen time, and location permissions"
          onPress={() => router.push('/settings/connections')}
        />
        <Divider />
        <Row
          testID="settings-agent-connection"
          title="Agent connection"
          subtitle="Pair, check connection, or disconnect"
          onPress={() => router.push('/pair')}
        />
      </Group>
      <SectionHeader title="Privacy" />
      <Group>
        <LogSharingRow />
        <Divider />
        <PrivacyLinks />
      </Group>
    </Screen>
  );
}

function SettingsAccountAvatar() {
  const { session } = usePhone();
  const signedIn = Boolean(session?.owner && !session.requiresSignIn);
  return (
    <AccountAvatar
      testID="settings-account-avatar"
      account={signedIn ? session?.account : undefined}
      onPress={() => router.push(signedIn ? '/account' : '/login')}
    />
  );
}

/** The phone-only consent behind agent debug-log reads. Agents cannot change it. */
function LogSharingRow() {
  const { session } = usePhoneData();
  const [shared, setShared] = useState(() => debugSharing(session).shared);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => setShared(debugSharing(session).shared), [session]));
  /** @param {boolean} next */
  async function change(next) {
    setBusy(true);
    try {
      setDebugSharing(session, next);
      setShared(next);
      await api(session, `/api/phones/${session.deviceId}/diagnostics`, {
        method: 'POST',
        body: JSON.stringify(debugReport(session, true)),
      });
    } catch (failure) {
      showToast({ message: errorMessage(failure), kind: 'error' });
    } finally {
      setBusy(false);
      setShared(debugSharing(session).shared);
    }
  }
  /** @param {boolean} next */
  function confirm(next) {
    if (!next) {
      void change(false);
      return;
    }
    Alert.alert(
      'Share debug logs with agents?',
      'Connected agents can read app error messages and event metadata to diagnose problems. Errors may contain sensitive information. Agents may retain copies after you turn sharing off.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Allow', onPress: () => void change(true) },
      ],
    );
  }
  return (
    <Row
      testID="settings-log-sharing"
      title="Share debug logs with agents"
      subtitle="Off by default. Lets your agent or support diagnose problems while the app is open."
      trailing={
        <Checkbox
          testID="settings-log-sharing-toggle"
          accessibilityLabel="Share debug logs with agents"
          value={shared}
          disabled={busy || qaEnabled || !session.server}
          onValueChange={confirm}
        />
      }
    />
  );
}
