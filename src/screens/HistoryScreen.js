import { useMemo, useState } from 'react';
import { Stack, router, useLocalSearchParams, usePathname } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, Empty, Icon } from '../components/ui.js';
import { useTheme } from '../lib/theme.js';
import { useHistory } from '../../client/useHistory.js';
import {
  historyDay,
  historyTitle,
  historyOutcome,
  historyRoute,
} from '../../core/history-display.js';
/** @typedef {import('../../core/history.js').HistoryEvent} Event */
/** @typedef {{kind:'heading',id:string,title:string}|{kind:'event',id:string,event:Event,first:boolean,last:boolean}} Item */
export default function HistoryScreen() {
  const { colors, isDark } = useTheme(),
    insets = useSafeAreaInsets();
  const { events, loading, refreshing, error, hasMore, refresh, loadMore } = useHistory();
  const [filter, setFilter] = useState(0);
  const { profileId } = useLocalSearchParams();
  const profileScoped = usePathname().startsWith('/profiles/history');
  const items = useMemo(() => {
    const filtered = events.filter(
      (e) =>
        (!profileId || e.profile.id === profileId) &&
        (filter === 0 || (filter === 1 ? e.kind === 'export' : e.kind === 'access')),
    );
    /** @type {Item[]} */ const result = [];
    filtered.forEach((event, index) => {
      const day = historyDay(event.startedAt),
        previous = filtered[index - 1],
        next = filtered[index + 1];
      const first = !previous || historyDay(previous.startedAt) !== day;
      if (first) result.push({ kind: 'heading', id: `day-${day}`, title: day });
      result.push({
        kind: 'event',
        id: event.id,
        event,
        first,
        last: !next || historyDay(next.startedAt) !== day,
      });
    });
    return result;
  }, [events, filter, profileId]);
  return (
    <View
      testID="history-screen"
      collapsable={false}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: profileId ? 'Profile history' : 'History' }} />
      <FlashList
        testID="history-list"
        data={items}
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.kind}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Copy muted>Review exports and agent access to your data.</Copy>
            {profileId ? (
              <Copy variant="heading">
                {events.find((event) => event.profile.id === profileId)?.profile.name ??
                  'This profile'}
              </Copy>
            ) : null}
            {error ? (
              <View testID="history-error" accessibilityRole="alert">
                <Copy>{error}</Copy>
              </View>
            ) : null}
            <SegmentedControl
              style={styles.segment}
              values={['All', 'Exports', 'Agent access']}
              selectedIndex={filter}
              onChange={(event) => setFilter(event.nativeEvent.selectedSegmentIndex)}
              appearance={isDark ? 'dark' : 'light'}
              testID="history-filter"
              accessibilityLabel="History type"
            />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View
              testID="history-loading"
              accessibilityState={{ busy: true }}
              style={styles.loading}
            >
              <Copy muted>Loading history…</Copy>
            </View>
          ) : error ? (
            <Empty
              testID="history-empty"
              icon="alert-circle-outline"
              title="History could not be loaded"
              body="Saved entries have been retained. Pull down to retry."
            />
          ) : (
            <Empty
              testID="history-empty"
              icon="time-outline"
              title={
                filter === 2
                  ? 'No agent access yet'
                  : filter === 1
                    ? 'No exports yet'
                    : 'Your history starts here'
              }
              body={
                filter === 2
                  ? 'Live phone queries and cloud reads appear here when a connected agent requests data.'
                  : 'New exports and agent access will appear here. Earlier activity was not recorded.'
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
                : 'History records metadata, never the data itself.'}
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
          ) : (
            <HistoryRow item={item} profileScoped={profileScoped} />
          )
        }
      />
    </View>
  );
}
/** @param {{item:Extract<Item,{kind:'event'}>,profileScoped:boolean}} props */
function HistoryRow({ item, profileScoped }) {
  const { colors } = useTheme(),
    { event, first, last } = item;
  const outcome = historyOutcome(event);
  return (
    <Pressable
      testID={`history-event-${event.id}`}
      accessibilityRole="button"
      accessibilityLabel={[
        historyTitle(event),
        historyRoute(event),
        outcome,
        new Date(event.startedAt).toLocaleString(),
      ].join(', ')}
      onPress={() =>
        router.push({
          pathname: profileScoped ? '/profiles/history/[id]' : '/history/[id]',
          params: { id: event.id },
        })
      }
      style={({ pressed }) => [
        styles.row,
        first && styles.first,
        last && styles.last,
        {
          backgroundColor: pressed ? colors.subtle : colors.surface,
          borderBottomColor: colors.border,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={styles.icon}>
        <Icon
          name={
            event.kind === 'access'
              ? 'eye-outline'
              : event.target === 'cloud'
                ? 'cloud-upload-outline'
                : event.target === 'http'
                  ? 'arrow-up-outline'
                  : 'document-text-outline'
          }
        />
      </View>
      <View style={styles.content}>
        <Copy style={styles.title}>{historyTitle(event)}</Copy>
        <Copy variant="caption" muted>
          {historyRoute(event)}
        </Copy>
        <View style={styles.metadata}>
          <Copy
            variant="caption"
            style={event.status === 'failed' ? { color: colors.danger } : undefined}
          >
            {outcome}
            {event.recordCount !== null ? ` · ${event.recordCount.toLocaleString()} records` : ''}
          </Copy>
          <Copy variant="caption" muted style={styles.time}>
            {new Date(event.startedAt).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Copy>
        </View>
      </View>
      <Icon name="chevron-forward" size={16} color={colors.secondary} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 24 },
  header: { gap: 16, paddingBottom: 8 },
  segment: { height: 44 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  footer: { paddingTop: 24 },
  day: { paddingTop: 20, paddingBottom: 12 },
  row: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 88 },
  first: { borderTopLeftRadius: 12, borderTopRightRadius: 12, borderCurve: 'continuous' },
  last: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderCurve: 'continuous',
    marginBottom: 4,
  },
  icon: { width: 24, height: 32, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, gap: 4 },
  title: { fontWeight: '500' },
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  time: { fontVariant: ['tabular-nums'] },
});
