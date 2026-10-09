import { router } from 'expo-router';
import { Screen, Copy, Group, Row } from '../components/ui';
export default function SettingsScreen() {
  return (
    <Screen>
      <Copy variant="heading">myself.md</Copy>
      <Copy muted>Manage your phone’s data sources and choose which agents can access them.</Copy>
      <Group>
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
