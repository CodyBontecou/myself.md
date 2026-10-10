import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import FloatingNavigation, { NavigationDockContext } from '../../components/FloatingNavigation.js';
import { use } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon } from '../../components/ui.js';
import { useTheme } from '../../lib/theme.js';

export const unstable_settings = { initialRouteName: 'profiles' };
export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <GestureHandlerRootView style={styles.shell}>
      <Tabs
        style={[styles.shell, { backgroundColor: colors.background }]}
        options={{ backBehavior: 'initialRoute' }}
      >
        <TabSlot style={styles.content} />
        <TabList asChild>
          <FloatingNavigation>
            <TabTrigger name="profiles" href="/profiles" asChild>
              <NavigationButton label="Profiles" icon="albums-outline" testID="profiles-tab" />
            </TabTrigger>
            <TabTrigger name="history" href="/history" asChild>
              <NavigationButton label="Logs" icon="time-outline" testID="history-tab" />
            </TabTrigger>
            <NavigationButton
              label="Contact support"
              icon="chatbubble-ellipses-outline"
              testID="support-tab"
              onPress={() => router.push('/support')}
            />
            <TabTrigger name="settings" href="/settings" asChild>
              <NavigationButton label="Settings" icon="settings-outline" testID="settings-tab" />
            </TabTrigger>
          </FloatingNavigation>
        </TabList>
      </Tabs>
    </GestureHandlerRootView>
  );
}

/** @param {import('expo-router/ui').TabTriggerSlotProps & {label:string,icon:import('../../components/ui.js').IconName,testID:string}} props */
function NavigationButton({ label, icon, isFocused, ...props }) {
  const { colors } = useTheme();
  const accessibility = use(NavigationDockContext);
  return (
    <Pressable
      {...props}
      {...accessibility}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={24} color={isFocused ? colors.text : colors.secondary} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  shell: { flex: 1 },
  content: { flex: 1 },
  button: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderCurve: 'continuous',
  },
});
