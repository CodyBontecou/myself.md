import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../src/lib/theme.js';
import { router, useFocusEffect } from 'expo-router';
import { usePhone } from './PhoneProvider.js';
import { api } from './session.js';
import { qaEnabled, qaSnapshot } from './qa-runtime.js';
import { cloudUsageLabel } from '../core/cloud-allowance.js';
import { errorMessage } from '../packages/support-chat/errors.js';
import { Copy, Row, Group, SectionHeader, Icon } from '../src/components/ui.js';
import {
  acceptCloudStatus,
  cloudPlanTitle,
  cloudStatusKey,
  cloudStatusNotices,
  cloudStatusSnapshot,
  qaCloudStatus,
  subscribeCloudStatus,
} from './cloud-storage.js';

/** Server cloud status for the signed-in account, refreshed while the calling screen is focused.
 * Fixtures return synthetic status for the active QA scenario. */
export function useCloudStatus() {
  const { session } = usePhone();
  const key = session && !session.requiresSignIn ? cloudStatusKey(session) : '';
  const cached = useSyncExternalStore(subscribeCloudStatus, cloudStatusSnapshot);
  const [state, setState] = useState({ key: '', error: '', loading: false });
  const refreshCurrent = useRef(/** @type {(()=>Promise<void>)|null} */ (null));
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let pending = false;
      async function refresh() {
        if (!active || pending || AppState.currentState !== 'active') return;
        if (qaEnabled) {
          const scenario = qaSnapshot().scenario;
          acceptCloudStatus(
            key,
            qaCloudStatus(scenario, Platform.OS === 'android' ? 'android' : 'ios'),
          );
          setState({ key, error: '', loading: scenario === 'loading' });
          return;
        }
        if (!session || !key) return;
        pending = true;
        setState({ key, error: '', loading: true });
        try {
          const value = /** @type {import('./cloud-storage.js').CloudStatus} */ (
            await api(session, '/api/cloud/status')
          );
          if (active) {
            acceptCloudStatus(key, value);
            setState({ key, error: '', loading: false });
          }
        } catch (error) {
          if (active) setState({ key, error: errorMessage(error), loading: false });
        } finally {
          pending = false;
        }
      }
      refreshCurrent.current = refresh;
      void refresh();
      const subscription = AppState.addEventListener('change', (status) => {
        if (status === 'active') void refresh();
      });
      const interval = setInterval(() => void refresh(), 30_000);
      return () => {
        active = false;
        refreshCurrent.current = null;
        clearInterval(interval);
        subscription.remove();
      };
    }, [session, key]),
  );
  return {
    value: cached.key === key ? cached.value : null,
    loading: state.key === key && state.loading,
    error: state.key === key ? state.error : '',
    signedIn: Boolean(key) || qaEnabled,
    refresh: () => void refreshCurrent.current?.(),
  };
}

export default function CloudStorageUsage() {
  const status = useCloudStatus();
  return (
    <CloudStorageUsageView
      value={status.value}
      loading={status.loading}
      error={status.error}
      signedIn={status.signedIn}
      onRefresh={status.refresh}
      onSignIn={() => router.push('/account')}
    />
  );
}
/** @param {{value:import('../core/cloud-allowance.js').CloudAllowance|null,loading:boolean,error:string,signedIn:boolean,onRefresh:()=>void,onSignIn:()=>void}} props */
export function CloudStorageUsageView({ value, loading, error, signedIn, onRefresh, onSignIn }) {
  const paid = value?.plan === 'cloud_1gb' || value?.plan === 'cloud_10gb';
  return (
    <>
      <SectionHeader title="Cloud storage" />
      {value && <CloudStatusNotices value={value} />}
      <Group>
        <Row
          testID="cloud-storage-usage"
          title={value?.eligible ? cloudPlanTitle(value.plan) : 'Included cloud storage'}
          subtitle={
            !signedIn
              ? 'Sign in to activate your included lifetime storage'
              : loading && !value
                ? 'Checking cloud storage…'
                : value
                  ? value.eligible
                    ? cloudUsageLabel(value)
                    : 'Verify lifetime access to activate 100 MB'
                  : 'Cloud storage could not be checked'
          }
        />
      </Group>
      {error && (
        <Copy muted>
          {value ? 'Showing last known usage. ' : ''}
          {error}
        </Copy>
      )}
      <Copy variant="caption" muted>
        Lifetime includes 100 MB with no recurring charge; 1 GB and 10 GB plans are optional
        subscriptions. Files stay until deletion or replacement, except after a paid-storage lapse
        or a refunded Lifetime purchase.
      </Copy>
      <View style={styles.actions}>
        <CloudStorageAction
          testID="cloud-storage-upgrade"
          label={paid ? 'Manage cloud storage plan' : 'Upgrade cloud storage'}
          primary
          onPress={() => router.push('/cloud-storage')}
        />
        {signedIn && error && (
          <CloudStorageAction
            testID="cloud-storage-refresh"
            label={loading ? 'Checking…' : 'Retry cloud usage'}
            disabled={loading}
            onPress={onRefresh}
          />
        )}
        {!signedIn && (
          <CloudStorageAction
            testID="cloud-storage-sign-in"
            label="Sign in for cloud storage"
            onPress={onSignIn}
          />
        )}
      </View>
    </>
  );
}

/** Lapse deletion deadlines, store payment problems and over-capacity guidance.
 * @param {{value:import('../core/cloud-allowance.js').CloudAllowance}} props */
export function CloudStatusNotices({ value }) {
  const { colors } = useTheme();
  return (
    <>
      {cloudStatusNotices(value).map((notice) => {
        const urgent = notice.id === 'lapse';
        return (
          <View
            key={notice.id}
            testID={`cloud-storage-notice-${notice.id}`}
            accessibilityRole="alert"
            style={[
              styles.notice,
              {
                backgroundColor: colors.subtle,
                borderColor: urgent ? colors.danger : colors.border,
              },
            ]}
          >
            <Icon
              name={
                urgent
                  ? 'warning-outline'
                  : notice.id === 'over-limit'
                    ? 'alert-circle-outline'
                    : 'card-outline'
              }
              size={20}
              color={urgent ? colors.danger : colors.secondary}
            />
            <View style={styles.noticeText}>
              <Copy style={[styles.noticeTitle, urgent && { color: colors.danger }]}>
                {notice.title}
              </Copy>
              <Copy variant="caption" muted selectable>
                {notice.body}
              </Copy>
            </View>
          </View>
        );
      })}
    </>
  );
}

/** @param {{testID:string,label:string,onPress:()=>void,disabled?:boolean,primary?:boolean}} props */
function CloudStorageAction({ testID, label, onPress, disabled = false, primary = false }) {
  const { isDark } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}
    >
      <Copy
        muted={!primary}
        style={primary && [styles.primaryLabel, { color: isDark ? '#70AFFF' : '#0066CC' }]}
      >
        {label}
      </Copy>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 24 },
  action: { minHeight: 44, justifyContent: 'center' },
  primaryLabel: { fontWeight: '600' },
  notice: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  noticeText: { flex: 1, gap: 4 },
  noticeTitle: { fontWeight: '600' },
});
