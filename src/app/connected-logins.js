import { Redirect, Stack } from 'expo-router';
import ConnectedLogins from '../../client/ConnectedLogins.js';
import { usePhone } from '../../client/PhoneProvider.js';
import { Screen } from '../components/ui.js';

/** Retained route for login-connection returns and existing links; Account shows the same list inline. */
export default function ConnectedLoginsScreen() {
  const { session } = usePhone();
  if (!session?.owner || session.requiresSignIn) return <Redirect href="/login" />;
  return (
    <Screen compact testID="connected-logins-screen">
      <Stack.Screen options={{ title: 'Connected logins' }} />
      <ConnectedLogins />
    </Screen>
  );
}
