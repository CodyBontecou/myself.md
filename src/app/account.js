import { Stack } from 'expo-router';
import { Screen, Copy, Button, Group, Row, Notice } from '../components/ui';
import { usePhone } from '../../client/PhoneProvider';
import { useBilling } from '../../client/BillingPaywalls';
import { existingCustomerGuide } from '../../core/billing';
export default function AccountScreen() {
  const { session, busy, error, run, signInAccount, syncAccount, disconnect } = usePhone();
  const current = useBilling();
  const guide = existingCustomerGuide();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Lifetime access' }} />
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
      {error && <Notice title="Account needs attention" body={error} />}
    </Screen>
  );
}
