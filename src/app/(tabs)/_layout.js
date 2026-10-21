import { Stack } from 'expo-router';
import AppStack from '../../components/AppStack.js';

export const unstable_settings = { initialRouteName: 'profiles' };
export default function MainLayout() {
  return (
    <AppStack>
      <Stack.Screen name="profiles" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
    </AppStack>
  );
}
