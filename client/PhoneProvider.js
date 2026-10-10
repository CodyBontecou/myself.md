import { errorJSON } from '../packages/support-chat/errors.js';
import {
  deleteLocalAccount,
  queueAccountCleanup,
  pendingAccountCleanup,
  completeAccountCleanup,
} from './account-deletion.js';
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
} from './export-task.js';
import { stopTracking } from './location-task.js';
import { saveExportContext } from './export-context.js';
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
      <PhoneDataProvider
        key={`${dataSession.deviceId}:${value.accountRevision}`}
        session={dataSession}
        incoming={value.incoming}
        onDismiss={value.dismissIncoming}
      >
        {children}
      </PhoneDataProvider>
    </PhoneContext.Provider>
  );
}
function usePhoneState() {
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(/** @type {import('./session.js').Session|null} */ (null));
  const [pairing, setPairing] = useState(
    /** @type {import('../core/index.js').PairingQr|null} */ (null),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accountRevision, setAccountRevision] = useState(0);
  const [deletionStatusUrl, setDeletionStatusUrl] = useState('');
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
        if (url === 'qrconnect://account' || url.startsWith('qrconnect://account?')) {
          router.navigate('/account');
        } else if (url.startsWith('qrconnect://profile')) {
          setIncoming(profileFromLink(url));
          router.navigate('/profiles');
        } else if (url.startsWith('qrconnect://pair?') || /^https?:\/\/[^/]+\/pair#/.test(url)) {
          setPairing(parsePairingQr(url));
          router.push('/pair');
          locked.current = true;
          setError('');
        }
      } catch (e) {
        setError(errorJSON(e));
      }
    };
    void Linking.getInitialURL()
      .then(receive)
      .catch((e) => setError(errorJSON(e)));
    const listener = Linking.addEventListener('url', ({ url }) => receive(url));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    loadSession()
      .then(async (loaded) => {
        const pending = pendingAccountCleanup();
        if (pending) {
          saveExportContext(null);
          await stopAccountExports();
          await stopTracking();
          await deleteLocalAccount(pending);
          await clearSession(loaded ?? undefined);
          clearAccountAllowance();
          completeAccountCleanup();
          setSession(null);
          setAccountRevision((value) => value + 1);
        } else setSession(loaded);
        return undefined;
      })
      .catch((e) => setError(errorJSON(e)))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready) return;
    saveExportContext(session?.deviceId ? session : localSession);
    void reconcileExports().catch((e) => setError(errorJSON(e)));
    const tick = () => {
      void runScheduledExports().catch((e) => setError(errorJSON(e)));
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [session, ready]);
  useEffect(() => {
    if (!session) return;
    const active = () => {
      if (AppState.currentState !== 'active') return;
      void resumeSession(session)
        .then((valid) => {
          if (!valid) {
            cancelExports();
            clearAccountAllowance();
            setSession(null);
            setError(
              errorJSON('Your session expired after 30 days of inactivity. Please sign in again.'),
            );
          }
          return valid ? renewCloudAuthorizations(session) : undefined;
        })
        .catch((e) => setError(errorJSON(e)));
    };
    active();
    const listener = AppState.addEventListener('change', active);
    const timer = setInterval(active, 60000);
    return () => {
      listener.remove();
      clearInterval(timer);
    };
  }, [session]);
  /** @param {string} value */
  function scan(value) {
    if (locked.current) return;
    Keyboard.dismiss();
    try {
      setPairing(parsePairingQr(value.trim()));
      locked.current = true;
      setError('');
    } catch (e) {
      setError(errorJSON(e));
    }
  }
  /** @param {() => Promise<void>} action */
  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorJSON(e));
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
    await syncBilling(connected);
    await saveSession(connected);
    setSession(connected);
    reset();
    router.dismissTo('/');
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
        tracking.status === 'rejected' ? errorJSON(tracking.reason) : '',
        remote.status === 'rejected' ? errorJSON(remote.reason) : '',
      ].filter(Boolean);
      if (failures.length) Alert.alert('Signed out on this phone', errorJSON(failures.join('\n')));
      return undefined;
    });
  }
  const connected = Boolean(session?.deviceId);
  return {
    accountRevision,
    deletionStatusUrl,
    incoming,
    dismissIncoming: () => setIncoming(null),
    session,
    connected,
    permission,
    requestPermission,
    pairing,
    busy,
    error,
    link,
    setLink,
    scan,
    confirm,
    refresh,
    disconnect,
    deleteAccount: async () => {
      if (!session?.owner) throw new Error('Sign in to delete your account.');
      const result = /** @type {import('../core/account-deletion.js').DeletionStatus} */ (
        await api(session, '/api/account', {
          method: 'DELETE',
          body: JSON.stringify({ confirmation: 'DELETE', subject: session.owner }),
        })
      );
      if (result.state === 'unavailable' || result.state === 'active')
        throw new Error(result.error ?? 'Deletion could not start.');
      setDeletionStatusUrl(result.statusUrl ?? '');
      queueAccountCleanup(session);
      saveExportContext(null);
      await stopAccountExports();
      await stopTracking();
      await deleteLocalAccount(session);
      await clearSession(session);
      completeAccountCleanup();
      setSession(null);
      setAccountRevision((value) => value + 1);
      clearAccountAllowance();
      reset();
      Alert.alert(
        result.state === 'completed' ? 'Account deleted' : 'Account deletion started',
        result.state === 'completed'
          ? 'Your account and cloud data were deleted.'
          : result.error
            ? errorJSON(result.error)
            : 'Access is revoked. Cloud cleanup retries automatically. An interrupted upload needs at least an hour; provider or storage failures may take longer.',
      );
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
    signInAccount: async (provider) => {
      const next = await signIn(
        process.env.EXPO_PUBLIC_ACCOUNT_SERVER ?? 'https://myself.md',
        provider,
      );
      await syncBilling(next);
      await saveSession(next);
      setSession(next);
    },
    syncAccount: async () => {
      if (session) await syncBilling(session);
    },
    /** @param {'apple'|'github'|'google'} provider */
    signIn: async (provider) => setSession(await signIn(pairing?.server ?? '', provider)),
  };
}
