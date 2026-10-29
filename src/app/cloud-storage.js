import { Stack, router } from 'expo-router';
import CloudStoragePlans from '../../client/CloudStoragePlans.js';
import { IconButton } from '../components/ui.js';

function closePlans() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
function headerClose() {
  return (
    <IconButton
      plain
      icon="close"
      label="Close cloud plans"
      testID="cloud-plans-close"
      onPress={closePlans}
    />
  );
}
export default function CloudStorageScreen() {
  return (
    <>
      <Stack.Screen
        options={{ title: 'Cloud storage', headerBackVisible: false, headerRight: headerClose }}
      />
      <CloudStoragePlans />
    </>
  );
}
