import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { usePhone } from '../../client/PhoneProvider.js';
import { connectWhoop, disconnectWhoop, whoopStatus } from '../../client/whoop.js';
import { errorMessage } from '../../packages/support-chat/errors.js';
import { Screen, Copy, Group, Row, Button, SectionHeader } from '../components/ui.js';
import { qaEnabled } from '../../client/qa-runtime.js';
export default function WhoopScreen() {
  const { session } = usePhone();
  const owner = session?.owner ?? 'local-device';
  const [status, setStatus] = useState(
    /** @type {Awaited<ReturnType<typeof whoopStatus>>|null} */ (null),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError('');
      setStatus(null);
      whoopStatus(owner)
        .then((value) => {
          if (active) setStatus(value);
          return value;
        })
        .catch(() => {
          if (active) setError('Could not read WHOOP secure storage. Reopen this screen to retry.');
        });
      return () => {
        active = false;
      };
    }, [owner]),
  );
  /** @param {'connect'|'disconnect'} operation */
  async function run(operation) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      if (operation === 'connect') await connectWhoop(owner);
      else await disconnectWhoop(owner);
      setStatus(await whoopStatus(owner));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const signedIn = Boolean(session?.owner && session.server && !session.requiresSignIn);
  return (
    <Screen compact testID="whoop-screen">
      <Stack.Screen options={{ title: 'WHOOP' }} />
      <SectionHeader title="Connection" />
      <Group>
        <Row
          title="WHOOP"
          trailing={
            <Copy variant="caption" testID="whoop-status">
              {busy
                ? 'Working…'
                : status === null
                  ? 'Checking…'
                  : 'error' in status
                    ? 'Unavailable'
                    : status.connected
                      ? 'Connected'
                      : 'Not connected'}
            </Copy>
          }
        />
      </Group>
      <Copy>
        Connect WHOOP to export recovery, cycles, sleep, workouts and body measurements. Credentials
        stay in secure storage on this phone.
      </Copy>
      <Copy>
        WHOOP values stay separate from Apple Health and Health Connect. The same events may appear
        in both sources.
      </Copy>
      {error || (status && 'error' in status) ? (
        <Copy testID="whoop-error">{error || status?.instructions}</Copy>
      ) : null}
      {qaEnabled ? (
        <Copy>
          WHOOP authentication requires a normal build. QA fixtures never connect a real provider.
        </Copy>
      ) : !signedIn ? (
        <Button
          label="Sign in to connect WHOOP"
          testID="whoop-sign-in"
          onPress={() => router.push('/login')}
        />
      ) : status?.connected ? (
        <Button
          label="Disconnect WHOOP"
          secondary
          disabled={busy}
          testID="whoop-disconnect"
          onPress={() =>
            Alert.alert(
              'Disconnect WHOOP?',
              'Revoke WHOOP access and remove its credentials from this phone. Existing exports and profile selections remain.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Disconnect', style: 'destructive', onPress: () => void run('disconnect') },
              ],
            )
          }
        />
      ) : (
        <Button
          label={busy ? 'Connecting…' : 'Connect WHOOP'}
          disabled={busy || status === null}
          testID="whoop-connect"
          onPress={() => void run('connect')}
        />
      )}
      {!qaEnabled && signedIn && status?.connected && (
        <Button
          secondary
          label="Reconnect WHOOP"
          testID="whoop-reconnect"
          disabled={busy}
          onPress={() => void run('connect')}
        />
      )}
      <SectionHeader title="Export & agent access" />
      <Copy>
        After connecting, select WHOOP data in a profile’s Data selection. Profile data selections
        control whether agents can read those selected types. Connecting alone grants no agent
        access.
      </Copy>
      <Button
        secondary
        label="Open profiles"
        testID="whoop-profiles"
        onPress={() => router.navigate('/profiles')}
      />
    </Screen>
  );
}
