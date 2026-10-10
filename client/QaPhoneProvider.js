import { errorJSON } from '../packages/support-chat/errors.js';
import { useState, useSyncExternalStore } from 'react';
import { PermissionStatus } from 'expo-camera';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogBox, Platform } from 'react-native';
import { PhoneStateProvider } from './PhoneProvider.js';
import { PhoneDataStateProvider } from './DataPanel.js';
import {
  qaEnabled,
  qaBannerEnabled,
  qaSession,
  qaSnapshot,
  subscribeQa,
  updateQa,
} from './qa-runtime.js';
import { saveProfiles } from './profiles.js';
import { Button, Copy } from '../src/components/ui.js';

// Fixture runs must not lose taps to transient developer notifications.
// Console output remains available through Metro and Argent's debugger.
if (qaEnabled) LogBox.ignoreAllLogs();

/** @returns {Promise<never>} */
async function unavailable() {
  throw new Error(
    'QA fixtures do not perform native, account, or network operations. Use a normal build for integration QA.',
  );
}
const refreshLocation = async () => ({
  backgroundGranted: false,
  permission: 'Synthetic location access',
  tracking: false,
  count: 0,
  last: null,
});

/** @param {{children:import('react').ReactNode}} props */
export default function QaPhoneProvider({ children }) {
  const fixture = useSyncExternalStore(subscribeQa, qaSnapshot);
  const [message, setMessage] = useState('Synthetic QA data. No agent is connected.');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  /** @param {()=>Promise<void>} _action */
  async function run(_action) {
    // Source-screen callbacks can contain direct native calls. Never execute them in fixtures.
    setError(errorJSON('This operation requires a normal build for integration QA.'));
    setMessage('This operation requires a normal build for integration QA.');
  }
  /** @param {import('../core/data.js').Domain} domain */
  async function reviewSourceAccess(domain) {
    const denied = fixture.scenario === 'permission-denied';
    updateQa({
      permissions: { ...qaSnapshot().permissions, [domain]: denied ? 'denied' : 'authorized' },
    });
    return {
      message: denied
        ? 'Synthetic permission denied. Review permissions to try again.'
        : 'Synthetic permission allowed. Recording and agent grants are unchanged.',
    };
  }
  /** @param {import('../core/profiles.js').ProfileState} profiles */
  async function changeProfiles(profiles) {
    setBusy(true);
    try {
      if (fixture.scenario === 'save-error')
        throw new Error('Synthetic save failure. Your saved profile is unchanged.');
      saveProfiles(qaSession.deviceId, profiles);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PhoneStateProvider
      value={{
        accountRevision: fixture.revision,
        deletionStatusUrl: '',
        incoming: null,
        dismissIncoming: () => {},
        session: null,
        connected: false,
        permission: null,
        requestPermission: async () => {
          setError(errorJSON('Camera access requires a normal build for integration QA.'));
          return {
            status: PermissionStatus.UNDETERMINED,
            granted: false,
            canAskAgain: false,
            expires: 'never',
          };
        },
        pairing: null,
        busy,
        error,
        link,
        setLink,
        scan: () => setError(errorJSON('Pairing requires a normal build.')),
        confirm: unavailable,
        refresh: unavailable,
        disconnect: unavailable,
        deleteAccount: unavailable,
        run,
        reset: () => setLink(''),
        changeAccount: () => {},
        switchConnection: unavailable,
        signInAccount: unavailable,
        syncAccount: unavailable,
        signIn: unavailable,
      }}
    >
      <PhoneDataStateProvider
        value={{
          session: qaSession,
          incoming: null,
          onDismiss: () => {},
          profiles: fixture.scenario === 'loading' ? null : fixture.profiles,
          types: {
            health: [
              Platform.OS === 'ios' ? 'native:HKQuantityTypeIdentifierStepCount' : 'native:Steps',
            ],
            time: ['native:applications'],
            location: ['native:points'],
          },
          busy,
          proposal: null,
          setProposal: () => {},
          grants: { health: false, time: false, location: false },
          isTracking: false,
          locationInfo: 'Synthetic data: recording off, 0 location points.',
          notes: {
            health: 'Synthetic Health catalog',
            time: 'Synthetic Screen Time catalog',
            location: 'Synthetic Location catalog',
          },
          sourceNotes: {
            health: 'QA fixtures do not read HealthKit or Health Connect.',
            time: 'QA fixtures do not read device usage.',
            location: 'QA fixtures do not record location.',
          },
          sourcePermissions: fixture.permissions,
          reviewSourceAccess,
          message,
          run,
          changeGrant: unavailable,
          changeRecording: unavailable,
          changeProfiles,
          setMessage,
          setTracking: () => {},
          publish: async () => {},
          refreshLocation,
        }}
      >
        {qaBannerEnabled && (
          <SafeAreaView edges={['top']}>
            <Button
              testID="qa-open"
              label="QA fixtures"
              secondary
              onPress={() => router.push('/qa')}
            />
            <Copy testID="qa-active" accessibilityRole="alert" variant="caption">
              QA fixtures · {fixture.scenario}
            </Copy>
          </SafeAreaView>
        )}
        {children}
      </PhoneDataStateProvider>
    </PhoneStateProvider>
  );
}
