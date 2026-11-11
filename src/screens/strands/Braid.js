import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { sorted } from '../../../core/collections.js';
import { Copy } from '../../components/ui.js';
import { fonts, themed } from './palette.js';

/** @typedef {ReturnType<typeof import('../../../core/strands.js').strandsDay>} Day */

const hourHeight = 22;
const gapMs = 45 * 60000;

/** @param {number} ms */
export function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** @param {number} ms */
function span(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

/** First hour with any observation, never later than 07:00. @param {Day} day */
function firstHour(day) {
  const start = Date.parse(day.start);
  const times = [
    ...day.place.runs.map((r) => Date.parse(r.start)),
    ...day.body.samples.map((s) => Date.parse(s.time)),
    ...day.body.steps.map((h) => Date.parse(h.start)),
    ...day.body.sleep.map((i) => Date.parse(i.start)),
    ...day.attention.hours.filter((h) => (h.minutes ?? 0) > 0).map((h) => Date.parse(h.start)),
  ];
  const earliest = times.length ? Math.min(...times) : start + 7 * 3600000;
  return Math.max(0, Math.min(7, Math.floor((earliest - start) / 3600000 / 2) * 2));
}

/** @param {{day:Day,placeLabel:(id:string|null)=>string,selected:number|null,onSelect:(ms:number)=>void}} props */
export default function Braid({ day, placeLabel, selected, onSelect }) {
  const { strands, styles } = useStyles();
  const [width, setWidth] = useState(0);
  const dayStart = Date.parse(day.start);
  const from = firstHour(day);
  const height = (24 - from) * hourHeight;
  const y = (/** @type {number} */ ms) =>
    Math.max(0, Math.min(height, ((ms - dayStart) / 3600000 - from) * hourHeight));
  const lane = {
    place: [0, width * 0.31],
    attention: [width * 0.35, width * 0.63],
    body: [width * 0.67, width],
  };
  const bpms = day.body.samples.map((s) => s.bpm);
  const low = bpms.length ? Math.min(...bpms) - 6 : 40;
  const high = bpms.length ? Math.max(...bpms) + 6 : 180;
  const hx = (/** @type {number} */ bpm) =>
    (lane.body[0] ?? 0) +
    ((bpm - low) / (high - low || 1)) * ((lane.body[1] ?? 0) - (lane.body[0] ?? 0));
  const segments = heartSegments(day.body.samples);
  const bodyWidth = (lane.body[1] ?? 0) - (lane.body[0] ?? 0);
  const mostSteps = Math.max(1, ...day.body.steps.map((h) => h.count));
  // With a heart-rate line on top, steps recede to a narrow underlay.
  const stepScale = segments.length ? 0.45 : 1;
  const near =
    selected === null
      ? null
      : day.body.samples.reduce((best, s) => {
          const gap = Math.abs(Date.parse(s.time) - selected);
          return gap <= 15 * 60000 && (!best || gap < best.gap) ? { bpm: s.bpm, gap } : best;
        }, /** @type {{bpm:number,gap:number}|null} */ (null));
  const hours = Array.from(
    { length: Math.ceil((24 - from) / 2) + 1 },
    (_, k) => from + k * 2,
  ).filter((h) => h < 24);
  return (
    <View style={styles.row}>
      <View style={[styles.labels, { height }]}>
        {hours.map((h) => (
          <Copy key={h} style={[styles.hour, { top: (h - from) * hourHeight - 6 }]}>
            {String(h).padStart(2, '0')}
          </Copy>
        ))}
      </View>
      <Pressable
        testID="strands-braid"
        accessibilityRole="adjustable"
        accessibilityLabel={`Timeline for ${day.date}. Selected ${selected === null ? 'nothing' : clock(selected)}. Swipe up or down to move one hour.`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) =>
          onSelect(
            (selected ?? dayStart + 12 * 3600000) +
              (event.nativeEvent.actionName === 'increment' ? 1 : -1) * 3600000,
          )
        }
        onPress={(event) =>
          onSelect(dayStart + (from + event.nativeEvent.locationY / hourHeight) * 3600000)
        }
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[styles.plot, { height }]}
      >
        {width > 0 && (
          <Svg width={width} height={height}>
            <G>
              {hours.map((h) => (
                <Line
                  key={h}
                  x1={0}
                  x2={width}
                  y1={(h - from) * hourHeight + 0.5}
                  y2={(h - from) * hourHeight + 0.5}
                  stroke={strands.grid}
                  strokeWidth={1}
                />
              ))}
            </G>
            {day.place.runs.map((run) => {
              const top = y(Date.parse(run.start));
              const h = y(Date.parse(run.end)) - top;
              const x0 = lane.place[0] ?? 0,
                w = (lane.place[1] ?? 0) - x0;
              if (h < 6)
                return (
                  <Rect
                    key={`${run.start}-${run.placeId}`}
                    x={x0}
                    y={top - 1.5}
                    width={w}
                    height={3}
                    rx={1.5}
                    fill={run.placeId === null ? strands.faint : strands.place}
                    fillOpacity={run.placeId === null ? 0.4 : 0.75}
                  />
                );
              return (
                <G key={`${run.start}-${run.placeId}`}>
                  <Rect
                    x={x0}
                    y={top}
                    width={w}
                    height={h}
                    rx={6}
                    fill={strands.place}
                    fillOpacity={run.placeId === null ? 0 : 0.16}
                    stroke={run.placeId === null ? strands.faint : strands.place}
                    strokeOpacity={run.placeId === null ? 0.7 : 0.5}
                    strokeDasharray={run.placeId === null ? '3 3' : 'none'}
                  />
                  {h >= 18 && (
                    <SvgText
                      x={x0 + 8}
                      y={top + 14}
                      fill={strands.place}
                      fontSize={10}
                      fontFamily={fonts.mono}
                    >
                      {placeLabel(run.placeId)}
                    </SvgText>
                  )}
                  {h >= 32 && (
                    <SvgText
                      x={x0 + 8}
                      y={top + 27}
                      fill={strands.faint}
                      fontSize={10}
                      fontFamily={fonts.mono}
                    >
                      {span(Date.parse(run.end) - Date.parse(run.start))}
                    </SvgText>
                  )}
                </G>
              );
            })}
            {day.attention.hours.map((h) =>
              h.minutes ? (
                <Rect
                  key={h.start}
                  x={lane.attention[0] ?? 0}
                  y={y(Date.parse(h.start)) + 4}
                  width={Math.max(
                    3,
                    (Math.min(60, h.minutes) / 60) *
                      ((lane.attention[1] ?? 0) - (lane.attention[0] ?? 0)),
                  )}
                  height={hourHeight - 8}
                  rx={2}
                  fill={strands.attention}
                  fillOpacity={0.45 + Math.min(0.55, h.minutes / 60)}
                />
              ) : null,
            )}
            {day.body.sleep.map((interval) => {
              const top = y(Date.parse(interval.start));
              const h = y(Date.parse(interval.end)) - top;
              return h > 0 ? (
                <Rect
                  key={`sleep-${interval.start}`}
                  x={lane.body[0] ?? 0}
                  y={top}
                  width={bodyWidth}
                  height={h}
                  fill={strands.body}
                  fillOpacity={0.1}
                />
              ) : null;
            })}
            {day.body.steps.map((h) => (
              <Rect
                key={`steps-${h.start}`}
                x={lane.body[0] ?? 0}
                y={y(Date.parse(h.start)) + 4}
                width={Math.max(3, (h.count / mostSteps) * bodyWidth * stepScale)}
                height={hourHeight - 8}
                rx={2}
                fill={strands.body}
                fillOpacity={segments.length ? 0.25 : 0.35 + 0.5 * (h.count / mostSteps)}
              />
            ))}
            {segments.map((segment) => {
              const points = segment.map(
                (s) => `${hx(s.bpm).toFixed(1)} ${y(Date.parse(s.time)).toFixed(1)}`,
              );
              const first = segment[0],
                last = segment.at(-1);
              if (!first || !last) return null;
              const line = `M${points.join(' L')}`;
              const area = `${line} L${(lane.body[0] ?? 0).toFixed(1)} ${y(Date.parse(last.time)).toFixed(1)} L${(lane.body[0] ?? 0).toFixed(1)} ${y(Date.parse(first.time)).toFixed(1)} Z`;
              return (
                <G key={first.time}>
                  <Path d={area} fill={strands.body} fillOpacity={0.12} />
                  <Path
                    d={line}
                    fill="none"
                    stroke={strands.body}
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </G>
              );
            })}
            {selected !== null && (
              <G>
                <Line
                  x1={0}
                  x2={width}
                  y1={y(selected)}
                  y2={y(selected)}
                  stroke={strands.text}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                {near && (
                  <Circle
                    cx={hx(near.bpm)}
                    cy={y(selected)}
                    r={4}
                    fill={strands.ground}
                    stroke={strands.body}
                    strokeWidth={2}
                  />
                )}
              </G>
            )}
          </Svg>
        )}
      </Pressable>
      <View style={[styles.moments, { height }]}>
        {day.moments.map((m) => {
          const at = Date.parse(m.time);
          const active = selected !== null && Math.abs(selected - at) < 60000;
          return (
            <Pressable
              key={`${m.kind}-${m.time}`}
              accessibilityRole="button"
              accessibilityLabel={`${clock(at)}, ${m.label}`}
              accessibilityState={{ selected: active }}
              hitSlop={8}
              onPress={() => onSelect(at)}
              style={[styles.moment, { top: y(at) - 14 }, active ? styles.momentActive : null]}
            >
              <View style={styles.momentDot} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Contiguous heart-rate runs; gaps over 45 minutes are left open, not drawn through.
 * @param {{time:string,bpm:number}[]} samples */
function heartSegments(samples) {
  /** @type {{time:string,bpm:number}[][]} */
  const out = [];
  for (const s of sorted(samples, (a, b) => a.time.localeCompare(b.time))) {
    const current = out.at(-1);
    const last = current?.at(-1);
    if (current && last && Date.parse(s.time) - Date.parse(last.time) <= gapMs) current.push(s);
    else out.push([s]);
  }
  return out;
}

const useStyles = themed((strands) => {
  const styles = StyleSheet.create({
    row: { flexDirection: 'row', gap: 8 },
    labels: { width: 22, position: 'relative' },
    hour: {
      position: 'absolute',
      left: 0,
      fontFamily: fonts.mono,
      fontSize: 10,
      color: strands.faint,
    },
    plot: { flex: 1 },
    moments: { width: 30, position: 'relative' },
    moment: {
      position: 'absolute',
      left: 1,
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: strands.rule,
      backgroundColor: strands.ground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    momentActive: { borderColor: strands.text, backgroundColor: strands.line },
    momentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: strands.text },
  });
  return styles;
});
