import { errorJSON } from '../../packages/support-chat/errors.js';
import { useMemo, useState } from 'react';
import { Stack, router, useLocalSearchParams, usePathname } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import * as Clipboard from 'expo-clipboard';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, Empty, Icon, Button } from '../components/ui.js';
import { useTheme } from '../lib/theme.js';
import { useHistory } from '../../client/useHistory.js';
import {
  historyDay,
  historyTitle,
  historyOutcome,
  historyRoute,
} from '../../core/history-display.js';
import { logs, logJson, selectLogs, logsJson } from '../../core/logs.js';
/** @typedef {{kind:'heading',id:string,title:string}|{kind:'event',id:string,log:import('../../core/logs.js').Log,first:boolean,last:boolean}} Item */
export default function HistoryScreen() {
  const { colors, isDark } = useTheme(),
    insets = useSafeAreaInsets();
  const [raw, setRaw] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(/** @type {string[]} */ ([]));
  const [copyStatus, setCopyStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const {
    events,
    diagnostics,
    diagnosticsTime,
    diagnosticsError,
    loading,
    refreshing,
    error,
    hasMore,
    refresh,
    loadMore,
  } = useHistory(true);
  const [filter, setFilter] = useState(0);
  const [issues, setIssues] = useState(false);
  const { profileId } = useLocalSearchParams();
  const profileScoped = usePathname().startsWith('/profiles/history');
  const items = useMemo(() => {
    const filtered = logs(events, profileScoped ? [] : diagnostics, diagnosticsTime, {
      issues,
      category: /** @type {import('../../core/logs.js').LogCategory} */ (
        ['all', 'exports', 'agents', 'app'][filter]
      ),
      profileId: typeof profileId === 'string' ? profileId : undefined,
    });
    /** @type {Item[]} */ const result = [];
    filtered.forEach((log, index) => {
      const day = historyDay(new Date(log.time).toISOString()),
        previous = filtered[index - 1],
        next = filtered[index + 1];
      const first = !previous || historyDay(new Date(previous.time).toISOString()) !== day;
      if (first) result.push({ kind: 'heading', id: `day-${day}`, title: day });
      result.push({
        kind: 'event',
        id: log.id,
        log,
        first,
        last: !next || historyDay(new Date(next.time).toISOString()) !== day,
      });
    });
    return result;
  }, [events, diagnostics, diagnosticsTime, filter, issues, profileId, profileScoped]);
  const visibleLogs = items.flatMap((item) => (item.kind === 'event' ? [item.log] : []));
  const selection = selectLogs(visibleLogs, selected);
  /** @param {string} id */
  function toggleSelected(id) {
    setCopyStatus('');
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : previous.length < 350
          ? [...previous, id]
          : previous,
    );
  }
  async function copySelected() {
    if (copying || !selection.logs.length) return;
    setCopying(true);
    try {
      const copied = await Clipboard.setStringAsync(logsJson(selection.logs));
      if (!copied) throw new Error('Clipboard unavailable');
      setCopyStatus(
        `Copied ${selection.logs.length} ${selection.logs.length === 1 ? 'log' : 'logs'} as JSON lines.`,
      );
    } catch (failure) {
      setCopyStatus(errorJSON(failure));
    } finally {
      setCopying(false);
    }
  }
  return (
    <View
      testID="history-screen"
      collapsable={false}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: profileId ? 'Profile logs' : 'Logs' }} />
      <FlashList
        testID="history-list"
        data={items}
        extraData={{ selecting, selected }}
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.kind}
        maintainVisibleContentPosition={raw ? { autoscrollToTopThreshold: 0.1 } : {}}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.toolbar}>
              <View style={styles.streamState}>
                <View style={[styles.liveDot, { backgroundColor: colors.text }]} />
                <Copy variant="caption" style={styles.label}>
                  LIVE LOGS
                </Copy>
              </View>
              {!profileScoped ? (
                <Pressable
                  testID="logs-report"
                  accessibilityRole="button"
                  accessibilityLabel="Share & agent access"
                  onPress={() => router.push('/diagnostics')}
                  style={styles.toolbarAction}
                >
                  <Icon name="options-outline" size={18} />
                  <Copy variant="caption">Log settings</Copy>
                </Pressable>
              ) : null}
            </View>
            {profileId ? (
              <Copy variant="heading">
                {events.find((event) => event.profile.id === profileId)?.profile.name ??
                  'This profile'}
              </Copy>
            ) : null}
            {diagnosticsError && !profileScoped ? (
              <Copy accessibilityRole="alert">{diagnosticsError}</Copy>
            ) : null}
            {error ? (
              <View testID="history-error" accessibilityRole="alert">
                <Copy selectable>{errorJSON(error)}</Copy>
              </View>
            ) : null}
            <SegmentedControl
              testID="logs-format"
              accessibilityLabel="Log display"
              style={styles.segment}
              values={['Timeline', 'Raw']}
              selectedIndex={raw ? 1 : 0}
              onChange={(event) => setRaw(event.nativeEvent.selectedSegmentIndex === 1)}
              appearance={isDark ? 'dark' : 'light'}
            />
            <View style={styles.toolbar}>
              <Copy testID="logs-live" muted variant="caption">
                Local events live · agents every 2s
              </Copy>
              <Pressable
                testID="logs-issues"
                accessibilityRole="button"
                accessibilityLabel={issues ? 'Show all outcomes' : 'Show issues only'}
                accessibilityState={{ selected: issues }}
                onPress={() => {
                  setIssues(!issues);
                  setCopyStatus('');
                }}
                style={[
                  styles.issueFilter,
                  {
                    borderColor: issues ? colors.danger : colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <Icon
                  name="alert-circle-outline"
                  size={16}
                  color={issues ? colors.danger : colors.secondary}
                />
                <Copy
                  variant="caption"
                  style={{ color: issues ? colors.danger : colors.secondary }}
                >
                  {issues ? 'Issues only' : 'All outcomes'}
                </Copy>
              </Pressable>
            </View>
            <SegmentedControl
              style={styles.segment}
              values={
                profileScoped ? ['All', 'Exports', 'Agents'] : ['All', 'Exports', 'Agents', 'App']
              }
              selectedIndex={filter}
              onChange={(event) => {
                setFilter(event.nativeEvent.selectedSegmentIndex);
                setCopyStatus('');
              }}
              appearance={isDark ? 'dark' : 'light'}
              testID="history-filter"
              accessibilityLabel="Log type"
            />
            <View style={styles.toolbar}>
              <Pressable
                testID="logs-select"
                accessibilityRole="button"
                onPress={() => {
                  setSelecting(!selecting);
                  setSelected([]);
                  setCopyStatus('');
                }}
                style={styles.toolbarAction}
              >
                <Icon name={selecting ? 'close-outline' : 'checkbox-outline'} size={18} />
                <Copy variant="caption">{selecting ? 'Cancel selection' : 'Select logs'}</Copy>
              </Pressable>
              {selecting ? (
                <Pressable
                  testID="logs-select-all"
                  accessibilityRole="button"
                  onPress={() => {
                    setSelected(visibleLogs.slice(0, 350).map((log) => log.id));
                    setCopyStatus('');
                  }}
                  style={styles.toolbarAction}
                >
                  <Copy variant="caption">
                    {visibleLogs.length > 350 ? 'Select first 350' : 'Select all loaded'}
                  </Copy>
                </Pressable>
              ) : null}
            </View>
            <View style={[styles.tableHeader, { borderColor: colors.border }]}>
              <Copy variant="caption" muted style={styles.label}>
                EVENT STREAM
              </Copy>
              <Copy variant="caption" muted style={styles.time}>
                {items.filter((item) => item.kind === 'event').length} loaded · newest first
              </Copy>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View
              testID="history-loading"
              accessibilityState={{ busy: true }}
              style={styles.loading}
            >
              <Copy muted>Loading logs…</Copy>
            </View>
          ) : error ? (
            <Empty
              testID="history-empty"
              icon="alert-circle-outline"
              title="Logs could not be loaded"
              body="Saved entries have been retained. Pull down to retry."
            />
          ) : (
            <Empty
              testID="history-empty"
              icon="time-outline"
              title={
                issues
                  ? 'No issues recorded'
                  : filter === 2
                    ? 'No agent access yet'
                    : filter === 1
                      ? 'No exports yet'
                      : filter === 3
                        ? 'No app logs yet'
                        : 'Your logs start here'
              }
              body={
                filter === 2
                  ? 'Live phone queries and cloud reads appear here when a connected agent requests data.'
                  : filter === 3
                    ? 'App operations and outcomes appear here as you use the app.'
                    : 'App activity, exports and agent access appear here as you use the app.'
              }
              action={filter === 2 ? 'Manage connection' : 'Profiles & exports'}
              onPress={() => (filter === 2 ? router.push('/pair') : router.navigate('/profiles'))}
            />
          )
        }
        ListFooterComponent={
          <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
            <Copy variant="caption" muted>
              {hasMore
                ? 'Scroll for older activity'
                : 'App events: seven days · up to 300. Included content follows your log settings.'}
            </Copy>
          </View>
        }
        refreshing={refreshing && !loading}
        onRefresh={() => void refresh()}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) =>
          item.kind === 'heading' ? (
            <View style={styles.day}>
              <Copy variant="caption" muted>
                {item.title}
              </Copy>
            </View>
          ) : raw ? (
            <View
              style={[styles.raw, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {selecting ? (
                <LogSelection
                  selected={selected.includes(item.id)}
                  onPress={() => toggleSelected(item.id)}
                  id={item.id}
                />
              ) : null}
              <Copy testID={`raw-${item.id}`} selectable variant="caption" style={styles.rawText}>
                {logJson(item.log, true)}
              </Copy>
            </View>
          ) : (
            <EventRow
              item={item}
              profileScoped={profileScoped}
              selecting={selecting}
              selected={selected.includes(item.id)}
              onSelect={() => toggleSelected(item.id)}
            />
          )
        }
      />
      {selecting ? (
        <View
          style={[
            styles.selectionBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <Copy variant="caption" muted>
            {selection.logs.length} selected · JSON lines
            {selection.unavailableIds.length
              ? ` · ${selection.unavailableIds.length} hidden or expired`
              : ''}
          </Copy>
          {copyStatus ? (
            <Copy testID="logs-copy-status" accessibilityRole="alert" variant="caption">
              {copyStatus}
            </Copy>
          ) : null}
          <Button
            testID="logs-copy"
            label={
              selection.logs.length
                ? `Copy ${selection.logs.length} ${selection.logs.length === 1 ? 'log' : 'logs'}`
                : 'Copy logs'
            }
            icon="copy-outline"
            disabled={!selection.logs.length || copying}
            busy={copying}
            onPress={() => void copySelected()}
          />
        </View>
      ) : null}
    </View>
  );
}
/** @param {{selected:boolean,onPress:()=>void,id:string}} props */
function LogSelection({ selected, onPress, id }) {
  return (
    <Pressable
      testID={`logs-check-${id}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel="Select log"
      onPress={onPress}
      style={styles.toolbarAction}
    >
      <Icon name={selected ? 'checkbox' : 'square-outline'} size={20} />
      <Copy variant="caption">{selected ? 'Selected' : 'Select log'}</Copy>
    </Pressable>
  );
}
/** @param {{item:Extract<Item,{kind:'event'}>,profileScoped:boolean,selecting:boolean,selected:boolean,onSelect:()=>void}} props */
function EventRow({ item, profileScoped, selecting, selected, onSelect }) {
  const { colors } = useTheme();
  const log = item.log;
  const entry = 'entry' in log ? log.entry : null;
  const event = 'event' in log ? log.event : null;
  const outcome = entry?.outcome ?? event?.status ?? '';
  const severity = ['failed', 'interrupted'].includes(outcome)
    ? 'ERROR'
    : ['partial', 'cancelled', 'expired'].includes(outcome)
      ? 'WARN'
      : 'INFO';
  const color = severity === 'ERROR' ? colors.danger : colors.secondary;
  const title = event ? historyTitle(event) : (entry?.operation ?? '');
  const message =
    entry?.error || event?.error
      ? errorJSON(entry?.error ?? event?.error)
      : event
        ? historyRoute(event)
        : (entry?.url ?? 'Internal app event');
  return (
    <Pressable
      testID={event ? `history-event-${event.id}` : `log-${item.id}`}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : {}}
      accessibilityLabel={[
        title,
        message,
        event ? historyOutcome(event) : outcome,
        new Date(log.time).toLocaleString(),
      ].join(', ')}
      onPress={() =>
        selecting
          ? onSelect()
          : event
            ? router.push({
                pathname: profileScoped ? '/profiles/history/[id]' : '/history/[id]',
                params: { id: event.id },
              })
            : router.push({ pathname: '/history/debug/[id]', params: { id: item.id } })
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.subtle : colors.surface,
          borderBottomColor: colors.border,
          borderLeftColor: color,
        },
      ]}
    >
      <View style={styles.metadata}>
        <View style={styles.streamState}>
          <Copy variant="caption" style={[styles.mono, { color }]}>
            {severity}
          </Copy>
          <Copy variant="caption" muted>
            {log.category === 'app' ? 'App' : log.category === 'agents' ? 'Agent' : 'Export'}
          </Copy>
        </View>
        <Copy variant="caption" muted style={[styles.mono, styles.time]}>
          {new Date(log.time).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })}
        </Copy>
      </View>
      <View style={styles.eventTitle}>
        <Copy style={styles.title}>{title}</Copy>
        <Icon
          name={selecting ? (selected ? 'checkbox' : 'square-outline') : 'chevron-forward'}
          size={selecting ? 20 : 14}
          color={colors.secondary}
        />
      </View>
      <Copy
        variant="caption"
        style={{ color: entry?.error || event?.error ? colors.danger : colors.secondary }}
      >
        {message.length > 160 ? `${message.slice(0, 160)}…` : message}
      </Copy>
      <Copy variant="caption" muted style={styles.mono}>
        {outcome}
        {entry && entry.durationMs !== null ? ` · ${entry.durationMs}ms` : ''}
        {entry && entry.httpStatus !== null ? ` · HTTP ${entry.httpStatus}` : ''}
        {event && event.recordCount !== null
          ? ` · ${event.recordCount.toLocaleString()} records`
          : ''}
      </Copy>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  selectionBar: { padding: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  header: { gap: 12, paddingBottom: 4 },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toolbarAction: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  streamState: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontWeight: '600', letterSpacing: 1, fontSize: 11 },
  issueFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    borderCurve: 'continuous',
  },
  tableHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segment: { height: 44 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  footer: { paddingTop: 24 },
  day: { paddingTop: 16, paddingBottom: 8 },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 2,
  },
  eventTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontWeight: '500', flex: 1 },
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  time: { fontVariant: ['tabular-nums'] },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  raw: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rawText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
