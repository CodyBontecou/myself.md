import { useTheme } from '../src/lib/theme';
import { StyleSheet, TextInput, View } from 'react-native';
import { Switch } from './Terminal.js';
import { Group, Row, Icon, Copy, SectionHeader } from '../src/components/ui';
/** @type {Record<string, string>} */
/** @type {Record<string,string>} */
const fieldIds = {
  JSON: 'export-format-json',
  JSONL: 'export-format-jsonl',
  'Completed days (1–30)': 'export-lookback-input',
  'Include today in manual exports': 'export-include-today',
  'Documents folder': 'export-folder-input',
  'Separate folders for JSON and JSONL': 'export-format-folders',
  'Daily filename template': 'export-filename-input',
  'Local hour (0–23)': 'schedule-hour-input',
  'Minute (0–59)': 'schedule-minute-input',
  'Today Refresh': 'schedule-today-refresh',
  'HTTPS endpoint': 'export-http-url-input',
  'Weekday (1 Monday – 7 Sunday)': 'schedule-weekday-input',
  'Every (1–365)': 'schedule-interval-input',
  'Anchor date (YYYY-MM-DD; blank uses opt-in day)': 'schedule-anchor-input',
};
/** @param {{section?:string,field?:string,settings:import('../core/export-files.js').ExportSettings,schedule:import('../core/schedules.js').ScheduleConfig,onSettings:(value:import('../core/export-files.js').ExportSettings)=>void,onSchedule:(value:import('../core/schedules.js').ScheduleConfig)=>void,disabled:boolean}} props */
export default function ExportSettingsEditor({
  section,
  field,
  settings,
  schedule,
  onSettings,
  onSchedule,
  disabled,
}) {
  const { colors } = useTheme();
  /** @param {string} label */
  function visible(label) {
    if (!field) return true;
    const group =
      {
        JSON: 'formats',
        JSONL: 'formats',
        'Completed days (1–30)': 'window',
        'Include today in manual exports': 'window',
        'Documents folder': 'folders',
        'Separate folders for JSON and JSONL': 'folders',
        'Daily filename template': 'filename',
        'Local hour (0–23)': 'time',
        'Minute (0–59)': 'time',
        'Today Refresh': 'refresh',
      }[label] ?? 'cadence';
    return field === group;
  }
  /** @param {string} label @param {string} value @param {(value:string)=>void} change @param {boolean} [numeric] */
  function input(label, value, change, numeric = false) {
    if (!visible(label)) return null;
    return (
      <View style={styles.field}>
        <Copy variant="caption" muted>
          {label}
        </Copy>
        <TextInput
          testID={fieldIds[label]}
          accessibilityLabel={label}
          editable={!disabled}
          value={value}
          onChangeText={change}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType={numeric ? 'number-pad' : 'default'}
          style={[
            styles.input,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />
      </View>
    );
  }
  /** @param {string} label @param {boolean} value @param {(value:boolean)=>void} change */
  function toggle(label, value, change) {
    if (!visible(label)) return null;
    return (
      <Row
        key={label}
        compact
        title={label}
        trailing={
          <Switch
            testID={fieldIds[label]}
            accessibilityLabel={label}
            disabled={disabled}
            value={value}
            onValueChange={change}
          />
        }
      />
    );
  }
  return (
    <View style={styles.container}>
      {(!section || section === 'destination') && (
        <>
          {!section && <SectionHeader compact title="Destination" />}
          <Group compact>
            {['local', 'http', 'cloud'].map((destination) => (
              <Choice
                key={destination}
                testID={`export-destination-${destination}`}
                selected={settings.destination === destination}
                title={
                  destination === 'local'
                    ? 'On this phone'
                    : destination === 'http'
                      ? 'HTTPS endpoint'
                      : 'Cloud service'
                }
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
          </Group>
          {settings.destination === 'http'
            ? input('HTTPS endpoint', settings.httpUrl ?? '', (v) =>
                onSettings({ ...settings, httpUrl: v || null }),
              )
            : null}
          <Copy variant="caption" muted>
            Remote exports send your selected data to the chosen destination. Save and use Export
            profile now, or opt in to automatic exports.
          </Copy>
        </>
      )}
      {(!section || section === 'output') && (
        <>
          {!section && <SectionHeader compact title="Output" />}
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
          {(!field || field === 'filename') && (
            <Copy variant="caption" muted>
              Use {'{date}'} or all of {'{year}'}, {'{month}'} and {'{day}'}. Matching daily files
              are replaced.
            </Copy>
          )}
          {toggle('Separate folders for JSON and JSONL', settings.formatFolders, (v) =>
            onSettings({ ...settings, formatFolders: v }),
          )}
        </>
      )}
      {(!section || section === 'schedule') && (
        <>
          {!section && <SectionHeader compact title="Schedule" />}
          {(!field || field === 'cadence') && (
            <Group compact>
              {['daily', 'weekly', 'custom'].map((frequency) => (
                <Choice
                  key={frequency}
                  testID={`schedule-frequency-${frequency}`}
                  selected={schedule.frequency === frequency}
                  title={
                    frequency === 'daily'
                      ? 'Daily'
                      : frequency === 'weekly'
                        ? 'Weekly'
                        : 'Custom interval'
                  }
                  disabled={disabled}
                  onPress={() =>
                    onSchedule({
                      ...schedule,
                      frequency:
                        /** @type {import('../core/schedules.js').ScheduleConfig['frequency']} */ (
                          frequency
                        ),
                    })
                  }
                />
              ))}
            </Group>
          )}
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
          {schedule.frequency === 'custom' && (!field || field === 'cadence') ? (
            <>
              {input(
                'Every (1–365)',
                String(schedule.interval),
                (v) => onSchedule({ ...schedule, interval: Number(v) }),
                true,
              )}
              {['day', 'week', 'month'].map((unit) => (
                <Choice
                  key={unit}
                  testID={`schedule-unit-${unit}`}
                  selected={schedule.unit === unit}
                  title={unit === 'day' ? 'Days' : unit === 'week' ? 'Weeks' : 'Months'}
                  disabled={disabled}
                  onPress={() =>
                    onSchedule({
                      ...schedule,
                      unit: /** @type {import('../core/schedules.js').ScheduleConfig['unit']} */ (
                        unit
                      ),
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
          {schedule.todayRefresh && (!field || field === 'refresh')
            ? [3, 6, 12].map((hours) => (
                <Choice
                  key={hours}
                  testID={`schedule-refresh-${hours}`}
                  selected={schedule.refreshHours === hours}
                  title={`Every ${hours} hours`}
                  disabled={disabled}
                  onPress={() =>
                    onSchedule({ ...schedule, refreshHours: /** @type {3|6|12} */ (hours) })
                  }
                />
              ))
            : null}
          {(!field || field === 'refresh') && (
            <Copy variant="caption" muted>
              Today Refresh rewrites the current day independently of completed-day runs. Save, then
              enable automatic exports on this profile.
            </Copy>
          )}
        </>
      )}
    </View>
  );
}
/** @param {{title:string,selected:boolean,disabled:boolean,onPress:()=>void,testID:string}} props */
function Choice({ title, selected, disabled, onPress, testID }) {
  return (
    <Row
      testID={testID}
      compact
      title={title}
      selected={selected}
      onPress={onPress}
      disabled={disabled}
      trailing={selected ? <Icon name="checkmark" /> : undefined}
    />
  );
}
const styles = StyleSheet.create({
  container: { gap: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',

    padding: 12,

    fontSize: 16,
    minHeight: 44,
  },
  field: { gap: 4 },
});
