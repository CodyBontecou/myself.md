import { Stack } from 'expo-router';
import AppStack from '../../../components/AppStack';
export const unstable_settings = { initialRouteName: 'index' };
export default function ProfilesLayout() {
  return (
    <AppStack>
      <Stack.Screen name="index" options={{ title: 'Profiles' }} />
      <Stack.Screen name="[id]" options={{ title: 'Profile' }} />
      <Stack.Screen name="history/index" options={{ title: 'Profile history' }} />
      <Stack.Screen name="history/[id]" options={{ title: 'Activity details' }} />
    </AppStack>
  );
}
