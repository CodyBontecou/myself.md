import { router } from 'expo-router';
import { useToast } from '../src/components/Toast.js';
import { errorMessage } from '../packages/support-chat/errors.js';
import { qaEnabled } from './qa-runtime.js';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View, TextInput, StyleSheet } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Checkbox } from './Terminal.js';
import { Copy, Group, Icon, Row, SectionHeader } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
import { scheduleState, setScheduleEnabled, exportNow, cancelExports } from './export-task.js';
import { saveDestinationCredential } from './destinations.js';
import { nextOccurrence } from '../core/schedules.js';
import { formatNextExport, localCalendar } from './calendar.js';
import ProfileQuickAction from './ProfileQuickAction.js';
import { useProfileEditor } from './ProfileEditorState.js';
/** @param {{session:import('./session.js').Session,profile:import('../core/profiles.js').ExportProfile,disabled:boolean,quick?:boolean,roomy?:boolean,compact?:boolean,showStatus?:boolean,cloudAccessOnly?:boolean,scheduleOnly?:boolean,destinationOnly?:boolean,filesOnly?:boolean,onOpenSchedule?:()=>void}} props */
export default function ProfileExports(props) {
  return <ProfileExportControls {...props} disabled={props.disabled || qaEnabled} />;
}
/** @param {{session:import('./session.js').Session,profile:import('../core/profiles.js').ExportProfile,disabled:boolean,quick?:boolean,roomy?:boolean,compact?:boolean,showStatus?:boolean,cloudAccessOnly?:boolean,scheduleOnly?:boolean,destinationOnly?:boolean,filesOnly?:boolean,onOpenSchedule?:()=>void}} props */
function ProfileExportControls({
  session,
  profile,
  disabled,
  quick = false,
  roomy = false,
  compact = false,
  showStatus = true,
  cloudAccessOnly = false,
  scheduleOnly = false,
  destinationOnly = false,
  filesOnly = false,
  onOpenSchedule,
}) {
  const { colors } = useTheme();
  const { start } = useProfileEditor();
  const showToast = useToast();
  const running = useRef(false);
  const [bearer, setBearer] = useState('');
  const [now, setNow] = useState(() => new Date().toISOString());
  const [state, setState] = useState(() => scheduleState(session.deviceId, profile));
  const [exporting, setExporting] = useState(false);
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
  useEffect(() => {
    if (!scheduleOnly && !destinationOnly && !filesOnly && state.retryAt && state.message)
      showToast({
        message: errorMessage(state.message),
        kind: 'error',
      });
  }, [state.retryAt, state.message, showToast, scheduleOnly, destinationOnly, filesOnly]);
  /** @param {()=>Promise<void>} action @param {string} [failureToast] @param {(toast:import('../src/components/Toast.js').Toast)=>void} [notify] */
  async function run(action, failureToast, notify = showToast) {
    if (running.current || disabled) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
      setState(scheduleState(session.deviceId, profile));
      setMessage('');
    } catch (e) {
      setMessage('');
      notify({
        message: errorMessage(e) || failureToast || 'Could not complete this request.',
        kind: 'error',
      });
    } finally {
      running.current = false;
      setBusy(false);
      setExporting(false);
    }
  }
  /** @param {boolean} [allTimeHealth] */
  function exportProfile(allTimeHealth = false) {
    if (qaEnabled || disabled || running.current) {
      showToast({
        message: qaEnabled
          ? 'Exports are disabled in this QA preview. Use the regular app to export.'
          : running.current
            ? 'An export is already in progress. Wait for it to finish.'
            : 'Another profile action is in progress. Try again when it finishes.',
        kind: 'warning',
      });
      return;
    }
    setExporting(true);
    const updateToast = showToast({
      message: `Exporting ${profile.name}`,
      detail: 'Preparing export…',
      kind: 'loading',
      progress: 0,
    });
    void run(
      async () => {
        const result = await exportNow(
          session,
          profile,
          (detail, progress) => {
            updateToast({
              detail: detail
                .replace(/HK(?:Quantity|Category|Characteristic|Correlation)TypeIdentifier/g, '')
                .replace(/([a-z])([A-Z])/g, '$1 $2'),
              progress,
            });
          },
          allTimeHealth ? { domains: ['health'], range: { start: null, end: null } } : {},
        );
        updateToast({
          detail: result.failedSources
            ? `${result.failedSources} source failures · See export details`
            : `${result.days} ${result.days === 1 ? 'day' : 'days'} exported`,
          progress: 100,
          message: result.failedSources
            ? `${profile.name} partially exported`
            : `${profile.name} exported`,
          kind: result.failedSources ? 'warning' : 'success',
        });
      },
      `Could not export ${profile.name}.`,
      (toast) => updateToast({ ...toast, detail: undefined, progress: undefined }),
    );
  }
  function exportAllTimeHealth() {
    const destination =
      profile.export.destination === 'local'
        ? 'this phone'
        : profile.export.destination === 'cloud'
          ? 'your cloud storage'
          : new URL(profile.export.httpUrl ?? '').host;
    Alert.alert(
      'Export All Time Health?',
      `Export the ${profile.selection.health.length} selected Health types in ${profile.name}, from the earliest readable record through today, to ${destination}. This uses the profile’s formats and file replacement settings and your export allowance. Existing files may be replaced. Keep the app open; a large history can take a long time. Health permissions still apply.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export All Time', onPress: () => exportProfile(true) },
      ],
    );
  }
  const cloudControls =
    profile.export.destination === 'cloud' ? (
      <>
        <SectionHeader compact title="Cloud access" />
        <Copy variant="caption" selectable>
          Connector URL: {session.server}/mcp
        </Copy>
        <Copy variant="caption" muted>
          Add this remote MCP endpoint to your connector and sign in with the same account as this
          phone.
        </Copy>
        <Copy variant="caption" muted>
          Agent permissions control which selected Health, Screen time and Location data agents can
          read from this profile’s cloud exports. Changes apply after your phone syncs.
        </Copy>
        <Row
          compact
          destructive
          testID="export-delete-this-profile-s-cloud-exports"
          title="Delete this profile’s cloud exports"
          disabled={disabled || busy}
          onPress={() =>
            Alert.alert('Delete cloud exports?', `Remove all stored exports for ${profile.name}?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () =>
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
                  }),
              },
            ])
          }
        />
      </>
    ) : null;
  const httpControls =
    profile.export.destination === 'http' ? (
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
    ) : null;
  const next = nextOccurrence(profile.schedule, state.progress, now, localCalendar);
  const scheduleControls = (
    <>
      <Row
        compact
        testID="export-automatic-exports"
        title="Automatic exports"
        trailing={
          <Checkbox
            style={styles.trailingControl}
            testID="export-automatic"
            accessibilityLabel={`Automatic exports for ${profile.name}`}
            disabled={disabled || busy}
            value={state.progress.enabled}
            onValueChange={(v) => void run(() => setScheduleEnabled(session.deviceId, profile, v))}
          />
        }
      />
      {state.progress.enabled && state.reminderError && (
        <Copy testID="export-reminder-status">
          Push registration needs attention. A previous registration may still receive wakes;
          automatic exports also use best-effort background execution and catch up when you open the
          app. Check notification settings and connectivity.
        </Copy>
      )}
      {!scheduleOnly && (
        <Row
          compact
          testID="export-next-eligible"
          title="Next eligible"
          value={next ? new Date(next).toLocaleString() : 'Off'}
        />
      )}
      {state.job && (
        <Row
          compact
          testID="export-pending"
          title="Pending"
          value={`${state.job.days.length} days`}
        />
      )}
    </>
  );
  const fileControls = state.files.map((uri) => (
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
  ));
  if (filesOnly) return <Group compact>{fileControls}</Group>;
  if (destinationOnly)
    return (
      <View style={styles.container}>
        {httpControls}
        {cloudControls}
      </View>
    );
  if (scheduleOnly) return <Group compact>{scheduleControls}</Group>;
  if (cloudAccessOnly) return <View style={styles.container}>{cloudControls}</View>;
  if (quick)
    return (
      <View style={styles.container}>
        {showStatus &&
        (message ||
          (!state.retryAt &&
            state.message &&
            !['No exports yet.', 'Profile changed; pending exports cancelled.'].includes(
              state.message,
            ))) ? (
          <Copy
            testID={`profile-export-status-${profile.id}`}
            accessibilityRole="alert"
            variant="caption"
          >
            {message || state.message}
          </Copy>
        ) : null}
        <View style={[styles.quickActions, compact && styles.inlineActions]}>
          {showStatus && (
            <Pressable
              testID={`profile-schedule-${profile.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Edit schedule for ${profile.name}`}
              accessibilityHint={next ? formatNextExport(next, now) : 'Not scheduled'}
              onPress={(event) => {
                event.stopPropagation();
                if (onOpenSchedule) onOpenSchedule();
                else {
                  start(profile, profile.id);
                  router.push({ pathname: '/profiles/editor', params: { section: 'schedule' } });
                }
              }}
              style={({ pressed }) => [styles.scheduleSummary, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Icon name="time-outline" size={14} color={colors.secondary} />
              <Copy
                testID={`profile-next-export-${profile.id}`}
                variant="caption"
                muted
                style={styles.scheduleLabel}
              >
                {next ? formatNextExport(next, now) : 'Not scheduled'}
              </Copy>
            </Pressable>
          )}
          {exporting && (
            <ProfileQuickAction
              testID={`profile-export-cancel-${profile.id}`}
              label="Cancel"
              icon="close-outline"
              disabled={false}
              onPress={cancelExports}
            />
          )}
          <ProfileQuickAction
            testID={`profile-export-${profile.id}`}
            label={busy ? 'Exporting…' : 'Export'}
            icon="download-outline"
            disabled={disabled || busy}
            busy={busy}
            roomy={roomy}
            compact={compact}
            onPress={() => exportProfile()}
            onDisabledPress={() => exportProfile()}
          />
        </View>
      </View>
    );
  return (
    <View testID="profile-exports" accessibilityState={{ busy }} style={styles.container}>
      <SectionHeader compact title="Exports" />
      {qaEnabled && (
        <Copy testID="qa-integration-handoff" variant="caption">
          Exports, scheduling, credentials and sharing require a normal build for integration QA.
        </Copy>
      )}
      <Group compact>
        {scheduleControls}
        <Row
          compact
          testID="export-now"
          title={busy ? 'Exporting…' : 'Export profile now'}
          disabled={disabled || busy}
          onPress={() => exportProfile()}
          onDisabledPress={() => exportProfile()}
        />
        {profile.selection.health.length > 0 && (
          <Row
            compact
            testID="export-all-time-health"
            title="Export All Time Health"
            subtitle="Selected Health types · Earliest readable record through today"
            disabled={disabled || busy}
            onPress={exportAllTimeHealth}
          />
        )}
        {exporting && (
          <Row compact testID="export-cancel" title="Cancel export" onPress={cancelExports} />
        )}
        {fileControls}
      </Group>
      {message || (!state.retryAt && state.message && state.message !== 'No exports yet.') ? (
        <Copy testID="export-status" accessibilityRole="alert" variant="caption" selectable>
          {message || state.message}
        </Copy>
      ) : null}
      {httpControls}
      {cloudControls}
    </View>
  );
}

const styles = StyleSheet.create({
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineActions: { flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  scheduleSummary: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleLabel: { flexShrink: 1 },
  container: { gap: 8 },
  trailingControl: { alignItems: 'flex-end' },
  input: {
    minHeight: 44,
    padding: 12,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
});
