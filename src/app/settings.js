import { Stack, router } from 'expo-router';
import { Screen, Copy, Group, Row, IconButton, Notice } from '../components/ui';
export default function SettingsScreen() {
  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: CloseSettings,
        }}
      />
      <Copy variant="heading">A bridge to your data</Copy>
      <Copy muted>
        Manage health, screen time, and location on your phone. Pair your agent when you’re ready to
        share.
      </Copy>
      <Group>
        <Row
          title="Profiles & exports"
          subtitle="Imports, sharing controls, files, and schedules"
          onPress={() => router.push('/manage')}
        />
        <Row
          title="Agent connection"
          subtitle="Pair, check connection, or disconnect"
          onPress={() => router.push('/pair')}
        />
      </Group>
      <Notice
        title="Your existing data is preserved"
        body="This app uses the original database, saved profiles, account session, and native integrations. Permissions remain under your control."
      />
      <Copy variant="caption" muted>
        Appearance follows your phone’s light or dark setting.
      </Copy>
    </Screen>
  );
}

function CloseSettings() {
  return <IconButton label="Close settings" icon="close" onPress={() => router.back()} />;
}
