import { showToast } from '../components/Toast.js';
import { errorMessage } from '../../packages/support-chat/errors.js';
import { Platform, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Copy, Row, SectionHeader, Notice } from '../components/ui.js';
import { useTheme } from '../lib/theme.js';
import { usePhoneData } from '../../client/DataPanel.js';
import { relatedHistory } from '../../client/history.js';
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
/** Full event metadata rendered inside its log row.
 * @param {{event:import('../../core/history.js').HistoryEvent}} props */
export default function HistoryDetail({ event }) {
  const { session } = usePhoneData();
  const [relatedId, setRelatedId] = useState('');
  const related = relatedHistory(session, session.server, event);
  const selected = Object.entries(event.profile.selection).filter(([, types]) => types.length);
  return (
    <View testID={`logs-details-history:${event.id}`} style={styles.section}>
      {event.error ? (
        <Notice
          title="This activity did not finish"
          body={errorMessage(event.error)}
          icon="alert-circle-outline"
        />
      ) : null}
      <View>
        <DetailField title="Route" subtitle={historyRoute(event)} />
        <DetailField title="Outcome" subtitle={historyOutcome(event)} />
        <DetailField title="Started" subtitle={new Date(event.startedAt).toLocaleString()} />
        <DetailField title="Last update" subtitle={new Date(event.updatedAt).toLocaleString()} />
        <DetailField
          title={event.kind === 'access' ? 'Requested by' : 'Triggered by'}
          subtitle={
            event.actor === 'agent'
              ? 'Connected MCP client'
              : event.actor === 'schedule'
                ? 'Automatic schedule'
                : 'You · Manual export'
          }
        />
        {event.client ? (
          <DetailField title="Authenticated client ID" subtitle={event.client} />
        ) : null}
        <DetailField
          title={event.kind === 'access' ? 'Read from' : 'Destination'}
          subtitle={event.destination}
        />
      </View>
      <View style={styles.section}>
        <SectionHeader title="Data scope" />
        <View>
          <DetailField title="Profile at the time" subtitle={event.profile.name} />
          <DetailField
            title="Data interval"
            subtitle={`${new Date(event.interval.start).toLocaleString(undefined, { timeZone: event.timezone })} – ${new Date(event.interval.end).toLocaleString(undefined, { timeZone: event.timezone })}`}
          />
          <DetailField title="Interval timezone" subtitle={event.timezone} />
          {event.request ? (
            <DetailField
              title="Requested data"
              subtitle={`${event.request.domain} · ${event.request.source}:${event.request.type}`}
            />
          ) : null}
          <DetailField
            title="Records"
            subtitle={
              event.recordCount === null
                ? 'Not confirmed'
                : `${event.recordCount.toLocaleString()}${event.kind === 'access' ? ' in this response page' : ''}`
            }
          />
          <DetailField title="Schema" subtitle={event.schema ?? 'myself.md.export.v1'} />
          <DetailField
            title="Format"
            subtitle={event.formats.map((f) => f.toUpperCase()).join(', ')}
          />
        </View>
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
          <View>
            {event.artifacts.map((a) => (
              <DetailField
                key={`${a.day}-${a.format}`}
                title={a.name}
                subtitle={`${a.recordCount.toLocaleString()} records · ${Math.max(1, Math.round(a.bytes / 1024)).toLocaleString()} KB${a.partial ? ' · Partial' : ''}`}
                onPress={a.uri ? () => void shareFile(a) : undefined}
              />
            ))}
          </View>
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
          <View>
            {related.map((item) => (
              <DetailField
                key={item.id}
                title={historyTitle(item)}
                subtitle={`${historyOutcome(item)} · ${new Date(item.startedAt).toLocaleString()}`}
                testID={`logs-related-${item.id}`}
                onPress={() => setRelatedId(relatedId === item.id ? '' : item.id)}
              />
            ))}
          </View>
          {related
            .filter((item) => item.id === relatedId)
            .map((item) => (
              <HistoryDetail key={item.id} event={item} />
            ))}
        </View>
      ) : null}
      <Copy selectable variant="caption" muted>
        Activity ID: {event.id}
      </Copy>
    </View>
  );
}
/** @param {import('react').ComponentProps<typeof Row>} props */
function DetailField(props) {
  const { colors } = useTheme();
  if (props.onPress) return <Row {...props} compact />;
  return (
    <View style={[styles.field, { borderColor: colors.border }]}>
      <Copy variant="caption" muted style={styles.fieldLabel}>
        {props.title}
      </Copy>
      <Copy selectable variant="caption" style={styles.value}>
        {props.subtitle ?? props.value}
      </Copy>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: 8 },
  types: { gap: 4, paddingHorizontal: 16, paddingVertical: 8 },
  label: { fontWeight: '500' },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { flex: 1 },
  value: { flex: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'right' },
});
