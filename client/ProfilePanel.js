import { router, useNavigation } from 'expo-router';
import { qaEnabled } from './qa-runtime.js';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useTheme } from '../src/lib/theme';
import { useRef, useState } from 'react';
import {
  Copy,
  Icon,
  Group,
  Row,
  SectionHeader,
  Button as BridgeButton,
  Screen,
} from '../src/components/ui';
import { Alert, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { Button, Switch, Text } from './Terminal.js';
import { useProfileEditor } from './ProfileEditorState.js';
import ProfileDataEditor from './ProfileDataEditor.js';
import ProfileExports from './ProfileExports.js';
import ExportSettingsEditor from './ExportSettingsEditor.js';
import { domains } from '../core/data.js';
import { parseProfile, profileLink, uniqueProfileName } from '../core/profiles.js';
/** @param {{session:import('./session.js').Session,state:import('../core/profiles.js').ProfileState,types:Record<import('../core/data.js').Domain,string[]>,permissions:Record<string,string>,onAuthorize:(domain:import('../core/data.js').Domain)=>Promise<{message:string}>,busy:boolean,onChange:(state:import('../core/profiles.js').ProfileState)=>Promise<void>,profileId?:string,draft:import('../core/profiles.js').ProfileDraft|null,onDismiss:()=>void}} props */
export default function ProfilePanel({
  session,
  state,
  types,
  permissions,
  onAuthorize,
  busy,
  onChange,
  draft,
  onDismiss,
  profileId,
}) {
  const { colors } = useTheme();
  const { start } = useProfileEditor();
  const actionRunning = useRef(false);
  const [deletingProfile, setDeletingProfile] = useState(
    /** @type {import('../core/profiles.js').ExportProfile|null} */ (null),
  );
  const profile = state.profiles.find((p) => p.id === profileId) ?? deletingProfile;
  const [error, setError] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [working, setWorking] = useState(false);
  const disabled = busy || working;
  const navigation = useNavigation();
  const [editing, setEditing] = useState(
    /** @type {{key:string,original:import('../core/profiles.js').ResolvedDraft,draft:import('../core/profiles.js').ResolvedDraft}|null} */ (
      null
    ),
  );
  const dirty = Boolean(
    editing && JSON.stringify(editing.draft) !== JSON.stringify(editing.original),
  );
  usePreventRemove(dirty && !deletingProfile, ({ data }) => {
    if (working) return;
    Alert.alert('Discard changes?', 'Your unsaved profile changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  /** @param {()=>void} action */
  function leaveForm(action) {
    if (!dirty) return action();
    Alert.alert('Discard changes?', 'Your unsaved profile changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: action },
    ]);
  }
  /** @param {string} title @param {string} value @param {string} section @param {string} [field] */
  function setting(title, value, section, field = '') {
    if (!profile) return null;
    const key = field || section;
    const open = editing?.key === key;
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          testID={`profile-setting-${key}`}
          accessibilityLabel={[title, value].filter(Boolean).join(', ')}
          accessibilityState={{ expanded: open, disabled }}
          disabled={disabled}
          onPress={() =>
            leaveForm(() => {
              setError('');
              setEditing(open ? null : { key, original: profile, draft: profile });
            })
          }
          style={({ pressed }) => [
            styles.settingRow,
            {
              borderBottomColor: colors.border,
              backgroundColor: pressed ? colors.subtle : 'transparent',
            },
          ]}
        >
          <Icon
            name={open ? 'chevron-down' : 'chevron-forward'}
            size={17}
            color={colors.secondary}
          />
          <View style={styles.settingTitle}>
            <Copy>{title}</Copy>
          </View>
          <Copy variant="caption" muted style={styles.settingValue}>
            {value}
          </Copy>
        </Pressable>
        {open && editing && (
          <View style={styles.form}>
            {section === 'name' ? (
              <TextInput
                testID="profile-name-input"
                accessibilityLabel="Profile name"
                value={editing.draft.name}
                editable={!disabled}
                onChangeText={(name) =>
                  setEditing({ ...editing, draft: { ...editing.draft, name } })
                }
                style={[styles.nameInput, { color: colors.text, borderColor: colors.border }]}
              />
            ) : (
              <ExportSettingsEditor
                section={section}
                field={field}
                settings={editing.draft.export}
                schedule={editing.draft.schedule}
                onSettings={(settings) =>
                  setEditing({ ...editing, draft: { ...editing.draft, export: settings } })
                }
                onSchedule={(schedule) =>
                  setEditing({ ...editing, draft: { ...editing.draft, schedule } })
                }
                disabled={disabled}
              />
            )}
            {error ? (
              <Copy testID="profile-inline-error" accessibilityRole="alert">
                {error}
              </Copy>
            ) : null}
            {dirty && (
              <View style={styles.formActions}>
                <View style={styles.settingTitle}>
                  <BridgeButton
                    testID="profile-inline-save"
                    busy={working}
                    label="Save"
                    disabled={disabled}
                    onPress={() =>
                      void run(async () => {
                        const updated = parseProfile({
                          ...profile,
                          name: section === 'name' ? editing.draft.name : profile.name,
                          export: {
                            ...profile.export,
                            ...changedFields(editing.original.export, editing.draft.export),
                          },
                          schedule: {
                            ...profile.schedule,
                            ...changedFields(editing.original.schedule, editing.draft.schedule),
                          },
                        });
                        if (section === 'name')
                          updated.name = uniqueProfileName(
                            updated.name,
                            state.profiles.filter((p) => p.id !== profile.id),
                          );
                        await onChange({
                          ...state,
                          profiles: state.profiles.map((p) =>
                            p.id === profile.id
                              ? {
                                  ...updated,
                                  id: profile.id,
                                  agentAccess: profile.agentAccess === true,
                                }
                              : p,
                          ),
                        });
                        setEditing(null);
                      })
                    }
                  />
                </View>
                <View style={styles.settingTitle}>
                  <BridgeButton
                    testID="profile-inline-cancel"
                    label="Cancel"
                    secondary
                    disabled={disabled}
                    onPress={() => {
                      setEditing(null);
                      setError('');
                    }}
                  />
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }
  /** @param {import('../core/profiles.js').ProfileDraft} p @param {string} [id] */
  function edit(p, id = '', section = '', field = '', domain = '') {
    if (disabled) return;
    start(p, id, p === draft ? onDismiss : undefined);
    router.push({ pathname: '/profiles/editor', params: { section, field, domain } });
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
  const content = (
    <View testID={profile ? 'profile-content' : 'profiles-list'} style={styles.container}>
      {profileId && !profile && (
        <Text testID="profile-unavailable">This profile no longer exists.</Text>
      )}
      {profile && (
        <>
          <Group compact>
            <Row
              compact
              testID="profile-saved-profile"
              title="Saved profile"
              value={`${domains.reduce((n, d) => n + profile.selection[d].length, 0)}/${domains.reduce((n, d) => n + new Set([...types[d], ...profile.selection[d]]).size, 0)} · ${profile.export.formats.join(' + ').toUpperCase()}`}
            />
          </Group>
          <Copy variant="caption" muted>
            Agents can choose any approved profile. Source permissions and domain grants still
            apply.
          </Copy>
          <Group compact>
            <Row
              compact
              testID="profile-allow-agent-access"
              title="Allow agent access"
              trailing={
                <Switch
                  testID="profile-agent-access"
                  accessibilityLabel={`Allow agent access for ${profile.name}`}
                  value={profile.agentAccess === true}
                  disabled={disabled}
                  onValueChange={(enabled) => {
                    const save = () =>
                      void run(() =>
                        onChange({
                          ...state,
                          profiles: state.profiles.map((p) =>
                            p.id === profile.id ? { ...p, agentAccess: enabled } : p,
                          ),
                        }),
                      );
                    if (!enabled) return save();
                    Alert.alert(
                      'Allow agent access?',
                      `Paired agents can read the selected data in ${profile.name}, subject to domain grants and source permissions.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Allow', onPress: save },
                      ],
                    );
                  }}
                />
              }
            />
          </Group>
          <Group compact>{setting('Profile name', profile.name, 'name')}</Group>
          <SectionHeader compact title="Data selection" />
          <Group compact>
            <ProfileDataEditor
              key={profile.id}
              inline
              types={types}
              permissions={permissions}
              onAuthorize={onAuthorize}
              onOpenLocation={() => router.push('/data/location')}
              selection={profile.selection}
              onSelection={async (selection) => {
                if (actionRunning.current)
                  throw new Error('Wait for the current profile action to finish.');
                actionRunning.current = true;
                setWorking(true);
                try {
                  const updated = parseProfile({ ...profile, selection });
                  await onChange({
                    ...state,
                    profiles: state.profiles.map((p) =>
                      p.id === profile.id
                        ? { ...updated, id: profile.id, agentAccess: profile.agentAccess === true }
                        : p,
                    ),
                  });
                } finally {
                  actionRunning.current = false;
                  setWorking(false);
                }
              }}
              disabled={disabled}
            />
          </Group>
          <SectionHeader compact title="Destination" />
          <Group compact>
            {setting(
              profile.export.destination === 'local'
                ? 'On this phone'
                : profile.export.destination === 'http'
                  ? 'HTTPS endpoint'
                  : 'Cloud service',
              profile.export.destination === 'local'
                ? `Documents/${profile.export.folderName}`
                : profile.export.destination === 'http'
                  ? (profile.export.httpUrl ?? '')
                  : session.server || 'Connect an agent to use cloud exports',
              'destination',
            )}
          </Group>
          <SectionHeader compact title="Output" />
          <Group compact>
            {setting(
              'Formats',
              profile.export.formats.join(' + ').toUpperCase(),
              'output',
              'formats',
            )}
            {setting(
              'Export window',
              `${profile.export.lookbackDays} days${profile.export.includeToday ? ' + today' : ''}`,
              'output',
              'window',
            )}
            {setting('Filename', profile.export.filenameTemplate, 'output', 'filename')}
            {setting(
              'Folders',
              `${profile.export.folderName}${profile.export.formatFolders ? ' · separate format folders' : ''}`,
              'output',
              'folders',
            )}
            <Row
              compact
              testID="profile-when-files-exist"
              title="When files exist"
              value="Replace matching daily files"
            />
          </Group>
          <SectionHeader compact title="Schedule" />
          <Group compact>
            {setting(
              'Cadence',
              profile.schedule.frequency === 'custom'
                ? `Every ${profile.schedule.interval} ${profile.schedule.unit}${profile.schedule.interval === 1 ? '' : 's'}${profile.schedule.anchorDate ? ` · from ${profile.schedule.anchorDate}` : ' · anchored on opt-in day'}`
                : profile.schedule.frequency === 'weekly'
                  ? `Weekly · ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][profile.schedule.weekday - 1]}`
                  : 'Daily',
              'schedule',
              'cadence',
            )}
            {setting(
              'Preferred time',
              `${String(profile.schedule.hour).padStart(2, '0')}:${String(profile.schedule.minute).padStart(2, '0')} local time`,
              'schedule',
              'time',
            )}
            {setting(
              'Today Refresh',
              profile.schedule.todayRefresh
                ? `Every ${profile.schedule.refreshHours} hours`
                : 'Off',
              'schedule',
              'refresh',
            )}
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
              testID="profile-view-history"
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
              testID="profile-duplicate-profile"
              title="Duplicate profile"
              disabled={disabled}
              onPress={() =>
                edit({ ...profile, name: uniqueProfileName(profile.name, state.profiles) })
              }
            />
            <Row
              compact
              testID="profile-share-profile-link"
              title="Share profile link"
              disabled={disabled || qaEnabled}
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
              testID="profile-delete-profile"
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
                          await onChange({ profiles });
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
      {draft ? (
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text>Generated profile: {draft.name}</Text>
          <Text>
            {domains.map((d) => `${d}: ${draft.selection[d].length}`).join(' / ')} selected types.
            Review before saving; access stays unchanged.
          </Text>
          <Button
            testID="profile-review-generated-profile"
            title="Review generated profile"
            disabled={disabled}
            onPress={() => {
              edit(draft);
            }}
          />
          <Button
            testID="profile-dismiss-generated-profile"
            title="Dismiss generated profile"
            onPress={onDismiss}
          />
        </View>
      ) : null}
      {!profileId && (
        <>
          <View style={styles.intro}>
            <Copy variant="heading">Choose what goes into your exports.</Copy>
            <Copy muted>
              Profiles keep your data selection, destination, and schedule together.
            </Copy>
          </View>
          <BridgeButton
            testID="profile-new-profile"
            label="New profile"
            icon="add"
            disabled={disabled}
            onPress={() =>
              edit({
                schema: 'myself.md.profile.v1',
                name: 'Profile',
                selection: { health: [], time: [], location: [] },
              })
            }
          />
          <View
            accessible
            testID="profile-summary"
            accessibilityRole="header"
            accessibilityLabel={`Saved profiles, ${state.profiles.length}`}
          >
            <SectionHeader title="Saved profiles" count={state.profiles.length} />
          </View>
          <Group compact>
            {state.profiles.map((p) => (
              <Row
                compact
                key={p.id}
                testID={`profile-row-${p.id}`}
                title={p.name}
                subtitle={`${domains.reduce((n, d) => n + p.selection[d].length, 0)} data types · ${p.export.formats.join(' + ').toUpperCase()} · ${p.export.destination === 'local' ? 'On this phone' : p.export.destination === 'http' ? 'HTTPS' : 'Cloud'}`}
                value={p.agentAccess ? 'Agent access' : 'Private'}
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
      {profileId ? content : <Screen>{content}</Screen>}
      {shareLink ? (
        <Text selectable style={styles.detail}>
          {shareLink}
        </Text>
      ) : null}
      {error && !editing ? (
        <Text testID="profile-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
/** @param {object} before @param {object} after */
function changedFields(before, after) {
  const original = new Map(Object.entries(before));
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(original.get(key)),
    ),
  );
}
const styles = StyleSheet.create({
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingTitle: { flex: 1 },
  settingValue: { flexShrink: 1, maxWidth: '55%', textAlign: 'right' },
  form: { padding: 12, gap: 12 },
  formActions: { flexDirection: 'row', gap: 8 },
  nameInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    minHeight: 44,
    fontSize: 16,
  },
  container: { gap: 16 },
  intro: { gap: 8 },
  feed: { flex: 1 },
  card: {
    gap: 8,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  detail: { fontSize: 13, lineHeight: 20 },
});
