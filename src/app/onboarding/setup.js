import { useOnboarding } from '../../../client/onboarding';
import OnboardingFrame, { OnboardingButton } from '../../components/OnboardingFrame';
import { Copy, Group, Row } from '../../components/ui';

export default function Setup() {
  const { finish } = useOnboarding();
  return (
    <OnboardingFrame
      title="Where would you like to start?"
      body="You can return to either option from Settings."
      footer={
        <OnboardingButton
          label="Explore the app first"
          secondary
          onPress={() => finish('/profiles')}
        />
      }
    >
      <Group compact>
        <Row
          compact
          title="Explore data sources"
          subtitle="See what’s available on your phone."
          onPress={() => finish('/settings/connections')}
        />
        <Row
          compact
          title="Connect an agent"
          subtitle="Scan a pairing code or paste its link."
          onPress={() => finish('/pair')}
        />
      </Group>
      <Copy variant="caption" muted>
        Pairing is optional. You can create profiles and export files on this phone without an
        agent.
      </Copy>
    </OnboardingFrame>
  );
}
