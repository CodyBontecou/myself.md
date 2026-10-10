import { errorJSON } from '../packages/support-chat/errors.js';
import { useEffect, useState } from 'react';
import { useProfileEditor } from './ProfileEditorState.js';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button, Copy, Group, Row, Screen, SectionHeader } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
import { usePhoneData } from './DataPanel.js';
import ProfileDataEditor from './ProfileDataEditor.js';
import ExportSettingsEditor from './ExportSettingsEditor.js';
import { parseProfile, profileFromLink, uniqueProfileName } from '../core/profiles.js';
import { domains } from '../core/data.js';

/** @param {{data?:boolean}} props */
export default function ProfileEditor({ data = false }) {
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const section = typeof params.section === 'string' ? params.section : '';
  const field = typeof params.field === 'string' ? params.field : '';
  const domain = domains.find((value) => value === params.domain);
  const title =
    domain === 'health'
      ? 'Health'
      : domain === 'time'
        ? 'Screen time'
        : domain === 'location'
          ? 'Location'
          : ({
              name: 'Profile name',
              destination: 'Destination',
              schema: 'Schema version',
              formats: 'Formats',
              window: 'Export window',
              filename: 'Filename',
              folders: 'Folders',
              cadence: 'Cadence',
              time: 'Preferred time',
              refresh: 'Today Refresh',
            }[field || section] ?? (data ? 'Data selection' : 'Profile settings'));
  const selectionScreen = data || section === 'data';
  const phone = usePhoneData();
  const { session, draft, setDraft, start, working, error, run, dirty, saved } = useProfileEditor();
  const navigation = useNavigation();
  const [importText, setImportText] = useState('');
  const disabled = phone.busy || working;
  usePreventRemove(
    (!data || Boolean(section)) && !saved && (dirty || working),
    ({ data: event }) => {
      if (working) return;
      Alert.alert('Discard changes?', 'Your unsaved profile changes will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(event.action) },
      ]);
    },
  );
  const save = useSaveProfile();
  useEffect(() => {
    if ((data && !section) || !saved || working) return;
    router.dismissTo({ pathname: '/profiles/[id]', params: { id: saved.id } });
    if (saved.location) router.push('/data/location');
  }, [data, section, saved, working]);
  if (!session)
    return (
      <Screen testID="profile-editor-unavailable">
        <Copy>Open a profile to edit its settings.</Copy>
      </Screen>
    );
  if (selectionScreen)
    return (
      <View testID="profile-selection-screen" collapsable={false} style={styles.fill}>
        <Stack.Screen
          options={{ title, ...(section ? { headerRight: renderSaveProfileButton } : {}) }}
        />
        {error ? (
          <Copy
            testID="profile-editor-error"
            accessibilityRole="alert"
            style={styles.error}
            selectable
          >
            {errorJSON(error)}
          </Copy>
        ) : null}
        <ProfileDataEditor
          {...(domain ? { domain } : {})}
          types={phone.types}
          permissions={phone.sourcePermissions}
          onAuthorize={phone.reviewSourceAccess}
          onOpenLocation={() => void run(() => save(true))}
          selection={draft.selection}
          onSelection={(selection) => setDraft({ ...draft, selection })}
          disabled={disabled}
        />
      </View>
    );
  return (
    <Screen testID="profile-editor-screen" compact>
      <Stack.Screen
        options={{ title, ...(section ? { headerRight: renderSaveProfileButton } : {}) }}
      />
      {error ? (
        <View testID="profile-editor-error" accessibilityRole="alert">
          <Copy selectable>{errorJSON(error)}</Copy>
        </View>
      ) : null}
      {!section && !session.id && !session.onSaved && (
        <>
          <SectionHeader compact title="Import profile" />
          <TextInput
            testID="profile-import-input"
            accessibilityLabel="Profile JSON or deep link"
            placeholder="Paste profile JSON or qrconnect link"
            editable={!disabled}
            value={importText}
            onChangeText={setImportText}
            multiline
            style={[
              styles.input,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />
          <Button
            label="Review pasted profile"
            disabled={disabled || !importText}
            onPress={() =>
              void run(async () => {
                start(
                  importText.trim().startsWith('qrconnect:')
                    ? profileFromLink(importText.trim())
                    : parseProfile(JSON.parse(importText)),
                );
                setImportText('');
              })
            }
          />
        </>
      )}
      {(!section || section === 'name') && (
        <>
          {!section && <SectionHeader compact title="Profile name" />}
          <TextInput
            testID="profile-name-input"
            accessibilityLabel="Profile name"
            editable={!disabled}
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
            maxLength={80}
            style={[
              styles.input,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />
        </>
      )}
      {!section && (
        <Group compact>
          <Row
            compact
            testID="profile-edit-data"
            title="Data selection"
            subtitle={`${domains.reduce((n, d) => n + draft.selection[d].length, 0)}/${domains.reduce((n, d) => n + new Set([...phone.types[d], ...draft.selection[d]]).size, 0)}`}
            disabled={disabled}
            onPress={() => router.push('/profiles/editor/data')}
          />
        </Group>
      )}
      {(!section || section !== 'name') && (
        <ExportSettingsEditor
          {...(section ? { section } : {})}
          {...(field ? { field } : {})}
          settings={draft.export}
          schedule={draft.schedule}
          onSettings={(settings) => setDraft({ ...draft, export: settings })}
          onSchedule={(schedule) => setDraft({ ...draft, schedule })}
          disabled={disabled}
        />
      )}
      {!section && (
        <>
          <Copy variant="caption" muted>
            Changes stay in this draft until you save. Automatic exports and credentials are managed
            on the saved profile.
          </Copy>
          <Button
            testID="profile-save"
            busy={working}
            label={working ? 'Saving…' : 'Save profile'}
            disabled={disabled}
            onPress={() => void run(() => save())}
          />
          <Button
            testID="profile-cancel"
            label="Cancel"
            secondary
            disabled={disabled}
            onPress={() => router.back()}
          />
        </>
      )}
    </Screen>
  );
}
function useSaveProfile() {
  const phone = usePhoneData();
  const { session, draft, setSaved } = useProfileEditor();
  /** @param {boolean} [location] */
  async function save(location = false) {
    if (!session || !phone.profiles) throw new Error('Open a profile to edit it.');
    const parsed = parseProfile(draft);
    const state = phone.profiles;
    const id = session.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (session.id && !state.profiles.some((p) => p.id === id))
      throw new Error('This profile no longer exists. Go back to return.');
    const others = state.profiles.filter((p) => p.id !== id);
    if (others.length >= 50) throw new Error('Keep at most 50 profiles.');
    const savedProfile = {
      ...parsed,
      id,
      name: uniqueProfileName(parsed.name, others),
      agentAccess: session.id
        ? state.profiles.find((p) => p.id === id)?.agentAccess === true
        : false,
    };
    await phone.changeProfiles({
      ...state,
      profiles: session.id
        ? state.profiles.map((p) => (p.id === id ? savedProfile : p))
        : [...state.profiles, savedProfile],
    });
    session.onSaved?.();
    setSaved({ id, location });
  }
  return save;
}
function renderSaveProfileButton() {
  return <SaveProfileButton />;
}
function SaveProfileButton() {
  const { colors } = useTheme();
  const { busy } = usePhoneData();
  const { working, run } = useProfileEditor();
  const save = useSaveProfile();
  const disabled = busy || working;
  return (
    <Pressable
      accessibilityRole="button"
      testID="profile-save"
      accessibilityLabel="Save profile"
      accessibilityState={{ disabled, busy: working }}
      disabled={disabled}
      onPress={() => void run(() => save())}
      style={[styles.saveAction, disabled && styles.disabled]}
    >
      <Copy style={[styles.saveLabel, { color: colors.accent }]}>
        {working ? 'Saving…' : 'Save'}
      </Copy>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  saveLabel: { fontWeight: '600' },
  disabled: { opacity: 0.45 },
  saveAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  error: { padding: 16 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 12,
    fontSize: 16,
    minHeight: 44,
  },
});
