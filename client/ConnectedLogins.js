import { Fragment, useCallback, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { openAuthSessionAsync } from 'expo-web-browser';
import { api } from './session.js';
import { usePhone } from './PhoneProvider.js';
import { qaEnabled } from './qa-runtime.js';
import { Copy, Divider, Group, Icon, Row, SectionHeader } from '../src/components/ui.js';
import { useTheme } from '../src/lib/theme.js';

/** @typedef {{providers:{provider:'apple'|'github'|'google',connected:boolean,available:boolean}[],handoff:{url:string}}} LoginInventory */
const names = { apple: 'Apple', github: 'GitHub', google: 'Google' };
/** @type {Record<'apple'|'github'|'google',import('../src/components/ui.js').IconName>} */
const logos = { apple: 'logo-apple', github: 'logo-github', google: 'logo-google' };

/** Sign-in methods linked to the signed-in account, with the owner-confirmed connect handoff. */
export default function ConnectedLogins() {
  const { session } = usePhone();
  const { colors } = useTheme();
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
            setError('Could not load sign-in methods. Check your connection and try again.');
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

  if (!signedIn) return null;
  return (
    <View testID="connected-logins" style={styles.section}>
      <SectionHeader
        title="Ways to sign in"
        action={opening ? 'Waiting for browser…' : loading ? 'Checking…' : 'Refresh'}
        testID="connected-logins-refresh"
        onPress={() => {
          if (!loading && !opening) setRevision((value) => value + 1);
        }}
      />
      {qaEnabled && (
        <Copy muted variant="caption">
          Synthetic QA login states. No account is connected.
        </Copy>
      )}
      {loading && !inventory && (
        <Copy testID="connected-logins-loading" muted>
          Checking sign-in methods…
        </Copy>
      )}
      {inventory && (
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
                      ? 'Not connected'
                      : 'Not available right now'
                }
                icon={
                  <View
                    style={[
                      styles.mark,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <Icon
                      name={logos[provider.provider]}
                      size={18}
                      color={
                        provider.connected
                          ? colors.place
                          : provider.available
                            ? colors.text
                            : colors.secondary
                      }
                    />
                  </View>
                }
                trailing={
                  provider.connected ? (
                    <Icon name="checkmark-circle" size={20} color={colors.place} />
                  ) : provider.available ? (
                    <View style={[styles.connect, { borderColor: colors.outline }]}>
                      <Copy style={styles.connectLabel}>{opening ? 'Opening…' : 'Connect'}</Copy>
                    </View>
                  ) : undefined
                }
                selected={false}
                disabled={opening || loading || provider.connected || !provider.available}
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
      <Copy muted variant="caption" style={styles.note}>
        Each login opens this same account, in the app and on the web. To add one, confirm your
        original account in the browser, then sign in with the new provider. Separate accounts can’t
        be merged.
      </Copy>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connect: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
  },
  connectLabel: { fontSize: 14, fontWeight: '500' },
  note: { paddingHorizontal: 4 },
});
