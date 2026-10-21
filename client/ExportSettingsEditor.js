import { exportWriteModes } from '../core/export-files.js';
import { scheduleIntervalMs } from '../core/schedules.js';
import LocalExportFolder from './LocalExportFolder.js';
import SchemaViewer from './SchemaViewer.js';
import { useState } from 'react';
import { exportSchemas } from '../core/export-schemas.js';
import { useTheme } from '../src/lib/theme';
import { StyleSheet, TextInput, View } from 'react-native';
import { Checkbox } from './Terminal.js';
import { Group, Row, Icon, Copy, SectionHeader } from '../src/components/ui';
/** @type {Record<string, string>} */
/** @type {Record<string,string>} */
const fieldIds = {
  JSON: 'export-format-json',
  JSONL: 'export-format-jsonl',
  'Completed days (1–30)': 'export-lookback-input',
  'Include today in exports': 'export-include-today',
  'Separate folders for JSON and JSONL': 'export-format-folders',
  'Daily filename template': 'export-filename-input',
  'Local hour (0–23)': 'schedule-hour-input',
  'Minute (0–59)': 'schedule-minute-input',
  'Today Refresh': 'schedule-today-refresh',
  'Daily times (HH:mm, separated by commas)': 'schedule-daily-times-input',
  'Refresh every (1–24 hours)': 'schedule-refresh-hours-input',
  'HTTPS endpoint': 'export-http-url-input',
  'Weekday (1 Monday – 7 Sunday)': 'schedule-weekday-input',
  'Every (1–365)': 'schedule-interval-input',
  'Anchor date (YYYY-MM-DD; blank uses opt-in day)': 'schedule-anchor-input',
};
/** @param {{section?:string,field?:string,folderContext?:{owner:string,deviceId:string},settings:import('../core/export-files.js').ExportSettings,schedule:import('../core/schedules.js').ScheduleConfig,onSettings:(value:import('../core/export-files.js').ExportSettings)=>void,onSchedule:(value:import('../core/schedules.js').ScheduleConfig)=>void,disabled:boolean}} props */
export default function ExportSettingsEditor({
  section,
  field,
  folderContext,
  settings,
  schedule,
  onSettings,
  onSchedule,
  disabled,
}) {
  const { colors } = useTheme();
  const [details, setDetails] = useState(false);
  const registry = exportSchemas();
  const elapsed = scheduleIntervalMs(schedule) !== null;
  /** @param {string} label */
  function visible(label) {
    if (elapsed && ['Local hour (0–23)', 'Minute (0–59)', 'Today Refresh'].includes(label))
      return false;
    if (!field) return true;
    const group =
      {
        JSON: 'formats',
        JSONL: 'formats',
        'Completed days (1–30)': 'window',
        'Include today in exports': 'window',
        'Separate folders for JSON and JSONL': 'folders',
        'Daily filename template': 'filename',
        'Local hour (0–23)': 'time',
        'Minute (0–59)': 'time',
        'Today Refresh': 'refresh',
        'Daily times (HH:mm, separated by commas)': 'time',
        'Refresh every (1–24 hours)': 'refresh',
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
          <Checkbox
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
        </>
      )}
      {(!section || section === 'output') && (
        <>
          {!section && <SectionHeader compact title="Output" />}
          {(!field || field === 'schema') && (
            <>
              <Copy variant="caption" muted>
                Schema version
              </Copy>
              <Group compact>
                {registry.versions.map((version) => (
                  <Choice
                    key={version.id}
                    testID={`export-schema-${version.version}`}
                    title={`${version.version} — ${version.title}${version.id === registry.recommended ? ' (recommended)' : ''}`}
                    selected={settings.schema === version.id}
                    disabled={disabled}
                    onPress={() => onSettings({ ...settings, schema: version.id })}
                  />
                ))}
                <Row
                  compact
                  title="View schema and example"
                  testID="export-schema-details"
                  selected={false}
                  onPress={() => setDetails(!details)}
                  trailing={<Icon name={details ? 'chevron-up' : 'chevron-down'} />}
                />
              </Group>
              <Copy variant="caption" muted>
                Saved profiles keep this version when new versions are released.
              </Copy>
              {details &&
                registry.versions
                  .filter((v) => v.id === settings.schema)
                  .map((version) => (
                    <View key={version.id} style={styles.field}>
                      <Copy variant="caption">{version.description}</Copy>
                      <Copy variant="caption">{version.changes.join('\n')}</Copy>
                      <SchemaViewer version={version} />
                    </View>
                  ))}
            </>
          )}
          {settings.destination === 'cloud'
            ? visible('JSON') && (
                <Copy variant="caption" muted testID="export-format-cloud">
                  Cloud stores JSONL files grouped by day. Your file choice controls repeated
                  exports.
                </Copy>
              )
            : ['json', 'jsonl'].map((format) =>
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
          {toggle('Include today in exports', settings.includeToday, (v) =>
            onSettings({ ...settings, includeToday: v }),
          )}
          {settings.destination !== 'http' && (
            <>
              {(!field || field === 'writeMode') && (
                <Group compact>
                  {exportWriteModes.map((mode) => (
                    <Choice
                      key={mode.value}
                      testID={`export-write-mode-${mode.value}`}
                      title={mode.title}
                      subtitle={
                        settings.destination === 'cloud' ? mode.cloudDescription : mode.description
                      }
                      selected={(settings.writeMode ?? 'replace') === mode.value}
                      disabled={disabled}
                      onPress={() =>
                        onSettings({
                          ...settings,
                          writeMode:
                            /** @type {import('../core/export-files.js').ExportWriteMode} */ (
                              mode.value
                            ),
                        })
                      }
                    />
                  ))}
                </Group>
              )}
            </>
          )}
          {settings.destination === 'cloud' && (!field || field === 'writeMode') && (
            <Copy variant="caption" muted>
              Append or replace the latest file for the same profile, day and schema. New file keeps
              each run as a separate snapshot. Older snapshots stay available. Appending full-day
              exports may duplicate records; a combined file is limited to 16 MiB and 50,000
              records.
            </Copy>
          )}
          {settings.destination === 'local' && (
            <>
              {(!field || field === 'folders') && folderContext && (
                <LocalExportFolder
                  context={folderContext}
                  settings={settings}
                  onSettings={onSettings}
                  disabled={disabled}
                />
              )}
              {input('Daily filename template', settings.filenameTemplate, (v) =>
                onSettings({ ...settings, filenameTemplate: v }),
              )}
              {(!field || field === 'filename') && (
                <Copy variant="caption" muted>
                  Use {'{date}'} or all of {'{year}'}, {'{month}'} and {'{day}'}. The version suffix
                  is added automatically.
                </Copy>
              )}
              {toggle('Separate folders for JSON and JSONL', settings.formatFolders, (v) =>
                onSettings({ ...settings, formatFolders: v }),
              )}
            </>
          )}
        </>
      )}
      {(!section || section === 'schedule') && (
        <>
          {!section && <SectionHeader compact title="Schedule" />}
          {!field && (
            <Copy variant="caption" muted>
              {settings.destination !== 'http'
                ? `Each automatic export uses your Output setting: ${exportWriteModes.find((mode) => mode.value === (settings.writeMode ?? 'replace'))?.title}.`
                : 'Each run uploads a complete export. Your HTTPS endpoint controls whether files are appended, replaced or kept separately.'}
            </Copy>
          )}
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
          {schedule.frequency === 'daily' && (
            <>
              {input(
                'Daily times (HH:mm, separated by commas)',
                (schedule.dailyTimes ?? []).join(', '),
                (value) =>
                  onSchedule({
                    ...schedule,
                    dailyTimes: value ? value.split(',').map((time) => time.trim()) : [],
                  }),
              )}
              {(!field || field === 'time') && (
                <Copy variant="caption" muted>
                  Add as many different times as you need, for example 08:00, 12:30, 18:00. Leave
                  blank to use the time below. Include today in Output to capture today’s data at
                  each run.
                </Copy>
              )}
            </>
          )}
          {!(schedule.frequency === 'daily' && schedule.dailyTimes?.length) &&
            input(
              'Local hour (0–23)',
              String(schedule.hour),
              (v) => onSchedule({ ...schedule, hour: Number(v) }),
              true,
            )}
          {!(schedule.frequency === 'daily' && schedule.dailyTimes?.length) &&
            input(
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
              {['minute', 'hour', 'day', 'week', 'month'].map((unit) => (
                <Choice
                  key={unit}
                  testID={`schedule-unit-${unit}`}
                  selected={schedule.unit === unit}
                  title={
                    unit === 'minute'
                      ? 'Minutes'
                      : unit === 'hour'
                        ? 'Hours'
                        : unit === 'day'
                          ? 'Days'
                          : unit === 'week'
                            ? 'Weeks'
                            : 'Months'
                  }
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
              {!elapsed &&
                input(
                  'Anchor date (YYYY-MM-DD; blank uses opt-in day)',
                  schedule.anchorDate ?? '',
                  (v) => onSchedule({ ...schedule, anchorDate: v || null }),
                )}
            </>
          ) : null}
          {toggle('Today Refresh', schedule.todayRefresh, (v) =>
            onSchedule({ ...schedule, todayRefresh: v }),
          )}
          {!elapsed &&
            schedule.todayRefresh &&
            input(
              'Refresh every (1–24 hours)',
              String(schedule.refreshHours),
              (value) => onSchedule({ ...schedule, refreshHours: Number(value) }),
              true,
            )}
          {elapsed && (
            <Copy variant="caption" muted testID="schedule-interval-timing">
              Refreshes today&apos;s file at this interval while the app is open, starting when
              automatic exports are enabled. Background timing is controlled by your phone. Missed
              intervals are combined into one refresh.
            </Copy>
          )}
          {!elapsed && (!field || field === 'refresh') && (
            <Copy variant="caption" muted>
              Today Refresh exports the current day in addition to scheduled runs. For more frequent
              exports, choose a custom minute or hour interval. Local exports use your Output file
              choice; appending repeated full-day snapshots may duplicate records. Background runs
              depend on your phone; missed times combine into one export. Save, then enable
              automatic exports on this profile.
            </Copy>
          )}
        </>
      )}
    </View>
  );
}
/** @param {{title:string,subtitle?:string,selected:boolean,disabled:boolean,onPress:()=>void,testID:string}} props */
function Choice({ title, subtitle, selected, disabled, onPress, testID }) {
  return (
    <Row
      testID={testID}
      compact
      title={title}
      subtitle={subtitle}
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
