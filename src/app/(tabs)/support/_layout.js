import { Stack } from 'expo-router';
import AppStack from '../../../components/AppStack.js';

export default function SupportLayout() {
  return (
    <AppStack>
      <Stack.Screen name="index" options={{ title: 'Support' }} />
    </AppStack>
  );
}
