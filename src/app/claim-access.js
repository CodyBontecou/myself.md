import { Linking, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { Stack, router } from 'expo-router';
import { existingCustomerGuide } from '../../core/billing.js';
import { Screen, Copy, Group, Row, Button } from '../components/ui.js';
export default function ClaimAccessScreen() {
  const guide = existingCustomerGuide();
  const [appId, setAppId] = useState('');
  const [openError, setOpenError] = useState('');
  const selected = guide.apps.find((app) => app.id === appId);
  async function openPurchasedApp() {
    if (!selected) return;
    setOpenError('');
    try {
      await Linking.openURL(selected.handoffUrl);
    } catch {
      setOpenError(
        selected.id === 'time'
          ? 'Could not open purchase verification. Please try again.'
          : `Could not open ${selected.name}. Install or update the app, then open Settings → Claim myself.md access in that app.`,
      );
    }
  }
  return (
    <Screen compact testID="claim-access-screen">
      <Stack.Screen options={{ title: 'Existing purchases' }} />
      <View style={styles.intro}>
        <Copy variant="heading" style={styles.heading}>
          {selected ? `Claim access from ${selected.name}` : 'Which app did you purchase?'}
        </Copy>
        <Copy muted>{guide.summary}</Copy>
      </View>
      {selected ? (
        <View key={selected.id} testID={`claim-access-steps-${selected.id}`} style={styles.section}>
          <Group compact>
            {selected.steps.map((step, index) => (
              <Row
                compact
                key={step.title}
                title={`${index + 1}. ${step.title}`}
                subtitle={step.body}
              />
            ))}
          </Group>
          <Button
            testID={
              selected.id === 'time' ? 'claim-access-time' : `claim-access-open-${selected.id}`
            }
            label={selected.id === 'time' ? 'Verify time.md purchase' : `Open ${selected.name}`}
            filled
            onPress={() => void openPurchasedApp()}
          />
          {openError && (
            <Copy
              testID="claim-access-open-error"
              accessibilityRole="alert"
              variant="caption"
              muted
            >
              {openError}
            </Copy>
          )}
          {selected.id !== 'time' && (
            <Button
              testID="claim-access-account"
              label="Already verified? Continue to your account"
              secondary
              onPress={() => router.navigate('/account')}
            />
          )}
          <Button
            testID="claim-access-change-app"
            label="Choose a different app"
            secondary
            onPress={() => {
              setOpenError('');
              setAppId('');
            }}
          />
          <Copy variant="caption" muted>
            {selected.eligibility}
          </Copy>
        </View>
      ) : (
        <Group compact>
          {guide.apps.map((app) => (
            <Row
              compact
              key={app.id}
              testID={`claim-access-app-${app.id}`}
              title={app.name}
              onPress={() => setAppId(app.id)}
            />
          ))}
        </Group>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  section: { gap: 8 },
});
