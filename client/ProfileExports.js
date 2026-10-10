import { errorJSON } from '../packages/support-chat/errors.js';
import { qaEnabled } from './qa-runtime.js';
import { useEffect, useRef, useState } from 'react';
import { Alert, View, TextInput, StyleSheet } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Switch } from './Terminal.js';
import { Copy, Group, Row, SectionHeader } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
import { scheduleState, setScheduleEnabled, exportNow } from './export-task.js';
import { authorizeCloud, cloudAccess, saveDestinationCredential } from './destinations.js';
import { shareDomain } from './export.js';
import { domains } from '../core/data.js';
import { nextOccurrence } from '../core/schedules.js';
import { localCalendar } from './calendar.js';
import ProfileQuickAction from './ProfileQuickAction.js';
/** @param {{session:import('./session.js').Session,profile:import('../core/profiles.js').ExportProfile,disabled:boolean,quick?:boolean,roomy?:boolean,iconOnly?:boolean,agentAction?:import('react').ReactNode}} props */
export default function ProfileExports(props) {
  return <ProfileExportControls {...props} disabled={props.disabled || qaEnabled} />;
}
/** @param {{session:import('./session.js').Session,profile:import('../core/profiles.js').ExportProfile,disabled:boolean,quick?:boolean,roomy?:boolean,iconOnly?:boolean,agentAction?:import('react').ReactNode}} props */
function ProfileExportControls({
  session,
  profile,
  disabled,
  quick = false,
  roomy = false,
  iconOnly = false,
  agentAction,
}) {
  const { colors } = useTheme();
  const running = useRef(false);
  const [bearer, setBearer] = useState('');
  const [days, setDays] = useState('7');
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
      setMessage(errorJSON(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!quick && !qaEnabled && profile.export.destination === 'cloud')
      void cloudAccess(session, profile)
        .then((r) => setShared(r.shared))
        .catch(() => {});
  }, [session, profile, quick]);
  if (quick)
    return (
      <View style={styles.container}>
        <View style={[styles.quickActions, iconOnly && styles.inlineActions]}>
          <ProfileQuickAction
            testID={`profile-export-${profile.id}`}
            label={busy ? 'Exporting…' : 'Export'}
            icon="download-outline"
            disabled={disabled || busy}
            busy={busy}
            roomy={roomy}
            iconOnly={iconOnly}
            onPress={() => void run(() => exportNow(session, profile, setMessage))}
          />
          {agentAction}
        </View>
        {message || (state.message && state.message !== 'No exports yet.') ? (
          <Copy
            testID={`profile-export-status-${profile.id}`}
            accessibilityRole="alert"
            variant="caption"
          >
            {message || state.message}
          </Copy>
        ) : null}
      </View>
    );
  const next = nextOccurrence(profile.schedule, state.progress, now, localCalendar);
  return (
    <View testID="profile-exports" accessibilityState={{ busy }} style={styles.container}>
      <SectionHeader compact title="Exports" />
      {qaEnabled && (
        <Copy testID="qa-integration-handoff" variant="caption">
          Exports, scheduling, credentials and sharing require a normal build for integration QA.
        </Copy>
      )}
      <Group compact>
        <Row
          compact
          testID="export-automatic-exports"
          title="Automatic exports"
          trailing={
            <Switch
              testID="export-automatic"
              accessibilityLabel={`Automatic exports for ${profile.name}`}
              disabled={disabled || busy}
              value={state.progress.enabled}
              onValueChange={(v) =>
                void run(() => setScheduleEnabled(session.deviceId, profile, v))
              }
            />
          }
        />
        <Row
          compact
          testID="export-next-eligible"
          title="Next eligible"
          value={next ? new Date(next).toLocaleString() : 'Off'}
        />
        {state.job && (
          <Row
            compact
            testID="export-pending"
            title="Pending"
            value={`${state.job.days.length} days`}
          />
        )}
        <Row
          compact
          testID="export-now"
          title={busy ? 'Exporting…' : 'Export profile now'}
          disabled={disabled || busy}
          onPress={() => void run(() => exportNow(session, profile, setMessage))}
        />
        <Row
          compact
          testID="export-days-to-share-1-31"
          title="Days to share (1–31)"
          trailing={
            <TextInput
              testID="export-share-days-input"
              accessibilityLabel="Days to share"
              keyboardType="number-pad"
              value={days}
              onChangeText={setDays}
              editable={!disabled && !busy}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            />
          }
        />
        {domains
          .filter((d) => profile.selection[d].length > 0)
          .map((domain) => (
            <Row
              key={domain}
              compact
              title={`Share ${domain === 'time' ? 'screen time' : domain} JSON`}
              disabled={disabled || busy}
              onPress={() =>
                void run(async () => {
                  const range = Number(days);
                  if (!Number.isInteger(range) || range < 1 || range > 31)
                    throw new Error('Choose 1–31 days.');
                  await shareDomain(
                    session,
                    { health: true, time: true, location: true },
                    domain,
                    profile,
                    range,
                    setMessage,
                  );
                })
              }
            />
          ))}
        <Row compact testID="export-files" title="Files" value={String(state.files.length)} />
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
        <Copy testID="export-status" accessibilityRole="alert" variant="caption" selectable>
          {message || state.message}
        </Copy>
      ) : null}
      <Copy variant="caption" muted>
        Background timing depends on the OS. Opening the app catches up.
      </Copy>
      {profile.export.destination === 'http' ? (
        <>
          <TextInput
            testID="export-http-credential-input"
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
            testID="export-save-http-credential"
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
            testID="export-authorize-cloud-uploads"
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
            testID="export-allow-stored-data-in-connectors"
            title="Allow stored data in connectors"
            trailing={
              <Switch
                testID="export-cloud-access"
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
            testID="export-delete-this-profile-s-cloud-exports"
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
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineActions: { flexWrap: 'nowrap' },
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
