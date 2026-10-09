import { syncBilling } from './billing.js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Linking, Platform } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { PhoneDataProvider } from './DataPanel.js';
import { reconcileExports, cancelExports, runScheduledExports } from './export-task.js';
import { stopTracking } from './location-task.js';
import { saveExportContext } from './export-context.js';
import { profileFromLink } from '../core/profiles.js';
import { parsePairingQr } from '../core/index.js';
import { api, clearSession, loadSession, saveSession, signIn, revokeDevice } from './session.js';
const PhoneContext = createContext(/** @type {ReturnType<typeof usePhoneState>|null} */ (null));
export function usePhone() {
  const value = useContext(PhoneContext);
  if (!value) throw new Error('Phone provider is required.');
  return value;
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
        key={dataSession.deviceId}
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
        if (url.startsWith('qrconnect://profile')) {
          setIncoming(profileFromLink(url));
          router.navigate('/profiles');
        } else if (url.startsWith('qrconnect://pair?') || /^https?:\/\/[^/]+\/pair#/.test(url)) {
          setPairing(parsePairingQr(url));
          router.push('/pair');
          locked.current = true;
          setError('');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid app link.');
      }
    };
    void Linking.getInitialURL()
      .then(receive)
      .catch((e) => setError(String(e)));
    const listener = Linking.addEventListener('url', ({ url }) => receive(url));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    loadSession()
      .then(setSession)
      .catch((e) => setError(String(e)))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready) return;
    saveExportContext(session?.deviceId ? session : localSession);
    void reconcileExports().catch((e) => setError(String(e)));
    const tick = () => {
      void runScheduledExports().catch((e) => setError(String(e)));
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [session, ready]);
  /** @param {string} value */
  function scan(value) {
    if (locked.current) return;
    Keyboard.dismiss();
    try {
      setPairing(parsePairingQr(value.trim()));
      locked.current = true;
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid QR code.');
    }
  }
  /** @param {() => Promise<void>} action */
  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
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
    reset();
    void Promise.allSettled([stopTracking(), revokeDevice(previous)]).then(([tracking, remote]) => {
      const failures = [
        tracking.status === 'rejected' ? 'Location shutdown failed; check location settings.' : '',
        remote.status === 'rejected'
          ? 'The old server could not confirm revocation. Its device pairing may still exist.'
          : '',
      ].filter(Boolean);
      if (failures.length) Alert.alert('Signed out on this phone', failures.join('\n'));
      return undefined;
    });
  }
  const connected = Boolean(session?.deviceId);
  return {
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
    run,
    reset,
    changeAccount: () => setSession(null),
    switchConnection: async () => {
      const next = pairing;
      await disconnect();
      setPairing(next);
      locked.current = true;
    },
    /** @param {'apple'|'github'} provider */
    signIn: async (provider) => setSession(await signIn(pairing?.server ?? '', provider)),
  };
}
