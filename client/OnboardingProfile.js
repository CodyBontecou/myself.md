import { createContext, useContext, useRef, useState } from 'react';
import { router } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { parseProfile, saveProfileDraft } from '../core/profiles.js';
import { defaultExportSchema } from '../core/export-schemas.js';
import { domains } from '../core/data.js';
import { errorMessage } from '../packages/support-chat/errors.js';
import { usePhoneData } from './DataPanel.js';
import { useOnboarding } from './onboarding.js';
import ProfileDataEditor from './ProfileDataEditor.js';
import ExportSettingsEditor from './ExportSettingsEditor.js';
import { scheduleState } from './export-task.js';
import OnboardingFrame, { OnboardingButton } from '../src/components/OnboardingFrame.js';
import { Copy, Row } from '../src/components/ui.js';
import { useTheme } from '../src/lib/theme.js';
import { ErrorToast } from '../src/components/Toast.js';

const Context = createContext(/** @type {ReturnType<typeof useDraft>|null} */ (null));
function useDraft() {
  const [draft, setDraft] = useState(() =>
    parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'My first export',
      selection: { health: [], time: [], location: [] },
      export: { schema: defaultExportSchema },
    }),
  );
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [savedId, setSavedId] = useState('');
  const running = useRef(false);
  /** @param {()=>Promise<void>} action */
  async function run(action) {
    if (running.current) return;
    running.current = true;
    setWorking(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      running.current = false;
      setWorking(false);
    }
  }
  return { draft, setDraft, error, setError, working, savedId, setSavedId, run };
}
/** @param {{children:import('react').ReactNode}} props */
export function OnboardingProfileProvider({ children }) {
  const value = useDraft();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** @param {{step:'name'|'data'|'output'|'review'}} props */
export default function OnboardingProfile({ step }) {
  const state = useContext(Context);
  if (!state) throw new Error('Onboarding profile provider is required.');
  const { draft, setDraft, error, setError, working, savedId, setSavedId, run } = state;
  const phone = usePhoneData();
  const { finish } = useOnboarding();
  const { colors } = useTheme();
  const disabled = working || phone.busy || !phone.profiles;
  const count = domains.reduce((total, domain) => total + draft.selection[domain].length, 0);
  usePreventRemove(working, () => {});
  /** @param {'/onboarding/data'|'/onboarding/output'|'/onboarding/review'} target */
  function next(target) {
    try {
      parseProfile(draft);
      setError('');
      Keyboard.dismiss();
      router.navigate(target);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  async function save() {
    if (!phone.profiles) return;
    const profiles = phone.profiles;
    await run(async () => {
      if (!count) throw new Error('Choose at least one data type before saving.');
      // Reuse only the untouched, empty starter profile. Preserve existing user profiles.
      const starter = profiles.profiles.length === 1 ? profiles.profiles[0] : undefined;
      const emptyStarter =
        starter?.id === 'default' &&
        starter.name === 'Default' &&
        !starter.agentAccess &&
        JSON.stringify(parseProfile(starter)) ===
          JSON.stringify(
            parseProfile({
              schema: 'myself.md.profile.v1',
              name: 'Default',
              selection: { health: [], time: [], location: [] },
            }),
          );
      const starterExports = emptyStarter ? scheduleState(phone.session.deviceId, starter) : null;
      const reuseStarter =
        emptyStarter &&
        !starterExports?.progress.enabled &&
        !starterExports?.job &&
        !starterExports?.files.length;
      const id =
        savedId ||
        (reuseStarter ? 'default' : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const editing = profiles.profiles.some((profile) => profile.id === id);
      await phone.changeProfiles(saveProfileDraft(profiles, draft, id, editing));
      setSavedId(id);
      // Persist completion only after the profile save succeeds. Retry never adds a second profile.
      finish(`/profiles/${id}?firstExport=1`);
    });
  }
  const titles = {
    name: 'Name your first export.',
    data: 'What would you like to export?',
    output: 'Choose your files.',
    review: 'Your first profile is ready.',
  };
  const bodies = {
    name: 'An export profile remembers your data and file preferences. You can change them anytime.',
    data: 'Choose specific data types. Source permissions stay under your control; selecting data does not allow agent access.',
    output: 'Save files on this phone. Choose a format and how many completed days to include.',
    review:
      'Review your choices, then save. You’ll land on your profile with Export profile now available.',
  };
  return (
    <OnboardingFrame
      testID={step === 'name' ? 'onboarding-setup-screen' : `onboarding-${step}-screen`}
      title={titles[step]}
      body={bodies[step]}
      disabled={working}
      footer={
        <>
          <ErrorToast error={error} />
          <OnboardingButton
            testID={`onboarding-${step}-continue`}
            label={working ? 'Saving…' : step === 'review' ? 'Save profile' : 'Continue'}
            disabled={disabled || !draft.name.trim() || (step !== 'name' && !count)}
            busy={working}
            onPress={() =>
              step === 'review'
                ? void save()
                : next(
                    step === 'name'
                      ? '/onboarding/data'
                      : step === 'data'
                        ? '/onboarding/output'
                        : '/onboarding/review',
                  )
            }
          />
          {step === 'name' && (
            <OnboardingButton
              testID="onboarding-explore"
              label="Set up later"
              secondary
              disabled={working}
              onPress={() => finish('/profiles')}
            />
          )}
        </>
      }
    >
      <View style={styles.fields}>
        <Copy testID="onboarding-profile-progress" variant="caption" muted>
          {draft.name.trim() || 'Your profile'} · Step{' '}
          {['name', 'data', 'output', 'review'].indexOf(step) + 1} of 4
        </Copy>
        {!phone.profiles && <Copy>Loading your profiles…</Copy>}
        {step === 'name' && (
          <>
            <TextInput
              testID="onboarding-profile-name"
              accessibilityLabel="Profile name"
              value={draft.name}
              onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
              editable={!disabled}
              maxLength={80}
              returnKeyType="next"
              onSubmitEditing={() => !disabled && draft.name.trim() && next('/onboarding/data')}
              style={[
                styles.input,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
              ]}
            />
          </>
        )}
        {step === 'data' && (
          <ProfileDataEditor
            inline
            types={phone.types}
            permissions={phone.sourcePermissions}
            onAuthorize={phone.reviewSourceAccess}
            selection={draft.selection}
            onSelection={(selection) => setDraft((current) => ({ ...current, selection }))}
            disabled={disabled}
          />
        )}
        {step === 'data' && (
          <Copy variant="caption" muted>
            Location exports use points already recorded by myself.md. Set up recording from
            Settings after onboarding. Unavailable or denied sources may produce empty files or
            capture warnings.
          </Copy>
        )}
        {step === 'output' && (
          <>
            <ExportSettingsEditor
              section="output"
              field="formats"
              settings={draft.export}
              schedule={draft.schedule}
              onSettings={(settings) => setDraft((current) => ({ ...current, export: settings }))}
              onSchedule={() => {}}
              disabled={disabled}
            />
            <ExportSettingsEditor
              section="output"
              field="window"
              settings={draft.export}
              schedule={draft.schedule}
              onSettings={(settings) => setDraft((current) => ({ ...current, export: settings }))}
              onSchedule={() => {}}
              disabled={disabled}
            />
          </>
        )}
        {step === 'review' && (
          <>
            <Row
              compact
              testID="onboarding-review-name"
              title="Profile name"
              subtitle={draft.name.trim()}
            />
            {domains.map((domain) => (
              <Row
                compact
                key={domain}
                title={
                  domain === 'health' ? 'Health' : domain === 'time' ? 'Screen time' : 'Location'
                }
                subtitle={`${draft.selection[domain].length} data ${draft.selection[domain].length === 1 ? 'type' : 'types'} selected`}
              />
            ))}
            <Row
              compact
              title="Files on this phone"
              subtitle={`${draft.export.formats.map((format) => format.toUpperCase()).join(' + ')} · ${draft.export.lookbackDays} completed days${draft.export.includeToday ? ' + today' : ''}`}
            />
            <Copy muted>
              Agent access and automatic exports are off. Saving does not export data. Use Export
              profile now when you’re ready; source permissions and your export allowance still
              apply.
            </Copy>
          </>
        )}
      </View>
    </OnboardingFrame>
  );
}
const styles = StyleSheet.create({
  fields: { gap: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 12,
    fontSize: 16,
    minHeight: 44,
  },
});
