import { Stack } from 'expo-router';
import AppStack from '../../components/AppStack';
import { OnboardingProfileProvider } from '../../../client/OnboardingProfile.js';
export default function OnboardingLayout() {
  return (
    <OnboardingProfileProvider>
      <AppStack>
        <Stack.Screen name="index" options={{ title: 'myself.md' }} />
        <Stack.Screen name="privacy" options={{ title: 'Your control' }} />
        <Stack.Screen name="setup" options={{ title: 'Profile name' }} />
        <Stack.Screen name="data" options={{ title: 'Data selection' }} />
        <Stack.Screen name="output" options={{ title: 'Export files' }} />
        <Stack.Screen name="review" options={{ title: 'Review profile' }} />
      </AppStack>
    </OnboardingProfileProvider>
  );
}
