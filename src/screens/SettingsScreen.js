import { qaEnabled } from '../../client/qa-runtime.js';
import { Platform } from 'react-native';
import { openFeedback, openFeedbackSettings } from '../../client/gripe.js';
import { useBilling } from '../../client/BillingPaywalls';
import { router } from 'expo-router';
import { Screen, Copy, Group, Row, Divider, SectionHeader } from '../components/ui';
import PrivacyLinks from '../components/PrivacyLinks';
export default function SettingsScreen() {
  const billing = useBilling();
  return (
    <Screen testID="settings-screen">
      {qaEnabled && (
        <Row testID="settings-qa" title="QA fixtures" onPress={() => router.push('/qa')} />
      )}
      <Copy muted>Manage your account, data sources, and agent connections.</Copy>
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
        <Divider />
        <Row
          testID="settings-your-account"
          title="Your account"
          subtitle="Sign in, claim existing access, or delete your account"
          onPress={() => router.push('/account')}
        />
      </Group>
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
      <SectionHeader title="Privacy & support" />
      <Group>
        <Row
          testID="settings-diagnostics"
          title="Log sharing"
          subtitle="Review app events and share a debug report"
          onPress={() => router.push('/diagnostics')}
        />
        <Divider />
        <Row
          testID="settings-support"
          title="Contact support"
          subtitle="Ask Isobot a question or report a problem"
          onPress={() => router.push('/support')}
        />
        <Divider />
        <PrivacyLinks />
      </Group>
      <Copy variant="caption" muted>
        myself.md · You choose which data your agents can access.
      </Copy>
      {!qaEnabled && __DEV__ && Platform.OS === 'ios' && (
        <>
          <Row
            testID="settings-gripe-settings"
            title="Gripe settings"
            subtitle="Floating companion and quick capture preferences"
            onPress={() => void openFeedbackSettings()}
          />
          <Group>
            <Row
              testID="settings-feedback"
              title="Report a bug"
              subtitle="Capture a screenshot and send a report"
              onPress={() => void openFeedback()}
            />
          </Group>
        </>
      )}
      {!qaEnabled && Platform.OS === 'ios' && (
        <Row
          testID="settings-feedback-updates"
          title="Bug report updates"
          subtitle="Follow fixes and manage notifications"
          onPress={() => router.push('/feedback')}
        />
      )}
    </Screen>
  );
}
