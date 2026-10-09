import { Alert, Linking } from 'react-native';
import { accountDeletionNotice } from '../../core/account-deletion.js';
import { Stack } from 'expo-router';
import { Screen, Copy, Button, Group, Row, Notice } from '../components/ui';
import { usePhone } from '../../client/PhoneProvider';
import { useBilling } from '../../client/BillingPaywalls';
import { existingCustomerGuide } from '../../core/billing';
export default function AccountScreen() {
  const {
    session,
    busy,
    error,
    run,
    signInAccount,
    syncAccount,
    disconnect,
    deleteAccount,
    deletionStatusUrl,
  } = usePhone();
  const current = useBilling();
  const guide = existingCustomerGuide();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Account' }} />
      <Copy variant="heading">Your myself.md account</Copy>
      <Copy muted>
        Already claimed access through health.md or iso.me, or received a time.md offer? Sign in
        with the account that received your lifetime access.
      </Copy>
      {!current.unlocked && (
        <>
          <Copy variant="heading">Claim existing-customer access</Copy>
          <Copy muted>{guide.summary}</Copy>
          <Group>
            {guide.steps.map((step) => (
              <Row key={step.title} title={step.title} subtitle={step.body} />
            ))}
          </Group>
          <Copy variant="caption" muted>
            {guide.eligibility}
          </Copy>
          <Notice title="Purchased time.md?" body={guide.timeOffer} />
        </>
      )}
      {session?.owner ? (
        <>
          <Group>
            <Row title="Account" subtitle={session.account} />
            <Row
              title="Lifetime access"
              subtitle={
                current.unlocked
                  ? 'Active · unlimited exports and queries'
                  : 'No lifetime access linked yet'
              }
            />
          </Group>
          <Button
            label={busy ? 'Checking…' : 'Check lifetime access'}
            disabled={busy}
            onPress={() => void run(syncAccount)}
          />
          <Copy variant="heading">Delete account</Copy>
          <Copy muted>{accountDeletionNotice}</Copy>
          <Button
            label="Delete account"
            secondary
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
          <Button label="Sign out" secondary disabled={busy} onPress={() => void run(disconnect)} />
        </>
      ) : (
        <>
          <Button
            label="Sign in with Apple"
            disabled={busy}
            onPress={() => void run(() => signInAccount('apple'))}
          />
          <Button
            label="Continue with GitHub"
            secondary
            disabled={busy}
            onPress={() => void run(() => signInAccount('github'))}
          />
        </>
      )}
      {deletionStatusUrl && (
        <Button
          label="View account deletion status"
          secondary
          onPress={() => void Linking.openURL(deletionStatusUrl)}
        />
      )}
      {error && <Notice title="Account needs attention" body={error} />}
    </Screen>
  );
}
