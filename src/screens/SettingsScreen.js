import { AnalyticsConsent } from '../../client/AnalyticsControls.js';
import CloudStorageUsage from '../../client/CloudStorageUsage.js';
import { qaEnabled } from '../../client/qa-runtime.js';
import { useBilling } from '../../client/BillingPaywalls';
import { router, Stack } from 'expo-router';
import { usePhone } from '../../client/PhoneProvider.js';
import AccountAvatar from '../components/AccountAvatar.js';
import { Screen, Group, Row, SectionHeader } from '../components/ui';
import PrivacyLinks from '../components/PrivacyLinks';
export default function SettingsScreen() {
  const billing = useBilling();
  return (
    <Screen testID="settings-screen">
      <Stack.Screen options={{ headerRight: renderSettingsAccountAvatar }} />
      {qaEnabled && (
        <Row testID="settings-qa" title="QA fixtures" onPress={() => router.push('/qa')} />
      )}
      <SectionHeader title="Account & access" />
      <Group>
        <Row
          testID="settings-lifetime-access"
          title={
            billing.lifetime
              ? 'Lifetime access'
              : billing.unlocked
                ? 'Cloud subscription access'
                : 'Unlock forever · $19.99'
          }
          subtitle={
            billing.unlocked
              ? 'Unlimited exports and queries'
              : `${billing.remaining} free exports remaining · one-time purchase`
          }
          {...(billing.unlocked ? { value: 'Unlocked' } : {})}
          onPress={() =>
            router.push(billing.unlocked && !billing.lifetime ? '/cloud-storage' : '/unlock')
          }
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

      <SectionHeader title="Connected health apps" />
      <Group>
        <Row
          testID="settings-whoop"
          title="WHOOP"
          subtitle="Connect recovery, sleep and activity"
          onPress={() => router.push('/whoop')}
        />
      </Group>
      <SectionHeader title="Agent" />
      <Group>
        <Row
          testID="settings-agent-connection"
          title="Agent connection"
          subtitle="Pair, check connection, or disconnect"
          onPress={() => router.push('/pair')}
        />
      </Group>
      <SectionHeader title="Privacy" />
      <Group>
        <AnalyticsConsent />
        <PrivacyLinks />
      </Group>
    </Screen>
  );
}

function renderSettingsAccountAvatar() {
  return <SettingsAccountAvatar />;
}

function SettingsAccountAvatar() {
  const { session, accountProfile } = usePhone();
  const signedIn = Boolean(session?.owner && !session.requiresSignIn);
  return (
    <AccountAvatar
      testID="settings-account-avatar"
      signedIn={signedIn}
      picture={signedIn ? accountProfile?.picture : null}
      onPress={() => router.push(signedIn ? '/account' : '/login')}
    />
  );
}
