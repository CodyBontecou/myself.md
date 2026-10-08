import { Stack } from 'expo-router';
import AppStack from '../../../components/AppStack';
export const unstable_settings = { initialRouteName: 'index' };
export default function SettingsLayout() {
  return (
    <AppStack>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="connections" options={{ title: 'Connections' }} />
    </AppStack>
  );
}
