import { Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { existingCustomerGuide } from '../../core/billing.js';
import { Screen, Copy, Group, Row, Notice, Button } from '../components/ui.js';
export default function ClaimAccessScreen() {
  const guide = existingCustomerGuide();
  return (
    <Screen testID="claim-access-screen">
      <Stack.Screen options={{ title: 'Existing purchases' }} />
      <Copy variant="heading">Claim existing-customer access</Copy>
      <Copy muted>{guide.summary}</Copy>
      <Group>
        {guide.steps.map((step) => (
          <Row key={step.title} title={step.title} subtitle={step.body} />
        ))}
      </Group>
      <Copy variant="caption" muted>
        {guide.eligibility}
      </Copy>
      <Notice title="Purchased time.md?" body={guide.timeOffer} />
      <Button
        testID="claim-access-time"
        label="Verify time.md purchase"
        onPress={() => void Linking.openURL(guide.timeClaimUrl)}
      />
      <Button
        testID="claim-access-account"
        label="Continue to your account"
        onPress={() => router.navigate('/account')}
      />
    </Screen>
  );
}
