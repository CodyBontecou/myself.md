import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '../../lib/theme';
export const unstable_settings = { initialRouteName: 'profiles' };
export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <NativeTabs tintColor={colors.accent} backBehavior="initialRoute">
      <NativeTabs.Trigger
        name="profiles"
        testID="profiles-tab"
        contentStyle={{ backgroundColor: colors.background }}
      >
        <NativeTabs.Trigger.Label>Profiles</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: 'person.crop.rectangle.stack',
            selected: 'person.crop.rectangle.stack.fill',
          }}
          md="folder"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="history"
        testID="history-tab"
        contentStyle={{ backgroundColor: colors.background }}
      >
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="settings"
        testID="settings-tab"
        contentStyle={{ backgroundColor: colors.background }}
      >
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
