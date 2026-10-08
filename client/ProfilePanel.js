import { router } from 'expo-router';
import { useTheme } from '../src/lib/theme';
import { useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Copy, Group, Row, SectionHeader, Notice, Screen } from '../src/components/ui';
import { Alert, Modal, Share, StyleSheet, TextInput, View } from 'react-native';
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
  const [exportSettings, setExportSettings] = useState(() => parseExportSettings(undefined));
  const [scheduleSettings, setScheduleSettings] = useState(() => parseSchedule(undefined));
  const [editing, setEditing] = useState('');
  const [section, setSection] = useState('');
  const originalDraft = useRef('');
  const actionRunning = useRef(false);
  const profile = state.profiles.find((p) => p.id === profileId);
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
    originalDraft.current = JSON.stringify({
      name: p.name,
      selection: p.selection,
      export: parseExportSettings(p.export),
      schedule: parseSchedule(p.schedule),
    });
    setSection('');
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
      schema: 'qr-connect.profile.v1',
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
    await onChange({ ...state, profiles: [...others, savedProfile] });
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
  return (
    <View style={styles.container}>
      {!profileId && (
        <Notice
          title="Profiles"
          body="Save a configuration for each export. Select a profile to customize its data, destination, output and schedule."
        />
      )}
      {profileId && !profile && <Text>This profile no longer exists.</Text>}
      {profile && (
        <>
          <Notice
            title={profile.id === state.activeId ? 'Active profile' : 'Saved profile'}
            body={
              profile.id === state.activeId
                ? 'This profile controls live agent access. Saved edits apply immediately; domain and system permissions still apply.'
                : 'Its schedule runs independently. Make it active to use these selections for live agent access.'
            }
          />
          <Button
            title="Customize profile"
            disabled={disabled}
            onPress={() => edit(profile, profile.id)}
          />
          <SectionHeader
            title="Data selection"
            action="Edit"
            onPress={() => {
              edit(profile, profile.id);
              setSection('data');
            }}
          />
          <Group>
            {domains.map((domain) => (
              <Row
                key={domain}
                title={
                  domain === 'health' ? 'Health' : domain === 'time' ? 'Screen time' : 'Location'
                }
                subtitle={`${profile.selection[domain].length} selected data types`}
              />
            ))}
          </Group>
          <SectionHeader
            title="Destination"
            action="Edit"
            onPress={() => {
              edit(profile, profile.id);
              setSection('destination');
            }}
          />
          <Group>
            <Row
              title={
                profile.export.destination === 'local'
                  ? 'On this phone'
                  : profile.export.destination === 'http'
                    ? 'HTTPS endpoint'
                    : 'Cloud service'
              }
              subtitle={
                profile.export.destination === 'local'
                  ? `Documents/${profile.export.folderName}`
                  : profile.export.destination === 'http'
                    ? (profile.export.httpUrl ?? '')
                    : session.server || 'Connect an agent to use cloud exports'
              }
            />
          </Group>
          <SectionHeader
            title="Output"
            action="Edit"
            onPress={() => {
              edit(profile, profile.id);
              setSection('output');
            }}
          />
          <Group>
            <Row title="Formats" subtitle={profile.export.formats.join(' + ').toUpperCase()} />
            <Row
              title="Export window"
              subtitle={`${profile.export.lookbackDays} completed days${profile.export.includeToday ? ' + today for manual exports' : ''}`}
            />
            <Row title="Filename" subtitle={profile.export.filenameTemplate} />
            <Row
              title="Folders"
              subtitle={`${profile.export.folderName}${profile.export.formatFolders ? ' · separate format folders' : ''}`}
            />
            <Row title="When files exist" subtitle="Replace matching daily files" />
          </Group>
          <SectionHeader
            title="Schedule & exports"
            action="Edit"
            onPress={() => {
              edit(profile, profile.id);
              setSection('schedule');
            }}
          />
          <Group>
            <Row
              title="Cadence"
              subtitle={
                profile.schedule.frequency === 'custom'
                  ? `Every ${profile.schedule.interval} ${profile.schedule.unit}${profile.schedule.interval === 1 ? '' : 's'}${profile.schedule.anchorDate ? ` · from ${profile.schedule.anchorDate}` : ' · anchored on opt-in day'}`
                  : profile.schedule.frequency === 'weekly'
                    ? `Weekly · ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][profile.schedule.weekday - 1]}`
                    : 'Daily'
              }
            />
            <Row
              title="Preferred time"
              subtitle={`${String(profile.schedule.hour).padStart(2, '0')}:${String(profile.schedule.minute).padStart(2, '0')} local time`}
            />
            <Row
              title="Today Refresh"
              subtitle={
                profile.schedule.todayRefresh
                  ? `Every ${profile.schedule.refreshHours} hours`
                  : 'Off'
              }
            />
          </Group>
          <View
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <ProfileExports
              key={profile.id}
              session={session}
              profile={profile}
              disabled={disabled}
            />
          </View>
          <Group>
            <Row
              title="View history"
              subtitle="Exports and agent access for this profile"
              onPress={() =>
                router.push({ pathname: '/history', params: { profileId: profile.id } })
              }
            />
          </Group>
          <SectionHeader title="Profile ID" />
          <View
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text selectable>{profile.id}</Text>
            <Copy variant="caption" muted>
              Use this ID to identify the profile in exports and agent requests.
            </Copy>
          </View>
          <SectionHeader title="Manage profile" />
          <Button
            title="Rename profile"
            disabled={disabled}
            onPress={() => edit(profile, profile.id)}
          />
          <Button
            title="Make active"
            disabled={disabled || profile.id === state.activeId}
            onPress={() => void run(() => onChange({ ...state, activeId: profile.id }))}
          />
          <Button
            title="Duplicate profile"
            disabled={disabled}
            onPress={() =>
              edit({ ...profile, name: uniqueProfileName(profile.name, state.profiles) })
            }
          />
          <Button
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
          <Button
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
          <SectionHeader title="Your profiles" count={state.profiles.length} />
          <Group>
            {state.profiles.map((p) => (
              <Row
                key={p.id}
                title={p.name}
                subtitle={`${p.id === state.activeId ? 'Active · ' : ''}${domains.reduce((n, d) => n + p.selection[d].length, 0)} types · ${p.export.formats.join(' + ').toUpperCase()} · ${p.export.destination === 'local' ? 'On this phone' : p.export.destination === 'http' ? 'HTTPS' : 'Cloud'}`}
                onPress={() => router.push({ pathname: '/profiles/[id]', params: { id: p.id } })}
              />
            ))}
          </Group>
          <Button
            title="New profile"
            disabled={disabled}
            onPress={() =>
              edit({
                schema: 'qr-connect.profile.v1',
                name: 'Profile',
                selection: { health: [], time: [], location: [] },
              })
            }
          />
          <TextInput
            accessibilityLabel="Profile JSON or deep link"
            placeholder="Paste profile JSON or qrconnect link"
            value={importText}
            onChangeText={setImportText}
            multiline
            style={[
              styles.input,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
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
      <Modal
        visible={Boolean(editing)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={cancel}
      >
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={styles.toolbar}>
            <View style={styles.label}>
              <Button
                title={section ? 'All settings' : 'Cancel'}
                disabled={disabled}
                onPress={() => (section ? setSection('') : cancel())}
              />
            </View>
            <View style={styles.label}>
              <Button title="Save profile" disabled={disabled} onPress={() => void run(save)} />
            </View>
          </View>
          {section === 'data' ? (
            <ProfileDataEditor
              types={types}
              selection={selection}
              onSelection={setSelection}
              disabled={disabled}
              error={error}
            />
          ) : (
            <Screen>
              <Copy variant="heading">
                {review
                  ? 'Review generated profile'
                  : editing === 'new'
                    ? 'New profile'
                    : 'Customize profile'}
              </Copy>
              {!section && (
                <>
                  <Text>Profile name</Text>
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
                  <Group>
                    <Row
                      title="Data selection"
                      subtitle={`${domains.reduce((n, d) => n + selection[d].length, 0)} selected types`}
                      onPress={() => setSection('data')}
                    />
                    <Row
                      title="Destination"
                      subtitle={
                        exportSettings.destination === 'local'
                          ? 'On this phone'
                          : exportSettings.destination === 'http'
                            ? 'HTTPS endpoint'
                            : 'Cloud service'
                      }
                      onPress={() => setSection('destination')}
                    />
                    <Row
                      title="Output"
                      subtitle={exportSettings.formats.join(' + ').toUpperCase()}
                      onPress={() => setSection('output')}
                    />
                    <Row
                      title="Schedule"
                      subtitle={scheduleSettings.frequency}
                      onPress={() => setSection('schedule')}
                    />
                  </Group>
                  <Notice
                    title="Save when ready"
                    body="Changes stay in this draft until you save. Automatic exports and destination credentials are managed on the saved profile."
                  />
                </>
              )}
              {['destination', 'output', 'schedule'].includes(section) && (
                <ExportSettingsEditor
                  section={section}
                  settings={exportSettings}
                  schedule={scheduleSettings}
                  onSettings={setExportSettings}
                  onSchedule={setScheduleSettings}
                  disabled={disabled}
                />
              )}
              <Text>
                Edits to the active profile apply when saved. Activate a new profile when ready to
                use it.
              </Text>
              {error ? <Text accessibilityRole="alert">{error}</Text> : null}
            </Screen>
          )}
        </SafeAreaView>
      </Modal>
      {shareLink ? (
        <Text selectable style={styles.detail}>
          {shareLink}
        </Text>
      ) : null}
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 16 },
  modal: { flex: 1 },
  toolbar: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingVertical: 12 },
  card: {
    gap: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    borderCurve: 'continuous',

    padding: 12,

    fontSize: 16,
    minHeight: 44,
  },
  label: { flex: 1 },
  detail: { fontSize: 13, lineHeight: 20 },
});
