import { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Button, Text, Switch } from './Terminal.js';
import { scheduleState, setScheduleEnabled, exportNow } from './export-task.js';
import { authorizeCloud, cloudAccess, saveDestinationCredential } from './destinations.js';
import { nextOccurrence } from '../core/schedules.js';
import { localCalendar } from './calendar.js';
/** @param {{session:import('./session.js').Session,profile:import('../core/profiles.js').ExportProfile,disabled:boolean}} props */
export default function ProfileExports({ session, profile, disabled }) {
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
    setBusy(true);
    try {
      await action();
      setState(scheduleState(session.deviceId, profile));
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Export failed.');
    } finally {
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
      <Text>
        {profile.export.formats.join(' + ').toUpperCase()} · {profile.export.lookbackDays} completed
        days{profile.export.includeToday ? ' + today' : ''}
      </Text>
      <Text>
        Destination:{' '}
        {profile.export.destination === 'local'
          ? `Documents/${profile.export.folderName}/${session.deviceId}/${profile.id}`
          : profile.export.destination === 'http'
            ? profile.export.httpUrl
            : 'Your paired cloud service'}
      </Text>
      {profile.export.destination === 'http' ? (
        <>
          <TextInput
            accessibilityLabel="HTTP bearer token"
            placeholder="Optional HTTP bearer token"
            value={bearer}
            onChangeText={setBearer}
            secureTextEntry
          />
          <Button
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
          <Button
            title="Authorize cloud uploads (30 days)"
            disabled={disabled || busy}
            onPress={() =>
              void run(async () => {
                await authorizeCloud(session, profile);
                setShared(false);
              })
            }
          />
          <Text selectable>Connector URL: {session.server}/mcp</Text>
          <Text>
            Add this remote MCP endpoint to your connector and sign in with the same account as this
            phone.
          </Text>
          <Text>Allow stored cloud data in MCP connectors</Text>
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
          <Button
            title="Delete this profile’s cloud exports"
            disabled={disabled || busy}
            onPress={() =>
              void run(async () => {
                const { api } = await import('./session.js');
                const exports = /** @type {{id:string,profileId:string,deviceId:string}[]} */ (
                  await api(session, '/api/cloud/exports')
                );
                for (const item of exports.filter(
                  (v) => v.profileId === profile.id && v.deviceId === session.deviceId,
                )) {
                  // Delete owner-matched exports sequentially.
                  // oxlint-disable-next-line eslint/no-await-in-loop
                  await api(session, `/api/cloud/exports/${item.id}`, { method: 'DELETE' });
                }
              })
            }
          />
        </>
      ) : null}
      <Text>
        Schedule: {profile.schedule.frequency} · {String(profile.schedule.hour).padStart(2, '0')}:
        {String(profile.schedule.minute).padStart(2, '0')} local time
      </Text>
      <Text>Automatic exports</Text>
      <Switch
        accessibilityLabel={`Automatic exports for ${profile.name}`}
        disabled={disabled || busy}
        value={state.progress.enabled}
        onValueChange={(v) => void run(() => setScheduleEnabled(session.deviceId, profile, v))}
      />
      <Text>
        Background timing depends on iOS/Android. Opening the app catches up. Local files replace
        matching days; JSONL has a companion manifest.
      </Text>
      {next ? <Text>Next eligible: {new Date(next).toLocaleString()}</Text> : null}
      <Text>
        {message || state.message}
        {state.job ? ` · ${state.job.days.length} days pending` : ''}
      </Text>
      <Button
        title="Export profile now"
        disabled={disabled || busy}
        onPress={() => void run(() => exportNow(session, profile, setMessage))}
      />
      {state.files.map((uri) => (
        <Button
          key={uri}
          title={`Share ${decodeURIComponent(uri.split('/').at(-1) ?? 'file')}`}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable.');
              await Sharing.shareAsync(uri);
            })
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ container: { gap: 12 } });
