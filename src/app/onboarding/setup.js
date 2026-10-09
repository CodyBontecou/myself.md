import { useOnboarding } from '../../../client/onboarding';
import { router } from 'expo-router';
import { View } from 'react-native';
import OnboardingFrame, { OnboardingButton } from '../../components/OnboardingFrame';
import { Row } from '../../components/ui';
import { existingCustomerGuide } from '../../../core/billing';

export default function Setup() {
  const { finish } = useOnboarding();
  const guide = existingCustomerGuide();
  return (
    <OnboardingFrame
      testID="onboarding-setup-screen"
      title="Where would you like to start?"
      body="Start with files you own, or connect an AI agent. Pairing is optional. These options are always available in Settings."
      footer={
        <OnboardingButton
          testID="onboarding-explore"
          label="Explore the app first"
          secondary
          onPress={() => finish('/profiles')}
        />
      }
    >
      <View>
        <Row
          testID="onboarding-explore-data-sources"
          title="Explore data sources"
          subtitle="See what’s available on your phone."
          onPress={() => finish('/settings/connections')}
        />
        <Row
          testID="onboarding-connect-an-agent"
          title="Connect an agent"
          subtitle="Scan a pairing code or paste its link."
          onPress={() => finish('/pair')}
        />
        <Row
          testID="onboarding-claim-existing-customer-access"
          title="Claim existing-customer access"
          subtitle={`${guide.title} ${guide.summary}`}
          onPress={() => router.push('/account')}
        />
      </View>
    </OnboardingFrame>
  );
}
