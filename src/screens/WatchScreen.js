import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';
import { router } from 'expo-router';
import { usePhone } from '../../client/PhoneProvider.js';
import { Checkbox } from '../../client/Terminal.js';
import {
  listWatches,
  setupWatch,
  watchConnection,
  revokeWatch,
  cancelWatchExport,
} from '../../client/watch.js';
import { qaEnabled } from '../../client/qa-runtime.js';
import { errorMessage } from '../../packages/support-chat/errors.js';
import { useToast } from '../components/Toast.js';
import { Screen, Copy, Group, Row, SectionHeader } from '../components/ui';
import { useTheme } from '../lib/theme';

export default function WatchScreen() {
  const { session, connected } = usePhone(),
    { colors } = useTheme(),
    toast = useToast();
  const [name, setName] = useState('Watch steps'),
    [endpoint, setEndpoint] = useState(''),
    [bearer, setBearer] = useState('');
  const [agentAccess, setAgentAccess] = useState(false),
    [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState(
    /** @type {import('../../client/watch.js').WatchConnection|null} */ (null),
  );
  const [watches, setWatches] = useState(
    /** @type {import('../../client/watch.js').WatchState[]} */ ([]),
  );
  const locked = useRef(false);
  const disabled = qaEnabled || !connected || !session || busy;
  useEffect(() => {
    let active = true;
    if (!qaEnabled)
      void watchConnection()
        .then((value) => {
          if (active) setConnection(value);
          return undefined;
        })
        .catch(() => {});
    if (session?.deviceId && connected && !qaEnabled)
      void listWatches(session)
        .then((value) => {
          if (active) setWatches(value.devices);
          return undefined;
        })
        .catch((error) => toast({ message: errorMessage(error), kind: 'error' }));
    return () => {
      active = false;
    };
  }, [session, connected, toast]);
  /** @param {()=>Promise<unknown>} action */
  async function run(action) {
    if (locked.current || disabled) return;
    locked.current = true;
    setBusy(true);
    try {
      await action();
      if (session) setWatches((await listWatches(session)).devices);
    } catch (error) {
      toast({ message: errorMessage(error), kind: 'error' });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function configure() {
    if (!session) return;
    const install = () =>
      void run(async () => {
        await setupWatch(session, { name, endpoint, bearer, agentAccess });
        setBearer('');
        setConnection(await watchConnection());
        toast({
          message: 'Profile saved on your watch. Review Steps access there before exporting.',
          kind: 'success',
        });
      });
    Alert.alert(
      'Save watch export profile?',
      `Today’s available watch step samples will be sent as JSON to ${endpoint || 'your HTTPS destination'}.${agentAccess ? ' Agents may read the cached steps and request exports to this destination.' : ''} Existing pending watch exports will be cancelled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save on watch', onPress: install },
      ],
    );
  }
  const inputStyle = [
    styles.input,
    { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
  ];
  return (
    <Screen testID="watch-setup-screen">
      <SectionHeader title="Apple Watch" />
      <Copy>
        View today’s steps, add a Smart Stack widget, and export directly from your watch.
      </Copy>
      <Copy variant="caption" muted>
        Keep myself.md open on both devices for setup. Afterward, the phone app can stay closed
        during exports.
      </Copy>
      {!connected && (
        <Row
          title="Connect your account"
          subtitle="Watch exports use your account’s export allowance."
          onPress={() => router.push('/pair')}
        />
      )}
      <Group>
        <Row
          title="Watch connection"
          value={
            connection?.reachable
              ? 'Ready'
              : connection?.installed
                ? 'Open watch app'
                : connection?.paired
                  ? 'Install watch app'
                  : connection?.supported
                    ? 'Pair Apple Watch'
                    : 'Rebuild iOS app'
          }
        />
        <Row
          title="Check connection"
          testID="watch-check-connection"
          disabled={disabled}
          onPress={() => void run(async () => setConnection(await watchConnection()))}
        />
      </Group>
      <SectionHeader title="Steps export profile" />
      <TextInput
        accessibilityLabel="Watch profile name"
        testID="watch-profile-name"
        value={name}
        onChangeText={setName}
        editable={!disabled}
        maxLength={80}
        style={inputStyle}
      />
      <TextInput
        accessibilityLabel="Watch HTTPS destination"
        testID="watch-endpoint"
        value={endpoint}
        onChangeText={setEndpoint}
        editable={!disabled}
        placeholder="https://your-server.example/exports"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholderTextColor={colors.secondary}
        maxLength={2048}
        style={inputStyle}
      />
      <TextInput
        accessibilityLabel="Watch destination bearer token"
        testID="watch-bearer"
        value={bearer}
        onChangeText={setBearer}
        editable={!disabled}
        placeholder="Optional bearer token"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.secondary}
        maxLength={4096}
        style={inputStyle}
      />
      <Copy variant="caption" muted>
        Changing setup replaces the watch credential. Enter the destination token again when
        updating a protected endpoint.
      </Copy>
      <Row
        title="Allow agent requests"
        subtitle="Share cached watch steps and allow exports to this destination."
        trailing={
          <Checkbox
            accessibilityLabel="Allow watch agent requests"
            value={agentAccess}
            disabled={disabled}
            onValueChange={setAgentAccess}
          />
        }
      />
      <Row
        title={busy ? 'Saving…' : 'Save on watch'}
        testID="watch-save-profile"
        disabled={disabled || !endpoint.trim() || !name.trim()}
        onPress={configure}
      />
      <Copy variant="caption" muted>
        Watch exports include only data available on the watch. Review Health permission on the
        watch. An empty read can mean no samples or denied access.
      </Copy>
      {qaEnabled && <Copy variant="caption">Setup and exports require a normal build.</Copy>}
      {watches.map((watch) => (
        <Group key={watch.id}>
          <Row
            title={watch.name}
            value={watch.ready ? 'Configured' : 'Awaiting watch'}
            subtitle={watch.destination}
          />
          {watch.jobs.slice(-3).map((job) => (
            <Row
              key={job.id}
              title={
                job.status === 'completed'
                  ? 'Delivered'
                  : job.status === 'running'
                    ? 'Uploading'
                    : job.status === 'accepted'
                      ? 'Queued'
                      : job.status === 'awaiting_user'
                        ? 'Review Health access'
                        : job.status
              }
              subtitle={
                job.error ??
                (job.partial
                  ? 'Some source details were unavailable.'
                  : new Date(job.createdAt).toLocaleString())
              }
              {...(['accepted', 'awaiting_user', 'running'].includes(job.status)
                ? {
                    value: 'Cancel',
                    disabled,
                    onPress: () =>
                      Alert.alert(
                        'Cancel watch export?',
                        'A transfer already in flight may have reached its destination.',
                        [
                          { text: 'Keep export', style: 'cancel' },
                          {
                            text: 'Cancel export',
                            style: 'destructive',
                            onPress: () =>
                              void run(() =>
                                session
                                  ? cancelWatchExport(session, watch.id, job.id)
                                  : Promise.resolve(),
                              ),
                          },
                        ],
                      ),
                  }
                : {})}
            />
          ))}
          <Row
            title="Revoke watch access"
            destructive
            disabled={disabled}
            onPress={() =>
              Alert.alert(
                'Revoke watch access?',
                'Stops new exports and cancels pending requests. Data already sent stays at its destination.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Revoke',
                    style: 'destructive',
                    onPress: () =>
                      void run(() =>
                        session ? revokeWatch(session, watch.id) : Promise.resolve(),
                      ),
                  },
                ],
              )
            }
          />
        </Group>
      ))}
      <Row
        title="Refresh export status"
        disabled={disabled}
        onPress={() => void run(() => Promise.resolve())}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  input: { borderWidth: 1, padding: 12, minHeight: 44, fontSize: 16 },
});
