import { AnalyticsConsent } from '../../../client/AnalyticsControls.js';
import { router } from 'expo-router';
import { View } from 'react-native';
import OnboardingFrame, { OnboardingButton } from '../../components/OnboardingFrame';
import { Row } from '../../components/ui';
import { StrandBar } from '../../components/StrandsMark.js';

export default function Welcome() {
  return (
    <OnboardingFrame
      testID="onboarding-welcome-screen"
      title="Bring your data to your agent."
      body="Export your phone data to files you own. Use them across apps, with AI, or with your agents."
      footer={
        <OnboardingButton
          testID="onboarding-welcome-continue"
          label="Continue"
          onPress={() => router.navigate('/onboarding/privacy')}
        />
      }
    >
      <View>
        <AnalyticsConsent />
        <Row
          icon={<StrandBar strand="body" />}
          title="Health"
          subtitle="Sleep, activity, and other health data"
        />
        <Row
          icon={<StrandBar strand="attention" />}
          title="Screen time"
          subtitle="App and website usage"
        />
        <Row
          icon={<StrandBar strand="place" />}
          title="Location"
          subtitle="Places recorded by your phone"
        />
      </View>
    </OnboardingFrame>
  );
}
