import { loadSession } from './session.js';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Switch } from 'react-native';
import { useSegments } from 'expo-router';
import { usePhone } from './PhoneProvider.js';
import {
  analyticsAvailable,
  analyticsChoice,
  subscribeAnalytics,
  setAnalyticsChoice,
  syncAnalyticsSession,
  trackAnalytics,
  flushAnalytics,
} from './analytics.js';
import { Row } from '../src/components/ui.js';
import { analyticsSteps } from '../core/analytics.js';
import { qaEnabled } from './qa-runtime.js';

export function AnalyticsObserver() {
  const { session } = usePhone();
  const segments = useSegments();
  const route = segments.join('/');
  useEffect(() => {
    void loadSession()
      .then((loaded) => syncAnalyticsSession(session ?? loaded))
      .catch(() => {});
  }, [session]);
  useEffect(() => {
    const last = route.split('/').at(-1) ?? 'other';
    const step = analyticsSteps.find((name) => name === last) ?? 'other';
    if (route.startsWith('onboarding'))
      trackAnalytics(
        route.endsWith('index') || route === 'onboarding'
          ? 'onboarding_started'
          : 'onboarding_step_viewed',
        step,
      );
    else if (route === 'unlock' || route === 'cloud-storage')
      trackAnalytics('paywall_viewed', step);
  }, [route]);
  useEffect(() => {
    trackAnalytics('app_opened');
    const timer = setInterval(() => {
      void flushAnalytics();
    }, 30000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') trackAnalytics('app_opened');
      void flushAnalytics();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  return null;
}
export function AnalyticsConsent() {
  const segments = useSegments();
  const choice = useSyncExternalStore(subscribeAnalytics, analyticsChoice);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (qaEnabled) return null;
  return (
    <Row
      title="Share usage analytics"
      subtitle={
        error ||
        'Optional setup and export events; no health records, locations, file contents or screen recordings. While signed in, changes also update your account choice. An existing account choice can be restored on sign-in. Turning account analytics off erases linked usage events.'
      }
      trailing={
        <Switch
          testID="usage-analytics-toggle"
          accessibilityLabel="Share usage analytics"
          value={choice === true}
          disabled={busy || !analyticsAvailable}
          onValueChange={(enabled) => {
            setBusy(true);
            setError('');
            void setAnalyticsChoice(enabled)
              .then(() => {
                if (enabled && segments[0] === 'onboarding')
                  trackAnalytics('onboarding_started', 'onboarding');
                return undefined;
              })
              .catch(() => setError('Could not save your account choice. Try again.'))
              .finally(() => setBusy(false));
          }}
        />
      }
    />
  );
}
