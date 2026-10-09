import { Redirect, router, Stack } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Button, Copy, Screen } from '../components/ui.js';
import { qaEnabled, qaSnapshot, resetQa, subscribeQa } from '../../client/qa-runtime.js';
import { qaScenarios } from '../../client/qa-fixtures.js';

export default function QaScreen() {
  const fixture = useSyncExternalStore(subscribeQa, qaSnapshot);
  if (!qaEnabled) return <Redirect href="/" />;
  return (
    <Screen testID="qa-screen" compact>
      <Stack.Screen options={{ title: 'QA fixtures' }} />
      <Copy>
        Development fixtures use synthetic state. Resets never touch account data, source
        permissions, recording, purchases, or scheduled exports.
      </Copy>
      <Copy testID="qa-scenario">Scenario: {fixture.scenario}</Copy>
      <Button
        testID="qa-reset-onboarding"
        label="Reset onboarding"
        onPress={() => {
          resetQa('populated', false);
          router.replace('/');
        }}
      />
      {qaScenarios.map((scenario) => (
        <Button
          key={scenario}
          testID={`qa-reset-${scenario}`}
          label={`Reset ${scenario}`}
          onPress={() => {
            resetQa(scenario);
            router.replace('/');
          }}
        />
      ))}
      <Copy selectable testID="qa-state">
        {JSON.stringify({
          profileCount: fixture.profiles.profiles.length,
          historyCount: fixture.events.length,
          permissions: fixture.permissions,
          agentGrants: false,
          recording: false,
        })}
      </Copy>
    </Screen>
  );
}
