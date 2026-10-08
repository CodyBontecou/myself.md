import { useTheme } from '../src/lib/theme';
import { useState } from 'react';
import { Alert, Share, StyleSheet, TextInput, View } from 'react-native';
import { Button, Text, Switch } from './Terminal.js';
import ExportSettingsEditor from './ExportSettingsEditor.js';
import ProfileExports from './ProfileExports.js';
import { parseExportSettings } from '../core/export-files.js';
import { parseSchedule } from '../core/schedules.js';
import { domains } from '../core/data.js';
import { parseProfile, profileLink, profileFromLink, uniqueProfileName } from '../core/profiles.js';
/** @param {{session:import('./session.js').Session,state:import('../core/profiles.js').ProfileState,types:Record<import('../core/data.js').Domain,string[]>,busy:boolean,onChange:(state:import('../core/profiles.js').ProfileState)=>Promise<void>,draft:import('../core/profiles.js').ProfileDraft|null,onDismiss:()=>void}} props */
export default function ProfilePanel({ session, state, types, busy, onChange, draft, onDismiss }) {
  const { colors } = useTheme();
  const styles = themedStyles(colors);
  const [exportSettings, setExportSettings] = useState(() => parseExportSettings(undefined));
  const [scheduleSettings, setScheduleSettings] = useState(() => parseSchedule(undefined));
  const [editing, setEditing] = useState('');
  const [exportsOpen, setExportsOpen] = useState('');
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(true);
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
    setEditing(id || 'new');
    setName(p.name);
    setSelection(p.selection);
    setExportSettings(parseExportSettings(p.export));
    setScheduleSettings(parseSchedule(p.schedule));
    setSearch('');
    setSelectedOnly(true);
    setError('');
    setShareLink('');
  }
  /** @param {()=>Promise<void>|void} action */
  async function run(action) {
    try {
      setError('');
      setWorking(true);
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile.');
    } finally {
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
    const others = state.profiles.filter((p) => p.id !== id);
    const profile = { ...parsed, id, name: uniqueProfileName(parsed.name, others) };
    if (others.length >= 50) throw new Error('Keep at most 50 profiles.');
    await onChange({ ...state, profiles: [...others, profile] });
    setEditing('');
    if (review) {
      setReview(false);
      onDismiss();
    }
  }
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{'Sharing profiles'}</Text>
      <Text>
        Profiles select individual data types for chat and file exports. Chat domain access and
        system permissions still apply. New data types stay off until selected.
      </Text>
      {draft && !review ? (
        <View style={styles.card}>
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
      {!editing ? (
        <>
          {state.profiles.map((p) => (
            <View key={p.id} style={styles.card}>
              <Text>
                {p.id === state.activeId ? 'Active · ' : ''}
                {p.name}
              </Text>
              <Text>{domains.reduce((n, d) => n + p.selection[d].length, 0)} selected types</Text>
              <Text selectable style={styles.detail}>
                ID: {p.id}
              </Text>
              <Button title={exportsOpen === p.id ? "Hide export settings" : "Export settings & schedules"} onPress={() => setExportsOpen(exportsOpen === p.id ? "" : p.id)} />
              {exportsOpen === p.id && <ProfileExports session={session} profile={p} disabled={disabled} />}
              <Button title="Edit profile" disabled={disabled} onPress={() => edit(p, p.id)} />
              <Button
                title="Activate profile"
                disabled={disabled || p.id === state.activeId}
                onPress={() => void run(() => onChange({ ...state, activeId: p.id }))}
              />
              <Button
                title="Duplicate profile"
                disabled={disabled}
                onPress={() => edit({ ...p, name: uniqueProfileName(p.name, state.profiles) })}
              />
              <Button
                title="Share profile link"
                disabled={disabled}
                onPress={() =>
                  void run(async () => {
                    const link = profileLink(p);
                    setShareLink(link);
                    await Share.share({ message: link, title: p.name });
                  })
                }
              />
              <Button
                title="Delete profile"
                disabled={disabled || state.profiles.length === 1}
                onPress={() =>
                  Alert.alert('Delete profile?', p.name, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () =>
                        void run(() => {
                          const profiles = state.profiles.filter((item) => item.id !== p.id);
                          return onChange({
                            profiles,
                            activeId:
                              state.activeId === p.id
                                ? (profiles[0]?.id ?? state.activeId)
                                : state.activeId,
                          });
                        }),
                    },
                  ])
                }
              />
            </View>
          ))}
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
            style={styles.input}
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
      ) : (
        <View style={styles.card}>
          <Text>{review ? 'Review generated profile' : 'Edit profile'}</Text>
          <TextInput
            accessibilityLabel="Profile name"
            value={name}
            onChangeText={setName}
            maxLength={80}
            style={styles.input}
          />
          <TextInput
            accessibilityLabel="Search data types"
            placeholder="Search data types"
            value={search}
            onChangeText={setSearch}
            style={styles.input}
          />
          <View style={styles.row}>
            <Text style={styles.label}>Show only selected types</Text>
            <Switch
              accessibilityLabel="Show only selected types"
              disabled={disabled}
              value={selectedOnly}
              onValueChange={setSelectedOnly}
            />
          </View>
          <Text style={styles.detail}>
            Search includes disabled types. Editing the active profile updates access; new profiles
            require activation.
          </Text>
          <Button title="Save profile" disabled={disabled} onPress={() => void run(save)} />
          <Button
            title="Cancel edits"
            disabled={disabled}
            onPress={() => {
              setEditing('');
              setReview(false);
            }}
          />
          {domains.map((domain) => {
            const keys = [...new Set([...types[domain], ...selection[domain]])];
            return (
              <View key={domain} style={styles.container}>
                <Text>
                  {domain.toUpperCase()} / {selection[domain].length} SELECTED
                </Text>
                <Button
                  disabled={disabled}
                  title={`Disable all ${domain}`}
                  onPress={() => setSelection({ ...selection, [domain]: [] })}
                />
                <Button
                  title={`Enable available ${domain} types`}
                  disabled={disabled || !types[domain].length}
                  onPress={() =>
                    setSelection({
                      ...selection,
                      [domain]: [
                        ...new Set([
                          ...selection[domain],
                          ...types[domain].filter((key) => key !== 'imported:archive'),
                        ]),
                      ],
                    })
                  }
                />
                <Text style={styles.detail}>
                  Bulk enable excludes original archives. Select archives individually to include
                  their complete contents.
                </Text>
                {!keys.length ? (
                  <Text>No types available yet. Enable domain permissions or import data.</Text>
                ) : null}
                {keys
                  .filter((key) =>
                    search
                      ? key.toLowerCase().includes(search.toLowerCase())
                      : !selectedOnly || selection[domain].includes(key),
                  )
                  .map((key) => (
                    <View key={key} style={styles.row}>
                      <View style={styles.label}>
                        <Text>
                          {key
                            .replace(/^(native|imported):/, '')
                            .replace(/^HK(Quantity|Category|Correlation|Data)TypeIdentifier/, '')
                            .replace(/([a-z])([A-Z])/g, '$1 $2')}
                        </Text>
                        <Text style={styles.detail}>
                          {key.startsWith('imported:') ? 'Imported' : 'Native'}
                          {!types[domain].includes(key) ? ' · unavailable on this phone' : ''}
                        </Text>
                        {key === 'imported:archive' ? (
                          <Text style={styles.detail}>
                            Original archive contains ALL imported data, including disabled indexed
                            types.
                          </Text>
                        ) : null}
                      </View>
                      <Switch
                        disabled={disabled}
                        accessibilityLabel={`Include ${domain} ${key}`}
                        value={selection[domain].includes(key)}
                        onValueChange={(enabled) =>
                          setSelection({
                            ...selection,
                            [domain]: enabled
                              ? [...selection[domain], key]
                              : selection[domain].filter((k) => k !== key),
                          })
                        }
                      />
                    </View>
                  ))}
              </View>
            );
          })}
          <ExportSettingsEditor
            settings={exportSettings}
            schedule={scheduleSettings}
            onSettings={setExportSettings}
            onSchedule={setScheduleSettings}
            disabled={disabled}
          />
          <Text>
            Edits to the active profile apply when saved. Activate a new profile when ready to use
            it.
          </Text>
          <Button title="Save profile" disabled={disabled} onPress={() => void run(save)} />
          <Button
            title="Cancel edits"
            disabled={disabled}
            onPress={() => {
              setEditing('');
              setReview(false);
            }}
          />
        </View>
      )}
      {shareLink ? (
        <Text selectable style={styles.detail}>
          {shareLink}
        </Text>
      ) : null}
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}
const themedStyles = (colors) => StyleSheet.create({
  container: { gap: 16 },
  heading: { fontSize: 22, lineHeight: 30 },
  card: { gap: 12, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, backgroundColor: colors.surface, borderColor: colors.border },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: 12,
    color: colors.text,
    fontSize: 16,
    minHeight: 44,
  },
  row: { minHeight: 44, flexDirection: 'row', gap: 12, alignItems: 'center' },
  label: { flex: 1 },
  detail: { fontSize: 13, lineHeight: 20 },
});
