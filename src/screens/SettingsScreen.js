import { useBilling } from '../../client/BillingPaywalls';
import { router } from 'expo-router';
import { Screen, Copy, Group, Row } from '../components/ui';
export default function SettingsScreen() {
  const billing = useBilling();
  return (
    <Screen>
      <Copy variant="heading">myself.md</Copy>
      <Copy muted>Manage your phone’s data sources and choose which agents can access them.</Copy>
      <Group>
        <Row
          title={billing.unlocked ? 'Lifetime access unlocked' : 'Unlock forever · $19.99'}
          subtitle={
            billing.unlocked
              ? 'Unlimited exports and queries'
              : `${billing.remaining} free exports remaining · one-time purchase`
          }
          onPress={() => router.push('/unlock')}
        />
        <Row
          title="Connections & data sources"
          subtitle="Health, screen time, location, and agent access"
          onPress={() => router.push('/settings/connections')}
        />
        <Row
          title="Agent connection"
          subtitle="Pair, check connection, or disconnect"
          onPress={() => router.push('/pair')}
        />
      </Group>
    </Screen>
  );
}
