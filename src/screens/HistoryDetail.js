import { showToast } from '../components/Toast.js';
import { errorMessage } from '../../packages/support-chat/errors.js';
import { StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams, usePathname } from 'expo-router';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Copy, Empty, Group, Row, Screen, SectionHeader, Notice } from '../components/ui.js';
import { usePhoneData } from '../../client/DataPanel.js';
import { useHistory } from '../../client/useHistory.js';
import { historyEntry, relatedHistory } from '../../client/history.js';
import { historyTitle, historyOutcome, historyRoute } from '../../core/history-display.js';
/** @param {import('../../core/history.js').HistoryArtifact} artifact */
async function shareFile(artifact) {
  try {
    if (!artifact.uri) return;
    const file = new File(artifact.uri);
    if (!file.exists || file.md5 !== artifact.checksum)
      throw new Error(
        'This file was removed or replaced by a newer export. Its history is still preserved.',
      );
    if (!(await Sharing.isAvailableAsync()))
      throw new Error('File sharing is unavailable on this phone.');
    await Sharing.shareAsync(file.uri);
  } catch (error) {
    showToast({ message: errorMessage(error), kind: 'error' });
  }
}
export default function HistoryDetail() {
  const profileScoped = usePathname().startsWith('/profiles/history');
  const { id } = useLocalSearchParams(),
    { session } = usePhoneData();
  const { events, loading } = useHistory();
  const event =
    events.find((e) => e.id === id) ??
    historyEntry(session, session.server, typeof id === 'string' ? id : '');
  if (!event)
    return (
      <Screen testID="history-detail-screen">
        <Stack.Screen options={{ title: 'Activity details' }} />
        <Empty
          title={loading ? 'Loading activity…' : 'Activity unavailable'}
          body="This entry is not in this account’s saved history."
          icon="time-outline"
        />
      </Screen>
    );
  const related = relatedHistory(session, session.server, event);
  const selected = Object.entries(event.profile.selection).filter(([, types]) => types.length);
  return (
    <Screen testID="history-detail-screen">
      <Stack.Screen
        options={{ title: event.kind === 'access' ? 'Agent access' : 'Export details' }}
      />
      <View style={styles.heading}>
        <Copy variant="title">{historyTitle(event)}</Copy>
        <Copy muted>{historyRoute(event)}</Copy>
      </View>
      <Group>
        <Row title="Outcome" subtitle={historyOutcome(event)} />
        <Row title="Started" subtitle={new Date(event.startedAt).toLocaleString()} />
        <Row title="Last update" subtitle={new Date(event.updatedAt).toLocaleString()} />
        <Row
          title={event.kind === 'access' ? 'Requested by' : 'Triggered by'}
          subtitle={
            event.actor === 'agent'
              ? 'Connected MCP client'
              : event.actor === 'schedule'
                ? 'Automatic schedule'
                : 'You · Manual export'
          }
        />
        {event.client ? <Row title="Authenticated client ID" subtitle={event.client} /> : null}
        <Row
          title={event.kind === 'access' ? 'Read from' : 'Destination'}
          subtitle={event.destination}
        />
      </Group>
      {event.error ? (
        <Notice
          title="This activity did not finish"
          body={errorMessage(event.error)}
          icon="alert-circle-outline"
        />
      ) : null}
      <View style={styles.section}>
        <SectionHeader title="Data scope" />
        <Group>
          <Row title="Profile at the time" subtitle={event.profile.name} />
          <Row
            title="Data interval"
            subtitle={`${new Date(event.interval.start).toLocaleString(undefined, { timeZone: event.timezone })} – ${new Date(event.interval.end).toLocaleString(undefined, { timeZone: event.timezone })}`}
          />
          <Row title="Interval timezone" subtitle={event.timezone} />
          {event.request ? (
            <Row
              title="Requested data"
              subtitle={`${event.request.domain} · ${event.request.source}:${event.request.type}`}
            />
          ) : null}
          <Row
            title="Records"
            subtitle={
              event.recordCount === null
                ? 'Not confirmed'
                : `${event.recordCount.toLocaleString()}${event.kind === 'access' ? ' in this response page' : ''}`
            }
          />
          <Row title="Schema" subtitle={event.schema ?? 'myself.md.export.v1'} />
          <Row title="Format" subtitle={event.formats.map((f) => f.toUpperCase()).join(', ')} />
        </Group>
        {selected.map(([domain, types]) => (
          <View key={domain} style={styles.types}>
            <Copy style={styles.label}>
              {domain === 'time' ? 'Screen time' : domain.charAt(0).toUpperCase() + domain.slice(1)}
            </Copy>
            <Copy selectable variant="caption" muted>
              {types.join(', ')}
            </Copy>
          </View>
        ))}
      </View>
      {event.artifacts.length ? (
        <View style={styles.section}>
          <SectionHeader title="Files" count={event.artifacts.length} />
          <Group>
            {event.artifacts.map((a) => (
              <Row
                key={`${a.day}-${a.format}`}
                title={a.name}
                subtitle={`${a.recordCount.toLocaleString()} records · ${Math.max(1, Math.round(a.bytes / 1024)).toLocaleString()} KB${a.partial ? ' · Partial' : ''}`}
                onPress={a.uri ? () => void shareFile(a) : undefined}
              />
            ))}
          </Group>
          <Copy variant="caption" muted>
            {event.target === 'local'
              ? 'Tap a file to share it. Files may have been removed or replaced; the original file is verified before sharing.'
              : event.target === 'cloud'
                ? 'Cloud files are retained for 30 days. This history entry remains after files expire or are replaced.'
                : 'The destination acknowledged these files. History cannot confirm their current availability there.'}
          </Copy>
        </View>
      ) : null}
      {event.warnings.length ? (
        <Notice title="Coverage & limitations" body={event.warnings.join('\n')} />
      ) : null}
      {event.kind === 'access' ? (
        <Copy variant="caption" muted>
          Each entry represents one requested page. A returned response confirms data was sent
          through MCP; it does not identify a specific model or prove how it used the data.
        </Copy>
      ) : null}
      {related.length ? (
        <View style={styles.section}>
          <SectionHeader title="Related activity" />
          <Group>
            {related.map((item) => (
              <Row
                key={item.id}
                title={historyTitle(item)}
                subtitle={`${historyOutcome(item)} · ${new Date(item.startedAt).toLocaleString()}`}
                onPress={() =>
                  router.push({
                    pathname: profileScoped ? '/profiles/history/[id]' : '/history/[id]',
                    params: { id: item.id },
                  })
                }
              />
            ))}
          </Group>
        </View>
      ) : null}
      <Copy selectable variant="caption" muted>
        Activity ID: {event.id}
      </Copy>
    </Screen>
  );
}
const styles = StyleSheet.create({
  heading: { gap: 8 },
  section: { gap: 8 },
  types: { gap: 4, paddingHorizontal: 16, paddingVertical: 8 },
  label: { fontWeight: '500' },
});
