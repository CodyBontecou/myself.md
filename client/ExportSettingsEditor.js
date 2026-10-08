import { useTheme } from '../src/lib/theme';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button, Text, Switch } from './Terminal.js';
/** @param {{settings:import('../core/export-files.js').ExportSettings,schedule:import('../core/schedules.js').ScheduleConfig,onSettings:(value:import('../core/export-files.js').ExportSettings)=>void,onSchedule:(value:import('../core/schedules.js').ScheduleConfig)=>void,disabled:boolean}} props */
export default function ExportSettingsEditor({
  settings,
  schedule,
  onSettings,
  onSchedule,
  disabled,
}) {
  const { colors } = useTheme();
  const styles = themedStyles(colors);
  /** @param {string} label @param {string} value @param {(value:string)=>void} change @param {boolean} [numeric] */
  function input(label, value, change, numeric = false) {
    return (
      <View>
        <Text>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          editable={!disabled}
          value={value}
          onChangeText={change}
          keyboardType={numeric ? 'number-pad' : 'default'}
          style={styles.input}
        />
      </View>
    );
  }
  /** @param {string} label @param {boolean} value @param {(value:boolean)=>void} change */
  function toggle(label, value, change) {
    return (
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Switch
          accessibilityLabel={label}
          disabled={disabled}
          value={value}
          onValueChange={change}
        />
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <Text>EXPORT DESTINATION</Text>
      {['local', 'http', 'cloud'].map((destination) => (
        <Button
          key={destination}
          title={`${settings.destination === destination ? '[X] ' : ''}${destination === 'local' ? 'Local JSON / JSONL files' : destination === 'http' ? 'HTTP request' : 'Cloud service'}`}
          disabled={disabled}
          onPress={() =>
            onSettings({
              ...settings,
              destination:
                /** @type {import('../core/export-files.js').ExportSettings['destination']} */ (
                  destination
                ),
            })
          }
        />
      ))}
      {settings.destination === 'http'
        ? input('HTTPS endpoint', settings.httpUrl ?? '', (v) =>
            onSettings({ ...settings, httpUrl: v || null }),
          )
        : null}
      <Text>
        Remote exports send your selected data to the chosen destination. Save and use Export
        profile now, or opt in to automatic exports.
      </Text>
      <Text>EXPORT FILE SETTINGS</Text>
      {['json', 'jsonl'].map((format) =>
        toggle(
          format.toUpperCase(),
          settings.formats.includes(
            /** @type {import('../core/export-files.js').ExportFormat} */ (format),
          ),
          (v) =>
            onSettings({
              ...settings,
              formats: v
                ? [
                    ...settings.formats,
                    /** @type {import('../core/export-files.js').ExportFormat} */ (format),
                  ]
                : settings.formats.filter((f) => f !== format),
            }),
        ),
      )}
      {input(
        'Completed days (1–30)',
        String(settings.lookbackDays),
        (v) => onSettings({ ...settings, lookbackDays: Number(v) }),
        true,
      )}
      {toggle('Include today in manual exports', settings.includeToday, (v) =>
        onSettings({ ...settings, includeToday: v }),
      )}
      {input('Documents folder', settings.folderName, (v) =>
        onSettings({ ...settings, folderName: v }),
      )}
      {input('Daily filename template', settings.filenameTemplate, (v) =>
        onSettings({ ...settings, filenameTemplate: v }),
      )}
      <Text>
        Use {'{date}'} or all of {'{year}'}, {'{month}'} and {'{day}'}. Matching daily files are
        replaced.
      </Text>
      {toggle('Separate folders for JSON and JSONL', settings.formatFolders, (v) =>
        onSettings({ ...settings, formatFolders: v }),
      )}
      <Text>SCHEDULE SETTINGS</Text>
      {['daily', 'weekly', 'custom'].map((frequency) => (
        <Button
          key={frequency}
          title={`${schedule.frequency === frequency ? '[X] ' : ''}${frequency}`}
          disabled={disabled}
          onPress={() =>
            onSchedule({
              ...schedule,
              frequency: /** @type {import('../core/schedules.js').ScheduleConfig['frequency']} */ (
                frequency
              ),
            })
          }
        />
      ))}
      {input(
        'Local hour (0–23)',
        String(schedule.hour),
        (v) => onSchedule({ ...schedule, hour: Number(v) }),
        true,
      )}
      {input(
        'Minute (0–59)',
        String(schedule.minute),
        (v) => onSchedule({ ...schedule, minute: Number(v) }),
        true,
      )}
      {schedule.frequency === 'weekly'
        ? input(
            'Weekday (1 Monday – 7 Sunday)',
            String(schedule.weekday),
            (v) => onSchedule({ ...schedule, weekday: Number(v) }),
            true,
          )
        : null}
      {schedule.frequency === 'custom' ? (
        <>
          {input(
            'Every (1–365)',
            String(schedule.interval),
            (v) => onSchedule({ ...schedule, interval: Number(v) }),
            true,
          )}
          {['day', 'week', 'month'].map((unit) => (
            <Button
              key={unit}
              title={`${schedule.unit === unit ? '[X] ' : ''}${unit}`}
              disabled={disabled}
              onPress={() =>
                onSchedule({
                  ...schedule,
                  unit: /** @type {import('../core/schedules.js').ScheduleConfig['unit']} */ (unit),
                })
              }
            />
          ))}
          {input(
            'Anchor date (YYYY-MM-DD; blank uses opt-in day)',
            schedule.anchorDate ?? '',
            (v) => onSchedule({ ...schedule, anchorDate: v || null }),
          )}
        </>
      ) : null}
      {toggle('Today Refresh', schedule.todayRefresh, (v) =>
        onSchedule({ ...schedule, todayRefresh: v }),
      )}
      {schedule.todayRefresh
        ? [3, 6, 12].map((hours) => (
            <Button
              key={hours}
              title={`${schedule.refreshHours === hours ? '[X] ' : ''}Refresh every ${hours} hours`}
              disabled={disabled}
              onPress={() =>
                onSchedule({ ...schedule, refreshHours: /** @type {3|6|12} */ (hours) })
              }
            />
          ))
        : null}
      <Text>
        Today Refresh rewrites the current day independently of completed-day runs. Save, then
        enable automatic exports on the profile card.
      </Text>
    </View>
  );
}
const themedStyles = (colors) => StyleSheet.create({
  container: { gap: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: 12,
    color: colors.text,
    fontSize: 16,
    minHeight: 44,
  },
  row: { minHeight: 44, flexDirection: 'row', gap: 12, alignItems: 'center' },
  label: { flex: 1 },
});
