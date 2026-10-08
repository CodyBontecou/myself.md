import { Stack } from 'expo-router';
import AppStack from '../../components/AppStack';
export default function OnboardingLayout() {
  return (
    <AppStack>
      <Stack.Screen name="index" options={{ title: 'Welcome' }} />
      <Stack.Screen name="privacy" options={{ title: 'Your control' }} />
      <Stack.Screen name="setup" options={{ title: 'Get started' }} />
    </AppStack>
  );
}
