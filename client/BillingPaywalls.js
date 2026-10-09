import { useEffect, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import {
  allowance,
  subscribeBilling,
  paywallSeen,
  markPaywallSeen,
  takeBlockedPaywall,
  syncBilling,
} from './billing.js';
import { connectStore, restoreLifetime } from './store-purchases.js';
import { loadSession } from './session.js';
export function useBilling() {
  const [, render] = useState(0);
  useEffect(() => subscribeBilling(() => render((value) => value + 1)), []);
  return allowance();
}
export default function BillingPaywalls() {
  const current = useBilling();
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let disposed = false;
    /** @type {(()=>void)|undefined} */ let close;
    void connectStore((message) => Alert.alert('Purchase could not finish', message))
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        close = cleanup;
        return restoreLifetime();
      })
      .catch(() => {});
    return () => {
      disposed = true;
      close?.();
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    void loadSession()
      .then(syncBilling)
      .catch(() => {});
  }, [active]);
  useEffect(() => {
    if (!active || current.unlocked) return;
    const milestone = current.used >= 5 ? 5 : current.used >= 2 ? 2 : null;
    const blocked = takeBlockedPaywall(current.promptVersion);
    if (blocked || (milestone && !paywallSeen(milestone))) {
      if (milestone) {
        markPaywallSeen(milestone);
        if (milestone === 5) markPaywallSeen(2);
      }
      router.push('/unlock');
    }
  }, [active, current.used, current.unlocked, current.promptVersion]);
  return null;
}
