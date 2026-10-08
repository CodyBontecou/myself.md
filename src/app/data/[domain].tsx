import { Stack, useLocalSearchParams } from 'expo-router';
import { Screen, Copy } from '../../components/ui';
import DataPanel from '../../../client/DataPanel';
import { phoneSources } from '../../../client/Overview';
export default function PhoneDataScreen() {
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const source = phoneSources.find((item) => item.id === domain);
  return <Screen><Stack.Screen options={{ title: source?.name ?? 'Data source' }} />{source ? <DataPanel domain={source.id} /> : <Copy>This data source is unavailable.</Copy>}</Screen>;
}
