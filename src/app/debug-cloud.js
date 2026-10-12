import { useEffect, useState } from 'react';
import { Redirect, Stack, useRouter } from 'expo-router';
import { CloudStorageUsageView } from '../../client/CloudStorageUsage.js';
import {
  cloudDebugScenarios,
  cloudDebugFixture,
  cloudDebugUsage,
  cloudDebugAction,
} from '../../core/cloud-debug.js';
import { Screen, Button, Copy } from '../components/ui.js';

export default function CloudDebugScreen() {
  const router = useRouter();
  const [state, setState] = useState(() => cloudDebugFixture('free'));
  const [message, setMessage] = useState('Choose a simulated account.');
  /** @param {unknown} scenario */
  function select(scenario) {
    if (!__DEV__) throw new Error('Cloud QA requires a Debug app.');
    const next = cloudDebugFixture(scenario);
    setState(next);
    setMessage(`Selected ${String(scenario)} simulated account.`);
    return { synthetic: true, usage: cloudDebugUsage(next), outcome: 'completed' };
  }
  /** @param {unknown} action @param {unknown} [bytes] */
  function run(action, bytes) {
    if (!__DEV__) throw new Error('Cloud QA requires a Debug app.');
    const result = cloudDebugAction(state, action, bytes);
    setState(result.state);
    setMessage(result.message);
    return {
      synthetic: true,
      usage: cloudDebugUsage(result.state),
      outcome: result.outcome,
      message: result.message,
    };
  }
  useEffect(() => {
    if (!__DEV__) return undefined;
    // Argent debugger MCP uses the same operations as the visible controls.
    const target = /** @type {typeof globalThis & {myselfCloudDebug?:unknown}} */ (globalThis);
    target.myselfCloudDebug = {
      select,
      run,
      getState: () => ({ synthetic: true, usage: cloudDebugUsage(state), message }),
    };
    return () => {
      delete target.myselfCloudDebug;
    };
  });
  if (!__DEV__) return <Redirect href="/" />;
  const usage = cloudDebugUsage(state);
  return (
    <Screen testID="cloud-debug-screen">
      <Stack.Screen options={{ title: 'Cloud allowance QA' }} />
      <Button
        testID="cloud-debug-live"
        label="Real cloud integration QA"
        onPress={() => router.push('/debug-cloud-live')}
      />
      <Copy testID="cloud-debug-notice">
        Debug simulation only. No purchases, network uploads, account grants or personal files are
        changed.
      </Copy>
      <CloudStorageUsageView
        value={usage}
        loading={false}
        error=""
        signedIn={true}
        onRefresh={() => setMessage('Refreshed simulated cloud usage.')}
        onSignIn={() => {}}
      />
      <Copy testID="cloud-debug-result" selectable>
        {message}
      </Copy>
      <Button
        testID="cloud-debug-upload"
        label="Simulate upload · 1 MB"
        onPress={() => {
          run('upload', 1_000_000);
        }}
      />
      <Button
        testID="cloud-debug-delete"
        label="Delete last simulated file"
        secondary
        onPress={() => {
          run('delete');
        }}
      />
      {cloudDebugScenarios.map((scenario) => (
        <Button
          key={scenario}
          testID={`cloud-debug-${scenario}`}
          label={`Test ${scenario}`}
          secondary
          onPress={() => {
            select(scenario);
          }}
        />
      ))}
      <Copy testID="cloud-debug-state" selectable>
        {JSON.stringify({ synthetic: true, ...usage })}
      </Copy>
    </Screen>
  );
}
