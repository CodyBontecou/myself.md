import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import OnboardingFrame, { OnboardingButton } from '../../components/OnboardingFrame';
import { Copy, Row } from '../../components/ui';

export default function Privacy() {
  return (
    <OnboardingFrame
      testID="onboarding-privacy-screen"
      title="You choose what to share."
      body="You decide what to export and who gets access. Nothing is shared during setup."
      footer={
        <OnboardingButton
          testID="onboarding-privacy-continue"
          label="Continue"
          onPress={() => router.navigate('/onboarding/setup')}
        />
      }
    >
      <View>
        <Row title="Choose the data" subtitle="Pick data types and dates in your profile." />
        <Row
          title="Allow access when you’re ready"
          subtitle="Your phone asks before accessing a data source."
        />
        <Row
          title="Disconnect anytime"
          subtitle="Stop future access. Already shared copies stay with the recipient."
        />
        <Pressable
          testID="privacy-policy-link"
          accessibilityRole="link"
          onPress={() => router.push('/privacy')}
          style={styles.policyLink}
        >
          <Copy variant="caption" muted style={styles.policyLabel}>
            Privacy policy
          </Copy>
        </Pressable>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  policyLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  policyLabel: { textDecorationLine: 'underline' },
});
