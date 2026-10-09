import { router } from 'expo-router';
import { View } from 'react-native';
import OnboardingFrame, { OnboardingButton } from '../../components/OnboardingFrame';
import { Row } from '../../components/ui';

export default function Privacy() {
  return (
    <OnboardingFrame
      testID="onboarding-privacy-screen"
      title="You choose what to share."
      body="Choose what goes into your files and who can access your data. This introduction doesn’t enable sharing."
      footer={
        <OnboardingButton
          testID="onboarding-privacy-continue"
          label="Continue"
          onPress={() => router.navigate('/onboarding/setup')}
        />
      }
    >
      <View>
        <Row
          title="Choose the data"
          subtitle="Set data types, date ranges, and export destinations in a profile."
        />
        <Row
          title="Allow access when ready"
          subtitle="Your phone asks for permission when a source needs it."
        />
        <Row
          title="Disconnect anytime"
          subtitle="Agent access and scheduled exports stop. Previously shared files stay at their destination."
        />
      </View>
    </OnboardingFrame>
  );
}
