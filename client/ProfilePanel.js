import {
  AccordionBody,
  AccordionChevron,
  AccordionLayout,
} from '../src/components/AccordionMotion.js';
import { useToast } from '../src/components/Toast.js';
import { defaultExportSchema } from '../core/export-schemas.js';
import { deliveredFormats, parseExportSettings, exportWriteModes } from '../core/export-files.js';
import { errorMessage } from '../packages/support-chat/errors.js';
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
} from '../src/components/ui';
import { Alert, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Terminal.js';
import { useProfileEditor } from './ProfileEditorState.js';
import ProfileDataEditor from './ProfileDataEditor.js';
import ProfileExports from './ProfileExports.js';
import ProfileFeed from './ProfileFeed.js';
import { exportFolderStatus } from './export-folder.js';
import ExportSettingsEditor from './ExportSettingsEditor.js';
import { scheduleIntervalMs } from '../core/schedules.js';
import { domains } from '../core/data.js';
import { compatibleProfile } from '../core/profile-compatibility.js';
import ProfileImportReview from './ProfileImportReview.js';
import { parseProfile, profileShareLink, uniqueProfileName } from '../core/profiles.js';
/** @param {{session:import('./session.js').Session,state:import('../core/profiles.js').ProfileState,types:Record<import('../core/data.js').Domain,string[]>,permissions:Record<string,string>,onAuthorize:(domain:import('../core/data.js').Domain,selected?:string[])=>Promise<{message:string}>,busy:boolean,isTracking:boolean,onRecordingChange:(enabled:boolean)=>void,exportFirst?:boolean,onChange:(state:import('../core/profiles.js').ProfileState)=>Promise<void>,profileId?:string,inline?:boolean,draft:import('../core/profiles.js').ProfileDraft|null,onDismiss:()=>void}} props */
export default function ProfilePanel({
  session,
  state,
  types,
  permissions,
  onAuthorize,
  busy,
  isTracking,
  onRecordingChange,
  exportFirst = false,
  onChange,
  draft,
  onDismiss,
  profileId,
  inline = false,
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const showToast = useToast();
  const { start } = useProfileEditor();
  const actionRunning = useRef(false);
  const [deletingProfile, setDeletingProfile] = useState(
    /** @type {import('../core/profiles.js').ExportProfile|null} */ (null),
  );
  const profile = state.profiles.find((p) => p.id === profileId) ?? deletingProfile;

  const [shareLink, setShareLink] = useState('');
  const [working, setWorking] = useState(false);
  const disabled = busy || working;
  const catalogReady = domains.every((domain) => domain in permissions);
  const importReview = draft && catalogReady ? compatibleProfile(draft, types) : undefined;
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
                folderContext={session}
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
                                  agentPermissions: profile.agentPermissions,
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
    if (p === draft && !catalogReady) return;
    const review = p === draft ? compatibleProfile(p, types) : undefined;
    start(review?.profile ?? p, id, p === draft ? onDismiss : undefined, review);
    router.push({ pathname: '/profiles/editor', params: { section, field, domain } });
  }
  /** @param {()=>Promise<void>|void} action @param {{success:string,failure:string}} [feedback] */
  async function run(action, feedback) {
    if (actionRunning.current) return;
    actionRunning.current = true;
    try {
      setWorking(true);
      await action();
      if (feedback) showToast({ message: feedback.success, kind: 'success' });
    } catch (e) {
      showToast({ message: errorMessage(e), kind: 'error' });
    } finally {
      actionRunning.current = false;
      setWorking(false);
    }
  }
  function toggleProfile() {
    leaveForm(() => {
      setEditing(null);
      setExpanded((value) => !value);
    });
  }
  /** @param {import('react').ReactNode} [action] */
  function profileHeader(action) {
    if (!profile || !inline) return null;
    return (
      <View style={styles.cardHeader}>
        <Pressable
          testID={`profile-row-${profile.id}`}
          accessibilityRole="button"
          accessibilityLabel={profile.name}
          accessibilityState={{ expanded, disabled }}
          disabled={disabled}
          onPress={toggleProfile}
          style={({ pressed }) => [styles.cardToggle, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={styles.profileIdentity}>
            <Copy variant="heading">{profile.name}</Copy>
          </View>
        </Pressable>
        {action}
        <Pressable
          testID={`profile-disclosure-${profile.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${profile.name}`}
          accessibilityState={{ expanded, disabled }}
          disabled={disabled}
          onPress={toggleProfile}
          style={({ pressed }) => [styles.disclosure, { opacity: pressed ? 0.6 : 1 }]}
        >
          <AccordionChevron open={expanded} color={colors.secondary} />
        </Pressable>
      </View>
    );
  }
  const content = (
    <AccordionLayout
      enabled={inline}
      testID={inline ? `profile-card-${profileId}` : profile ? 'profile-content' : 'profiles-list'}
      style={[styles.container, inline && styles.profileCard]}
    >
      {profileId && !profile && (
        <Text testID="profile-unavailable">This profile no longer exists.</Text>
      )}
      {profile && (
        <ProfileExports
          key={profile.id}
          visible={!inline || expanded}
          session={session}
          profile={profile}
          disabled={disabled}
          renderProfile={(action, exportControls) => (
            <>
              {profileHeader(action)}
              {exportFirst && exportControls}
              <AccordionBody open={!inline || expanded} enabled={inline} style={styles.container}>
                <Group compact>{setting('Profile name', profile.name, 'name')}</Group>
                <>
                  <SectionHeader compact title="Data selection" />
                  <Group compact>
                    <ProfileDataEditor
                      key={profile.id}
                      inline
                      types={types}
                      permissions={permissions}
                      isTracking={isTracking}
                      onRecordingChange={onRecordingChange}
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
                                ? {
                                    ...updated,
                                    id: profile.id,
                                    agentAccess: profile.agentAccess === true,
                                    agentPermissions: profile.agentPermissions,
                                  }
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
                </>
                <>
                  <SectionHeader compact title="Destination" />
                  <Group compact>
                    {setting(
                      profile.export.destination === 'local'
                        ? 'On this phone'
                        : profile.export.destination === 'http'
                          ? 'HTTPS endpoint'
                          : 'Cloud service',
                      profile.export.destination === 'local'
                        ? ''
                        : profile.export.destination === 'http'
                          ? (profile.export.httpUrl ?? '')
                          : session.server || 'Connect an agent to use cloud exports',
                      'destination',
                    )}
                  </Group>
                  <SectionHeader compact title="Output" />
                  <Group compact>
                    {setting(
                      'Schema version',
                      profile.export.schema.split('.').at(-1) ?? 'v1',
                      'output',
                      'schema',
                    )}
                    {profile.export.destination === 'cloud' ? (
                      <Row compact testID="export-format-cloud" title="Format" value="JSONL" />
                    ) : (
                      setting(
                        'Formats',
                        deliveredFormats(profile.export).join(' + ').toUpperCase(),
                        'output',
                        'formats',
                      )
                    )}
                    {setting(
                      'Export window',
                      `${profile.export.lookbackDays} days${profile.export.includeToday ? ' + today' : ''}`,
                      'output',
                      'window',
                    )}
                    {profile.export.destination === 'local' && (
                      <>
                        {setting('Filename', profile.export.filenameTemplate, 'output', 'filename')}
                        {setting(
                          'Folders',
                          `${exportFolderStatus(session, profile).name}${profile.export.formatFolders ? ' · separate format folders' : ''}`,
                          'output',
                          'folders',
                        )}
                      </>
                    )}
                    {profile.export.destination !== 'http' && (
                      <>
                        {setting(
                          'When files exist',
                          exportWriteModes.find(
                            (mode) => mode.value === (profile.export.writeMode ?? 'replace'),
                          )?.title ?? 'Replace matching file',
                          'output',
                          'writeMode',
                        )}
                      </>
                    )}
                  </Group>
                </>
                <>
                  <SectionHeader compact title="Schedule" />
                  <Group compact>
                    {setting(
                      'Cadence',
                      profile.schedule.frequency === 'custom'
                        ? `Every ${profile.schedule.interval} ${profile.schedule.unit}${profile.schedule.interval === 1 ? '' : 's'}${scheduleIntervalMs(profile.schedule) ? '' : profile.schedule.anchorDate ? ` · from ${profile.schedule.anchorDate}` : ' · anchored on opt-in day'}`
                        : profile.schedule.frequency === 'weekly'
                          ? `Weekly · ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][profile.schedule.weekday - 1]}`
                          : 'Daily',
                      'schedule',
                      'cadence',
                    )}
                    {!scheduleIntervalMs(profile.schedule) &&
                      setting(
                        'Preferred time',
                        profile.schedule.frequency === 'daily' &&
                          profile.schedule.dailyTimes?.length
                          ? `${profile.schedule.dailyTimes.join(', ')} local time`
                          : `${String(profile.schedule.hour).padStart(2, '0')}:${String(profile.schedule.minute).padStart(2, '0')} local time`,
                        'schedule',
                        'time',
                      )}
                    {!scheduleIntervalMs(profile.schedule) &&
                      setting(
                        'Today Refresh',
                        profile.schedule.todayRefresh
                          ? `Every ${profile.schedule.refreshHours} hours`
                          : 'Off',
                        'schedule',
                        'refresh',
                      )}
                  </Group>
                </>
              </AccordionBody>
              {!exportFirst && exportControls}
              <AccordionBody open={!inline || expanded} enabled={inline} style={styles.container}>
                <>
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
                          const link = profileShareLink(profile);
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
                                  const profiles = state.profiles.filter(
                                    (p) => p.id !== profile.id,
                                  );
                                  await onChange({ profiles });
                                  if (!inline) router.back();
                                }),
                            },
                          ],
                        )
                      }
                    />
                  </Group>
                </>
              </AccordionBody>
            </>
          )}
        />
      )}
      {draft ? (
        <View
          testID="profile-generated-review"
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Copy variant="caption" muted>
            Suggested profile
          </Copy>
          <Copy variant="heading">{draft.name}</Copy>
          <Copy variant="caption" muted>
            Review the data and file settings before saving.
          </Copy>
          {!catalogReady && <Copy>Checking available data on this phone…</Copy>}
          <Group compact>
            {domains.map((domain) => (
              <Row
                compact
                key={domain}
                title={
                  domain === 'health' ? 'Health' : domain === 'time' ? 'Screen time' : 'Location'
                }
                value={
                  catalogReady
                    ? `${importReview?.profile.selection[domain].length ?? 0} selected`
                    : 'Checking…'
                }
              />
            ))}
          </Group>
          {importReview && <ProfileImportReview review={importReview} />}
          <View style={styles.reviewActions}>
            <BridgeButton
              testID="profile-review-generated-profile"
              label="Review generated profile"
              filled
              disabled={disabled || !catalogReady}
              onPress={() => edit(draft)}
            />
            <BridgeButton
              testID="profile-dismiss-generated-profile"
              label="Dismiss generated profile"
              secondary
              onPress={onDismiss}
            />
          </View>
        </View>
      ) : null}
    </AccordionLayout>
  );
  return (
    <View style={!profileId && styles.feed}>
      {profileId ? (
        content
      ) : (
        <ProfileFeed
          profiles={state.profiles}
          disabled={disabled}
          renderProfile={(item) => (
            <ProfilePanel
              inline
              profileId={item.id}
              session={session}
              state={state}
              types={types}
              permissions={permissions}
              onAuthorize={onAuthorize}
              busy={disabled}
              isTracking={isTracking}
              onRecordingChange={onRecordingChange}
              onChange={onChange}
              draft={null}
              onDismiss={onDismiss}
            />
          )}
          onNewProfile={() =>
            edit({
              schema: 'myself.md.profile.v1',
              name: 'Profile',
              export: parseExportSettings({ schema: defaultExportSchema }),
              selection: { health: [], time: [], location: [] },
            })
          }
        >
          {draft ? content : null}
        </ProfileFeed>
      )}
      {shareLink ? (
        <Text selectable style={styles.detail}>
          {shareLink}
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
  profileCard: { gap: 16, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  disclosure: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cardToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  profileIdentity: { flex: 1, minHeight: 52, justifyContent: 'center', gap: 4, padding: 4 },
  reviewActions: { gap: 4 },
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
