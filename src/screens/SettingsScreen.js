import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AnalyticsConsent } from '../../client/AnalyticsControls.js';
import CloudStorageUsage from '../../client/CloudStorageUsage.js';
import { qaEnabled } from '../../client/qa-runtime.js';
import { useBilling } from '../../client/BillingPaywalls';
import { router, Stack } from 'expo-router';
import { usePhone } from '../../client/PhoneProvider.js';
import AccountAvatar from '../components/AccountAvatar.js';
import { Screen, Group, Row, SectionHeader, IconButton, Copy, Icon } from '../components/ui';
import { useTheme } from '../lib/theme';
import PrivacyLinks from '../components/PrivacyLinks';
export default function SettingsScreen() {
  const billing = useBilling();
  const { colors } = useTheme();
  return (
    <Screen testID="settings-screen">
      <Stack.Screen
        options={{ headerRight: renderSettingsAccountAvatar, headerLeft: renderSettingsBack }}
      />
      {qaEnabled && (
        <Row testID="settings-qa" title="QA fixtures" onPress={() => router.push('/qa')} />
      )}
      <SectionHeader title="Account & access" />
      {billing.unlocked ? (
        <Group>
          <Row
            testID="settings-lifetime-access"
            title={billing.lifetime ? 'Lifetime access' : 'Cloud subscription access'}
            subtitle="Unlimited exports and queries"
            value="Unlocked"
            onPress={() => router.push(billing.lifetime ? '/unlock' : '/cloud-storage')}
          />
        </Group>
      ) : (
        <Pressable
          testID="settings-lifetime-access"
          accessibilityRole="button"
          accessibilityLabel={`Unlock forever · $19.99, ${billing.remaining} free exports remaining · one-time purchase`}
          onPress={() => router.push('/unlock')}
          style={({ pressed }) => [
            styles.unlock,
            { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={styles.unlockTop}>
            <Copy style={[styles.unlockTitle, { color: colors.onAccent }]}>
              Unlock forever · $19.99
            </Copy>
            <Icon name="arrow-forward" size={18} color={colors.onAccent} />
          </View>
          <Copy variant="caption" style={[styles.unlockBody, { color: colors.onAccent }]}>
            {`${billing.remaining} free exports remaining · one-time purchase`}
          </Copy>
          <View style={styles.meter}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View
                key={i}
                style={[
                  styles.meterCell,
                  { backgroundColor: colors.onAccent },
                  i >= billing.used && styles.meterLeft,
                ]}
              />
            ))}
          </View>
        </Pressable>
      )}
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
      {Platform.OS === 'ios' && (
        <Group>
          <Row
            testID="settings-watch"
            title="Apple Watch"
            subtitle="Steps, widgets, and direct HTTPS exports"
            onPress={() => router.push('/settings/watch')}
          />
        </Group>
      )}
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

function renderSettingsBack() {
  return (
    <IconButton
      testID="settings-back"
      icon="chevron-back"
      label="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/profiles'))}
    />
  );
}

const styles = StyleSheet.create({
  unlock: { borderRadius: 22, borderCurve: 'continuous', padding: 18, gap: 6 },
  unlockTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unlockTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  unlockBody: { opacity: 0.75 },
  meter: { flexDirection: 'row', gap: 4, marginTop: 8 },
  meterCell: { flex: 1, height: 6, borderRadius: 3 },
  meterLeft: { opacity: 0.25 },
});
