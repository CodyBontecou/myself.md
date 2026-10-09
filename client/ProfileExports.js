import { useEffect, useRef, useState } from 'react';
import { Alert, View, TextInput, StyleSheet } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Switch } from './Terminal.js';
import { Copy, Group, Row, SectionHeader } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
import { scheduleState, setScheduleEnabled, exportNow } from './export-task.js';
import { authorizeCloud, cloudAccess, saveDestinationCredential } from './destinations.js';
import { nextOccurrence } from '../core/schedules.js';
import { localCalendar } from './calendar.js';
/** @param {{session:import('./session.js').Session,profile:import('../core/profiles.js').ExportProfile,disabled:boolean}} props */
export default function ProfileExports({ session, profile, disabled }) {
  const { colors } = useTheme();
  const running = useRef(false);
  const [bearer, setBearer] = useState('');
  const [shared, setShared] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [state, setState] = useState(() => scheduleState(session.deviceId, profile));
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      if (mounted) {
        setNow(new Date().toISOString());
        setState(scheduleState(session.deviceId, profile));
      }
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [session.deviceId, profile]);
  /** @param {()=>Promise<void>} action */
  async function run(action) {
    if (running.current || disabled) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
      setState(scheduleState(session.deviceId, profile));
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (profile.export.destination === 'cloud')
      void cloudAccess(session, profile)
        .then((r) => setShared(r.shared))
        .catch(() => {});
  }, [session, profile]);
  const next = nextOccurrence(profile.schedule, state.progress, now, localCalendar);
  return (
    <View style={styles.container}>
      <SectionHeader compact title="Exports" />
      <Group compact>
        <Row
          compact
          title="Automatic exports"
          trailing={
            <Switch
              accessibilityLabel={`Automatic exports for ${profile.name}`}
              disabled={disabled || busy}
              value={state.progress.enabled}
              onValueChange={(v) =>
                void run(() => setScheduleEnabled(session.deviceId, profile, v))
              }
            />
          }
        />
        <Row compact title="Next eligible" value={next ? new Date(next).toLocaleString() : 'Off'} />
        {state.job && <Row compact title="Pending" value={`${state.job.days.length} days`} />}
        <Row
          compact
          title={busy ? 'Exporting…' : 'Export profile now'}
          disabled={disabled || busy}
          onPress={() => void run(() => exportNow(session, profile, setMessage))}
        />
        <Row compact title="Files" value={String(state.files.length)} />
        {state.files.map((uri) => (
          <Row
            compact
            key={uri}
            title={`Share ${decodeURIComponent(uri.split('/').at(-1) ?? 'file')}`}
            disabled={disabled || busy}
            onPress={() =>
              void run(async () => {
                if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable.');
                await Sharing.shareAsync(uri);
              })
            }
          />
        ))}
      </Group>
      {message || state.message ? (
        <Copy variant="caption" selectable>
          {message || state.message}
        </Copy>
      ) : null}
      <Copy variant="caption" muted>
        Background timing depends on the OS. Opening the app catches up.
      </Copy>
      {profile.export.destination === 'http' ? (
        <>
          <TextInput
            accessibilityLabel="HTTP bearer token"
            placeholder="Optional HTTP bearer token"
            value={bearer}
            onChangeText={setBearer}
            secureTextEntry
            editable={!disabled && !busy}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.secondary}
            style={[
              styles.input,
              { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
            ]}
          />
          <Row
            compact
            title="Save HTTP credential"
            disabled={disabled || busy}
            onPress={() =>
              void run(async () => {
                await saveDestinationCredential(session.deviceId, profile.id, {
                  token: bearer,
                  url: new URL(profile.export.httpUrl ?? '').href,
                });
                setBearer('');
              })
            }
          />
        </>
      ) : null}
      {profile.export.destination === 'cloud' ? (
        <>
          <SectionHeader compact title="Cloud access" />
          <Row
            compact
            title="Authorize cloud uploads"
            disabled={disabled || busy}
            onPress={() =>
              void run(async () => {
                await authorizeCloud(session, profile);
                setShared(false);
              })
            }
          />
          <Copy variant="caption" selectable>
            Connector URL: {session.server}/mcp
          </Copy>
          <Copy variant="caption" muted>
            Add this remote MCP endpoint to your connector and sign in with the same account as this
            phone.
          </Copy>
          <Row
            compact
            title="Allow stored data in connectors"
            trailing={
              <Switch
                accessibilityLabel={`Cloud MCP access for ${profile.name}`}
                value={shared}
                disabled={disabled || busy}
                onValueChange={(v) =>
                  void run(async () => {
                    const result = await cloudAccess(session, profile, v);
                    setShared(result.shared);
                  })
                }
              />
            }
          />
          <Row
            compact
            destructive
            title="Delete this profile’s cloud exports"
            disabled={disabled || busy}
            onPress={() =>
              Alert.alert(
                'Delete cloud exports?',
                `Remove all stored exports for ${profile.name}?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () =>
                      void run(async () => {
                        const { api } = await import('./session.js');
                        const exports =
                          /** @type {{id:string,profileId:string,deviceId:string}[]} */ (
                            await api(session, '/api/cloud/exports')
                          );
                        for (const item of exports.filter(
                          (v) => v.profileId === profile.id && v.deviceId === session.deviceId,
                        )) {
                          // Delete owner-matched exports sequentially.
                          // oxlint-disable-next-line eslint/no-await-in-loop
                          await api(session, `/api/cloud/exports/${item.id}`, { method: 'DELETE' });
                        }
                      }),
                  },
                ],
              )
            }
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  input: {
    minHeight: 44,
    padding: 12,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
});
