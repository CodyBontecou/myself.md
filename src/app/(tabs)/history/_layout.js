import { Stack } from 'expo-router';
import AppStack from '../../../components/AppStack';
export const unstable_settings = { initialRouteName: 'index' };
export default function HistoryLayout() {
  return (
    <AppStack>
      <Stack.Screen name="index" options={{ title: 'History' }} />
      <Stack.Screen name="[id]" options={{ title: 'Activity details' }} />
    </AppStack>
  );
}
