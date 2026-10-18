import { reviewWhoopRequest } from './whoop-request.js';
import { profileSyncBase, saveProfileSyncBase, commitSyncedProfiles } from './profile-sync.js';
import { mergeProfileStates, sameProfileValue } from '../core/profile-sync.js';
import { trackAnalytics } from './analytics.js';
import { exportFolderStatus } from './export-folder.js';
import { showToast } from '../src/components/Toast.js';
import { errorJSON } from '../packages/support-chat/errors.js';
import { acceptAllowance } from './billing.js';
import { debugReport, recordDebug } from './debug-log.js';
import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, View } from 'react-native';
import { useTheme } from '../src/lib/theme';
import { router } from 'expo-router';
import { Button, Text } from './Terminal.js';
import { domains } from '../core/data.js';
import { api } from './session.js';
import { catalog, readPage } from './data.js';
import { requestSourceAccess } from './source-access.js';
import { startTracking, stopTracking, locationStatus } from './location-task.js';
import { reviewLocationCapture } from './location-capture.js';
import { reconcileExports } from './export-task.js';
import { syncHistory } from './history.js';
import ProfilePanel from './ProfilePanel.js';
import LocationSettings from './LocationSettings.js';
import { loadAgentProfiles, saveAgentProfiles } from './profile-logs.js';
import {
  parseProfile,
  parseProfileState,
  agentProfileAllows,
  parseAgentPermissions,
} from '../core/profiles.js';
/** @typedef {{session:import('./session.js').Session,incoming:import('../core/profiles.js').ProfileDraft|null,onDismiss:()=>void,children:import('react').ReactNode}} DataProviderProps */
const PhoneDataContext = createContext(
  /** @type {ReturnType<typeof usePhoneDataState>|null} */ (null),
);
export function usePhoneData() {
  const value = useContext(PhoneDataContext);
  if (!value) throw new Error('Phone data provider is required.');
  return value;
}
/** @param {{value:ReturnType<typeof usePhoneDataState>,children:import('react').ReactNode}} props */
export function PhoneDataStateProvider({ value, children }) {
  return <PhoneDataContext.Provider value={value}>{children}</PhoneDataContext.Provider>;
}
/** @param {DataProviderProps} props */
export function PhoneDataProvider(props) {
  const value = usePhoneDataState(props);
  return <PhoneDataContext.Provider value={value}>{props.children}</PhoneDataContext.Provider>;
}
/** @param {DataProviderProps} props */
function usePhoneDataState({ session, incoming, onDismiss }) {
  useEffect(() => {
    recordDebug(session, 'app', 'started');
  }, [session]);
  const [profiles, setProfiles] = useState(() => loadAgentProfiles(session));
  const profileState = useRef(profiles);
  const [types, setTypes] = useState(
    /** @type {Record<import('../core/data.js').Domain,string[]>} */ ({
      health: [],
      time: [],
      location: [],
    }),
  );
  const [proposal, setProposal] = useState(
    /** @type {{id:string,profile:import('../core/profiles.js').ProfileDraft}|null} */ (null),
  );
  const reviewing = useRef(false);
  const resolvingSync = useRef(false);
  const receivedProfileId = useRef('');
  useEffect(() => {
    if (!session.server) return;
    let active = true;
    /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
    const sync = async () => {
      try {
        if (AppState.currentState === 'active') await syncHistory(session);
      } catch {
        // Keep local history intact and retry while the paired app is open.
      } finally {
        if (active) timer = setTimeout(() => void sync(), 30000);
      }
    };
    void sync();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [session]);
  useEffect(() => {
    reviewing.current = Boolean(proposal || incoming);
  }, [proposal, incoming]);
  const [sourcePermissions, setSourcePermissions] = useState(
    /** @type {Record<string,string>} */ ({}),
  );
  const [sourceNotes, setSourceNotes] = useState(/** @type {Record<string,string>} */ ({}));
  const phoneCatalog = useCallback(async () => {
    const raw = await catalog(session.owner, { health: true, time: true, location: true });
    setSourcePermissions(Object.fromEntries(raw.domains.map((d) => [d.domain, d.permission])));
    setSourceNotes(Object.fromEntries(raw.domains.map((d) => [d.domain, d.notes.join(' ')])));
    setTypes({
      health: raw.domains.find((d) => d.domain === 'health')?.selectableTypes ?? [],
      time: raw.domains.find((d) => d.domain === 'time')?.selectableTypes ?? [],
      location: raw.domains.find((d) => d.domain === 'location')?.selectableTypes ?? [],
    });
    if (!profileState.current) {
      const initial = {
        profiles: [
          {
            ...parseProfile({
              schema: 'myself.md.profile.v1',
              name: 'Default',
              selection: Object.fromEntries(raw.domains.map((d) => [d.domain, []])),
            }),
            id: 'default',
            agentAccess: false,
            agentPermissions: { health: false, time: false, location: false, logs: false },
          },
        ],
      };
      saveAgentProfiles(session, initial);
      profileState.current = initial;
      setProfiles(initial);
    }
    let diagnostics;
    try {
      diagnostics = debugReport(session, true);
    } catch {
      /* Optional diagnostics must not prevent data dispatch. */
    }
    return {
      ...raw,
      locationCapture: { version: 1 },
      diagnostics,
      profiles: profileState.current.profiles.map((profile) =>
        Object.assign({}, profile, { localExportFolder: exportFolderStatus(session, profile) }),
      ),
      profileSync: { base: profileSyncBase(session) },
      acceptProfiles: !reviewing.current,
      receivedProfileId: receivedProfileId.current,
      domains: raw.domains.map((d) =>
        Object.assign({}, d, {
          enabled:
            profileState.current?.profiles.some(
              (p) =>
                p.agentAccess === true &&
                parseAgentPermissions(p.agentPermissions)[d.domain] &&
                p.selection[d.domain].length > 0,
            ) ?? false,
          availableTypes: d.types,
          types: d.types.filter((key) =>
            profileState.current?.profiles.some((p) =>
              agentProfileAllows(p, {
                domain: d.domain,
                source: 'native',
                type: key.replace(/^native:/, ''),
              }),
            ),
          ),
        }),
      ),
    };
  }, [session]);

  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      session.server
        ? 'Ready for agent queries while this app is open.'
        : 'Your data stays on this phone until you pair an agent.',
    );
  const [isTracking, setTracking] = useState(false);
  const [notes, setNotes] = useState(/** @type {Record<string,string>} */ ({}));
  const version = useRef(0);
  const resumeFromSettings = useRef(false);
  const [locationInfo, setLocationInfo] = useState('Checking location permissions…');
  const refreshLocation = useCallback(async () => {
    const status = await locationStatus(session.owner);
    setTracking(status.tracking);
    setLocationInfo(
      `${status.permission}. ${status.count} recorded points.${status.last ? ` Last point: ${new Date(status.last).toLocaleString()}.` : ''}${status.notificationPermission === 'required' || status.notificationPermission === 'blocked' ? ' Allow recording notifications in Android Settings before starting background recording.' : ''}`,
    );
    return status;
  }, [session.owner]);
  useEffect(() => {
    const refresh = async (resume = false) => {
      try {
        const status = await refreshLocation();
        if (resume && resumeFromSettings.current) {
          resumeFromSettings.current = false;
          if (status.backgroundGranted) {
            const started = await startTracking(session.owner);
            await refreshLocation();
            setMessage(
              started
                ? 'Location recording is on, including while your phone is locked.'
                : 'Location recording was not started.',
            );
          } else setMessage('Choose Always in location settings, then start recording again.');
        }
      } catch (error) {
        showToast({ message: errorJSON(error), kind: 'error' });
      }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh(true);
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 5000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [refreshLocation, session.owner]);
  const acceptProfileSync = useCallback(
    /** @param {{state:import('../core/profiles.js').ProfileState,conflicts:string[]}|undefined} remote @param {import('../core/profiles.js').ProfileState} sent */
    (remote, sent) => {
      if (!remote || !profileState.current || resolvingSync.current) return;
      const merged = mergeProfileStates(sent, profileState.current, remote.state);
      /** @param {import('../core/profiles.js').ProfileState} next */
      const apply = (next) => {
        if (!sameProfileValue(profileState.current, next)) {
          version.current++;
          commitSyncedProfiles(session, next, remote.state);
          profileState.current = next;
          setProfiles(next);
          void reconcileExports().catch((e) => showToast({ message: errorJSON(e), kind: 'error' }));
        } else saveProfileSyncBase(session, remote.state);
      };
      if (remote.conflicts.length || merged.conflicts.length) {
        resolvingSync.current = true;
        Alert.alert(
          'Profiles changed in both clients',
          'Web and phone edits overlap. Choose which profiles to keep. Your phone edits have not been replaced.',
          [
            {
              text: 'Use web profiles',
              onPress: () => {
                apply(remote.state);
                resolvingSync.current = false;
              },
            },
            {
              text: 'Keep phone profiles',
              onPress: () => {
                saveProfileSyncBase(session, remote.state);
                resolvingSync.current = false;
              },
            },
          ],
          { cancelable: false },
        );
      } else apply(merged.state);
    },
    [session],
  );
  const publish = useCallback(async () => {
    const info = await phoneCatalog();
    setNotes(
      Object.fromEntries(
        info.domains.map((d) => [
          d.domain,
          `${d.domain === 'health' ? 'HealthKit or Health Connect samples.' : d.domain === 'time' ? (d.availableTypes.some((t) => t.startsWith('native:')) ? 'Live usage totals available.' : 'Enable usage access to read totals.') : 'Locally recorded location points.'}`,
        ]),
      ),
    );
    if (!session.server) return;
    const response =
      /** @type {{profileSync?:{state:import('../core/profiles.js').ProfileState,conflicts:string[]}}} */ (
        await api(session, `/api/phones/${session.deviceId}/poll`, {
          method: 'POST',
          body: JSON.stringify({ ...info, dispatch: false }),
        })
      );
    acceptProfileSync(response.profileSync, { profiles: info.profiles });
  }, [session, phoneCatalog, acceptProfileSync]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        void publish().catch((error) => showToast({ message: errorJSON(error), kind: 'error' }));
    });
    return () => subscription.remove();
  }, [publish]);
  useEffect(() => {
    if (!session.server) {
      void Promise.resolve()
        .then(publish)
        .catch((e) => showToast({ message: errorJSON(e), kind: 'error' }));
      return;
    }
    let active = true,
      running = false;
    /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
    const poll = async () => {
      if (!active || running) return;
      if (AppState.currentState !== 'active') {
        timer = setTimeout(() => void poll(), 2000);
        return;
      }
      running = true;
      const current = version.current;
      try {
        const info = await phoneCatalog();
        const response =
          /** @type {{whoopRequest?:import('./whoop-request.js').WhoopRequest|null,locationCapture?:import('./location-capture.js').CaptureRequest|null,profileSync?:{state:import('../core/profiles.js').ProfileState,conflicts:string[]},request:null|{id:string,query:import('../core/data.js').DataQuery & {profileId:string}},profile?:{id:string,profile:import('../core/profiles.js').ProfileDraft}|null,allowance:import('../core/billing.js').ExportAllowance}} */ (
            await api(session, `/api/phones/${session.deviceId}/poll`, {
              method: 'POST',
              body: JSON.stringify(info),
            })
          );
        if (active) {
          await reviewWhoopRequest(session, response.whoopRequest, () => active);
          acceptAllowance(response.allowance);
          acceptProfileSync(response.profileSync, { profiles: info.profiles });
          await reviewLocationCapture(
            session,
            response.locationCapture,
            async () => {
              await refreshLocation();
              setMessage('Recorded one owner-approved Location point on this phone.');
            },
            () => active,
          );
          setNotes(
            Object.fromEntries(
              info.domains.map((d) => [
                d.domain,
                `${d.domain === 'health' ? 'HealthKit or Health Connect samples.' : d.domain === 'time' ? (d.availableTypes.some((t) => t.startsWith('native:')) ? 'Live usage totals available.' : 'Enable usage access to read totals.') : 'Locally recorded location points.'}`,
              ]),
            ),
          );
        }
        if (response.profile && active) {
          reviewing.current = true;
          receivedProfileId.current = response.profile.id;
          setProposal({ ...response.profile, profile: parseProfile(response.profile.profile) });
        }
        const request = response.request;
        const profile = profileState.current?.profiles.find(
          (p) => p.id === request?.query.profileId,
        );
        if (request && active && profile && agentProfileAllows(profile, request.query)) {
          setMessage(`Your chat requested ${request.query.domain} data.`);
          let body;
          recordDebug(session, 'query', 'started');
          try {
            const page = await readPage(session.owner, request.query, profile);
            recordDebug(session, 'query', 'succeeded');
            body = { id: request.id, page };
          } catch (error) {
            recordDebug(session, 'query', 'failed', { error });
            body = {
              id: request.id,
              error: errorJSON(error),
            };
          }
          if (active && current === version.current && agentProfileAllows(profile, request.query)) {
            await api(session, `/api/phones/${session.deviceId}/result`, {
              method: 'POST',
              body: JSON.stringify(body),
            });
            setMessage('Answered your chat. The server clears responses after five minutes.');
          }
        }
      } catch (error) {
        recordDebug(session, 'connection', 'failed', { error });
        if (active) showToast({ message: errorJSON(error), kind: 'error' });
      } finally {
        running = false;
        if (active) timer = setTimeout(() => void poll(), 2000);
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [session, phoneCatalog, publish, acceptProfileSync, refreshLocation]);
  /** @param {()=>Promise<void>} action */
  async function run(action) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      showToast({ message: errorJSON(error), kind: 'error' });
    } finally {
      setBusy(false);
    }
  }
  /** @param {boolean} enabled */
  async function changeRecording(enabled) {
    resumeFromSettings.current = false;
    if (!enabled) {
      await stopTracking();
      await refreshLocation();
      setMessage('Location recording stopped.');
      await publish();
      return;
    }
    const started = await startTracking(session.owner);
    await refreshLocation();
    resumeFromSettings.current = started === false;
    await publish();
    setMessage(
      started === null
        ? 'Location recording cancelled.'
        : started
          ? 'Location recording is on, including while your phone is locked.'
          : 'Use Location permissions to allow Always/background access and precise location, then return. Recording will start when access is granted.',
    );
  }
  /** Request device access without expanding agent grants or starting recording.
   * @param {import('../core/data.js').Domain} domain */
  async function reviewSourceAccess(domain) {
    try {
      return await requestSourceAccess(domain);
    } finally {
      await publish();
    }
  }
  /** @param {import('../core/profiles.js').ProfileState} next */
  async function changeProfiles(next) {
    next = parseProfileState(next);
    version.current++;
    saveAgentProfiles(session, next);
    recordDebug(session, 'profile', 'succeeded');
    trackAnalytics('profile_saved');
    profileState.current = next;
    setProfiles(next);
    void reconcileExports().catch((e) => showToast({ message: errorJSON(e), kind: 'error' }));
    try {
      await publish();
    } catch (failure) {
      showToast({ message: errorJSON(failure), kind: 'error' });
    }
  }
  return {
    session,
    incoming,
    onDismiss,
    profiles,
    types,
    busy,
    proposal,
    setProposal,
    isTracking,
    locationInfo,
    notes,
    sourceNotes,
    sourcePermissions,
    reviewSourceAccess,
    message,
    run,
    changeRecording,
    changeProfiles,
    setMessage,
    setTracking,
    publish,
    refreshLocation,
  };
}
/** @param {{domain?:import('../core/data.js').Domain, management?:boolean}} props */
export default function DataPanel({ domain: selectedDomain = undefined, management = false }) {
  const { colors } = useTheme();
  const data = usePhoneData();
  const {
    session,
    incoming,
    onDismiss,
    profiles,
    types,
    sourcePermissions,
    busy,
    isTracking,
    proposal,
    setProposal,
    sourceNotes,
    reviewSourceAccess,
    message,
    run,
    changeProfiles,
    setMessage,
  } = data;
  if (!management && selectedDomain === 'location') return <LocationSettings data={data} />;
  return (
    <View
      testID={management ? 'profiles-screen' : `source-${selectedDomain}-screen`}
      collapsable={false}
      style={management ? styles.management : styles.container}
    >
      {management && profiles ? (
        <ProfilePanel
          session={session}
          state={profiles}
          types={types}
          permissions={sourcePermissions}
          onAuthorize={reviewSourceAccess}
          busy={busy}
          isTracking={isTracking}
          onRecordingChange={(enabled) => void run(() => data.changeRecording(enabled))}
          draft={incoming ?? proposal?.profile ?? null}
          onDismiss={() => {
            if (incoming) onDismiss();
            else setProposal(null);
          }}
          onChange={changeProfiles}
        />
      ) : management ? (
        <Text testID="profiles-loading" accessibilityState={{ busy: true }}>
          Loading export profiles…
        </Text>
      ) : null}
      {!management && (
        <Text style={styles.description}>
          Review permissions and choose what your agent can read.
        </Text>
      )}

      {(management ? [] : domains.filter((item) => item === selectedDomain)).map((domain) => (
        <View
          key={domain}
          style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Text style={styles.title}>
            {domain === 'health' ? 'Health' : domain === 'time' ? 'Screen time' : 'Location'}
          </Text>
          {domain !== 'location' && (
            <Button
              title={
                domain === 'health' ? 'Review health permissions' : 'Review screen time permissions'
              }
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const result = await reviewSourceAccess(domain);
                  setMessage(result.message);
                })
              }
            />
          )}
          <Button
            testID={`source-${domain}-choose-types`}
            title="Choose data types"
            onPress={() => router.navigate('/profiles')}
          />
          <Button
            testID={`source-${domain}-exports`}
            title="Export files"
            onPress={() => router.navigate('/profiles')}
          />
        </View>
      ))}
      {!management && <Text style={styles.description}>{sourceNotes[selectedDomain ?? '']}</Text>}
      {!management && (
        <Text
          testID="source-status"
          accessibilityState={{ busy }}
          accessibilityLiveRegion="polite"
          style={[styles.status, { backgroundColor: colors.subtle, borderColor: colors.border }]}
        >
          {message}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 16 },
  management: { flex: 1 },
  description: { fontSize: 16, lineHeight: 24 },
  card: {
    padding: 16,
    gap: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 19, lineHeight: 27 },
  status: {
    fontSize: 15,
    lineHeight: 24,
    borderRadius: 12,

    padding: 16,

    paddingLeft: 12,
  },
});
