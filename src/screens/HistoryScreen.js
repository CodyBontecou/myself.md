import { ErrorToast, showToast } from '../components/Toast.js';
import { errorMessage } from '../../packages/support-chat/errors.js';
import { useMemo, useState } from 'react';
import { Stack, router, useLocalSearchParams, usePathname } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import * as Clipboard from 'expo-clipboard';
import Storage from 'expo-sqlite/kv-store';
import { qaEnabled, qaBannerEnabled } from '../../client/qa-runtime.js';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, Empty, Icon, Button } from '../components/ui.js';
import { useTheme } from '../lib/theme.js';
import HistoryDetail from './HistoryDetail.js';
import { useHistory } from '../../client/useHistory.js';
import {
  historyDay,
  historyTitle,
  historyOutcome,
  historyRoute,
} from '../../core/history-display.js';
import { logs, logJson, selectLogs, logsJson } from '../../core/logs.js';
const layoutKey = qaEnabled ? 'qa-log-card-layout-v1' : 'log-card-layout-v1';
function savedLayout() {
  try {
    const value = Storage.getItemSync(layoutKey);
    return value === '0' ? 0 : value === '2' ? 2 : 1;
  } catch {
    return 1;
  }
}
/** @type {{label:string,icon:import('../components/ui.js').IconName}[]} */
const layoutOptions = [
  { label: 'Compact', icon: 'reorder-two-outline' },
  { label: 'Standard', icon: 'list-outline' },
  { label: 'Large', icon: 'albums-outline' },
];
/** @type {{label:string,icon:import('../components/ui.js').IconName}[]} */
const categories = [
  { label: 'All', icon: 'layers-outline' },
  { label: 'Exports', icon: 'arrow-up-outline' },
  { label: 'Agents', icon: 'hardware-chip-outline' },
  { label: 'App', icon: 'phone-portrait-outline' },
];
/** @typedef {{kind:'heading',id:string,title:string}|{kind:'event',id:string,index:number,log:import('../../core/logs.js').Log}} Item */
export default function HistoryScreen() {
  const { colors, isDark } = useTheme(),
    insets = useSafeAreaInsets();
  const [raw, setRaw] = useState(false);
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState(savedLayout);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [expanded, setExpanded] = useState(/** @type {Record<string,boolean>} */ ({}));
  /** @param {number} index */
  function selectLayout(index) {
    try {
      Storage.setItemSync(layoutKey, String(index));
      setLayout(index);
      setRaw(false);
      setExpanded({});
    } catch {
      showToast({ message: 'Could not save your log layout. Please try again.', kind: 'error' });
    }
  }
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(/** @type {string[]} */ ([]));
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
  const { profileId, logId } = useLocalSearchParams();
  const profileScoped = usePathname().startsWith('/profiles/history');
  const toolbarTop = !profileScoped && !qaBannerEnabled ? insets.top + 8 : 8;
  const items = useMemo(() => {
    const filtered = logs(events, profileScoped ? [] : diagnostics, diagnosticsTime, {
      issues,
      query,
      category: /** @type {import('../../core/logs.js').LogCategory} */ (
        ['all', 'exports', 'agents', 'app'][filter]
      ),
      profileId: typeof profileId === 'string' ? profileId : undefined,
    });
    /** @type {Item[]} */ const result = [];
    filtered.forEach((log, index) => {
      const day = historyDay(new Date(log.time).toISOString()),
        previous = filtered[index - 1];
      const first = !previous || historyDay(new Date(previous.time).toISOString()) !== day;
      if (first) result.push({ kind: 'heading', id: `day-${day}`, title: day });
      result.push({
        kind: 'event',
        id: log.id,
        index,
        log,
      });
    });
    return result;
  }, [events, diagnostics, diagnosticsTime, filter, issues, query, profileId, profileScoped]);
  const visibleLogs = items.flatMap((item) => (item.kind === 'event' ? [item.log] : []));
  const selection = selectLogs(visibleLogs, selected);
  /** @param {string} id */
  function toggleSelected(id) {
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
      showToast({
        message: `Copied ${selection.logs.length} ${selection.logs.length === 1 ? 'log' : 'logs'} as JSON lines.`,
        kind: 'success',
      });
    } catch (failure) {
      showToast({ message: errorMessage(failure), kind: 'error' });
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
      <Stack.Screen
        options={{ title: profileScoped ? 'Profile logs' : 'Logs', headerShown: profileScoped }}
      />
      <View style={[styles.topToolbar, { paddingTop: toolbarTop }]}>
        {profileScoped ? (
          <View style={styles.heading} />
        ) : (
          <Copy variant="title" style={styles.heading}>
            Logs
          </Copy>
        )}
        <Copy testID="logs-live" variant="caption" muted>
          {refreshing ? 'Updating…' : 'Live · 2s'}
        </Copy>
      </View>
      <FlashList
        testID="history-list"
        data={items}
        extraData={{ selecting, selected, layout, expanded, raw }}
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.kind}
        maintainVisibleContentPosition={raw ? { autoscrollToTopThreshold: 0.1 } : {}}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            {profileId ? (
              <Copy variant="heading">
                {events.find((event) => event.profile.id === profileId)?.profile.name ??
                  'This profile'}
              </Copy>
            ) : null}
            <ErrorToast error={!profileScoped ? diagnosticsError : null} />
            <ErrorToast error={error} />
            <View style={[styles.search, { borderColor: colors.border }]}>
              <Icon name="search-outline" size={20} color={colors.secondary} />
              <TextInput
                testID="logs-search"
                accessibilityLabel="Search logs"
                placeholder="Search logs"
                placeholderTextColor={colors.secondary}
                value={query}
                onChangeText={setQuery}
                maxLength={200}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={[styles.searchInput, { color: colors.text }]}
              />
              {query ? (
                <LogAction
                  testID="logs-search-clear"
                  label="Clear log search"
                  icon="close-outline"
                  onPress={() => setQuery('')}
                />
              ) : null}
            </View>
            <View style={styles.toolbar}>
              <View style={styles.actions}>
                <LogAction
                  testID="logs-options"
                  label="Log options"
                  icon="options-outline"
                  active={optionsOpen}
                  expanded={optionsOpen}
                  onPress={() => setOptionsOpen(!optionsOpen)}
                />
                <LogAction
                  testID="logs-select"
                  label={selecting ? 'Cancel selection' : 'Select logs'}
                  icon={selecting ? 'close-outline' : 'checkbox-outline'}
                  active={selecting}
                  onPress={() => {
                    setSelecting(!selecting);
                    setSelected([]);
                  }}
                />
                {!profileScoped ? (
                  <LogAction
                    testID="logs-report"
                    label="Share & agent access"
                    icon="settings-outline"
                    onPress={() => router.push('/diagnostics')}
                  />
                ) : null}
              </View>
              <View style={styles.actions}>
                <View style={[styles.live, { borderColor: colors.border }]}>
                  <Icon name="radio-outline" size={18} />
                  <Copy variant="caption">Live</Copy>
                </View>
                <LogAction
                  testID="logs-refresh"
                  label="Refresh logs"
                  icon="refresh-outline"
                  busy={refreshing || loading}
                  onPress={() => void refresh()}
                />
              </View>
            </View>
            <View testID="history-filter" style={styles.filters}>
              <View style={styles.categories}>
                {categories.slice(0, profileScoped ? 3 : 4).map((category, index) => (
                  <Pressable
                    key={category.label}
                    testID={`history-filter-${category.label.toLowerCase()}`}
                    accessibilityRole="button"
                    accessibilityLabel={category.label}
                    accessibilityState={{ selected: filter === index }}
                    onPress={() => setFilter(index)}
                    style={({ pressed }) => [
                      styles.category,
                      {
                        backgroundColor:
                          filter === index || pressed ? colors.subtle : 'transparent',
                      },
                    ]}
                  >
                    <Icon
                      name={category.icon}
                      size={16}
                      color={filter === index ? colors.text : colors.secondary}
                    />
                    <Copy variant="caption" muted={filter !== index}>
                      {category.label}
                    </Copy>
                  </Pressable>
                ))}
              </View>
              <LogAction
                testID="logs-issues"
                label={issues ? 'Show all outcomes' : 'Show issues only'}
                icon="alert-circle-outline"
                active={issues}
                danger={issues}
                onPress={() => setIssues(!issues)}
              />
            </View>
            {optionsOpen ? (
              <View
                testID="logs-options-panel"
                style={[styles.options, { borderColor: colors.border }]}
              >
                <View testID="logs-layout" style={styles.actions}>
                  {layoutOptions.map((option, index) => (
                    <LogAction
                      key={option.label}
                      testID={`logs-layout-${option.label.toLowerCase()}`}
                      label={`${option.label} log layout`}
                      icon={option.icon}
                      active={!raw && layout === index}
                      onPress={() => selectLayout(index)}
                    />
                  ))}
                </View>
                <SegmentedControl
                  testID="logs-format"
                  accessibilityLabel="Log display"
                  style={styles.segment}
                  values={['Table', 'Raw']}
                  selectedIndex={raw ? 1 : 0}
                  onChange={(event) => setRaw(event.nativeEvent.selectedSegmentIndex === 1)}
                  appearance={isDark ? 'dark' : 'light'}
                />
                {!profileScoped ? (
                  <Copy testID="logs-retention" variant="caption" muted style={styles.retention}>
                    App events: seven days · up to 300. Included content follows your log settings.
                  </Copy>
                ) : null}
              </View>
            ) : null}
            <LogTimeline entries={visibleLogs} />
            <View style={styles.toolbar}>
              <View style={styles.streamState}>
                <View style={[styles.liveDot, { backgroundColor: colors.text }]} />
                <Copy variant="caption" muted>
                  {visibleLogs.length} {visibleLogs.length === 1 ? 'event' : 'events'}
                  {issues ? ' · Issues only' : ''}
                  {raw ? ' · Raw JSON' : ''}
                </Copy>
              </View>
              {selecting ? (
                <Pressable
                  testID="logs-select-all"
                  accessibilityRole="button"
                  accessibilityLabel={
                    visibleLogs.length > 350 ? 'Select first 350' : 'Select all loaded'
                  }
                  onPress={() => setSelected(visibleLogs.slice(0, 350).map((log) => log.id))}
                  style={styles.toolbarAction}
                >
                  <Copy variant="caption">
                    {visibleLogs.length > 350 ? 'Select first 350' : 'Select all loaded'}
                  </Copy>
                </Pressable>
              ) : null}
            </View>
            {!raw ? (
              <View testID="logs-columns" style={[styles.columns, { borderColor: colors.border }]}>
                <Copy variant="caption" muted style={styles.timeColumn}>
                  Time
                </Copy>
                <Copy variant="caption" muted style={styles.statusColumn}>
                  Status
                </Copy>
                <Copy variant="caption" muted style={styles.eventColumn}>
                  Event
                </Copy>
                <View style={styles.disclosureColumn} />
              </View>
            ) : null}
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
                query.trim()
                  ? 'No matching logs'
                  : issues
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
                query.trim()
                  ? 'Try another search or source filter. Search covers loaded log metadata.'
                  : filter === 2
                    ? 'Live phone queries and cloud reads appear here when a connected agent requests data.'
                    : filter === 3
                      ? 'App operations and outcomes appear here as you use the app.'
                      : 'App activity, exports and agent access appear here as you use the app.'
              }
              action={
                query.trim()
                  ? 'Clear search'
                  : filter === 2
                    ? 'Manage connection'
                    : 'Profiles & exports'
              }
              onPress={() =>
                query.trim()
                  ? setQuery('')
                  : filter === 2
                    ? router.push('/pair')
                    : router.navigate('/profiles')
              }
            />
          )
        }
        ListFooterComponent={
          <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
            {hasMore ? (
              <Copy variant="caption" muted>
                Scroll for older activity
              </Copy>
            ) : visibleLogs.length ? (
              <Copy variant="caption" muted style={styles.endMessage}>
                No more logs in loaded activity
              </Copy>
            ) : null}
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
            <View style={[styles.raw, { borderColor: colors.border }]}>
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
              selecting={selecting}
              selected={selected.includes(item.id)}
              onSelect={() => toggleSelected(item.id)}
              layout={layout}
              expanded={expanded[item.id] ?? (layout === 2 || item.id === logId)}
              onExpand={() =>
                setExpanded((previous) => ({
                  ...previous,
                  [item.id]: !(previous[item.id] ?? (layout === 2 || item.id === logId)),
                }))
              }
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
/** @param {number} value */
function timelineTime(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
/** Activity distribution of the loaded, filtered page; not a time-range control.
 * @param {{entries:import('../../core/logs.js').Log[]}} props */
function LogTimeline({ entries }) {
  const { colors } = useTheme();
  if (!entries.length) return null;
  const newest = entries[0]?.time ?? 0;
  const oldest = entries[entries.length - 1]?.time ?? newest;
  const span = Math.max(newest - oldest, 1);
  const bins = Array.from({ length: 32 }, (_, index) => ({ id: `bin-${index}`, count: 0 }));
  for (const entry of entries) {
    const index = Math.min(31, Math.floor(((entry.time - oldest) / span) * 32));
    const bin = bins[index];
    if (bin) bin.count++;
  }
  const max = Math.max(...bins.map((bin) => bin.count), 1);
  return (
    <View
      testID="logs-timeline"
      accessible
      accessibilityLabel={`Loaded activity: ${entries.length} events, ${new Date(oldest).toLocaleString()} to ${new Date(newest).toLocaleString()}`}
      style={styles.timeline}
    >
      <View style={[styles.timelineBars, { borderColor: colors.border }]}>
        {bins.map(({ id, count }) => {
          const height = count ? Math.max(4, (count / max) * 28) : 0;
          return (
            <View
              key={id}
              style={[
                styles.timelineBin,
                {
                  height,
                  backgroundColor: colors.secondary,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.timelineLabels}>
        <Copy variant="caption" muted>
          {timelineTime(oldest)}
        </Copy>
        <Copy variant="caption" muted>
          {timelineTime(newest)}
        </Copy>
      </View>
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
/** @param {{testID:string,label:string,icon:import('../components/ui.js').IconName,active?:boolean,danger?:boolean,expanded?:boolean,busy?:boolean,onPress:()=>void}} props */
function LogAction({
  testID,
  label,
  icon,
  active = false,
  danger = false,
  expanded,
  busy = false,
  onPress,
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      accessibilityState={{
        selected: active,
        busy,
        disabled: busy,
        ...(expanded === undefined ? {} : { expanded }),
      }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          borderColor: colors.border,
          opacity: busy ? 0.45 : 1,
          backgroundColor: active || pressed ? colors.subtle : 'transparent',
        },
      ]}
    >
      <Icon
        name={icon}
        size={20}
        color={danger ? colors.danger : active ? colors.text : colors.secondary}
      />
    </Pressable>
  );
}
/** @param {{item:Extract<Item,{kind:'event'}>,selecting:boolean,selected:boolean,onSelect:()=>void,layout:number,expanded:boolean,onExpand:()=>void}} props */
function EventRow({ item, selecting, selected, onSelect, layout, expanded, onExpand }) {
  const { colors, isDark } = useTheme();
  const log = item.log;
  const entry = 'entry' in log ? log.entry : null;
  const event = 'event' in log ? log.event : null;
  const outcome = entry?.outcome ?? event?.status ?? '';
  const failed = ['failed', 'interrupted'].includes(outcome);
  const warning = ['partial', 'cancelled', 'expired'].includes(outcome);
  const pending = ['started', 'running', 'ready'].includes(outcome);
  const title = event ? historyTitle(event) : (entry?.operation ?? 'App event');
  const status = event ? historyOutcome(event) : outcome;
  const route = event ? historyRoute(event) : (entry?.url ?? 'Internal app event');
  const failure = entry?.error || event?.error;
  const message = failure ? errorMessage(failure) : route;
  const category = categories.find((option) => option.label.toLowerCase() === log.category) ?? {
    label: 'App',
    icon: /** @type {const} */ ('phone-portrait-outline'),
  };
  const rowBackground = item.index % 2 === 0 ? colors.surface : 'transparent';
  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: rowBackground,
        },
        layout === 0 && styles.compactCard,
        selected && { borderColor: colors.text },
      ]}
    >
      <View style={styles.cardHeader}>
        <Pressable
          testID={event ? `history-event-${event.id}` : `log-${item.id}`}
          accessibilityRole={selecting ? 'checkbox' : 'button'}
          accessibilityState={selecting ? { checked: selected } : { expanded }}
          accessibilityLabel={[
            title,
            category.label,
            status,
            message,
            new Date(log.time).toLocaleString(),
          ].join(', ')}
          accessibilityHint={
            selecting
              ? 'Select this log for copying'
              : expanded
                ? 'Collapse log details'
                : 'Expand log details'
          }
          onPress={selecting ? onSelect : onExpand}
          style={({ pressed }) => [
            styles.identity,
            layout === 0 && styles.compactIdentity,
            { backgroundColor: pressed ? colors.subtle : 'transparent' },
          ]}
        >
          <Copy variant="caption" style={[styles.timeColumn, styles.mono]}>
            {new Date(log.time).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}
          </Copy>
          <View style={styles.statusColumn}>
            <Copy
              variant="caption"
              style={[
                styles.mono,
                {
                  color:
                    failed || warning
                      ? colors.danger
                      : pending
                        ? colors.secondary
                        : isDark
                          ? '#30D158'
                          : '#187B38',
                },
              ]}
            >
              {typeof entry?.httpStatus === 'number'
                ? entry.httpStatus
                : failed
                  ? 'ERR'
                  : warning
                    ? 'WARN'
                    : pending
                      ? 'WAIT'
                      : 'OK'}
            </Copy>
          </View>
          <View style={styles.eventColumn}>
            <View style={styles.streamState}>
              {selecting ? (
                <Icon name={selected ? 'checkbox' : 'square-outline'} size={16} />
              ) : null}
              <Text
                numberOfLines={1}
                style={[styles.rowTitle, styles.mono, { color: colors.text }]}
              >
                {title}
              </Text>
            </View>
            {layout !== 0 ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.preview,
                  styles.mono,
                  { color: failure ? colors.danger : colors.secondary },
                ]}
              >
                {category.label} · {message}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <LogAction
          testID={`logs-expand-${item.id}`}
          label={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
          icon={expanded ? 'chevron-up' : 'chevron-down'}
          expanded={expanded}
          onPress={onExpand}
        />
      </View>
      {expanded ? (
        <View testID={`logs-summary-${item.id}`} style={styles.details}>
          <View style={styles.detailHeading}>
            <Copy variant="heading" style={styles.detailTitle}>
              {event ? (event.kind === 'access' ? 'Agent access' : 'Export details') : 'App event'}
            </Copy>
            <Pressable
              testID={`logs-close-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel="Close log details"
              onPress={onExpand}
              style={({ pressed }) => [styles.detailClose, { opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={[styles.detailCloseIcon, { backgroundColor: colors.subtle }]}>
                <Icon name="close" size={16} color={colors.secondary} />
              </View>
            </Pressable>
          </View>
          {event ? (
            <HistoryDetail key={event.id} event={event} />
          ) : entry ? (
            <View testID={`logs-details-${item.id}`} style={styles.detailsContent}>
              <Copy selectable variant="caption">
                {new Date(entry.time).toLocaleString()} · {entry.operation} · {entry.outcome}
              </Copy>
              <Copy selectable variant="caption" muted>
                Duration: {entry.durationMs === null ? 'Not recorded' : `${entry.durationMs} ms`} ·
                HTTP: {entry.httpStatus ?? 'Not recorded'}
              </Copy>
              {entry.error !== undefined ? (
                <Copy selectable style={{ color: colors.danger }}>
                  {errorMessage(entry.error)}
                </Copy>
              ) : null}
              <Copy selectable variant="caption" style={styles.rawText}>
                {JSON.stringify(entry, null, 2)}
              </Copy>
              <Copy variant="caption" muted>
                Raw error messages are always included. Structured records, credentials and URLs
                follow your log content settings. Events expire after seven days or when the
                300-event limit is reached.
              </Copy>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  topToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  heading: { flex: 1, fontSize: 20, lineHeight: 28 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionBar: { padding: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  list: { paddingHorizontal: 16 },
  header: { gap: 12, paddingTop: 8 },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toolbarAction: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  streamState: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 4, height: 4, borderRadius: 2 },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  options: {
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
  segment: { height: 44, marginBottom: 8 },
  retention: { paddingBottom: 12 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  footer: { paddingTop: 64 },
  endMessage: { textAlign: 'center' },
  day: { paddingTop: 12, paddingBottom: 8 },
  card: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    borderCurve: 'continuous',
    overflow: 'hidden',
    marginBottom: 2,
  },
  compactCard: {
    marginBottom: 0,
  },
  cardHeader: { paddingLeft: 8, flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  identity: {
    flex: 1,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 0,
  },
  compactIdentity: { minHeight: 52 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 12,
    paddingRight: 4,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    borderCurve: 'continuous',
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, minWidth: 0 },
  live: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    borderCurve: 'continuous',
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  timeColumn: { width: 76, paddingRight: 8 },
  statusColumn: { width: 52, paddingRight: 8 },
  eventColumn: { flex: 1, minWidth: 0, gap: 4 },
  disclosureColumn: { width: 48 },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontVariant: ['tabular-nums'],
    fontSize: 12,
    lineHeight: 18,
  },
  rowTitle: { flex: 1 },
  preview: { fontSize: 12, lineHeight: 18 },
  timeline: { gap: 4, paddingTop: 12 },
  timelineBars: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    borderBottomWidth: 1,
  },
  timelineBin: { flex: 1, minWidth: 0 },
  timelineLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  details: {
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
  },
  detailHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailTitle: { flex: 1 },
  detailClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  detailCloseIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsContent: { gap: 12 },
  raw: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  rawText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
