import { errorJSON } from '../../../../../packages/support-chat/errors.js';
import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { usePhoneData } from '../../../../../client/DataPanel.js';
import { debugReport } from '../../../../../client/debug-log.js';
import { logs } from '../../../../../core/logs.js';
import { Screen, Copy, Group, Row, Notice } from '../../../../components/ui.js';
export default function AppLogDetail() {
  const { session } = usePhoneData();
  const { id } = useLocalSearchParams();
  const [entry, setEntry] = useState(
    /** @type {import('../../../../../core/debug-log.js').DebugEntry|null} */ (null),
  );
  const [error, setError] = useState('');
  useFocusEffect(
    useCallback(() => {
      try {
        const report = debugReport(session);
        const log = logs([], report.entries, report.generatedAt).find((item) => item.id === id);
        setEntry(log && 'entry' in log ? log.entry : null);
        setError('');
      } catch (failure) {
        setError(errorJSON(failure));
      }
    }, [session, id]),
  );
  return (
    <Screen testID="app-log-detail">
      <Stack.Screen options={{ title: 'App event' }} />
      {error ? (
        <Notice title="Log unavailable" body={errorJSON(error)} />
      ) : entry ? (
        <>
          <Copy variant="heading">
            {entry.operation} · {entry.outcome}
          </Copy>
          <Group>
            <Row title="Time" subtitle={new Date(entry.time).toLocaleString()} />
            <Row title="Operation" value={entry.operation} />
            <Row title="Outcome" value={entry.outcome} />
            <Row
              title="Duration"
              value={entry.durationMs === null ? 'Not recorded' : `${entry.durationMs} ms`}
            />
            <Row
              title="HTTP status"
              value={entry.httpStatus === null ? 'Not recorded' : String(entry.httpStatus)}
            />
          </Group>
          {entry.error !== undefined ? (
            <Notice title="Raw error message" body={errorJSON(entry.error)} />
          ) : null}
          <Copy selectable variant="caption">
            {JSON.stringify(entry, null, 2)}
          </Copy>
          <Copy muted>
            Raw error messages are always included. Structured records, credentials and URLs follow
            your log content settings. Events expire after seven days or when the 300-event limit is
            reached.
          </Copy>
        </>
      ) : (
        <Notice
          title="Log no longer available"
          body="This event may have expired. Return to Logs to view retained events."
        />
      )}
    </Screen>
  );
}
