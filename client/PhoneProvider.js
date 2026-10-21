import { showToast, ErrorToast } from '../src/components/Toast.js';
import { errorMessage, readJSONResponse } from '../packages/support-chat/errors.js';
import { finishAccountDeletion, pendingAccountCleanup } from './account-deletion.js';
import { Screen, Copy, Button } from '../src/components/ui.js';
import { syncBilling, clearAccountAllowance } from './billing.js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Keyboard, Linking, Platform } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { PhoneDataProvider } from './DataPanel.js';
import {
  reconcileExports,
  cancelExports,
  stopAccountExports,
  runScheduledExports,
  syncExportNotifications,
} from './export-task.js';
import { stopTracking, migrateLocationTask } from './location-task.js';
import { saveExportContext } from './export-context.js';
import { prepareProfilePairing, completeProfilePairing } from './profiles.js';
import { useAccountProfile } from './use-account-profile.js';
import { renewCloudAuthorizations } from './destinations.js';
import { profileFromLink } from '../core/profiles.js';
import { parsePairingQr } from '../core/index.js';
import {
  api,
  clearSession,
  loadSession,
  saveSession,
  signIn,
  revokeDevice,
  resumeSession,
  reauthenticateSession,
} from './session.js';
const PhoneContext = createContext(/** @type {ReturnType<typeof usePhoneState>|null} */ (null));
export function usePhone() {
  const value = useContext(PhoneContext);
  if (!value) throw new Error('Phone provider is required.');
  return value;
}
/** @param {{value:ReturnType<typeof usePhoneState>,children:import('react').ReactNode}} props */
export function PhoneStateProvider({ value, children }) {
  return <PhoneContext.Provider value={value}>{children}</PhoneContext.Provider>;
}
const localSession = {
  server: '',
  issuer: '',
  resource: '',
  accessToken: '',
  refreshToken: '',
  expires: 0,
  deviceId: 'local-device',
  account: 'This phone',
  owner: 'local-device',
};
/** @param {{children:import('react').ReactNode}} props */
export default function PhoneProvider({ children }) {
  const value = usePhoneState();
  const dataSession = value.connected && value.session ? value.session : localSession;
  return (
    <PhoneContext.Provider value={value}>
      <ErrorToast error={value.error} />
      {value.deletionPending ? (
        <Screen compact testID="account-deletion-recovery">
          <Copy variant="heading">
            {value.deletionConfirmed ? 'Finish phone cleanup' : 'Finish account deletion'}
          </Copy>
          <Copy>
            {value.deletionConfirmed
              ? 'Account deletion has started. Retry to finish removing this account’s data from this phone. Cloud cleanup may still be running.'
              : 'Your deletion request may have reached the server, but its outcome is not confirmed. Your phone data stays here until the server confirms deletion has started.'}
          </Copy>
          <Copy>
            Normal app activity is blocked. Before sending a deletion request, we stop recording and
            exports. If stopping or the request failed, retry below.
          </Copy>
          <Button
            testID="account-deletion-retry"
            label={value.busy ? 'Checking…' : 'Retry deletion'}
            disabled={value.busy}
            onPress={() => void value.run(value.deleteAccount)}
          />
          {!value.deletionConfirmed && (
            <Copy>
              If your session expired, sign in to the same account to retry. If the account was
              already deleted and its status receipt was lost, sign-in cannot recover that receipt.
              Deletion remains unconfirmed on this phone.
            </Copy>
          )}
          {!value.deletionConfirmed &&
            /** @type {const} */ (['apple', 'github', 'google']).map((provider) => (
              <Button
                key={provider}
                testID={`account-deletion-sign-in-${provider}`}
                label={`Sign in with ${provider === 'apple' ? 'Apple' : provider === 'github' ? 'GitHub' : 'Google'} to retry`}
                secondary
                disabled={value.busy}
                onPress={() => void value.run(() => value.reauthenticateDeletion(provider))}
              />
            ))}
        </Screen>
      ) : (
        <PhoneDataProvider
          key={`${dataSession.deviceId}:${value.accountRevision}`}
          session={dataSession}
          incoming={value.incoming}
          onDismiss={value.dismissIncoming}
        >
          {children}
        </PhoneDataProvider>
      )}
    </PhoneContext.Provider>
  );
}
function usePhoneState() {
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(/** @type {import('./session.js').Session|null} */ (null));
  const accountProfile = useAccountProfile(session);
  const [pairing, setPairing] = useState(
    /** @type {import('../core/index.js').PairingQr|null} */ (null),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accountRevision, setAccountRevision] = useState(0);
  const [deletionStatusUrl, setDeletionStatusUrl] = useState('');
  const [deletionPending, setDeletionPending] = useState(Boolean(pendingAccountCleanup()));
  const [link, setLink] = useState('');
  const locked = useRef(false);
  const [incoming, setIncoming] = useState(
    /** @type {import('../core/profiles.js').ProfileDraft|null} */ (null),
  );
  useEffect(() => {
    /** @param {string|null} url */
    const receive = (url) => {
      if (!url) return;
      try {
        if (url === 'myselfmd://account' || url.startsWith('myselfmd://account?')) {
          router.navigate('/account');
        } else if (url.startsWith('myselfmd://profile?')) {
          setIncoming(profileFromLink(url));
          router.navigate('/profiles');
        } else if (url.startsWith('myselfmd://pair?') || /^https?:\/\/[^/]+\/pair#/.test(url)) {
          setPairing(parsePairingQr(url));
          router.push('/pair');
          locked.current = true;
          setError('');
        }
      } catch (e) {
        setError(errorMessage(e));
      }
    };
    void Linking.getInitialURL()
      .then(receive)
      .catch((e) => setError(errorMessage(e)));
    const listener = Linking.addEventListener('url', ({ url }) => receive(url));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    loadSession()
      .then(async (loaded) => {
        const pending = pendingAccountCleanup();
        if (pending) {
          setSession(loaded);
          await finishDeletion(pending, loaded);
        } else {
          if (loaded?.deviceId && !loaded.requiresSignIn) completeProfilePairing(loaded);
          setSession(loaded);
          await migrateLocationTask();
        }
        return undefined;
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready || deletionPending) return;
    saveExportContext(session?.deviceId ? session : localSession);
    void reconcileExports().catch((e) => setError(errorMessage(e)));
    const tick = () => {
      void runScheduledExports().catch((e) => setError(errorMessage(e)));
    };
    tick();
    const timer = setInterval(() => {
      tick();
      void syncExportNotifications().catch((e) => setError(errorMessage(e)));
    }, 30000);
    const active = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void reconcileExports().catch((e) => setError(errorMessage(e)));
        tick();
      }
    });
    return () => {
      clearInterval(timer);
      active.remove();
    };
  }, [session, ready, deletionPending]);
  useEffect(() => {
    if (!session || deletionPending) return;
    let observing = true;
    const active = () => {
      if (AppState.currentState !== 'active') return;
      void resumeSession(session)
        .then((valid) => {
          if (!observing) return undefined;
          if (!valid) {
            cancelExports();
            clearAccountAllowance();
            setSession(null);
            setError(
              errorMessage(
                'Your session expired after 365 days of inactivity. Please sign in again.',
              ),
            );
          }
          return valid ? renewCloudAuthorizations(session) : undefined;
        })
        .catch((e) => {
          if (observing) setError(errorMessage(e));
        });
    };
    active();
    const listener = AppState.addEventListener('change', active);
    const timer = setInterval(active, 60000);
    return () => {
      observing = false;
      listener.remove();
      clearInterval(timer);
    };
  }, [session, deletionPending]);
  /** @param {string} value */
  function scan(value) {
    if (locked.current) return;
    Keyboard.dismiss();
    try {
      setPairing(parsePairingQr(value.trim()));
      locked.current = true;
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  /** @param {() => Promise<void>} action */
  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setPairing(null);
    setLink('');
    locked.current = false;
  }
  async function confirm() {
    if (!session || !pairing) return;
    const device = await api(session, '/api/claim', {
      method: 'POST',
      body: JSON.stringify({
        ticket: pairing.ticket,
        name: Platform.OS === 'ios' ? 'iPhone' : 'Android phone',
      }),
    });
    const connected = { ...session, deviceId: /** @type {{id:string}} */ (device).id };
    prepareProfilePairing(connected);
    await saveSession(connected, session);
    completeProfilePairing(connected);
    setSession(connected);
    reset();
    router.dismissTo('/');
    await syncBilling(connected);
  }
  async function refresh() {
    if (!session) return;
    const info = /** @type {{devices:{id:string}[]}} */ (await api(session, '/api/devices'));
    if (!info.devices.some((device) => device.id === session.deviceId)) {
      await clearSession(session);
      clearAccountAllowance();
      setSession(null);
      throw new Error('This phone was disconnected. Scan a new QR code.');
    }
    Alert.alert('Connected', 'This phone is connected to your MCP account.');
  }
  async function disconnect() {
    if (!session) return;
    const previous = session;
    cancelExports();
    await clearSession(previous);
    setSession(null);
    clearAccountAllowance();
    reset();
    void Promise.allSettled([
      stopTracking(),
      previous.deviceId ? revokeDevice(previous) : Promise.resolve(),
    ]).then(([tracking, remote]) => {
      const failures = [
        tracking.status === 'rejected' ? errorMessage(tracking.reason) : '',
        remote.status === 'rejected' ? errorMessage(remote.reason) : '',
      ].filter(Boolean);
      if (failures.length) showToast({ message: errorMessage(failures.join('\n')), kind: 'error' });
      return undefined;
    });
  }
  /** @param {{owner:string,deviceId:string}} owner @param {import('./session.js').Session|null} current */
  async function finishDeletion(owner, current) {
    setDeletionPending(true);
    try {
      const result = await finishAccountDeletion(owner, {
        stop: async () => {
          saveExportContext(null);
          const stopped = await Promise.allSettled([stopAccountExports(), stopTracking()]);
          for (const outcome of stopped) if (outcome.status === 'rejected') throw outcome.reason;
        },
        request: async (method) => {
          if (!current || current.owner !== owner.owner || current.deviceId !== owner.deviceId)
            throw new Error('Sign in to the same account to retry the pending deletion.');
          if (method === 'DELETE')
            return api(current, '/api/account', {
              method,
              body: JSON.stringify({ confirmation: 'DELETE', subject: owner.owner }),
            });
          // A deleted identity cannot refresh. Its still-valid access token may
          // read deletion status without attempting to rotate revoked credentials.
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          try {
            return /** @type {import('../core/account-deletion.js').DeletionStatus} */ (
              await readJSONResponse(
                await fetch(`${current.server}/api/account`, {
                  headers: { Authorization: `Bearer ${current.accessToken}` },
                  signal: controller.signal,
                }),
              )
            );
          } finally {
            clearTimeout(timeout);
          }
        },
        clear: async () => {
          if (current?.owner === owner.owner && current.deviceId === owner.deviceId)
            await clearSession(current);
        },
      });
      setDeletionStatusUrl(result?.statusUrl ?? '');
      setSession(null);
      setAccountRevision((value) => value + 1);
      clearAccountAllowance();
      reset();
      return result;
    } finally {
      setDeletionPending(Boolean(pendingAccountCleanup()));
    }
  }
  const connected = Boolean(session?.deviceId && !session.requiresSignIn);
  return {
    accountRevision,
    deletionPending,
    deletionConfirmed: pendingAccountCleanup()?.phase === 'confirmed',
    deletionStatusUrl,
    incoming,
    dismissIncoming: () => setIncoming(null),
    session,
    accountProfile,
    connected,
    permission,
    requestPermission,
    pairing,
    busy: busy || (deletionPending && !ready),
    error,
    link,
    setLink,
    scan,
    confirm,
    refresh,
    disconnect,
    deleteAccount: async () => {
      const pending = pendingAccountCleanup();
      const owner = pending ?? session;
      if (!owner?.owner) throw new Error('Sign in to delete your account.');
      const result = await finishDeletion(owner, session);
      const statusUrl = result?.statusUrl;
      Alert.alert(
        !result
          ? 'Phone cleanup complete'
          : result.state === 'completed'
            ? 'Account deleted'
            : 'Account deletion started',
        !result
          ? 'This account’s data was removed from this phone. Its previously confirmed cloud deletion may still be running.'
          : result.state === 'completed'
            ? 'Your account and cloud data were deleted.'
            : result?.error
              ? errorMessage(result.error)
              : 'Access is revoked. Cloud cleanup retries automatically. An interrupted upload needs at least an hour; provider or storage failures may take longer.',
        [
          { text: 'Done', style: 'cancel' },
          ...(statusUrl
            ? [
                {
                  text: 'Check deletion status',
                  onPress: () =>
                    void run(async () => {
                      const url = new URL(statusUrl);
                      if (
                        !session ||
                        url.origin !== new URL(session.server).origin ||
                        url.pathname !== '/delete-account' ||
                        url.username ||
                        url.password ||
                        !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('receipt') ?? '')
                      )
                        throw new Error('The account deletion status link is invalid.');
                      await Linking.openURL(statusUrl);
                    }),
                },
              ]
            : []),
        ],
      );
    },
    /** @param {'apple'|'github'|'google'} provider */
    reauthenticateDeletion: async (provider) => {
      const pending = pendingAccountCleanup();
      if (!pending) return;
      const next = await signIn(
        session?.server ?? process.env.EXPO_PUBLIC_ACCOUNT_SERVER ?? 'https://myself.md',
        provider,
      );
      if (next.owner !== pending.owner)
        throw new Error('That sign-in did not match the account awaiting deletion.');
      next.deviceId = pending.deviceId;
      await saveSession(next);
      setSession(next);
      await finishDeletion(pending, next);
    },
    run,
    reset,
    changeAccount: () => setSession(null),
    switchConnection: async () => {
      const next = pairing;
      await disconnect();
      setPairing(next);
      locked.current = true;
    },
    /** @param {'apple'|'github'|'google'} provider */
    reauthenticateAccount: async (provider) => {
      if (!session) throw new Error('Sign in before reconnecting this account.');
      const next = await reauthenticateSession(session, provider);
      clearAccountAllowance();
      setSession(next);
      await syncBilling(next).catch((e) => {
        setError(`Signed in. Purchase access could not be checked: ${errorMessage(e)}`);
      });
    },
    /** @param {'apple'|'github'|'google'} provider */
    signInAccount: async (provider) => {
      const next = await signIn(
        process.env.EXPO_PUBLIC_ACCOUNT_SERVER ?? 'https://myself.md',
        provider,
      );
      await saveSession(next);
      clearAccountAllowance();
      setSession(next);
      await syncBilling(next).catch((e) => {
        setError(`Signed in. Purchase access could not be checked: ${errorMessage(e)}`);
      });
    },
    /** @param {'apple'|'github'|'google'} provider */
    signIn: async (provider) => {
      const next = await signIn(pairing?.server ?? '', provider);
      await saveSession(next);
      setSession(next);
    },
  };
}
