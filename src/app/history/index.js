import { useMemo, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, Empty, Icon, Notice } from '../../components/ui.js';
import { useTheme } from '../../lib/theme.js';
import { useHistory } from '../../../client/useHistory.js';
import {
  historyDay,
  historyTitle,
  historyOutcome,
  historyRoute,
} from '../../../client/history-display.js';
/** @typedef {import('../../../core/history.js').HistoryEvent} Event */
/** @typedef {{kind:'heading',id:string,title:string}|{kind:'event',id:string,event:Event,first:boolean,last:boolean}} Item */
export default function HistoryScreen() {
  const { colors, isDark } = useTheme(),
    insets = useSafeAreaInsets();
  const { events, loading, refreshing, error, hasMore, refresh, loadMore } = useHistory();
  const [filter, setFilter] = useState(0);
  const { profileId } = useLocalSearchParams();
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
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: profileId ? 'Profile history' : 'History' }} />
      <FlashList
        data={items}
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.kind}
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
            <Copy muted>See where your data went, and when an agent accessed it.</Copy>
            <SegmentedControl
              values={['All', 'Exports', 'Agent access']}
              selectedIndex={filter}
              onChange={(event) => setFilter(event.nativeEvent.selectedSegmentIndex)}
              appearance={isDark ? 'dark' : 'light'}
              accessibilityLabel="History type"
            />
            {error ? (
              <Notice title="Showing saved history" body={error} icon="cloud-offline-outline" />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <Copy muted>Loading history…</Copy>
            </View>
          ) : (
            <Empty
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
              onPress={() => router.push(filter === 2 ? '/pair' : '/manage')}
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
              <Copy variant="heading">{item.title}</Copy>
            </View>
          ) : (
            <HistoryRow item={item} />
          )
        }
      />
    </View>
  );
}
/** @param {{item:Extract<Item,{kind:'event'}>}} props */
function HistoryRow({ item }) {
  const { colors } = useTheme(),
    { event, first, last } = item;
  const outcome = historyOutcome(event);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        historyTitle(event),
        historyRoute(event),
        outcome,
        new Date(event.startedAt).toLocaleString(),
      ].join(', ')}
      onPress={() => router.push({ pathname: '/history/[id]', params: { id: event.id } })}
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
      <View style={[styles.icon, { backgroundColor: colors.subtle }]}>
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
  list: { paddingHorizontal: 24, paddingTop: 16 },
  header: { gap: 20, paddingBottom: 8 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  footer: { paddingTop: 24 },
  day: { paddingTop: 20, paddingBottom: 12 },
  row: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 100 },
  first: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderCurve: 'continuous' },
  last: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderCurve: 'continuous',
    marginBottom: 4,
  },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
