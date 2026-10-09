import { router } from 'expo-router';
import { View } from 'react-native';
import OnboardingFrame, { OnboardingButton } from '../../components/OnboardingFrame';
import { Row } from '../../components/ui';

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
        <Row title="Health" subtitle="Sleep, activity, and other health data" />
        <Row title="Screen time" subtitle="App and website usage" />
        <Row title="Location" subtitle="Places recorded by your phone" />
      </View>
    </OnboardingFrame>
  );
}
