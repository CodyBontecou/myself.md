import { router } from 'expo-router';
import { useTheme } from '../src/lib/theme';
import { useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, Group, Row, SectionHeader, Icon, Screen } from '../src/components/ui';
import { Alert, Modal, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { Button, Text } from './Terminal.js';
import ProfileDataEditor from './ProfileDataEditor.js';
import ExportSettingsEditor from './ExportSettingsEditor.js';
import ProfileExports from './ProfileExports.js';
import { parseExportSettings } from '../core/export-files.js';
import { parseSchedule } from '../core/schedules.js';
import { domains } from '../core/data.js';
import { parseProfile, profileLink, profileFromLink, uniqueProfileName } from '../core/profiles.js';
/** @param {{session:import('./session.js').Session,state:import('../core/profiles.js').ProfileState,types:Record<import('../core/data.js').Domain,string[]>,busy:boolean,onChange:(state:import('../core/profiles.js').ProfileState)=>Promise<void>,profileId?:string,draft:import('../core/profiles.js').ProfileDraft|null,onDismiss:()=>void}} props */
export default function ProfilePanel({
  session,
  state,
  types,
  busy,
  onChange,
  draft,
  onDismiss,
  profileId,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [exportSettings, setExportSettings] = useState(() => parseExportSettings(undefined));
  const [scheduleSettings, setScheduleSettings] = useState(() => parseSchedule(undefined));
  const [editing, setEditing] = useState('');
  const [section, setSection] = useState('');
  const originalDraft = useRef('');
  const actionRunning = useRef(false);
  const [deletingProfile, setDeletingProfile] = useState(
    /** @type {import('../core/profiles.js').ExportProfile|null} */ (null),
  );
  const profile = state.profiles.find((p) => p.id === profileId) ?? deletingProfile;
  const [name, setName] = useState('');
  const [selection, setSelection] = useState(
    /** @type {import('../core/profiles.js').ProfileDraft['selection']} */ ({
      health: [],
      time: [],
      location: [],
    }),
  );
  const [importText, setImportText] = useState('');
  const [error, setError] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [review, setReview] = useState(false);
  const [working, setWorking] = useState(false);
  const disabled = busy || working;
  /** @param {import('../core/profiles.js').ProfileDraft} p @param {string} [id] */
  function edit(p, id = '') {
    if (disabled) return;
    originalDraft.current = JSON.stringify({
      name: p.name,
      selection: p.selection,
      export: parseExportSettings(p.export),
      schedule: parseSchedule(p.schedule),
    });
    setSection('');
    setImportText('');
    setEditing(id || 'new');
    setName(p.name);
    setSelection(p.selection);
    setExportSettings(parseExportSettings(p.export));
    setScheduleSettings(parseSchedule(p.schedule));
    setError('');
    setShareLink('');
  }
  /** @param {()=>Promise<void>|void} action */
  async function run(action) {
    if (actionRunning.current) return;
    actionRunning.current = true;
    try {
      setError('');
      setWorking(true);
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile.');
    } finally {
      actionRunning.current = false;
      setWorking(false);
    }
  }
  async function save() {
    const parsed = parseProfile({
      schema: 'myself.md.profile.v1',
      name,
      selection,
      export: exportSettings,
      schedule: scheduleSettings,
    });
    const id = editing === 'new' ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : editing;
    if (editing !== 'new' && !state.profiles.some((p) => p.id === id))
      throw new Error('This profile no longer exists. Cancel to return.');
    const others = state.profiles.filter((p) => p.id !== id);
    const savedProfile = { ...parsed, id, name: uniqueProfileName(parsed.name, others) };
    if (others.length >= 50) throw new Error('Keep at most 50 profiles.');
    await onChange({
      ...state,
      profiles:
        editing === 'new'
          ? [...state.profiles, savedProfile]
          : state.profiles.map((p) => (p.id === id ? savedProfile : p)),
    });
    setEditing('');
    if (editing === 'new') router.push({ pathname: '/profiles/[id]', params: { id } });
    if (review) {
      setReview(false);
      onDismiss();
    }
  }
  function closeEditor() {
    setEditing('');
    setReview(false);
    setError('');
  }
  function cancel() {
    if (disabled) return;
    if (
      JSON.stringify({ name, selection, export: exportSettings, schedule: scheduleSettings }) ===
      originalDraft.current
    )
      closeEditor();
    else
      Alert.alert('Discard changes?', 'Your unsaved profile changes will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: closeEditor },
      ]);
  }
  const content = (
    <View
      style={styles.container}
      accessibilityElementsHidden={Boolean(editing)}
      importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}
    >
      {profileId && !profile && <Text>This profile no longer exists.</Text>}
      {profile && (
        <>
          <Group compact>
            <Row
              compact
              title={profile.id === state.activeId ? 'Active profile' : 'Saved profile'}
              value={`${domains.reduce((n, d) => n + profile.selection[d].length, 0)} selected · ${profile.export.formats.join(' + ').toUpperCase()}`}
            />
            <Row
              compact
              title="Customize profile"
              onPress={() => edit(profile, profile.id)}
              disabled={disabled}
            />
          </Group>
          <Copy variant="caption" muted>
            {profile.id === state.activeId
              ? 'Saved selections apply to live agent access. Source permissions still apply.'
              : 'Schedules run independently. Activate to use this profile for live agent access.'}
          </Copy>
          <SectionHeader
            compact
            title="Data selection"
            action="Edit"
            onPress={() => {
              edit(profile, profile.id);
              setSection('data');
            }}
          />
          <Group compact>
            {domains.map((domain) => (
              <Row
                compact
                key={domain}
                title={
                  domain === 'health' ? 'Health' : domain === 'time' ? 'Screen time' : 'Location'
                }
                value={`${profile.selection[domain].length} selected`}
              />
            ))}
          </Group>
          <SectionHeader
            compact
            title="Destination"
            action="Edit"
            onPress={() => {
              edit(profile, profile.id);
              setSection('destination');
            }}
          />
          <Group compact>
            <Row
              compact
              title={
                profile.export.destination === 'local'
                  ? 'On this phone'
                  : profile.export.destination === 'http'
                    ? 'HTTPS endpoint'
                    : 'Cloud service'
              }
              value={
                profile.export.destination === 'local'
                  ? `Documents/${profile.export.folderName}`
                  : profile.export.destination === 'http'
                    ? (profile.export.httpUrl ?? '')
                    : session.server || 'Connect an agent to use cloud exports'
              }
            />
          </Group>
          <SectionHeader
            compact
            title="Output"
            action="Edit"
            onPress={() => {
              edit(profile, profile.id);
              setSection('output');
            }}
          />
          <Group compact>
            <Row compact title="Formats" value={profile.export.formats.join(' + ').toUpperCase()} />
            <Row
              compact
              title="Export window"
              value={`${profile.export.lookbackDays} days${profile.export.includeToday ? ' + today' : ''}`}
            />
            <Row compact title="Filename" value={profile.export.filenameTemplate} />
            <Row
              compact
              title="Folders"
              value={`${profile.export.folderName}${profile.export.formatFolders ? ' · separate format folders' : ''}`}
            />
            <Row compact title="When files exist" value="Replace matching daily files" />
          </Group>
          <SectionHeader
            compact
            title="Schedule"
            action="Edit"
            onPress={() => {
              edit(profile, profile.id);
              setSection('schedule');
            }}
          />
          <Group compact>
            <Row
              compact
              title="Cadence"
              value={
                profile.schedule.frequency === 'custom'
                  ? `Every ${profile.schedule.interval} ${profile.schedule.unit}${profile.schedule.interval === 1 ? '' : 's'}${profile.schedule.anchorDate ? ` · from ${profile.schedule.anchorDate}` : ' · anchored on opt-in day'}`
                  : profile.schedule.frequency === 'weekly'
                    ? `Weekly · ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][profile.schedule.weekday - 1]}`
                    : 'Daily'
              }
            />
            <Row
              compact
              title="Preferred time"
              value={`${String(profile.schedule.hour).padStart(2, '0')}:${String(profile.schedule.minute).padStart(2, '0')} local time`}
            />
            <Row
              compact
              title="Today Refresh"
              value={
                profile.schedule.todayRefresh
                  ? `Every ${profile.schedule.refreshHours} hours`
                  : 'Off'
              }
            />
          </Group>
          <ProfileExports
            key={profile.id}
            session={session}
            profile={profile}
            disabled={disabled}
          />
          <Group compact>
            <Row
              compact
              title="View history"
              subtitle="Exports and agent access for this profile"
              onPress={() =>
                router.push({ pathname: '/profiles/history', params: { profileId: profile.id } })
              }
            />
          </Group>
          <SectionHeader compact title="Profile ID" />
          <View
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text selectable>{profile.id}</Text>
            <Copy variant="caption" muted>
              Use this ID to identify the profile in exports and agent requests.
            </Copy>
          </View>
          <SectionHeader compact title="Manage profile" />
          <Group compact>
            <Row
              compact
              title="Rename profile"
              disabled={disabled}
              onPress={() => edit(profile, profile.id)}
            />
            <Row
              compact
              title="Make active"
              disabled={disabled || profile.id === state.activeId}
              onPress={() => void run(() => onChange({ ...state, activeId: profile.id }))}
            />
            <Row
              compact
              title="Duplicate profile"
              disabled={disabled}
              onPress={() =>
                edit({ ...profile, name: uniqueProfileName(profile.name, state.profiles) })
              }
            />
            <Row
              compact
              title="Share profile link"
              disabled={disabled}
              onPress={() =>
                void run(async () => {
                  const link = profileLink(profile);
                  setShareLink(link);
                  await Share.share({ message: link, title: profile.name });
                })
              }
            />
            <Row
              compact
              destructive
              title="Delete profile"
              disabled={disabled || state.profiles.length === 1}
              onPress={() =>
                Alert.alert(
                  'Delete profile?',
                  `Remove ${profile.name} and its schedule configuration?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () =>
                        void run(async () => {
                          setDeletingProfile(profile);
                          const profiles = state.profiles.filter((p) => p.id !== profile.id);
                          await onChange({
                            profiles,
                            activeId:
                              state.activeId === profile.id
                                ? (profiles[0]?.id ?? state.activeId)
                                : state.activeId,
                          });
                          router.back();
                        }),
                    },
                  ],
                )
              }
            />
          </Group>
        </>
      )}
      {draft && !review ? (
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text>Generated profile: {draft.name}</Text>
          <Text>
            {domains.map((d) => `${d}: ${draft.selection[d].length}`).join(' / ')} selected types.
            Review before saving; access stays unchanged.
          </Text>
          <Button
            title="Review generated profile"
            disabled={disabled}
            onPress={() => {
              setReview(true);
              edit(draft);
            }}
          />
          <Button title="Dismiss generated profile" onPress={onDismiss} />
        </View>
      ) : null}
      {!profileId && (
        <>
          <SectionHeader compact title="Your profiles" />
          <Group compact>
            {state.profiles.map((p) => (
              <Row
                compact
                key={p.id}
                title={p.name}
                subtitle={`${p.id === state.activeId ? 'Active · ' : ''}${domains.reduce((n, d) => n + p.selection[d].length, 0)} types · ${p.export.formats.join(' + ').toUpperCase()} · ${p.export.destination === 'local' ? 'On this phone' : p.export.destination === 'http' ? 'HTTPS' : 'Cloud'}`}
                onPress={() => router.push({ pathname: '/profiles/[id]', params: { id: p.id } })}
              />
            ))}
          </Group>
        </>
      )}
    </View>
  );
  return (
    <View style={!profileId && styles.feed}>
      {profileId ? (
        content
      ) : (
        <Screen>
          {content}
          <View style={styles.feedClearance} />
        </Screen>
      )}
      {!profileId && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New profile"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() =>
            edit({
              schema: 'myself.md.profile.v1',
              name: 'Profile',
              selection: { health: [], time: [], location: [] },
            })
          }
          style={({ pressed }) => [
            styles.floatingAction,
            {
              bottom: insets.bottom + 16,
              backgroundColor: colors.accent,
              opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Icon name="add" size={30} color={colors.onAccent} />
        </Pressable>
      )}
      <Modal
        visible={Boolean(editing)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => (section ? setSection('') : cancel())}
      >
        <SafeAreaView
          accessibilityViewIsModal
          style={[styles.modal, { backgroundColor: colors.background }]}
        >
          <View style={styles.toolbar}>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              accessibilityState={{ disabled }}
              onPress={() => (section ? setSection('') : cancel())}
              style={({ pressed }) => [
                styles.toolbarAction,
                { backgroundColor: colors.subtle, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
              ]}
            >
              <Copy style={styles.toolbarLabel}>{section ? 'All settings' : 'Cancel'}</Copy>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              accessibilityState={{ disabled }}
              onPress={() => void run(save)}
              style={({ pressed }) => [
                styles.toolbarAction,
                { backgroundColor: colors.accent, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
              ]}
            >
              <Copy style={[styles.toolbarLabel, { color: colors.onAccent }]}>
                {working ? 'Saving…' : 'Save profile'}
              </Copy>
            </Pressable>
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={styles.editorError}>
              {error}
            </Text>
          ) : null}
          {section === 'data' ? (
            <ProfileDataEditor
              types={types}
              selection={selection}
              onSelection={setSelection}
              disabled={disabled}
            />
          ) : (
            <Screen compact>
              <Copy variant="heading">
                {section
                  ? ({ destination: 'Destination', output: 'Output', schedule: 'Schedule' }[
                      section
                    ] ?? 'Customize profile')
                  : review
                    ? 'Review generated profile'
                    : editing === 'new'
                      ? 'New profile'
                      : 'Customize profile'}
              </Copy>
              {!section && editing === 'new' && !review && (
                <>
                  <SectionHeader compact title="Import profile" />
                  <TextInput
                    accessibilityLabel="Profile JSON or deep link"
                    placeholder="Paste profile JSON or qrconnect link"
                    editable={!disabled}
                    value={importText}
                    onChangeText={setImportText}
                    multiline
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        color: colors.text,
                      },
                    ]}
                  />
                  <Button
                    title="Review pasted profile"
                    disabled={disabled || !importText}
                    onPress={() =>
                      void run(async () => {
                        edit(
                          importText.trim().startsWith('qrconnect:')
                            ? profileFromLink(importText.trim())
                            : parseProfile(JSON.parse(importText)),
                        );
                      })
                    }
                  />
                </>
              )}
              {!section && (
                <>
                  <Copy variant="caption" muted>
                    Profile name
                  </Copy>
                  <TextInput
                    accessibilityLabel="Profile name"
                    editable={!disabled}
                    value={name}
                    onChangeText={setName}
                    maxLength={80}
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        color: colors.text,
                      },
                    ]}
                  />
                  <Group compact>
                    <Row
                      compact
                      title="Data selection"
                      subtitle={`${domains.reduce((n, d) => n + selection[d].length, 0)} selected`}
                      onPress={() => setSection('data')}
                    />
                  </Group>
                  <Copy variant="caption" muted>
                    Changes stay in this draft until you save.
                  </Copy>
                </>
              )}
              {(!section || ['destination', 'output', 'schedule'].includes(section)) && (
                <ExportSettingsEditor
                  section={section}
                  settings={exportSettings}
                  schedule={scheduleSettings}
                  onSettings={setExportSettings}
                  onSchedule={setScheduleSettings}
                  disabled={disabled}
                />
              )}
              <Copy variant="caption" muted>
                Automatic exports and credentials are managed on the saved profile.
              </Copy>
            </Screen>
          )}
        </SafeAreaView>
      </Modal>
      {shareLink ? (
        <Text selectable style={styles.detail}>
          {shareLink}
        </Text>
      ) : null}
      {error && !editing ? <Text accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 8 },
  feed: { flex: 1 },
  feedClearance: { height: 72 },
  floatingAction: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: { flex: 1 },
  editorError: { paddingHorizontal: 16, paddingBottom: 12 },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  card: {
    gap: 8,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',

    padding: 12,

    fontSize: 16,
    minHeight: 44,
  },
  toolbarAction: {
    minHeight: 48,
    flexShrink: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarLabel: { fontWeight: '600', textAlign: 'center' },
  detail: { fontSize: 13, lineHeight: 20 },
});
