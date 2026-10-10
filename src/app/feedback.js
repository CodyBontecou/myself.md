import { ErrorToast } from '../components/Toast.js';
import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { errorJSON } from '../../packages/support-chat/errors.js';
import {
  refreshReportUpdates,
  reportUpdatesSnapshot,
  setReportNotifications,
} from '../../client/feedback-updates.js';
import { Switch } from '../../client/Terminal.js';
import { Screen, Copy, Group, Row, Button } from '../components/ui.js';

export default function FeedbackScreen() {
  const [state, setState] = useState(reportUpdatesSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(() => {
    void refreshReportUpdates()
      .then(setState)
      .catch((failure) => setError(errorJSON(failure)));
  }, []);
  useFocusEffect(refresh);
  async function change(/** @type {boolean} */ enabled) {
    setBusy(true);
    setError('');
    try {
      await setReportNotifications(enabled);
      setState(reportUpdatesSnapshot());
    } catch (failure) {
      setError(errorJSON(failure));
    } finally {
      setBusy(false);
    }
  }
  function confirm(/** @type {boolean} */ enabled) {
    if (!enabled) {
      void change(false);
      return;
    }
    Alert.alert(
      'Receive bug report updates?',
      'Get a notification when your report has a pull request, when its fix is merged into main, and when a version containing it is available on the App Store.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Enable', onPress: () => void change(true) },
      ],
    );
  }
  return (
    <Screen testID="feedback-updates-screen">
      <Copy muted>
        Follow bug reports submitted from this phone. Private screenshots and report text stay out
        of notifications.
      </Copy>
      <Group>
        <Row
          title="Bug report notifications"
          subtitle="Pull request, merged fix, and App Store release"
          trailing={
            <Switch
              testID="feedback-notifications"
              accessibilityLabel="Bug report notifications"
              value={state.enabled}
              disabled={busy}
              onValueChange={confirm}
            />
          }
        />
      </Group>
      <ErrorToast error={error} />
      {state.reports.length === 0 ? (
        <Copy muted>
          No tracked reports yet. Older reports cannot be linked to this phone automatically.
        </Copy>
      ) : null}
      {state.reports.map((report) => (
        <Group key={report.id}>
          <Row
            title={`Report · ${report.id.slice(0, 8)}`}
            subtitle={new Date(report.created).toLocaleString()}
          />
          {report.events.length === 0 ? (
            <Copy muted>Submitted · waiting for a pull request</Copy>
          ) : null}
          {report.events.map((event) => (
            <Row
              key={event.id}
              title={
                event.kind === 'pr'
                  ? 'Pull request created'
                  : event.kind === 'merged'
                    ? 'Merged into main'
                    : `Released · ${event.version}`
              }
              subtitle={new Date(event.at).toLocaleString()}
              onPress={() =>
                void Linking.openURL(event.url).catch((failure) => setError(errorJSON(failure)))
              }
            />
          ))}
        </Group>
      ))}
      <Button label="Refresh report updates" secondary disabled={busy} onPress={refresh} />
      {state.cursor ? (
        <Copy muted>
          This view shows up to 50 reports. Other reports remain tracked and can still send
          notifications.
        </Copy>
      ) : null}
    </Screen>
  );
}
