import { router } from 'expo-router';
import OnboardingFrame, { OnboardingButton } from '../../components/OnboardingFrame';
import { Copy, Group, Row } from '../../components/ui';

export default function Privacy() {
  return (
    <OnboardingFrame
      title="You choose what to share."
      body="Access is defined by your profiles and the permissions you allow."
      footer={
        <OnboardingButton label="Continue" onPress={() => router.navigate('/onboarding/setup')} />
      }
    >
      <Group compact>
        <Row
          compact
          title="Choose the data"
          subtitle="Set data types, date ranges, and export destinations in a profile."
        />
        <Row
          compact
          title="Allow access when ready"
          subtitle="Your phone asks for permission when a source needs it."
        />
        <Row
          compact
          title="Disconnect anytime"
          subtitle="Agent access and scheduled exports stop. Previously shared files stay at their destination."
        />
      </Group>
      <Copy variant="caption" muted>
        This introduction doesn’t enable sharing.
      </Copy>
    </OnboardingFrame>
  );
}
