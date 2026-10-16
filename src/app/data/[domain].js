import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { Screen } from '../../components/ui';
import DataPanel from '../../../client/DataPanel';
export default function PhoneDataScreen() {
  const { domain } = useLocalSearchParams();
  if (domain !== 'location') return <Redirect href="/profiles" />;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Location recording' }} />
      <DataPanel domain="location" />
    </Screen>
  );
}
