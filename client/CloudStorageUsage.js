import { useCallback, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../src/lib/theme.js';
import { publicCloudPlans } from '../core/public-site.js';
import { router, useFocusEffect } from 'expo-router';
import { usePhone } from './PhoneProvider.js';
import { api } from './session.js';
import { qaEnabled, qaSnapshot } from './qa-runtime.js';
import { cloudAllowance, cloudUsageLabel } from '../core/cloud-allowance.js';
import { errorMessage } from '../packages/support-chat/errors.js';
import { Copy, Row, Group, SectionHeader } from '../src/components/ui.js';

export default function CloudStorageUsage() {
  const { session } = usePhone();
  const key = session && !session.requiresSignIn ? `${session.server}|${session.owner}` : '';
  const [state, setState] = useState(
    /** @type {{key:string,value:import('../core/cloud-allowance.js').CloudAllowance|null,error:string,loading:boolean}} */ ({
      key: '',
      value: null,
      error: '',
      loading: false,
    }),
  );
  const refreshCurrent = useRef(/** @type {(()=>Promise<void>)|null} */ (null));
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let pending = false;
      async function refresh() {
        if (!active || pending || AppState.currentState !== 'active') return;
        if (qaEnabled) {
          const scenario = qaSnapshot().scenario;
          setState({
            key,
            value:
              scenario === 'loading'
                ? null
                : cloudAllowance(true, scenario === 'empty' ? 0 : 42_000_000),
            error: '',
            loading: scenario === 'loading',
          });
          return;
        }
        if (!session || !key) return;
        pending = true;
        setState((previous) => ({
          key,
          value: previous.key === key ? previous.value : null,
          error: '',
          loading: true,
        }));
        try {
          const value = await api(session, '/api/cloud/status');
          if (active)
            setState({
              key,
              value: /** @type {import('../core/cloud-allowance.js').CloudAllowance} */ (value),
              error: '',
              loading: false,
            });
        } catch (error) {
          if (active)
            setState((previous) => ({ ...previous, error: errorMessage(error), loading: false }));
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
  const value = state.key === key ? state.value : null;
  const signedIn = Boolean(key) || qaEnabled;
  return (
    <CloudStorageUsageView
      value={value}
      loading={state.key === key && state.loading}
      error={state.key === key ? state.error : ''}
      signedIn={signedIn}
      onRefresh={() => void refreshCurrent.current?.()}
      onSignIn={() => router.push('/account')}
    />
  );
}
/** @param {{value:import('../core/cloud-allowance.js').CloudAllowance|null,loading:boolean,error:string,signedIn:boolean,onRefresh:()=>void,onSignIn:()=>void}} props */
export function CloudStorageUsageView({ value, loading, error, signedIn, onRefresh, onSignIn }) {
  return (
    <>
      <SectionHeader title="Cloud storage" />
      <Group>
        <Row
          testID="cloud-storage-usage"
          title={value?.eligible ? '100 MB included with Lifetime' : 'Included cloud storage'}
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
      {value?.overLimit && (
        <Copy muted>
          Storage allowance reached. Download or delete older files before uploading more.
        </Copy>
      )}
      {error && (
        <Copy muted>
          {value ? 'Showing last known usage. ' : ''}
          {error}
        </Copy>
      )}
      <Copy variant="caption" muted>
        Cloud files stay until you delete them or replace them. The included allowance has no
        recurring charge.
      </Copy>
      <View style={styles.actions}>
        <CloudStorageAction
          testID="cloud-storage-upgrade"
          label="Upgrade cloud storage"
          primary
          onPress={() =>
            Alert.alert(
              'Cloud storage upgrades · Coming soon',
              publicCloudPlans
                .slice(1)
                .map((plan) => `${plan.capacity} · ${plan.price} ${plan.billing}`)
                .join('\n\n') +
                '\n\nPlanned US prices. Larger plans are not available to purchase yet. Your current storage allowance stays unchanged.',
              [{ text: 'Done' }],
            )
          }
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
});
