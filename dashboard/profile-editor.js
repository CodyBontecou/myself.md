import { useState } from 'react';
import { parseProfile, parseProfileState } from '../core/profiles.js';
import { domains } from '../core/data.js';
import { exportSchemas } from '../core/export-schemas.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';
import { api } from './session.js';
/** @param {string} label @param {string} value @param {(value:string)=>void} update @param {string} [type] */
const input = (label, value, update, type = 'text') => (
  <label className="grid gap-1 text-sm">
    {label}
    <Input type={type} value={value} onChange={(e) => update(e.target.value)} />
  </label>
);
/** @param {string} label @param {boolean} checked @param {(value:boolean)=>void} update */
const checkbox = (label, checked, update) => (
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={checked} onChange={(e) => update(e.target.checked)} />
    {label}
  </label>
);
/** @param {string} label @param {string} value @param {string[]} options @param {(value:string)=>void} update */
const select = (label, value, options, update) => (
  <label className="grid gap-1 text-sm">
    {label}
    <select
      className="rounded-md border bg-background p-2"
      value={value}
      onChange={(e) => update(e.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {{
            local: 'On this phone',
            http: 'HTTPS endpoint',
            cloud: 'Cloud storage',
            new_file: 'Create a new file',
            replace: 'Replace matching file',
            append: 'Append to matching file',
            skip: 'Skip existing file',
          }[option] ?? option}
        </option>
      ))}
    </select>
  </label>
);
/** @param {{entry:import('./workspace.js').Profile,onSaved:()=>Promise<void>,onCancel:()=>void,onConfirm:(confirmation:import('./app.js').Confirmation)=>void,suggestion?:import('../server/profile-sync.js').ProfileRequest|undefined}} props */
export function ProfileEditor({ entry, onSaved, onCancel, onConfirm, suggestion }) {
  const [draft, setDraft] = useState(suggestion?.profile ?? entry.profile);
  const [baseRevision] = useState(entry.revision);
  const [error, setError] = useState('');
  if (!draft) return null;
  /** @param {Partial<import('../core/profiles.js').ExportProfile>} patch */
  const change = (patch) => setDraft({ ...draft, ...patch });
  /** @param {Partial<import('../core/export-files.js').ExportSettings>} patch */
  const output = (patch) => change({ export: { ...draft.export, ...patch } });
  /** @param {Partial<import('../core/schedules.js').ScheduleConfig>} patch */
  const schedule = (patch) => change({ schedule: { ...draft.schedule, ...patch } });
  return (
    <form
      className="space-y-5 border-t pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const profile = parseProfileState({
            profiles: [{ ...draft, ...parseProfile(draft), agentAccess: true }],
          }).profiles[0];
          if (!profile) throw new Error('Invalid profile.');
          onConfirm({
            title: 'Save profile changes?',
            description:
              'These settings will sync to this phone when myself.md is open. Enabled Agent permissions let all agents you allow for this account read only selected phone data and eligible old cloud exports; system permission still requires your phone. Agents and their AI providers use their own privacy and retention policies and may keep copies. Revoking access stops future reads; it cannot recall copies already received. The same permissions control cloud exports; no separate sharing switch is needed. Automatic exports, local folders and destination credentials still need setup on the phone.',
            label: 'Save changes',
            action: async () => {
              await api('/api/dashboard/profiles', 'PUT', {
                deviceId: entry.deviceId,
                profileId: entry.profileId,
                revision: baseRevision,
                profile,
                ...(suggestion ? { requestId: suggestion.id } : {}),
              });
              await onSaved();
              onCancel();
            },
          });
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      }}
    >
      {suggestion && (
        <p role="status" className="text-sm">
          Review this agent suggestion before saving. It has not changed your profile.
        </p>
      )}
      {input('Profile name', draft.name, (name) => change({ name }))}
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">Agent permissions</legend>
        {domains.map((domain) => (
          <div key={domain}>
            {checkbox(
              domain === 'time' ? 'Screen time' : domain === 'health' ? 'Health' : 'Location',
              draft.agentPermissions?.[domain] === true,
              (value) =>
                change({
                  agentAccess: true,
                  agentPermissions: {
                    health: false,
                    time: false,
                    location: false,
                    logs: false,
                    ...draft.agentPermissions,
                    [domain]: value,
                  },
                }),
            )}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Turning a permission off blocks that data in old cloud exports. Turning it back on
          restores eligible access after this phone syncs. Access applies to all agents you allow
          for this account. Agents and their AI providers may keep received copies under their own
          privacy and retention policies. App logs consent is managed on the phone.
        </p>
      </fieldset>
      {domains.map((domain) => (
        <fieldset key={domain} className="space-y-2">
          <legend className="mb-2 font-medium">
            {domain === 'time' ? 'Screen time' : domain === 'health' ? 'Health' : 'Location'} data
            selection
          </legend>
          <div
            className="space-y-2 rounded-md border p-3"
            style={{ maxHeight: 192, overflowY: 'auto' }}
          >
            {[
              ...new Set([
                ...(entry.domains?.find((d) => d.domain === domain)?.selectableTypes ??
                  entry.domains?.find((d) => d.domain === domain)?.availableTypes ??
                  []),
                ...draft.selection[domain],
              ]),
            ].map((key) => (
              <div key={key}>
                {checkbox(
                  key
                    .replace(/^native:/, '')
                    .replace(/^HK(?:Quantity|Category|Correlation|Data)TypeIdentifier/, '')
                    .replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
                  draft.selection[domain].includes(key),
                  (value) =>
                    change({
                      selection: {
                        ...draft.selection,
                        [domain]: value
                          ? [...draft.selection[domain], key]
                          : draft.selection[domain].filter((k) => k !== key),
                      },
                    }),
                )}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-medium">Export settings</legend>
        {select('Destination', draft.export.destination, ['local', 'http', 'cloud'], (value) =>
          output({ destination: /** @type {'local'|'http'|'cloud'} */ (value) }),
        )}
        {draft.export.destination === 'http' &&
          input(
            'HTTPS destination URL',
            draft.export.httpUrl ?? '',
            (httpUrl) => output({ httpUrl }),
            'url',
          )}
        {select(
          'Schema',
          draft.export.schema,
          exportSchemas().versions.map((s) => s.id),
          (value) =>
            output({
              schema: /** @type {import('../core/export-schemas.js').ExportSchema} */ (value),
            }),
        )}
        {['json', 'jsonl'].map((format) => (
          <div key={format}>
            {checkbox(
              format.toUpperCase(),
              draft.export.formats.includes(/** @type {'json'|'jsonl'} */ (format)),
              (value) =>
                output({
                  formats: /** @type {Array<'json'|'jsonl'>} */ (
                    value
                      ? [...draft.export.formats, format]
                      : draft.export.formats.filter((f) => f !== format)
                  ),
                }),
            )}
          </div>
        ))}
        {input(
          'Completed days',
          String(draft.export.lookbackDays),
          (value) => output({ lookbackDays: Number(value) }),
          'number',
        )}
        {input('Folder name', draft.export.folderName, (folderName) => output({ folderName }))}
        {input('Filename template', draft.export.filenameTemplate, (filenameTemplate) =>
          output({ filenameTemplate }),
        )}
        {select(
          'When files exist',
          draft.export.writeMode ?? 'replace',
          ['replace', 'append', 'new_file', 'skip'],
          (value) =>
            output({
              writeMode: /** @type {import('../core/export-files.js').ExportWriteMode} */ (value),
            }),
        )}
        {checkbox('Include today', draft.export.includeToday, (value) =>
          output({ includeToday: value }),
        )}
        {checkbox('Separate folders for each format', draft.export.formatFolders, (value) =>
          output({ formatFolders: value }),
        )}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-medium">Schedule</legend>
        {select('Frequency', draft.schedule.frequency, ['daily', 'weekly', 'custom'], (value) =>
          schedule({ frequency: /** @type {'daily'|'weekly'|'custom'} */ (value) }),
        )}
        {draft.schedule.frequency === 'daily' &&
          input(
            'Daily times (HH:mm, separated by commas; blank uses hour/minute)',
            (draft.schedule.dailyTimes ?? []).join(', '),
            (value) =>
              schedule({ dailyTimes: value ? value.split(',').map((time) => time.trim()) : [] }),
          )}
        {input(
          'Hour (0–23)',
          String(draft.schedule.hour),
          (value) => schedule({ hour: Number(value) }),
          'number',
        )}
        {input(
          'Minute (0–59)',
          String(draft.schedule.minute),
          (value) => schedule({ minute: Number(value) }),
          'number',
        )}
        {input(
          'Weekday (Monday 1–Sunday 7)',
          String(draft.schedule.weekday),
          (value) => schedule({ weekday: Number(value) }),
          'number',
        )}
        {input(
          'Repeat interval',
          String(draft.schedule.interval),
          (value) => schedule({ interval: Number(value) }),
          'number',
        )}
        {select(
          'Repeat unit',
          draft.schedule.unit,
          ['minute', 'hour', 'day', 'week', 'month'],
          (value) =>
            schedule({
              unit: /** @type {import('../core/schedules.js').ScheduleConfig['unit']} */ (value),
            }),
        )}
        {input(
          'Anchor date',
          draft.schedule.anchorDate ?? '',
          (value) => schedule({ anchorDate: value || null }),
          'date',
        )}
        {checkbox('Refresh today', draft.schedule.todayRefresh, (value) =>
          schedule({ todayRefresh: value }),
        )}
        {input(
          'Refresh every (1–24 hours)',
          String(draft.schedule.refreshHours),
          (value) => schedule({ refreshHours: Number(value) }),
          'number',
        )}
      </fieldset>
      <p className="text-sm text-muted-foreground">
        Daily schedules accept multiple times in the phone’s timezone; missed times combine into one
        run. Include today to capture current-day data at each calendar run. Custom minute/hour
        intervals always export today. Background timing is controlled by the phone. Local and Cloud
        exports use the selected file behavior; append may duplicate records. Cloud append/replace
        targets the latest file for the profile, day and schema; New file keeps each run separately.
        Older snapshots are preserved. HTTPS endpoints control storage behavior. Enable or disable
        Automatic exports, choose a local folder and enter secure HTTP credentials in the phone app.
        Saving here does not start an export.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit">Review changes</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel edit
        </Button>
      </div>
    </form>
  );
}
