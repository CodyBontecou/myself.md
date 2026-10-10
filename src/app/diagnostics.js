import { ErrorToast } from '../components/Toast.js';
import { errorJSON } from '../../packages/support-chat/errors.js';
import { useCallback, useState } from 'react';
import { Alert, Share } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { usePhoneData } from '../../client/DataPanel.js';
import {
  debugReport,
  debugSharing,
  setDebugSharing,
  debugContent,
  setDebugContent,
} from '../../client/debug-log.js';
import { api } from '../../client/session.js';
import { qaEnabled } from '../../client/qa-runtime.js';
import { Switch } from '../../client/Terminal.js';
import { Screen, Copy, Group, Row, Button, Notice } from '../components/ui.js';
export default function DiagnosticsScreen() {
  const { session } = usePhoneData();
  const [report, setReport] = useState(() => debugReport(session));
  const [content, setContent] = useState(() => debugContent(session));
  const [shared, setShared] = useState(() => debugSharing(session).shared);
  const [showJson, setShowJson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(() => {
    setReport(debugReport(session));
    setShared(debugSharing(session).shared);
    setContent(debugContent(session));
  }, [session]);
  useFocusEffect(refresh);
  async function changeSharing() {
    const next = !shared;
    setBusy(true);
    setError('');
    try {
      setDebugSharing(session, next);
      setShared(next);
      await api(session, `/api/phones/${session.deviceId}/diagnostics`, {
        method: 'POST',
        body: JSON.stringify(debugReport(session, true)),
      });
    } catch (failure) {
      setError(errorJSON(failure));
    } finally {
      setBusy(false);
      refresh();
    }
  }
  function confirmSharing() {
    if (shared) {
      void changeSharing();
      return;
    }
    Alert.alert(
      'Share debug logs with agents?',
      'Connected agents can read raw error messages and event metadata, plus any enabled record, credential and URL fields. Errors may themselves contain sensitive information. Agents may retain copies after you turn sharing off.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Allow', onPress: () => void changeSharing() },
      ],
    );
  }
  /** @param {keyof import('../../core/debug-log.js').DebugContent} field @param {boolean} enabled */
  async function changeContent(field, enabled) {
    setBusy(true);
    setError('');
    try {
      const next = { ...debugContent(session), [field]: enabled };
      setDebugContent(session, next);
      setContent(next);
      if (session.server)
        await api(session, `/api/phones/${session.deviceId}/diagnostics`, {
          method: 'POST',
          body: JSON.stringify(debugReport(session, true)),
        });
    } catch (failure) {
      setError(errorJSON(failure));
    } finally {
      setBusy(false);
      refresh();
    }
  }
  /** @param {keyof import('../../core/debug-log.js').DebugContent} field @param {boolean} enabled */
  function confirmContent(field, enabled) {
    if (!enabled) {
      void changeContent(field, false);
      return;
    }
    Alert.alert(
      `Include ${field === 'urls' ? 'URLs' : field} in logs?`,
      'Future logged events may retain this content on the phone. If log sharing is on, connected agents can receive it; record data still requires existing grants. Manual reports include enabled content. Turning this off removes retained structured fields, but cannot recall copies already shared. Credentials can grant access to your accounts.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Include', onPress: () => void changeContent(field, true) },
      ],
    );
  }
  async function shareReport() {
    setBusy(true);
    setError('');
    try {
      const snapshot = debugReport(session);
      setReport(snapshot);
      await Share.share({
        title: 'myself.md debug report',
        message: JSON.stringify(snapshot, null, 2),
      });
    } catch (failure) {
      setError(errorJSON(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen testID="diagnostics-screen">
      <Stack.Screen options={{ title: 'Log sharing' }} />
      <Copy muted>
        Share internal app logs with support or your agent. Browse all activity in the Logs tab.
      </Copy>
      <Notice
        title="What logs contain"
        body="Raw error messages are always included and may contain sensitive text. The switches below control structured records, credentials and URLs for future events; turning a switch off removes that field from retained logs. Up to 300 events are kept for seven days. Errors are limited to 16,000 characters, record attachments to 50 records / 8,000 characters, and URL/credential fields to 4,000 characters. Reports are size bounded. Native crashes are not captured."
      />
      <Group>
        {
          /** @type {Array<keyof import('../../core/debug-log.js').DebugContent>} */ ([
            'records',
            'credentials',
            'urls',
          ]).map((field) => (
            <Row
              key={field}
              title={
                field === 'urls'
                  ? 'Include URLs'
                  : field === 'credentials'
                    ? 'Include credentials'
                    : 'Include records'
              }
              subtitle="Off by default. Capture future events; disabling removes retained fields."
              trailing={
                <Switch
                  testID={`diagnostics-content-${field}`}
                  accessibilityLabel={field === 'urls' ? 'Include URLs' : `Include ${field}`}
                  value={content[field]}
                  disabled={busy || qaEnabled}
                  onValueChange={(enabled) => confirmContent(field, enabled)}
                />
              }
            />
          ))
        }
      </Group>
      <Group>
        <Row
          title="Share logs with agents"
          subtitle="Off by default. Requires a connected phone and an open app."
          trailing={
            <Switch
              testID="diagnostics-agent-sharing"
              accessibilityLabel="Share logs with agents"
              value={shared}
              disabled={busy || qaEnabled || !session.server}
              onValueChange={confirmSharing}
            />
          }
        />
        <Row title="Platform" value={report.platform} />
        <Row title="Report updated" subtitle={new Date(report.generatedAt).toLocaleString()} />
      </Group>
      <ErrorToast error={error} />
      <Button
        testID="diagnostics-share"
        label="Share debug report"
        disabled={busy || qaEnabled}
        busy={busy}
        onPress={() => void shareReport()}
      />
      <Button
        testID="diagnostics-json"
        label={showJson ? 'Hide JSON report' : 'View JSON report'}
        secondary
        onPress={() => {
          refresh();
          setShowJson(!showJson);
        }}
      />
      {showJson ? (
        <Copy testID="diagnostics-report" selectable variant="caption">
          {JSON.stringify(report, null, 2)}
        </Copy>
      ) : null}
      <Copy muted variant="caption">
        Sharing opens the system share sheet. Choose a recipient yourself and review the report
        before sending. Turning agent access off does not recall copies already shared.
      </Copy>
    </Screen>
  );
}
