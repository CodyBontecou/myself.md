import { router } from 'expo-router';
import OnboardingFrame, { OnboardingButton } from '../../components/OnboardingFrame';
import { Copy, Group, Row } from '../../components/ui';

export default function Welcome() {
  return (
    <OnboardingFrame
      title="Your data, with context."
      body="Bring data from your phone into your agent’s conversations. Choose what to include in a profile."
      footer={
        <OnboardingButton label="Continue" onPress={() => router.navigate('/onboarding/privacy')} />
      }
    >
      <Group compact>
        <Row compact title="Health" subtitle="Sleep, activity, and other health data" />
        <Row compact title="Screen time" subtitle="App and website usage" />
        <Row compact title="Location" subtitle="Places recorded by your phone" />
      </Group>
      <Copy variant="caption" muted>
        Available data depends on your sources. No account is needed to explore.
      </Copy>
    </OnboardingFrame>
  );
}
