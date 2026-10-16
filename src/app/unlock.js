import { ErrorToast } from '../components/Toast.js';
import { errorJSON } from '../../packages/support-chat/errors.js';
import { qaEnabled } from '../../client/qa-runtime.js';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Copy, Button, Group, Row } from '../components/ui';
import { useBilling } from '../../client/BillingPaywalls';
import { buyLifetime, restoreLifetime, lifetimeProduct } from '../../client/store-purchases';
import { existingCustomerGuide } from '../../core/billing';
export default function UnlockScreen() {
  const current = useBilling();
  const guide = existingCustomerGuide();
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    qaEnabled ? 'Purchases require a normal build for integration QA.' : '',
  );
  useEffect(() => {
    if (qaEnabled) return;
    void lifetimeProduct()
      .then((product) => setPrice(product.displayPrice))
      .catch((e) => setError(errorJSON(e)));
  }, []);
  useEffect(() => {
    if (current.unlocked) router.back();
  }, [current.unlocked]);
  /** @param {()=>Promise<unknown>} action */
  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorJSON(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen compact testID="unlock-screen">
      <View style={styles.intro}>
        <Copy variant="heading" style={styles.heading}>
          {current.used >= 5
            ? 'Your free exports are used up'
            : current.used >= 2
              ? 'Keep your exports going'
              : 'Unlock myself.md forever'}
        </Copy>
        <Copy muted>
          {current.used >= 5
            ? 'You’ve used all 5 free exports. Unlock unlimited exports and queries with one purchase.'
            : `${current.remaining} of your 5 free exports remain. Unlock now to keep exporting whenever you need.`}
        </Copy>
      </View>
      <Group compact>
        <Row
          compact
          title="Unlimited exports and queries"
          subtitle="Manual, agent, scheduled and cloud exports"
        />
        <Row
          compact
          title={`${price || '$19.99'} · one-time purchase`}
          subtitle="Lifetime access. No subscription."
        />
      </Group>
      <ErrorToast error={error} />
      <Button
        testID="unlock-purchase"
        filled
        busy={busy}
        label={busy ? 'Please wait…' : `Unlock forever${price ? ` · ${price}` : ''}`}
        disabled={busy || !price}
        onPress={() => void run(buyLifetime)}
      />
      <View style={styles.recovery}>
        <Copy variant="caption" muted>
          {guide.title}
        </Copy>
        <Button
          testID="unlock-claim-existing-customer-access"
          label="Claim existing-customer access"
          secondary
          disabled={busy}
          onPress={() => router.push('/claim-access')}
        />
        <Button
          testID="unlock-restore-purchases"
          label="Restore purchases"
          secondary
          disabled={busy || qaEnabled}
          onPress={() => void run(() => restoreLifetime(true))}
        />
        <Button
          label={current.used >= 5 ? 'Close' : 'Maybe later'}
          secondary
          disabled={busy}
          onPress={() => router.back()}
        />
      </View>
      <Copy variant="caption" muted>
        The store shows your local price and confirms payment before you are charged.
      </Copy>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  recovery: { gap: 4 },
});
