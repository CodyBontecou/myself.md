import { useEffect, useState } from 'react';
import { Dialog } from 'radix-ui';
import {
  IconChevronLeft,
  IconChevronRight,
  IconX,
  IconFilter,
  IconLink,
  IconPlus,
} from '@tabler/icons-react';
import { normalizeRecord } from '../core/explorer.js';
import { api, hasSession } from './session.js';
import { navigateRoute } from './navigation.js';
import { readExplorerRoute, explorerRoute } from './explorer-route.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';
import { Badge } from './components/ui/badge.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/card.js';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from './components/ui/table.js';
/** @typedef {import('../core/explorer.js').ExplorerRow} ExplorerRow */
/** @typedef {import('../core/explorer.js').ExplorerQuery} ExplorerQuery */
/** @typedef {import('../core/explorer.js').Filter} Filter */
/** @typedef {{metrics:{type:string,label:string,domain:string}[],sources:string[],fields:{field:string,type:string}[]}} Facets */
/** @typedef {{query:ExplorerQuery,rows:ExplorerRow[],total:number,scanned:number,duplicates:number,archives:number,nextOffset:number|null,facets:Facets,visuals:ReturnType<typeof import('../core/explorer.js').visualizeRecords>,warnings:string[]}} Result */
const timezones = [
  ...new Set([
    'UTC',
    new Intl.DateTimeFormat().resolvedOptions().timeZone,
    'Europe/Lisbon',
    'America/New_York',
    'America/Los_Angeles',
    'Asia/Tokyo',
  ]),
];
const emptyFacets = { metrics: [], sources: [], fields: [] };
const knownColumns = [
  ['metric', 'Metric'],
  ['summary', 'Summary'],
  ['category', 'Category'],
  ['value', 'Value'],
  ['unit', 'Unit'],
  ['start', 'Started'],
  ['end', 'Ended'],
  ['source', 'Source'],
  ['domain', 'Domain'],
  ['duration', 'Duration (s)'],
  ['application', 'Application'],
  ['latitude', 'Latitude'],
  ['longitude', 'Longitude'],
  ['accuracy', 'Accuracy (m)'],
];
const baseFields = knownColumns
  .map(([field]) => ({
    field: field ?? '',
    type: ['value', 'duration', 'latitude', 'longitude', 'accuracy'].includes(field ?? '')
      ? 'number'
      : 'string',
  }))
  .filter((f) => f.field !== 'summary');
/** @param {{label:string,name:string,defaultValue:string,children:import('react').ReactNode}} props */
function SelectField({ label, name, defaultValue, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-xs font-medium">
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm font-normal"
      >
        {children}
      </select>
    </label>
  );
}
/** @param {{query:ExplorerQuery,facets:Facets,workspace:import('./session.js').Workspace,onApply:(query:ExplorerQuery)=>void}} props */
function QueryBuilder({ query, facets, workspace, onApply }) {
  const [filters, setFilters] = useState(
    query.filters.map((filter, index) => ({ ...filter, key: `initial-${index}` })),
  );
  const [error, setError] = useState('');
  const fields = facets.fields.length ? facets.fields : baseFields;
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  function apply(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (/** @type {string} */ key) => String(data.get(key) ?? '');
    try {
      const start = text('start') ? new Date(`${text('start')}Z`).toISOString() : '';
      const end = text('end') ? new Date(`${text('end')}Z`).toISOString() : '';
      if (start && end && start >= end) throw new Error('End must be after start.');
      const formatter = new Intl.DateTimeFormat('en', {
        timeZone: text('timezone'),
      });
      formatter.resolvedOptions();
      setError('');
      onApply({
        ...query,
        exportIds: data.getAll('exports').map(String),
        profileIds: data.getAll('profiles').map(String),
        deviceIds: data.getAll('devices').map(String),
        domain: text('domain'),
        metric: text('metric'),
        source: text('source'),
        start,
        end,
        timezone: text('timezone'),
        filters: filters.map(({ field, operator, value }) => ({ field, operator, value })),
        offset: 0,
        deduplicate: data.has('deduplicate'),
        includeArchives: data.has('archives'),
      });
    } catch {
      setError('Check the date range and use a valid timezone, such as Europe/Lisbon.');
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconFilter className="size-4" />
          Query records
        </CardTitle>
        <CardDescription>
          Filters run over all matching stored records. Time range uses record start; the end is
          exclusive.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={apply} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SelectField label="Domain" name="domain" defaultValue={query.domain}>
              <option value="">All domains</option>
              {['health', 'time', 'location'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </SelectField>
            <SelectField label="Metric" name="metric" defaultValue={query.metric}>
              <option value="">All metrics</option>
              {facets.metrics.map((m) => (
                <option key={m.type} value={m.type}>
                  {m.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="Source" name="source" defaultValue={query.source}>
              <option value="">All sources</option>
              {facets.sources.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </SelectField>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Display timezone
              <Input
                name="timezone"
                defaultValue={query.timezone}
                list="explorer-timezones"
                required
              />
              <datalist id="explorer-timezones">
                {timezones.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Start (UTC)
              <Input type="datetime-local" name="start" defaultValue={query.start.slice(0, 16)} />
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              End, exclusive (UTC)
              <Input type="datetime-local" name="end" defaultValue={query.end.slice(0, 16)} />
            </label>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Profiles, devices & exports{' '}
              {query.exportIds.length ? `· ${query.exportIds.length} exports selected` : ''}
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <ScopeList
                name="profiles"
                label="Profiles"
                selected={query.profileIds}
                options={[
                  ...new Map(
                    workspace.profiles.map((p) => [
                      p.profileId,
                      { id: p.profileId, label: p.name },
                    ]),
                  ).values(),
                ]}
              />
              <ScopeList
                name="devices"
                label="Devices"
                selected={query.deviceIds}
                options={[
                  ...new Map(
                    workspace.exports.map((e) => [
                      e.deviceId,
                      {
                        id: e.deviceId,
                        label:
                          workspace.devices.find((d) => d.id === e.deviceId)?.name ??
                          'Disconnected phone',
                      },
                    ]),
                  ).values(),
                ]}
              />
              <ScopeList
                name="exports"
                label="Exports"
                selected={query.exportIds}
                options={workspace.exports.map((e) => ({
                  id: e.id,
                  label: `${e.profileName} · ${e.day} · ${e.format.toUpperCase()}`,
                }))}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              No selection includes all items. An export scope can be cleared to explore the entire
              account.
            </p>
          </details>
          <div className="space-y-3">
            {filters.map((filter, index) => {
              const type = fields.find((f) => f.field === filter.field)?.type ?? 'string';
              const operators =
                type === 'number' || type === 'date'
                  ? ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'exists', 'missing']
                  : ['eq', 'ne', 'contains', 'exists', 'missing'];
              return (
                <div
                  key={filter.key}
                  className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto]"
                >
                  <select
                    aria-label={`Condition ${index + 1} field`}
                    value={filter.field}
                    className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
                    onChange={(e) =>
                      setFilters((current) =>
                        current.map((f, i) =>
                          i === index
                            ? { ...f, field: e.target.value, operator: 'eq', value: '' }
                            : f,
                        ),
                      )
                    }
                  >
                    {fields.map((f) => (
                      <option key={f.field} value={f.field}>
                        {f.field} ({f.type})
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Condition ${index + 1} operator`}
                    value={filter.operator}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    onChange={(e) =>
                      setFilters((current) =>
                        current.map((f, i) =>
                          i === index
                            ? { ...f, operator: /** @type {Filter['operator']} */ (e.target.value) }
                            : f,
                        ),
                      )
                    }
                  >
                    {[...new Set([...operators, filter.operator])].map((op) => (
                      <option key={op} value={op}>
                        {
                          {
                            eq: 'equals',
                            ne: 'does not equal',
                            gt: 'greater than',
                            gte: 'at least',
                            lt: 'less than',
                            lte: 'at most',
                            contains: 'contains',
                            exists: 'has a value',
                            missing: 'is missing',
                          }[op]
                        }
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label={`Condition ${index + 1} value`}
                    type={type === 'number' ? 'number' : 'text'}
                    step="any"
                    value={filter.value}
                    disabled={filter.operator === 'missing' || filter.operator === 'exists'}
                    placeholder={
                      type === 'boolean'
                        ? 'true or false'
                        : type === 'date'
                          ? '2026-10-08T00:00:00.000Z'
                          : 'Value'
                    }
                    onChange={(e) =>
                      setFilters((current) =>
                        current.map((f, i) => (i === index ? { ...f, value: e.target.value } : f)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove condition ${index + 1}`}
                    onClick={() => setFilters((current) => current.filter((_f, i) => i !== index))}
                  >
                    <IconX />
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filters.length >= 12}
              onClick={() =>
                setFilters((current) => [
                  ...current,
                  {
                    key: crypto.randomUUID(),
                    field: 'value',
                    operator: /** @type {const} */ ('gt'),
                    value: '',
                  },
                ])
              }
            >
              <IconPlus />
              Add condition
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="deduplicate" defaultChecked={query.deduplicate} />
              Collapse exact overlaps
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="archives" defaultChecked={query.includeArchives} />
              Include archive containers
            </label>
            <Button type="submit" className="sm:ml-auto">
              Apply query
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
/** @param {{name:string,label:string,selected:string[],options:{id:string,label:string}[]}} props */
function ScopeList({ name, label, selected, options }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-medium">{label}</legend>
      <div className="max-h-40 space-y-2 overflow-auto rounded-md border p-3">
        {options.map((option) => (
          <label key={option.id} className="flex items-start gap-2 text-xs">
            <input
              name={name}
              type="checkbox"
              value={option.id}
              defaultChecked={selected.includes(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
        {!options.length && <p className="text-xs text-muted-foreground">No stored items</p>}
      </div>
    </fieldset>
  );
}
/** @param {import('../core/explorer.js').Scalar|undefined} value @param {string} field @param {string} timezone */
function display(value, field, timezone) {
  if (value === null || value === undefined) return '—';
  if (
    (field === 'start' || field === 'end') &&
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value))
  )
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  if (typeof value === 'number')
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
  return String(value);
}
/** @param {{id:string,workspace:import('./session.js').Workspace,timezone:string,onClose:()=>void,onExpired:()=>void}} props */
function RecordInspector({ id, workspace, timezone, onClose, onExpired }) {
  const [tab, setTab] = useState('summary');
  const [result, setResult] = useState(
    /** @type {{record:import('../core/data.js').DataRecord}|null} */ (null),
  );
  const [error, setError] = useState('');
  const [exportId, index] = id.split(':');
  const item = workspace.exports.find((e) => e.id === exportId);
  const normalized = result
    ? normalizeRecord(
        result.record,
        {
          exportId: exportId ?? '',
          index: Number(index),
          profileId: item?.profileId ?? '',
          profileName: item?.profileName ?? '',
          deviceId: item?.deviceId ?? '',
          day: item?.day ?? '',
        },
        id,
      )
    : null;
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        const data = /** @type {{record:import('../core/data.js').DataRecord}} */ (
          await api(
            `/api/dashboard/record?${new URLSearchParams({ export: exportId ?? '', index: index ?? '' })}`,
          )
        );
        if (active) setResult(data);
      } catch (failure) {
        if (active) {
          setError(failure instanceof Error ? failure.message : 'Could not read record.');
          if (!hasSession()) onExpired();
        }
      }
    }
    void read();
    return () => {
      active = false;
    };
  }, [exportId, index, onExpired]);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col gap-4 overflow-auto border-l bg-background p-6 shadow-xl">
          <Dialog.Title className="pr-8 text-xl font-semibold">Record details</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            {item?.profileName ?? 'Stored export'} · {item?.day} · Original fields remain unchanged.
          </Dialog.Description>
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4"
              aria-label="Close record details"
            >
              <IconX />
            </Button>
          </Dialog.Close>
          <div role="tablist" aria-label="Record detail sections" className="flex gap-2">
            {['summary', 'metadata', 'raw'].map((name) => (
              <Button
                key={name}
                role="tab"
                aria-selected={tab === name}
                variant={tab === name ? 'secondary' : 'ghost'}
                onClick={() => setTab(name)}
              >
                {name === 'raw' ? 'Raw JSON' : name === 'summary' ? 'Summary' : 'Metadata'}
              </Button>
            ))}
          </div>
          {error ? (
            <p role="alert">{error}</p>
          ) : !result ? (
            <p role="status">Loading record…</p>
          ) : tab === 'raw' ? (
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/30 p-4 text-xs">
              {JSON.stringify(result.record, null, 2)}
            </pre>
          ) : tab === 'summary' ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-4 text-sm">
              {Object.entries({
                Domain: result.record.domain,
                Metric: normalized?.metric,
                Value: normalized?.value,
                Unit: normalized?.unit,
                Category: normalized?.fields.category,
                'Duration (seconds)': normalized?.duration,
                Application: normalized?.application,
                Latitude: normalized?.latitude,
                Longitude: normalized?.longitude,
                'Accuracy (metres)': normalized?.accuracy,
                Source: result.record.source,
                Started: display(result.record.start, 'start', timezone),
                Ended: display(result.record.end, 'end', timezone),
                Profile: item?.profileName,
                Export: exportId,
                Device:
                  workspace.devices.find((d) => d.id === item?.deviceId)?.name ?? item?.deviceId,
              })
                .filter(([_label, value]) => value !== null && value !== undefined)
                .map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="break-all">{value ?? '—'}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <FieldTree value={result.record.native} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
/** @param {{value:unknown}} props */
function FieldTree({ value }) {
  if (value === null || typeof value !== 'object')
    return <span className="break-all text-sm">{String(value)}</span>;
  return (
    <div className="space-y-3">
      {Object.entries(value).map(([key, child]) =>
        child && typeof child === 'object' ? (
          <details key={key} className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {key}
              {Array.isArray(child) ? ` · ${child.length} items` : ''}
            </summary>
            <div className="mt-3 border-l pl-3">
              <FieldTree value={child} />
            </div>
          </details>
        ) : (
          <div key={key} className="grid grid-cols-2 gap-3 border-b pb-2 text-sm">
            <span className="break-all text-muted-foreground">{key}</span>
            <span className="break-all">{String(child)}</span>
          </div>
        ),
      )}
    </div>
  );
}
/** @param {{workspace:import('./session.js').Workspace,search:string,updated:string,onExpired:()=>void}} props */
export function Explorer({ workspace, search, updated, onExpired }) {
  const route = readExplorerRoute(search),
    { query } = route;
  const request = JSON.stringify(query),
    requestKey = `${updated}:${request}`;
  const [response, setResponse] = useState(
    /** @type {{key:string,result:Result|null,error:string}|null} */ (null),
  );
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(/** @type {{name:string,search:string}[]} */ ([]));
  const [saveName, setSaveName] = useState('');
  const loading = response?.key !== requestKey;
  const result = loading ? null : response?.result;
  const error = loading ? '' : response?.error;
  const storageKey = `qr-explorer-views:${workspace.account}`;
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        const resultData = /** @type {Result} */ (
          await api('/api/dashboard/explore', 'POST', JSON.parse(request))
        );
        if (active) setResponse({ key: requestKey, result: resultData, error: '' });
      } catch (failure) {
        if (active) {
          setResponse({
            key: requestKey,
            result: null,
            error: failure instanceof Error ? failure.message : 'Query failed.',
          });
          if (!hasSession()) onExpired();
        }
      }
    }
    void read();
    return () => {
      active = false;
    };
  }, [request, requestKey, onExpired]);
  useEffect(() => {
    async function read() {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
        if (Array.isArray(stored))
          setSaved(
            stored.filter((v) => typeof v.name === 'string' && typeof v.search === 'string'),
          );
      } catch {
        setSaved([]);
      }
    }
    void read();
  }, [storageKey]);
  /** @param {Partial<ExplorerQuery>} patch @param {{chart?:string,columns?:string[],record?:string}} [view] */
  function change(patch, view = {}) {
    if (patch.filters && patch.filters.length > 12) {
      setNotice('Remove a condition before adding another filter (maximum 12).');
      return;
    }
    navigateRoute(
      explorerRoute(
        { ...query, ...patch },
        {
          chart: view.chart ?? route.chart,
          columns: view.columns ?? route.columns,
          record: view.record ?? '',
        },
      ),
    );
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setNotice('Query link copied. Opening it requires access to this account.');
    } catch {
      setNotice('Copy the current URL to share this query.');
    }
  }
  const facets = response?.result?.facets ?? emptyFacets;
  const scopedItem =
    query.exportIds.length === 1
      ? workspace.exports.find((e) => e.id === query.exportIds[0])
      : null;
  const dynamicColumns = [
    ...knownColumns,
    ...facets.fields.filter((f) => f.field.startsWith('native.')).map((f) => [f.field, f.field]),
  ];
  const columns = route.columns.flatMap((field) =>
    dynamicColumns.filter(([candidate]) => candidate === field),
  );
  const validColumns = columns.length ? columns : knownColumns.slice(0, 5);
  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigateRoute('')}>
            <IconChevronLeft />
            Stored data
          </Button>
          <h2 className="mt-3 text-2xl font-semibold">
            {scopedItem ? `${scopedItem.profileName} · ${scopedItem.day}` : 'Explore your data'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {scopedItem
              ? 'Inspect this export or broaden the query to your account.'
              : 'Query records across profiles and exports, with their original source attached.'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void copyLink();
          }}
        >
          <IconLink />
          Copy query link
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Saved view name"
          className="w-full sm:w-48"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="Name this view"
          maxLength={80}
        />
        <Button
          variant="outline"
          disabled={!saveName.trim()}
          onClick={() => {
            const next = [
              ...saved.filter((v) => v.name !== saveName.trim()),
              {
                name: saveName.trim(),
                search: explorerRoute({ ...query, offset: 0 }, { ...route, record: '' }),
              },
            ].slice(-20);
            try {
              localStorage.setItem(storageKey, JSON.stringify(next));
              setSaved(next);
              setSaveName('');
              setNotice('View saved in this browser for this account.');
            } catch {
              setNotice('This browser could not save the view.');
            }
          }}
        >
          Save view
        </Button>
        {saved.length > 0 && (
          <select
            aria-label="Saved views"
            defaultValue=""
            onChange={(e) => {
              const item = saved.find((v) => v.name === e.target.value);
              if (item) navigateRoute(item.search);
              e.target.value = '';
            }}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Open saved view</option>
            {saved.map((v) => (
              <option key={v.name}>{v.name}</option>
            ))}
          </select>
        )}
        {saved.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              localStorage.removeItem(storageKey);
              setSaved([]);
              setNotice('Saved views cleared from this browser.');
            }}
          >
            Clear saved views
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <QueryBuilder
        key={`${request}:${facets.metrics.map((metric) => metric.type).join(',')}`}
        query={query}
        facets={facets}
        workspace={workspace}
        onApply={(next) =>
          change(next, {
            columns:
              next.domain !== query.domain || next.metric !== query.metric
                ? readExplorerRoute(
                    `?domain=${encodeURIComponent(next.domain)}&metric=${encodeURIComponent(next.metric)}`,
                  ).columns
                : route.columns,
          })
        }
      />
      {loading && (
        <div role="status" className="rounded-lg border p-8 text-center text-muted-foreground">
          Querying all matching records…
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{result.total.toLocaleString()} matches</Badge>
            <Badge variant="outline">
              {result.scanned.toLocaleString()} stored records scanned
            </Badge>
            <Badge variant="outline">{result.duplicates.toLocaleString()} overlaps collapsed</Badge>
            <Badge variant="outline">{query.timezone}</Badge>
          </div>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Matching records</CardTitle>
                <details className="relative">
                  <summary className="cursor-pointer rounded-md border px-3 py-2 text-sm">
                    Columns
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 max-h-72 w-72 space-y-2 overflow-auto rounded-md border bg-background p-3 shadow-lg">
                    {dynamicColumns.map(([field, label]) => (
                      <label key={field} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={Boolean(field && route.columns.includes(field))}
                          onChange={(e) => {
                            if (field)
                              change(
                                {},
                                {
                                  columns: e.target.checked
                                    ? [...route.columns, field]
                                    : route.columns.filter((c) => c !== field),
                                },
                              );
                          }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </details>
              </div>
              <CardDescription>
                Click a column to sort all matching records; open a row for summary, metadata and
                raw JSON. Times are shown in {query.timezone}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-md border">
                <Table aria-label="Explorer records">
                  <TableHeader className="bg-muted">
                    <TableRow>
                      {validColumns.map(([field, label]) => (
                        <TableHead
                          key={field}
                          aria-sort={
                            query.sort === field
                              ? query.direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            className="whitespace-nowrap py-2 text-left"
                            onClick={() => {
                              if (field)
                                change({
                                  sort: field,
                                  direction:
                                    query.sort === field && query.direction === 'asc'
                                      ? 'desc'
                                      : 'asc',
                                  offset: 0,
                                });
                            }}
                          >
                            {label}
                            {query.sort === field ? (query.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                          </button>
                        </TableHead>
                      ))}
                      <TableHead>Origins</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row) => (
                      <TableRow key={row.id}>
                        {validColumns.map(([field]) => (
                          <TableCell
                            key={field}
                            className="max-w-xs truncate"
                            title={String(
                              field === 'summary'
                                ? row.summary
                                : field
                                  ? (row.fields[field] ?? '')
                                  : '',
                            )}
                          >
                            {field === 'summary'
                              ? row.summary
                              : display(
                                  field ? row.fields[field] : null,
                                  field ?? '',
                                  query.timezone,
                                )}
                          </TableCell>
                        ))}
                        <TableCell>
                          <details>
                            <summary className="cursor-pointer whitespace-nowrap text-xs">
                              {row.provenance.length} export{row.provenance.length === 1 ? '' : 's'}
                            </summary>
                            <div className="mt-2 min-w-48 space-y-2">
                              {row.provenance.map((p) => (
                                <button
                                  key={`${p.exportId}:${p.index}`}
                                  className="block text-left text-xs underline"
                                  onClick={() =>
                                    change(
                                      {
                                        exportIds: [p.exportId],
                                        profileIds: [],
                                        deviceIds: [],
                                        offset: 0,
                                      },
                                      { record: `${p.exportId}:${p.index}` },
                                    )
                                  }
                                >
                                  {p.profileName} · {p.day} ·{' '}
                                  {workspace.devices.find((d) => d.id === p.deviceId)?.name ??
                                    'Disconnected phone'}
                                </button>
                              ))}
                            </div>
                          </details>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => change({}, { record: row.id })}
                          >
                            View record
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!result.rows.length && (
                      <TableRow>
                        <TableCell
                          colSpan={validColumns.length + 2}
                          className="h-24 text-center text-muted-foreground"
                        >
                          {result.total
                            ? 'This page is beyond the current results. Go to the first page.'
                            : 'No records match this query.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="outline"
                  disabled={query.offset === 0}
                  onClick={() => change({ offset: Math.max(0, query.offset - query.limit) })}
                >
                  <IconChevronLeft />
                  Previous
                </Button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    Page {Math.floor(query.offset / query.limit) + 1} ·{' '}
                    {result.total ? Math.min(query.offset + 1, result.total) : 0}–
                    {Math.min(query.offset + result.rows.length, result.total)} of {result.total}
                  </span>
                  <select
                    aria-label="Records per page"
                    value={query.limit}
                    className="rounded border bg-background p-2"
                    onChange={(e) => change({ limit: Number(e.target.value), offset: 0 })}
                  >
                    {[25, 50, 100].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  {query.offset > 0 && (
                    <button className="underline" onClick={() => change({ offset: 0 })}>
                      First page
                    </button>
                  )}
                </div>
                <Button
                  variant="outline"
                  disabled={result.nextOffset === null}
                  onClick={() => {
                    if (result.nextOffset !== null) change({ offset: result.nextOffset });
                  }}
                >
                  Next
                  <IconChevronRight />
                </Button>
              </div>
            </CardContent>
          </Card>
          <details className="rounded-md border p-4">
            <summary className="cursor-pointer text-xs font-medium">
              Coverage & aggregation notes
            </summary>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-xs text-muted-foreground">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        </>
      )}
      {route.record && (
        <RecordInspector
          key={route.record}
          id={route.record}
          workspace={workspace}
          timezone={result?.query.timezone ?? 'UTC'}
          onClose={() => change({})}
          onExpired={onExpired}
        />
      )}
    </div>
  );
}
