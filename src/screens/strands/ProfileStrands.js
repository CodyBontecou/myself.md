import { Pressable, StyleSheet, View } from 'react-native';
import { Copy, Icon } from '../../components/ui.js';
import { fonts, inverse, themed } from './palette.js';

/** @param {number} fraction @returns {`${number}%`} */
function pct(fraction) {
  return `${Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10}%`;
}

/** Profiles tab header: count caption, title and the new-profile action.
 * @param {{caption:string,onNewProfile:()=>void,disabled:boolean,testID:string}} props */
export function ProfilesHeader({ caption, onNewProfile, disabled, testID }) {
  const { strands, styles } = useStyles();
  return (
    <View style={styles.header}>
      <View style={styles.fill}>
        <Copy style={styles.caption}>{caption}</Copy>
        <Copy accessibilityRole="header" style={styles.title}>
          Profiles
        </Copy>
      </View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="New profile"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onNewProfile}
        style={({ pressed }) => [
          styles.newButton,
          { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
        ]}
      >
        <Icon name="add" size={22} color={strands.ground} />
      </Pressable>
    </View>
  );
}

/** Mono section label used between Strands cards.
 * @param {{title:string}} props */
export function SectionLabel({ title }) {
  const { styles } = useStyles();
  return (
    <Copy accessibilityRole="header" style={styles.sectionLabel}>
      {title.toUpperCase()}
    </Copy>
  );
}

/** Inverted card counting down to a profile's next scheduled export, with a Run now action.
 * @param {{testID:string,name?:string,countdown:string,meta:string,mix:{health:number,time:number,location:number},runLabel:string,busy:boolean,disabled:boolean,onRun:()=>void,onDisabledPress?:()=>void,status?:string,onOpen?:()=>void,openTestID?:string}} props */
export function NextExportCard({
  testID,
  name,
  countdown,
  meta,
  mix,
  runLabel,
  busy,
  disabled,
  onRun,
  onDisabledPress,
  status,
  onOpen,
  openTestID,
}) {
  const { strands, styles } = useStyles();
  const ink = inverse(strands);
  const parts = [
    { key: 'health', label: 'Health', count: mix.health, color: ink.body },
    { key: 'time', label: 'Screen', count: mix.time, color: ink.attention },
    { key: 'location', label: 'Location', count: mix.location, color: ink.place },
  ];
  const selected = parts.filter((part) => part.count > 0);
  const blocked = disabled && !onDisabledPress;
  return (
    <View style={styles.hero}>
      <View style={styles.spread}>
        <Copy style={[styles.heroMono, { color: ink.muted }]}>NEXT EXPORT</Copy>
        <Copy style={[styles.heroMono, styles.shrink, { color: ink.muted }]}>{meta}</Copy>
      </View>
      <Copy style={[styles.countdown, { color: ink.text }]}>{countdown}</Copy>
      {name ? <Copy style={[styles.heroName, { color: ink.text }]}>{name}</Copy> : null}
      <View
        accessible
        accessibilityLabel={
          selected.length
            ? selected.map((part) => `${part.count} ${part.label}`).join(', ')
            : 'No data selected'
        }
        style={styles.mix}
      >
        {selected.length ? (
          selected.map((part) => (
            <View
              key={part.key}
              style={[styles.mixPart, { flex: part.count, backgroundColor: part.color }]}
            />
          ))
        ) : (
          <View style={[styles.mixPart, styles.fill, { backgroundColor: ink.rule }]} />
        )}
      </View>
      <Copy style={[styles.heroMono, { color: ink.muted }]}>
        {selected.length
          ? selected.map((part) => `${part.count} ${part.label}`).join(' · ')
          : 'No data selected yet'}
      </Copy>
      <View style={styles.heroActions}>
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={runLabel}
          accessibilityState={{ disabled: blocked, busy }}
          accessibilityHint={
            disabled && onDisabledPress ? 'Explains why this action is unavailable' : undefined
          }
          disabled={blocked}
          onPress={disabled ? onDisabledPress : onRun}
          style={({ pressed }) => [
            styles.runButton,
            { opacity: disabled || busy ? 0.6 : pressed ? 0.75 : 1 },
          ]}
        >
          <Icon name="download-outline" size={16} color={strands.text} />
          <Copy style={styles.runLabel}>{runLabel}</Copy>
        </Pressable>
        {onOpen ? (
          <Pressable
            testID={openTestID}
            accessibilityRole="button"
            accessibilityLabel={name ? `Open ${name}` : 'Open profile'}
            onPress={onOpen}
            style={({ pressed }) => [
              styles.openButton,
              { borderColor: ink.rule, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Copy style={[styles.openLabel, { color: ink.text }]}>Open</Copy>
          </Pressable>
        ) : null}
      </View>
      {status ? (
        <View accessibilityLiveRegion="polite">
          <Copy style={[styles.heroStatus, { color: ink.muted }]}>{status}</Copy>
        </View>
      ) : null}
    </View>
  );
}

/** @typedef {{id:string,name:string,runs:{at:number,passed:boolean}[],label:string}} ScheduleLane */

/** Today's scheduled export slots per profile on one 24-hour rail.
 * @param {{lanes:ScheduleLane[],now:number,caption:string,testID?:string}} props */
export function TodaySchedule({ lanes, now, caption, testID }) {
  const { styles } = useStyles();
  return (
    <View testID={testID} style={styles.card}>
      <View style={styles.spread}>
        <Copy style={styles.mono}>TODAY</Copy>
        <Copy style={styles.mono}>{caption}</Copy>
      </View>
      <View style={styles.lanes}>
        {lanes.map((lane) => (
          <View key={lane.id} accessible accessibilityLabel={lane.label} style={styles.lane}>
            <Copy style={styles.laneName}>{lane.name}</Copy>
            <View style={styles.rail}>
              <View style={styles.railLine} />
              <View style={[styles.nowLine, { left: pct(now) }]} />
              {lane.runs.map((run) => (
                <View
                  key={run.at}
                  style={[
                    styles.tick,
                    { left: pct(run.at) },
                    run.passed ? styles.tickPassed : styles.tickUpcoming,
                  ]}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        {['00', '06', '12', '18', '24'].map((hour) => (
          <Copy key={hour} style={styles.axisLabel}>
            {hour}
          </Copy>
        ))}
      </View>
    </View>
  );
}

/** One dot per local day, filled when this profile has exported that day's data. Tapping
 * dots toggles individual days (see `selectDay`), which the footer exports.
 * @param {{days:{day:string,label:string,name:string,done:boolean,today:boolean,selected:boolean}[],caption:string,onSelectDay:(day:string)=>void,selectionLabel:string,onExport:()=>void,onClear:()=>void,disabled:boolean}} props */
export function RecentDays({
  days,
  caption,
  onSelectDay,
  selectionLabel,
  onExport,
  onClear,
  disabled,
}) {
  const { styles } = useStyles();
  const count = days.filter((day) => day.done).length;
  return (
    <View testID="profile-recent-days" style={styles.recent}>
      <View style={styles.spread}>
        <Copy style={[styles.mono, styles.shrinkLeft]}>
          LAST {days.length} DAYS · {count} EXPORTED
        </Copy>
        <Copy style={styles.mono}>{caption}</Copy>
      </View>
      <View style={styles.dots}>
        {days.map((day) => (
          <Pressable
            key={day.day}
            testID={`profile-recent-day-${day.day}`}
            accessibilityRole="button"
            accessibilityLabel={`${day.name}, ${day.done ? 'exported' : 'not exported'}`}
            accessibilityHint="Selects this day for export"
            accessibilityState={{ selected: day.selected }}
            onPress={() => onSelectDay(day.day)}
            style={({ pressed }) => [styles.dayColumn, pressed && styles.dayPressed]}
          >
            <View
              style={[
                styles.dot,
                day.selected ? styles.dotSelected : day.done ? styles.dotDone : styles.dotEmpty,
              ]}
            />
            <Copy style={[styles.dayLabel, (day.today || day.selected) && styles.dayLabelStrong]}>
              {day.label}
            </Copy>
          </Pressable>
        ))}
      </View>
      {selectionLabel ? (
        <View style={styles.selectionBar}>
          <Pressable
            testID="profile-recent-days-export"
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            onPress={onExport}
            style={({ pressed }) => [
              styles.selectionExport,
              { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
            ]}
          >
            <Copy style={styles.selectionExportLabel}>{selectionLabel}</Copy>
          </Pressable>
          <Pressable
            testID="profile-recent-days-clear"
            accessibilityRole="button"
            onPress={onClear}
            style={({ pressed }) => [styles.selectionClear, pressed && styles.dayPressed]}
          >
            <Copy style={styles.selectionClearLabel}>Clear</Copy>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = themed((strands) => {
  const styles = StyleSheet.create({
    fill: { flex: 1 },
    shrink: { flexShrink: 1, textAlign: 'right' },
    shrinkLeft: { flexShrink: 1 },
    header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 4 },
    caption: { fontFamily: fonts.mono, fontSize: 12, color: strands.muted },
    title: {
      marginTop: 6,
      fontFamily: fonts.semibold,
      fontSize: 40,
      lineHeight: 42,
      letterSpacing: -1.2,
      color: strands.text,
    },
    newButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: strands.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionLabel: {
      marginTop: 8,
      paddingHorizontal: 8,
      fontFamily: fonts.mono,
      fontSize: 11,
      letterSpacing: 0.5,
      color: strands.muted,
    },
    spread: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    hero: { backgroundColor: strands.text, borderRadius: 26, padding: 18, gap: 6 },
    heroMono: { fontFamily: fonts.mono, fontSize: 11 },
    countdown: {
      marginTop: 4,
      fontFamily: fonts.semibold,
      fontSize: 44,
      lineHeight: 48,
      letterSpacing: -1.3,
    },
    heroName: { fontFamily: fonts.medium, fontSize: 16 },
    mix: { marginTop: 8, flexDirection: 'row', gap: 4, height: 6 },
    mixPart: { borderRadius: 3 },
    heroActions: { marginTop: 8, flexDirection: 'row', gap: 8 },
    runButton: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 22,
      backgroundColor: strands.ground,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    runLabel: { fontFamily: fonts.semibold, fontSize: 14, color: strands.text },
    openButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 22,
      borderWidth: 1,
      justifyContent: 'center',
    },
    openLabel: { fontFamily: fonts.medium, fontSize: 14 },
    heroStatus: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
    card: {
      backgroundColor: strands.surface,
      borderColor: strands.line,
      borderWidth: 1,
      borderRadius: 22,
      padding: 16,
      gap: 14,
    },
    mono: { fontFamily: fonts.mono, fontSize: 11, color: strands.muted },
    lanes: { gap: 10 },
    lane: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    laneName: { width: 96, fontFamily: fonts.regular, fontSize: 12, color: strands.soft },
    rail: { flex: 1, height: 18 },
    railLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 8,
      height: 2,
      backgroundColor: strands.line,
    },
    nowLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: strands.place },
    tick: {
      position: 'absolute',
      top: 4,
      width: 10,
      height: 10,
      marginLeft: -5,
      borderRadius: 5,
      borderWidth: 2,
    },
    tickPassed: { backgroundColor: strands.text, borderColor: strands.text },
    tickUpcoming: { backgroundColor: strands.surface, borderColor: strands.muted },
    axis: { marginLeft: 106, flexDirection: 'row', justifyContent: 'space-between' },
    axisLabel: { fontFamily: fonts.mono, fontSize: 10, color: strands.faint },
    recent: { gap: 10, paddingVertical: 12, paddingHorizontal: 12 },
    dots: { flexDirection: 'row', gap: 2 },
    dayColumn: {
      flex: 1,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    dayPressed: { opacity: 0.6 },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
    dotDone: { backgroundColor: strands.text, borderColor: strands.text },
    dotEmpty: { backgroundColor: 'transparent', borderColor: strands.rule },
    dotSelected: { backgroundColor: strands.body, borderColor: strands.body },
    dayLabel: { fontFamily: fonts.mono, fontSize: 10, color: strands.muted },
    dayLabelStrong: { color: strands.text },
    selectionBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    selectionExport: {
      flex: 1,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 22,
      backgroundColor: strands.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectionExportLabel: { fontFamily: fonts.semibold, fontSize: 14, color: strands.ground },
    selectionClear: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
    selectionClearLabel: { fontFamily: fonts.medium, fontSize: 14, color: strands.muted },
  });
  return styles;
});
