import { Alert, Linking, StyleSheet, View } from 'react-native';
import { accountDeletionNotice } from '../../core/account-deletion.js';
import { Redirect, Stack, router } from 'expo-router';
import { Screen, Copy, Button, Group, Row, Divider, SectionHeader } from '../components/ui.js';
import AccountAvatar from '../components/AccountAvatar.js';
import { usePhone } from '../../client/PhoneProvider.js';
import { useBilling } from '../../client/BillingPaywalls.js';
export default function AccountScreen() {
  const { session, busy, run, disconnect, deleteAccount, deletionStatusUrl } = usePhone();
  const current = useBilling();
  if (!session?.owner || session.requiresSignIn) return <Redirect href="/login" />;
  return (
    <Screen compact testID="account-screen">
      <Stack.Screen options={{ title: 'Account' }} />
      <View style={styles.identity}>
        <AccountAvatar account={session.account} />
        <Copy testID="account-account" variant="heading" selectable style={styles.center}>
          {session.account}
        </Copy>
      </View>
      <SectionHeader title="Access" />
      <Group>
        <Row
          testID="account-lifetime-access"
          title={
            current.lifetime
              ? 'Lifetime access'
              : current.unlocked
                ? 'Cloud subscription access'
                : 'App access'
          }
          subtitle={
            current.unlocked
              ? 'Active · unlimited exports and queries'
              : 'No lifetime access linked yet'
          }
        />
        {!current.unlocked && (
          <>
            <Divider />
            <Row
              testID="account-claim-existing-access"
              title="Claim existing-customer access"
              onPress={() => router.push('/claim-access')}
            />
          </>
        )}
      </Group>
      <SectionHeader title="Sign-in methods" />
      <Group>
        <Row
          testID="account-connected-logins"
          title="Connected logins"
          subtitle="Connect Apple, GitHub or Google to this account"
          disabled={busy}
          onPress={() => router.push('/connected-logins')}
        />
      </Group>
      <Button
        testID="account-sign-in-again"
        label="Sign in again"
        secondary
        disabled={busy}
        onPress={() => router.push('/login?reauthenticate=1')}
      />
      <Group>
        <Row
          testID="account-sign-out"
          title="Sign out"
          disabled={busy}
          onPress={() => {
            Alert.alert(
              'Sign out?',
              'This disconnects your phone and stops background location recording.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', onPress: () => void run(disconnect) },
              ],
            );
          }}
        />
      </Group>
      <SectionHeader title="Account management" />
      <Group>
        <Row
          testID="account-delete-account"
          title="Delete account"
          destructive
          disabled={busy}
          onPress={() => {
            Alert.alert('Permanently delete your account?', accountDeletionNotice, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete account',
                style: 'destructive',
                onPress: () => void run(deleteAccount),
              },
            ]);
          }}
        />
      </Group>
      {deletionStatusUrl && (
        <Button
          testID="account-view-account-deletion-status"
          label="View account deletion status"
          secondary
          onPress={() => void Linking.openURL(deletionStatusUrl)}
        />
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  center: { textAlign: 'center' },
});
