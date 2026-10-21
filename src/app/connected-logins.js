import { Fragment, useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { Redirect, Stack, useFocusEffect } from 'expo-router';
import { openAuthSessionAsync } from 'expo-web-browser';
import { api } from '../../client/session.js';
import { usePhone } from '../../client/PhoneProvider.js';
import { qaEnabled } from '../../client/qa-runtime.js';
import { Button, Copy, Divider, Group, Icon, Row, Screen } from '../components/ui.js';

/** @typedef {{providers:{provider:'apple'|'github'|'google',connected:boolean,available:boolean}[],handoff:{url:string}}} LoginInventory */
const names = { apple: 'Apple', github: 'GitHub', google: 'Google' };

export default function ConnectedLoginsScreen() {
  const { session } = usePhone();
  const [inventory, setInventory] = useState(/** @type {LoginInventory|null} */ (null));
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const signedIn = Boolean(session?.owner && !session.requiresSignIn);

  useFocusEffect(
    useCallback(() => {
      if (!signedIn || !session) return;
      const accountSession = session;
      let active = true;
      let request = revision;
      async function refresh() {
        const current = ++request;
        setLoading(true);
        setError('');
        // QA inventory is presentation-only and never reads or changes a real account.
        try {
          const result = qaEnabled
            ? {
                providers: [
                  { provider: 'apple', connected: true, available: true },
                  { provider: 'github', connected: false, available: false },
                  { provider: 'google', connected: false, available: true },
                ],
                handoff: { url: '' },
              }
            : await api(accountSession, '/api/account-logins');
          if (active && request === current) setInventory(/** @type {LoginInventory} */ (result));
        } catch {
          if (active && request === current) {
            setInventory(null);
            setError('Could not load connected logins. Check your connection and try again.');
          }
        } finally {
          if (active && request === current) setLoading(false);
        }
      }
      void refresh();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh();
      });
      return () => {
        active = false;
        subscription.remove();
      };
    }, [session, signedIn, revision]),
  );

  /** @param {LoginInventory['providers'][number]} provider */
  async function connect(provider) {
    if (!session || opening || loading || provider.connected || !provider.available) return;
    setError('');
    if (qaEnabled) {
      setError('Connecting a login requires a normal build and your own account.');
      return;
    }
    setOpening(true);
    try {
      // Re-read availability and the owner-bound handoff before leaving the app.
      const latest = /** @type {LoginInventory} */ (await api(session, '/api/account-logins'));
      setInventory(latest);
      const current = latest.providers.find((item) => item.provider === provider.provider);
      if (!current?.available) throw new Error('Provider unavailable.');
      if (!current.connected) {
        const url = new URL(latest.handoff.url);
        url.searchParams.set('provider', provider.provider);
        await openAuthSessionAsync(url.href, 'myselfmd://connected-logins');
      }
      setRevision((value) => value + 1);
    } catch {
      setError('Could not open login connection. Refresh and try again.');
    } finally {
      setOpening(false);
    }
  }

  if (!signedIn) return <Redirect href="/login" />;
  return (
    <Screen compact testID="connected-logins-screen">
      <Stack.Screen options={{ title: 'Connected logins' }} />
      <Copy muted>
        Add another way to sign in to your account. Connected logins work in both this app and the
        web app.
      </Copy>
      {qaEnabled && (
        <Copy muted variant="caption">
          Synthetic QA login states. No account is connected.
        </Copy>
      )}
      {loading && (
        <Copy testID="connected-logins-loading" muted>
          Checking connected logins…
        </Copy>
      )}
      {!loading && inventory && (
        <Group>
          {inventory.providers.map((provider, index) => (
            <Fragment key={provider.provider}>
              {index > 0 && <Divider />}
              <Row
                testID={`connected-login-${provider.provider}`}
                title={names[provider.provider]}
                subtitle={
                  provider.connected
                    ? 'Connected'
                    : provider.available
                      ? `Connect ${names[provider.provider]}`
                      : 'Not available'
                }
                trailing={
                  <Icon
                    name={
                      provider.connected
                        ? 'checkmark-circle'
                        : provider.available
                          ? 'open-outline'
                          : 'remove-outline'
                    }
                  />
                }
                selected={false}
                disabled={opening || provider.connected || !provider.available}
                onPress={
                  provider.connected || !provider.available
                    ? undefined
                    : () => void connect(provider)
                }
              />
            </Fragment>
          ))}
        </Group>
      )}
      {error && (
        <Copy testID="connected-logins-error" accessibilityRole="alert">
          {error}
        </Copy>
      )}
      <Button
        testID="connected-logins-refresh"
        label={opening ? 'Waiting for browser…' : 'Refresh connected logins'}
        secondary
        disabled={loading || opening}
        onPress={() => setRevision((value) => value + 1)}
      />
      <Copy muted variant="caption">
        Your lifetime access, data and history stay with this account. To connect a login, confirm
        your original account in the browser, then authenticate the additional provider. Return here
        to check its connection. Existing accounts cannot be merged.
      </Copy>
    </Screen>
  );
}
