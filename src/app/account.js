import { Stack } from 'expo-router';
import { Screen, Copy, Button, Group, Row, Notice } from '../components/ui';
import { usePhone } from '../../client/PhoneProvider';
import { useBilling } from '../../client/BillingPaywalls';
export default function AccountScreen() {
  const { session, busy, error, run, signInAccount, syncAccount, disconnect } = usePhone();
  const current = useBilling();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Lifetime access' }} />
      <Copy variant="heading">Your myself.md account</Copy>
      <Copy muted>
        Already claimed access through health.md or iso.me, or received a time.md offer? Sign in
        with the account that received your lifetime access.
      </Copy>
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
      {!current.unlocked && (
        <Notice
          title="Claim from your original app"
          body="Open Settings in health.md or iso.me and choose Claim myself.md access. We verify your purchase and link complimentary lifetime access to the account you choose. For time.md, contact the developer to activate your offer."
        />
      )}
      {error && <Notice title="Account needs attention" body={error} />}
    </Screen>
  );
}
