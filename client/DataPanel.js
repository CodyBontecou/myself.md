import { acceptAllowance } from './billing.js';
import { feedbackState, requestFeedback } from './gripe.js';
import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, View } from 'react-native';
import { useTheme } from '../src/lib/theme';
import { router } from 'expo-router';
import { Button, Switch, Text } from './Terminal.js';
import { domains } from '../core/data.js';
import { api } from './session.js';
import { catalog, readPage } from './data.js';
import { loadGrants, saveGrants } from './library.js';
import { requestSourceAccess } from './source-access.js';
import { captureLocation, startTracking, stopTracking, locationStatus } from './location-task.js';
import { cloudAccess } from './destinations.js';
import { reconcileExports } from './export-task.js';
import { syncHistory } from './history.js';
import ProfilePanel from './ProfilePanel.js';
import { loadProfiles, saveProfiles } from './profiles.js';
import { parseProfile, parseProfileState, agentProfileAllows } from '../core/profiles.js';
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
  const [grants, setGrants] = useState(() => loadGrants(session.deviceId));
  const allowed = useRef(grants);
  const [profiles, setProfiles] = useState(() => loadProfiles(session.deviceId));
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
    const raw = await catalog(session.owner, allowed.current);
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
              selection: Object.fromEntries(
                raw.domains.map((d) => [d.domain, allowed.current[d.domain] ? d.types : []]),
              ),
            }),
            id: 'default',
            agentAccess: false,
          },
        ],
      };
      saveProfiles(session.deviceId, initial);
      profileState.current = initial;
      setProfiles(initial);
    }
    return {
      ...raw,
      feedback: await feedbackState(),
      profiles: profileState.current.profiles,
      acceptProfiles: !reviewing.current,
      receivedProfileId: receivedProfileId.current,
      domains: raw.domains.map((d) =>
        Object.assign({}, d, {
          enabled: allowed.current[d.domain],
          availableTypes: d.types,
          types: d.types.filter((key) =>
            profileState.current?.profiles.some(
              (p) => p.agentAccess === true && p.selection[d.domain].includes(key),
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
      `${status.permission}. ${status.count} recorded points.${status.last ? ` Last point: ${new Date(status.last).toLocaleString()}.` : ''}`,
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
            await startTracking(session.owner);
            await refreshLocation();
            setMessage('Location recording is on, including while your phone is locked.');
          } else setMessage('Choose Always in location settings, then start recording again.');
        }
      } catch (error) {
        setLocationInfo(
          error instanceof Error ? error.message : 'Could not check location access.',
        );
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
    await api(session, `/api/phones/${session.deviceId}/poll`, {
      method: 'POST',
      body: JSON.stringify({ ...info, dispatch: false }),
    });
  }, [session, phoneCatalog]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void publish().catch((error) => setMessage(String(error)));
    });
    return () => subscription.remove();
  }, [publish]);
  useEffect(() => {
    if (!session.server) {
      void Promise.resolve()
        .then(publish)
        .catch((e) => setMessage(String(e)));
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
          /** @type {{feedback?:{id:string,expiresAt:number}|null,request:null|{id:string,query:import('../core/data.js').DataQuery & {profileId:string}},profile?:{id:string,profile:import('../core/profiles.js').ProfileDraft}|null,allowance:import('../core/billing.js').ExportAllowance}} */ (
            await api(session, `/api/phones/${session.deviceId}/poll`, {
              method: 'POST',
              body: JSON.stringify(info),
            })
          );
        if (active) {
          await requestFeedback(response.feedback ?? null, () =>
            api(session, `/api/phones/${session.deviceId}/feedback`, {
              method: 'POST',
              body: JSON.stringify({ id: response.feedback?.id }),
            }),
          );
          acceptAllowance(response.allowance);
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
        if (
          request &&
          active &&
          profile &&
          allowed.current[request.query.domain] &&
          agentProfileAllows(profile, request.query)
        ) {
          setMessage(`Your chat requested ${request.query.domain} data.`);
          let body;
          try {
            body = { id: request.id, page: await readPage(session.owner, request.query, profile) };
          } catch (error) {
            body = {
              id: request.id,
              error: error instanceof Error ? error.message : 'Read failed.',
            };
          }
          if (active && current === version.current && allowed.current[request.query.domain]) {
            await api(session, `/api/phones/${session.deviceId}/result`, {
              method: 'POST',
              body: JSON.stringify(body),
            });
            setMessage('Answered your chat. The server clears responses after five minutes.');
          }
        }
      } catch (error) {
        if (active)
          setMessage(error instanceof Error ? error.message : 'Could not reach your server.');
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
  }, [session, phoneCatalog, publish]);
  /** @param {()=>Promise<void>} action */
  async function run(action) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert(
        'Could not complete this request',
        error instanceof Error ? error.message : 'Please retry.',
      );
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
      return;
    }
    const started = await startTracking(session.owner);
    await refreshLocation();
    resumeFromSettings.current = !started;
    setMessage(
      started
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
  /** @param {import('../core/data.js').Domain} domain @param {boolean} enabled */
  async function changeGrant(domain, enabled) {
    version.current++;
    const next = { ...allowed.current, [domain]: enabled };
    allowed.current = next;
    saveGrants(session.deviceId, next);
    setGrants(next);
    await publish();
    if (enabled) {
      if (domain !== 'location') await reviewSourceAccess(domain);
      await publish();
    }
  }
  /** @param {import('../core/profiles.js').ProfileState} next */
  async function changeProfiles(next) {
    next = parseProfileState(next);
    for (const previous of profiles?.profiles ?? []) {
      const changed = next.profiles.find((p) => p.id === previous.id);
      if (
        session.server &&
        previous.export.destination === 'cloud' &&
        (!changed ||
          JSON.stringify(parseProfile(changed)) !== JSON.stringify(parseProfile(previous)))
      ) {
        // Revoke stored-data sharing before accepting changed profile permissions.
        // oxlint-disable-next-line eslint/no-await-in-loop
        await cloudAccess(session, previous, false);
      }
    }
    version.current++;
    saveProfiles(session.deviceId, next);
    profileState.current = next;
    setProfiles(next);
    void reconcileExports().catch((e) => setMessage(`Profile saved. ${String(e)}`));
    try {
      await publish();
    } catch {
      setMessage('Profile saved locally. Server access updates when this phone reconnects.');
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
    grants,
    isTracking,
    locationInfo,
    notes,
    sourceNotes,
    sourcePermissions,
    reviewSourceAccess,
    message,
    run,
    changeGrant,
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
  const {
    session,
    incoming,
    onDismiss,
    profiles,
    types,
    sourcePermissions,
    busy,
    proposal,
    setProposal,
    grants,
    isTracking,
    locationInfo,
    notes,
    sourceNotes,
    reviewSourceAccess,
    message,
    run,
    changeGrant,
    changeRecording,
    changeProfiles,
    setMessage,
    publish,
    refreshLocation,
  } = usePhoneData();
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
          {domain === 'location' ? (
            <View style={styles.row}>
              <Text style={styles.description}>Background recording</Text>
              <Switch
                testID="source-location-recording"
                accessibilityLabel="Record location in background"
                value={isTracking}
                disabled={busy}
                onValueChange={(enabled) => void run(() => changeRecording(enabled))}
              />
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.description}>Agent access</Text>
            <Switch
              testID={`source-grant-${domain}`}
              accessibilityLabel={`Allow chat to read ${domain} data`}
              value={grants[domain]}
              disabled={busy || !session.server}
              onValueChange={(value) => void run(() => changeGrant(domain, value))}
            />
          </View>
          <Text style={styles.description}>
            {grants[domain] ? 'Shared with your paired agent' : 'Private'} ·{' '}
            {notes[domain] ?? 'Checking data sources…'}
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
          {domain === 'location' ? (
            <>
              <Text style={styles.description}>{locationInfo}</Text>
              <Button
                testID={`source-${domain}-location-permissions`}
                title="Location permissions"
                disabled={busy}
                onPress={() => void run(() => Linking.openSettings())}
              />
              <Button
                testID={`source-${domain}-location-capture`}
                title="Save location point"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await captureLocation(session.owner);
                    setMessage('Recorded one location point on this phone.');
                    await publish();
                    await refreshLocation();
                  })
                }
              />
            </>
          ) : null}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
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
