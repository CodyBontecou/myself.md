import { Stack, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  Copy,
  Screen,
  Group,
  Row,
  Divider,
  SectionHeader,
  Button,
  Notice,
  Icon,
  IconButton,
} from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
import { usePhone } from './PhoneProvider';
import { usePhoneData } from './DataPanel';
/** @type {{id:import('../core/data.js').Domain,name:string,icon:import('../src/components/ui').IconName,description:string}[]} */
export const phoneSources = [
  {
    id: 'health',
    name: 'Health',
    icon: 'heart-outline',
    description: 'HealthKit and imported health data',
  },
  {
    id: 'time',
    name: 'Screen time',
    icon: 'hourglass-outline',
    description: 'App and website usage',
  },
  {
    id: 'location',
    name: 'Location',
    icon: 'location-outline',
    description: 'Recorded points and imported history',
  },
];
/** @param {{icon:import('../src/components/ui.js').IconName}} props */
export function SourceIcon({ icon }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sourceIcon, { backgroundColor: colors.subtle }]}>
      <Icon name={icon} />
    </View>
  );
}
export default function Overview() {
  const { colors } = useTheme();
  const { connected, session } = usePhone();
  const { grants, isTracking, types, message } = usePhoneData();
  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Connections',
          headerRight: SettingsButton,
        }}
      />
      <Copy muted>Your agents and your phone’s data, in one place.</Copy>
      <View style={styles.section}>
        <SectionHeader
          title="Your agent"
          action={connected ? 'Manage' : 'Connect'}
          onPress={() => router.push('/pair')}
        />
        <Group>
          <Row
            title={connected ? 'MCP connection' : 'Connect your agent'}
            subtitle={connected ? session?.account : 'Scan a pairing code from your chat'}
            icon={<SourceIcon icon="link-outline" />}
            trailing={
              connected ? (
                <Copy variant="caption" muted>
                  Connected
                </Copy>
              ) : null
            }
            onPress={() => router.push('/pair')}
          />
        </Group>
      </View>
      <View style={styles.section}>
        <SectionHeader title="Your data" count={3} />
        <Group>
          {phoneSources.map((source, index) => (
            <View key={source.id}>
              {index > 0 && <Divider />}
              <Row
                title={source.name}
                subtitle={
                  source.id === 'location'
                    ? `${isTracking ? 'Recording on' : 'Recording off'} · ${grants.location && connected ? 'Shared' : 'Private'}`
                    : `${types[source.id]?.length ?? 0} available data types · ${grants[source.id] && connected ? 'Shared' : 'Private'}`
                }
                icon={<SourceIcon icon={source.icon} />}
                onPress={() =>
                  router.push({ pathname: '/data/[domain]', params: { domain: source.id } })
                }
              />
            </View>
          ))}
        </Group>
      </View>
      <View style={styles.section}>
        <SectionHeader title="Data management" />
        <Group>
          <Row
            title="Profiles & exports"
            subtitle="Choose data types, destinations, and schedules"
            icon={<SourceIcon icon="folder-outline" />}
            onPress={() => router.push('/manage')}
          />
        </Group>
      </View>
      <Group>
        <Row
          title="History"
          subtitle="Past exports and agent access"
          icon={<SourceIcon icon="time-outline" />}
          onPress={() => router.push('/history')}
        />
      </Group>
      <Button
        label={connected ? 'Manage agent connection' : 'Connect agent'}
        icon="add"
        onPress={() => router.push('/pair')}
      />
      <Notice
        title={connected ? 'You control what’s shared' : 'Your data stays on this phone'}
        body={
          connected
            ? message
            : 'System permissions, agent access, and export profiles are separate. Nothing is shared until you pair an agent and enable access.'
        }
        icon="shield-checkmark-outline"
      />
      <Copy variant="caption" style={{ color: colors.secondary }}>
        Health, screen time, and location use the original native data integrations.
      </Copy>
    </Screen>
  );
}

function SettingsButton() {
  return (
    <IconButton
      icon="options-outline"
      label="Open settings"
      onPress={() => router.push('/settings')}
    />
  );
}
const styles = StyleSheet.create({
  section: { gap: 8 },
  sourceIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
