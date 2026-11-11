import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { strandsPatterns } from '../../../core/strands.js';
import { timezone } from '../../../client/strands.js';
import { sorted } from '../../../core/collections.js';
import { Copy } from '../../components/ui.js';
import { showToast } from '../../components/Toast.js';
import { Card, Mono, Pill, StrandsScreen, useText } from './kit.js';
import { fonts, strandColor, themed } from './palette.js';
import { today, useStrandsProfile, useStrandsWindow } from './useStrands.js';

/** @typedef {ReturnType<typeof strandsPatterns>['patterns'][number]} Pattern */

const filters = /** @type {const} */ ([
  ['all', 'All'],
  ['body:place', 'Place × Body'],
  ['attention:body', 'Attention × Body'],
  ['attention:place', 'Attention × Place'],
]);

/** @param {number|null} value @param {string} unit */
export function formatValue(value, unit) {
  if (value === null) return 'unknown';
  if (unit === 'h') {
    const m = Math.round(value * 60);
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  }
  if (unit === 'min after 18:00') {
    const m = (((18 * 60 + Math.round(value)) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  return `${Math.round(value)} ${unit}`;
}

/** Plain-language observation; never phrased as a cause. @param {Pattern} p */
function headline(p) {
  const [a, b] = p.groups;
  if (!a || !b || p.delta === null) return { lead: '', value: '', tail: '' };
  const minutes = Math.round(Math.abs(p.delta) * (p.unit === 'h' ? 60 : 1));
  if (p.id.startsWith('place-sleep'))
    return {
      lead: `After ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)} you slept a median `,
      value: `${minutes} min`,
      tail: p.delta >= 0 ? ' longer.' : ' less.',
    };
  return {
    lead: `On nights with ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}, you fell asleep a median `,
    value: `${minutes} min`,
    tail: p.delta >= 0 ? ' later.' : ' earlier.',
  };
}

export default function PatternsScreen() {
  const { strands, styles } = useStyles();
  const { styles: text } = useText();
  const { profile } = useStrandsProfile();
  const [filter, setFilter] = useState(/** @type {(typeof filters)[number][0]} */ ('all'));
  const window = useStrandsWindow(profile, today(), 31, { heart: false });
  const result = useMemo(() => {
    if (window.status !== 'ready') return null;
    try {
      return {
        review: strandsPatterns(window.days, window.rows, window.slots, timezone),
        error: '',
      };
    } catch (error) {
      return {
        review: null,
        error: error instanceof Error ? error.message : 'Patterns are unavailable.',
      };
    }
  }, [window.status, window.days, window.rows, window.slots]);
  const patterns = (result?.review?.patterns ?? []).filter(
    (p) => filter === 'all' || sorted(p.strands).join(':') === filter,
  );
  const nights = result?.review?.nights.length ?? 30;

  return (
    <StrandsScreen testID="strands-patterns">
      <Mono>~/myself.md/patterns/</Mono>
      <Copy style={text.title} accessibilityRole="header">
        Patterns
      </Copy>
      <Copy style={text.body}>
        Places where two of your strands moved together in the last {nights} nights. These are
        things that happened at the same time, not proof that one caused the other.
      </Copy>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {filters.map(([id, label]) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === id }}
            onPress={() => setFilter(id)}
            style={[styles.filter, filter === id ? styles.filterOn : styles.filterOff]}
          >
            <Copy style={[styles.filterLabel, filter === id ? styles.onLight : styles.onDark]}>
              {label}
            </Copy>
          </Pressable>
        ))}
      </ScrollView>

      {!profile ? (
        <Empty message="Select location, screen time or sleep in a profile to find patterns." />
      ) : window.status !== 'ready' ? (
        <View style={styles.loading}>
          {window.status === 'error' ? (
            <Copy style={text.small}>{window.error}</Copy>
          ) : (
            <ActivityIndicator color={strands.muted} />
          )}
        </View>
      ) : result?.error ? (
        <Empty message={result.error} />
      ) : !patterns.length ? (
        <Card>
          <Copy style={text.body}>
            Nothing to compare yet. Each comparison needs at least three nights on each side.
          </Copy>
          <Inputs
            nights={result?.review?.nights ?? []}
            places={result?.review?.places.length ?? 0}
          />
        </Card>
      ) : (
        patterns.map((p) => <PatternCard key={p.id} pattern={p} />)
      )}
      {result?.review && (
        <Copy style={text.small}>{[...window.warnings, ...result.review.warnings].join(' ')}</Copy>
      )}
    </StrandsScreen>
  );
}

/** @param {{pattern:Pattern}} props */
function PatternCard({ pattern: p }) {
  const { strands, styles } = useStyles();
  const { styles: text } = useText();
  const [first, second] = p.strands;
  const line = headline(p);
  async function ask() {
    await Clipboard.setStringAsync(
      `Using myself.md, call review_strands_patterns for my last 30 nights and explain "${p.title}". Keep it to what was observed, with group sizes and coverage, and don't claim a cause.`,
    );
    showToast({ message: 'Prompt copied. Paste it into your agent.', kind: 'success' });
  }
  return (
    <Card testID={`pattern-${p.id}`} style={styles.card}>
      <View style={styles.strands}>
        <Mono color={strandColor(first, strands)} size={10}>
          {first.toUpperCase()}
        </Mono>
        <Mono color={strands.faint} size={10}>
          ×
        </Mono>
        <Mono color={strandColor(second, strands)} size={10}>
          {second.toUpperCase()}
        </Mono>
      </View>
      <Copy style={text.heading}>{p.title}</Copy>
      {line.value ? (
        <Copy style={text.body}>
          {line.lead}
          <Copy style={[text.strong, styles.bright]}>{line.value}</Copy>
          {line.tail}
        </Copy>
      ) : (
        <Copy style={text.body}>Phone minutes per hour spent at each place.</Copy>
      )}
      {p.delta === null ? (
        <Bars pattern={p} />
      ) : (
        <Strips pattern={p} color={strandColor(first, strands)} />
      )}
      <Copy style={text.small}>
        {p.caveat} Coverage {Math.round(Math.min(1, p.coverage) * 100)}%.
      </Copy>
      <View style={styles.actions}>
        <Pill label="Ask my agent" onPress={() => void ask()} />
      </View>
    </Card>
  );
}

/** @param {{pattern:Pattern,color:string}} props */
function Strips({ pattern, color }) {
  const { strands, styles } = useStyles();
  const all = pattern.groups.flatMap((g) => g.values);
  const min = Math.min(...all),
    max = Math.max(...all),
    range = max - min || 1;
  /** @param {number} v @returns {`${number}%`} */
  const x = (v) => `${((v - min) / range) * 94}%`;
  return (
    <View
      accessible
      accessibilityLabel={pattern.groups
        .map((g) => `${g.label}, ${g.n} nights, median ${formatValue(g.median, pattern.unit)}`)
        .join('. ')}
      style={styles.stripWrap}
    >
      {pattern.groups.map((g, index) => (
        <View key={g.label} style={styles.stripRow}>
          <Mono size={10}>
            {g.label.toUpperCase()} · {g.n} nights
          </Mono>
          <View style={styles.strip}>
            {dots(g.label, g.values, index).map(({ id, v, top }) => (
              <View
                key={id}
                style={[
                  index ? styles.otherDot : styles.dot,
                  { left: x(v), top },
                  index ? null : { backgroundColor: color },
                ]}
              />
            ))}
            {g.median !== null && <View style={[styles.median, { left: x(g.median) }]} />}
          </View>
        </View>
      ))}
      <View style={styles.axis}>
        <Mono size={10} color={strands.faint}>
          {formatValue(min, pattern.unit)}
        </Mono>
        <Mono size={10} color={strands.faint}>
          {formatValue(max, pattern.unit)}
        </Mono>
      </View>
    </View>
  );
}

/** @param {{pattern:Pattern}} props */
function Bars({ pattern }) {
  const { strands, styles } = useStyles();
  const top = Math.max(1, ...pattern.groups.map((g) => g.median ?? 0));
  return (
    <View style={styles.bars}>
      {pattern.groups.map((g) => (
        <View key={g.label} style={styles.barRow}>
          <Copy style={styles.barLabel}>{g.label}</Copy>
          <View style={styles.barTrack}>
            <View
              style={[styles.barFill, { width: `${Math.max(3, ((g.median ?? 0) / top) * 100)}%` }]}
            />
          </View>
          <Mono color={strands.text}>{Math.round(g.median ?? 0)}m</Mono>
        </View>
      ))}
    </View>
  );
}

/** Stable identities for repeated values in one strip.
 * @param {string} label @param {number[]} values @param {number} group */
function dots(label, values, group) {
  return values.map((v, k) => ({ id: `${label}:${k}`, v, top: group ? 3 + ((k * 5) % 9) : 5 }));
}

/** What the comparisons had to work with, so an empty result is actionable.
 * @param {{nights:ReturnType<typeof strandsPatterns>['nights'],places:number}} props */
function Inputs({ nights, places }) {
  const { strands, styles } = useStyles();
  const { styles: text } = useText();
  const rows = [
    ['Nights with sleep', nights.filter((n) => n.sleepHours !== null).length, strands.body],
    [
      'Nights with phone use after 22:00',
      nights.filter((n) => n.phoneAfterCutoffMinutes !== null).length,
      strands.attention,
    ],
    [
      'Evenings at a known place',
      nights.filter((n) => n.eveningPlaces.length > 0).length,
      strands.place,
    ],
    ['Known places', places, strands.place],
  ];
  return (
    <View style={styles.inputs}>
      {rows.map(([label, value, color]) => (
        <View key={String(label)} style={styles.inputRow}>
          <Copy style={text.small}>{label}</Copy>
          <Mono color={String(color)} size={12}>
            {String(value)}
            {label === 'Known places' ? '' : ` / ${nights.length}`}
          </Mono>
        </View>
      ))}
    </View>
  );
}

/** @param {{message:string}} props */
function Empty({ message }) {
  const { styles: text } = useText();
  return (
    <Card>
      <Copy style={text.body}>{message}</Copy>
    </Card>
  );
}

const useStyles = themed((strands) => {
  const styles = StyleSheet.create({
    filters: { gap: 8, paddingVertical: 2 },
    inputs: { gap: 6, marginTop: 4 },
    inputRow: { flexDirection: 'row', justifyContent: 'space-between' },
    filter: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
    filterOn: { backgroundColor: strands.text },
    filterOff: { backgroundColor: strands.surface, borderWidth: 1, borderColor: strands.line },
    filterLabel: { fontFamily: fonts.medium, fontSize: 13 },
    onLight: { color: strands.ground },
    onDark: { color: strands.soft },
    loading: { height: 220, alignItems: 'center', justifyContent: 'center' },
    card: { borderRadius: 22, padding: 18 },
    strands: { flexDirection: 'row', gap: 6 },
    bright: { color: strands.text },
    stripWrap: { gap: 10, marginTop: 4 },
    stripRow: { gap: 4 },
    strip: { height: 22, borderBottomWidth: 1, borderColor: strands.line },
    dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
    otherDot: {
      position: 'absolute',
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: strands.dot,
    },
    median: { position: 'absolute', top: -2, width: 2, height: 24, backgroundColor: strands.text },
    axis: { flexDirection: 'row', justifyContent: 'space-between' },
    actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
    bars: { gap: 10, marginTop: 4 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    barLabel: { width: 64, fontFamily: fonts.regular, fontSize: 13, color: strands.place },
    barTrack: {
      flex: 1,
      height: 10,
      borderRadius: 5,
      backgroundColor: strands.track,
      overflow: 'hidden',
    },
    barFill: { height: 10, borderRadius: 5, backgroundColor: strands.attention },
  });
  return styles;
});
