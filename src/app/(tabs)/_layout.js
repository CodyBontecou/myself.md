import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '../../lib/theme.js';

export const unstable_settings = { initialRouteName: 'profiles' };
export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <NativeTabs tintColor={colors.text} backBehavior="initialRoute">
      <NativeTabs.Trigger
        name="profiles"
        testID="profiles-tab"
        contentStyle={{ backgroundColor: colors.background }}
      >
        <NativeTabs.Trigger.Label>Profiles</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.stack', selected: 'square.stack.fill' }}
          md="collections"
        />
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
