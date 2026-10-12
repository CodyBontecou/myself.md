import { useEffect, useState, useRef } from 'react';
import { Redirect, Stack } from 'expo-router';
import { TextInput, StyleSheet, Platform } from 'react-native';
import { CloudStorageUsageView } from '../../client/CloudStorageUsage.js';
import {
  liveCloudState,
  connectLiveCloud,
  refreshLiveCloud,
  uploadLiveCloud,
  fillLiveCloud,
  deleteLiveCloud,
  verifyLiveCloud,
  cleanupLiveCloud,
  disconnectLiveCloud,
  connectSandboxPurchases,
  buySandboxLifetime,
  restoreSandboxLifetime,
} from '../../client/live-cloud-qa.js';
import { useTheme } from '../lib/theme.js';
import { Screen, Copy, Button } from '../components/ui.js';
export default function LiveCloudQaScreen() {
  const { colors } = useTheme();
  const [value, setValue] = useState(liveCloudState);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [result, setResult] = useState(
    'Connect an operator-created isolated Lifetime test account.',
  );
  /** @param {()=>Promise<unknown>} action */
  async function run(action) {
    if (running.current) throw new Error('Cloud QA operation already running.');
    running.current = true;
    setBusy(true);
    try {
      const output = await action();
      setValue(liveCloudState());
      const summary =
        output && typeof output === 'object' ? /** @type {Record<string,unknown>} */ (output) : {};
      setResult(
        JSON.stringify({
          outcome: summary.outcome ?? 'completed',
          files: Array.isArray(summary.files) ? summary.files.length : summary.files,
          bytes: summary.bytes,
          encryptedR2: summary.encryptedR2,
          integrity: summary.integrity,
        }),
      );
      return output;
    } catch (error) {
      setValue(liveCloudState());
      setResult(error instanceof Error ? error.message : 'Cloud QA failed.');
      return {
        outcome: 'failed',
        error: error instanceof Error ? error.message : 'Cloud QA failed.',
      };
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!__DEV__) return undefined;
    const target = /** @type {typeof globalThis & {myselfLiveCloudQa?:unknown}} */ (globalThis);
    target.myselfLiveCloudQa = {
      getState: liveCloudState,
      connect: (/** @type {unknown} */ secret) => run(() => connectLiveCloud(secret)),
      upload: (/** @type {unknown} */ bytes) => run(() => uploadLiveCloud(bytes)),
      fill: () => run(() => fillLiveCloud(setValue)),
      refresh: () => run(refreshLiveCloud),
      deleteLast: () => run(deleteLiveCloud),
      verify: () => run(verifyLiveCloud),
      cleanup: () => run(cleanupLiveCloud),
      purchase: () => run(buySandboxLifetime),
      restore: () => run(restoreSandboxLifetime),
    };
    return () => {
      delete target.myselfLiveCloudQa;
    };
  });
  useEffect(() => () => disconnectLiveCloud(), []);
  useEffect(() => {
    if (!value.account || !value.purchaseRequired) return undefined;
    return connectSandboxPurchases(() => {
      setValue(liveCloudState());
      setResult('Test purchase verified by the store; native transaction finished.');
    });
  }, [value.account, value.purchaseRequired]);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen testID="cloud-live-screen">
      <Stack.Screen options={{ title: 'Live cloud QA' }} />
      <Copy>
        Real network uploads and encrypted R2 storage. Generated files only, in a separate test
        account and bucket. Your normal phone session and profiles stay unchanged.
      </Copy>
      {!value.account && (
        <>
          <TextInput
            testID="cloud-live-code"
            accessibilityLabel="Cloud QA access code"
            placeholder="Cloud QA access code"
            placeholderTextColor={colors.secondary}
            style={[styles.code, { color: colors.text, backgroundColor: colors.surface }]}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
          />
          <Button
            testID="cloud-live-connect"
            label="Connect Lifetime test account"
            disabled={busy}
            onPress={() => {
              void run(async () => {
                const state = await connectLiveCloud(code);
                setCode('');
                return state;
              });
            }}
          />
        </>
      )}
      <CloudStorageUsageView
        value={value.usage}
        loading={busy}
        error=""
        signedIn={Boolean(value.account)}
        onRefresh={() => void run(refreshLiveCloud)}
        onSignIn={() => {}}
      />
      <Copy testID="cloud-live-result" selectable>
        {result}
      </Copy>
      <Copy testID="cloud-live-state" selectable>
        {JSON.stringify({
          realCloud: true,
          isolated: true,
          account: value.account,
          purchaseRequired: value.purchaseRequired,
          transactionId: value.transactionId,
          ...value.usage,
          fileCount: value.files.length,
        })}
      </Copy>
      {value.purchaseRequired && (
        <>
          <Button
            testID="cloud-live-purchase"
            label={
              Platform.OS === 'ios'
                ? 'Buy Lifetime in Apple sandbox'
                : 'Buy Lifetime in Google Play test mode'
            }
            disabled={busy}
            onPress={() => void run(buySandboxLifetime)}
          />
          <Button
            testID="cloud-live-restore"
            label="Restore sandbox Lifetime"
            disabled={busy}
            onPress={() => void run(restoreSandboxLifetime)}
          />
        </>
      )}
      <Button
        testID="cloud-live-upload"
        label="Upload real 1 MB test file"
        disabled={busy || !value.account}
        onPress={() => void run(() => uploadLiveCloud(1_000_000))}
      />
      <Button
        testID="cloud-live-upload-two"
        label="Upload real 2 MB test file"
        disabled={busy || !value.account}
        onPress={() => void run(() => uploadLiveCloud(2_000_000))}
      />
      <Button
        testID="cloud-live-fill"
        label="Fill test account to 99 MB"
        disabled={busy || !value.account}
        onPress={() => void run(() => fillLiveCloud(setValue))}
      />
      <Button
        testID="cloud-live-delete"
        label="Delete newest test file"
        secondary
        disabled={busy || !value.account}
        onPress={() => void run(deleteLiveCloud)}
      />
      <Button
        testID="cloud-live-verify"
        label="Verify encrypted R2 files"
        secondary
        disabled={busy || !value.account}
        onPress={() => void run(verifyLiveCloud)}
      />
      <Button
        testID="cloud-live-cleanup"
        label="Delete all cloud QA files"
        secondary
        disabled={busy || !value.account}
        onPress={() => void run(cleanupLiveCloud)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ code: { minHeight: 48, padding: 12, borderRadius: 12 } });
