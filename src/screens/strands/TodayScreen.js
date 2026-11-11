import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { strandsDay, strandsPlaces } from '../../../core/strands.js';
import { strandsCoverage, timezone } from '../../../client/strands.js';
import { sorted } from '../../../core/collections.js';
import { Copy } from '../../components/ui.js';
import Braid, { clock } from './Braid.js';
import { Card, Mono, Pill, RoundButton, StrandsScreen, useText } from './kit.js';
import { strandColor, themed } from './palette.js';
import { shiftDate, today, useStrandsProfile, useStrandsWindow } from './useStrands.js';

/** @typedef {ReturnType<typeof strandsDay>} Day */

/** @param {number|null} minutes */
function duration(minutes) {
  if (minutes === null) return 'unknown';
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

export default function TodayScreen() {
  const { strands, styles } = useStyles();
  const { styles: text } = useText();
  const { profile, eligible, next } = useStrandsProfile();
  const [date, setDate] = useState(today);
  const [picked, setPicked] = useState(/** @type {number|null} */ (null));
  const [showNotes, setShowNotes] = useState(false);
  const window = useStrandsWindow(profile, date, 1);
  const history = useStrandsWindow(profile, today(), 30, { locationOnly: true });
  const result = useMemo(() => {
    const day = window.days[0];
    if (!day || window.status !== 'ready') return null;
    try {
      const places =
        history.status === 'ready'
          ? strandsPlaces(history.days, history.rows, timezone)
          : undefined;
      return { day: strandsDay(day, window.rows, window.slots, timezone, places), error: '' };
    } catch (error) {
      return { day: null, error: error instanceof Error ? error.message : 'Unreadable day.' };
    }
  }, [
    window.days,
    window.rows,
    window.slots,
    window.status,
    history.status,
    history.days,
    history.rows,
  ]);
  const changeDate = (/** @type {string} */ value) => {
    setDate(value);
    setPicked(null);
  };

  if (!profile)
    return (
      <StrandsScreen testID="strands-today">
        <Header date={date} onDate={changeDate} />
        <Card>
          <Copy style={text.heading}>Choose what Strands reads</Copy>
          <Copy style={text.body}>
            Strands braids recorded location, screen time and body data (heart rate, sleep, steps)
            from one of your profiles. Select at least one of them in a profile to start.
          </Copy>
          <Pill filled label="Open Profiles" onPress={() => router.navigate('/profiles')} />
        </Card>
      </StrandsScreen>
    );

  const coverage = strandsCoverage(profile);
  const day = result?.day ?? null;
  const placeLabel = (/** @type {string|null} */ id) =>
    day?.place.places.find((p) => p.id === id)?.label ?? 'Elsewhere';
  const fallback = day?.moments.at(-1);
  const selected = picked ?? (fallback ? Date.parse(fallback.time) : null);
  const readout = day && selected !== null ? readAt(day, selected, placeLabel) : null;
  /** @type {{strand:string,text:string}[]} */
  const missing = [];
  if (!coverage.place) missing.push({ strand: 'place', text: 'Location points aren’t selected' });
  else if (day && !day.place.runs.length)
    missing.push({ strand: 'place', text: 'No location points recorded this day' });
  if (!coverage.attention)
    missing.push({ strand: 'attention', text: 'Screen time isn’t selected' });
  else if (day && day.attention.totalMinutes === null)
    missing.push({ strand: 'attention', text: 'No screen-time records this day' });
  const bodySelected = coverage.heart || coverage.sleep || coverage.steps || coverage.resting;
  const bodyOther =
    day && (day.body.steps.length > 0 || day.body.sleep.length > 0 || day.body.resting !== null);
  if (!bodySelected)
    missing.push({ strand: 'body', text: 'Heart rate, sleep or steps aren’t selected' });
  else if (day && !day.body.samples.length && !bodyOther)
    missing.push({ strand: 'body', text: 'No heart rate, sleep or steps this day' });
  else if (day && !day.body.samples.length)
    missing.push({
      strand: 'body',
      text: coverage.heart
        ? 'No heart-rate samples this day; Body shows sleep and steps'
        : 'Heart rate isn’t selected; Body shows sleep and steps',
    });

  return (
    <StrandsScreen testID="strands-today">
      <Header date={date} onDate={changeDate} />
      {day && (
        <Copy style={text.body}>
          {day.place.runs.length ? (
            <>
              Mostly at <Copy style={[text.strong, styles.place]}>{mostTime(day, placeLabel)}</Copy>
              .{' '}
            </>
          ) : null}
          {day.attention.series?.type === 'websites' ? 'Websites' : 'Phone'}{' '}
          <Copy style={[text.strong, styles.attention]}>
            {duration(day.attention.totalMinutes)}
          </Copy>
          {day.body.peak ? (
            <>
              . Heart peaked at{' '}
              <Copy style={[text.strong, styles.body]}>{day.body.peak.bpm} bpm</Copy> at{' '}
              {clock(Date.parse(day.body.peak.time))}
            </>
          ) : day.body.stepsTotal !== null ? (
            <>
              .{' '}
              <Copy style={[text.strong, styles.body]}>
                {day.body.stepsTotal.toLocaleString()} steps
              </Copy>
            </>
          ) : null}
          {day.body.resting ? (
            <>
              , resting heart rate{' '}
              <Copy style={[text.strong, styles.body]}>{day.body.resting.bpm} bpm</Copy>
            </>
          ) : null}
          .
        </Copy>
      )}

      {missing.length > 0 && (
        <Card style={styles.missing}>
          {missing.map((m) => (
            <View key={m.text} style={styles.missingRow}>
              <View style={[styles.swatch, { backgroundColor: strandColor(m.strand, strands) }]} />
              <Copy style={text.small}>{m.text}</Copy>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/profiles')}
            style={styles.link}
          >
            <Mono color={strands.text}>Edit {profile.name} →</Mono>
          </Pressable>
        </Card>
      )}

      <View style={styles.legend} accessibilityElementsHidden>
        <Legend color={strands.place} label="PLACE" />
        <Legend color={strands.attention} label="ATTENTION" />
        <Legend color={strands.body} label="BODY" round />
      </View>

      {window.status !== 'ready' || !day ? (
        <View style={styles.loading}>
          {window.status === 'error' || result?.error ? (
            <Copy style={text.small}>{window.error || result?.error}</Copy>
          ) : (
            <ActivityIndicator color={strands.muted} />
          )}
        </View>
      ) : (
        <Braid day={day} placeLabel={placeLabel} selected={selected} onSelect={setPicked} />
      )}

      {readout && (
        <Card testID="strands-readout">
          <View style={styles.readoutHead}>
            <Mono color={strands.text} size={13}>
              {readout.time}
            </Mono>
            <Copy style={text.small}>{readout.note}</Copy>
          </View>
          <View style={styles.readout}>
            <Cell label="PLACE" color={strands.place} value={readout.place} />
            <Cell label="ATTENTION" color={strands.attention} value={readout.attention} />
            <Cell label="BODY" color={strands.body} value={readout.body} />
          </View>
        </Card>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showNotes }}
        onPress={() => setShowNotes((v) => !v)}
        style={styles.notesToggle}
      >
        <Mono>
          {showNotes ? '− ' : '+ '}Reading {profile.name} · how this is drawn
        </Mono>
      </Pressable>
      {showNotes && (
        <View style={styles.notes}>
          {eligible.length > 1 && <Pill label="Read a different profile" onPress={next} />}
          {[...window.warnings, ...(day?.warnings ?? [])].map((w) => (
            <Copy key={w} style={text.small}>
              • {w}
            </Copy>
          ))}
        </View>
      )}
    </StrandsScreen>
  );
}

/** @param {Day} day @param {number} t @param {(id:string|null)=>string} placeLabel */
function readAt(day, t, placeLabel) {
  const run = day.place.runs.find(
    (r) => Date.parse(r.start) - 900000 <= t && t <= Date.parse(r.end) + 900000,
  );
  const hour = day.attention.hours.find((h) => Date.parse(h.start) <= t && t < Date.parse(h.end));
  const sample = day.body.samples.reduce((best, s) => {
    const gap = Math.abs(Date.parse(s.time) - t);
    return gap <= 15 * 60000 && (!best || gap < best.gap) ? { bpm: s.bpm, gap } : best;
  }, /** @type {{bpm:number,gap:number}|null} */ (null));
  const moment = day.moments.find((m) => Math.abs(Date.parse(m.time) - t) < 60000);
  const asleep = day.body.sleep.some((i) => Date.parse(i.start) <= t && t < Date.parse(i.end));
  const steps = day.body.steps.find((h) => Date.parse(h.start) <= t && t < Date.parse(h.end));
  const minutes = hour?.minutes;
  return {
    time: clock(t),
    note: moment?.label ?? 'Tap the timeline to move',
    place: run ? placeLabel(run.placeId) : 'No point',
    attention:
      minutes === null || minutes === undefined
        ? 'Unknown'
        : hour?.apps[0]
          ? `${hour.apps[0].name} ${hour.apps[0].minutes}m`
          : `${Math.round(minutes)} min`,
    body: sample
      ? `${Math.round(sample.bpm)} bpm`
      : asleep
        ? 'Asleep'
        : steps
          ? `${steps.count.toLocaleString()} steps`
          : 'No sample',
  };
}

/** @param {Day} day @param {(id:string|null)=>string} placeLabel */
function mostTime(day, placeLabel) {
  /** @type {Map<string|null,number>} */
  const time = new Map();
  for (const r of day.place.runs)
    time.set(r.placeId, (time.get(r.placeId) ?? 0) + Date.parse(r.end) - Date.parse(r.start) + 1);
  const best = sorted([...time.entries()], (a, b) => b[1] - a[1])[0];
  return placeLabel(best?.[0] ?? null);
}

/** @param {{date:string,onDate:(date:string)=>void}} props */
function Header({ date, onDate }) {
  const { styles } = useStyles();
  const { styles: text } = useText();
  const isToday = date === today();
  const d = new Date(`${date}T12:00:00`);
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Mono>~/myself.md/{date}.md</Mono>
        <View style={styles.headerButtons}>
          <RoundButton
            icon="chevron-back"
            label="Previous day"
            onPress={() => onDate(shiftDate(date, -1))}
          />
          {!isToday && (
            <RoundButton
              icon="chevron-forward"
              label="Next day"
              onPress={() => onDate(shiftDate(date, 1))}
            />
          )}
        </View>
      </View>
      <View style={styles.titleRow}>
        <Copy style={text.title} accessibilityRole="header">
          {d.toLocaleDateString(undefined, { weekday: 'long' })}
        </Copy>
        <Mono>
          {d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          {isToday ? ' · today' : ''}
        </Mono>
      </View>
    </View>
  );
}

/** @param {{color:string,label:string,round?:boolean}} props */
function Legend({ color, label, round = false }) {
  const { styles } = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, round && styles.roundSwatch, { backgroundColor: color }]} />
      <Mono size={11}>{label}</Mono>
    </View>
  );
}

/** @param {{label:string,color:string,value:string}} props */
function Cell({ label, color, value }) {
  const { styles } = useStyles();
  const { styles: text } = useText();
  return (
    <View style={styles.cell}>
      <Mono color={color} size={10}>
        {label}
      </Mono>
      <Copy style={text.value}>{value}</Copy>
    </View>
  );
}

const useStyles = themed((strands) => {
  const styles = StyleSheet.create({
    header: { gap: 4 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerButtons: { flexDirection: 'row', gap: 8 },
    titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
    place: { color: strands.place },
    attention: { color: strands.attention },
    body: { color: strands.body },
    missing: { gap: 8, paddingVertical: 12 },
    missingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    link: { minHeight: 32, justifyContent: 'center' },
    legend: { flexDirection: 'row', gap: 14, paddingLeft: 30 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    swatch: { width: 8, height: 8, borderRadius: 2 },
    roundSwatch: { borderRadius: 4 },
    loading: { height: 240, alignItems: 'center', justifyContent: 'center' },
    readoutHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    readout: { flexDirection: 'row', gap: 10 },
    cell: { flex: 1, gap: 3 },
    notesToggle: { minHeight: 44, justifyContent: 'center' },
    notes: { gap: 6 },
  });
  return styles;
});
