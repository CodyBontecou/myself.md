import { ErrorToast } from '../components/Toast.js';
import { errorJSON } from '../../packages/support-chat/errors.js';
import { qaEnabled } from '../../client/qa-runtime.js';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Screen, Copy, Button, Notice } from '../components/ui';
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
    <Screen testID="unlock-screen">
      <Copy variant="title">
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
      <Notice
        title="Every export is included"
        body="Manual exports, agent and MCP queries, scheduled exports, and cloud exports share the same allowance."
        icon="infinite-outline"
      />
      <Copy variant="heading">{price || '$19.99'} · one-time purchase</Copy>
      <Copy muted>Unlimited exports and queries, forever. No subscription.</Copy>
      <Notice title={guide.title} body={guide.summary} icon="gift-outline" />
      <Button
        testID="unlock-claim-existing-customer-access"
        label="Claim existing-customer access"
        secondary
        disabled={busy}
        onPress={() => router.push('/account')}
      />
      <ErrorToast error={error} />
      <Button
        label={busy ? 'Please wait…' : `Unlock forever${price ? ` · ${price}` : ''}`}
        disabled={busy || !price}
        onPress={() => void run(buyLifetime)}
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
      <Copy variant="caption" muted>
        The store shows your local price and confirms payment before you are charged.
      </Copy>
    </Screen>
  );
}
