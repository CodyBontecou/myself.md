import { useState } from 'react';
import { IconChevronRight } from '@tabler/icons-react';
import { datasets } from './dataset-catalog.js';
import { record } from '../core/data.js';
import { parseProfile } from '../core/profiles.js';
import { datasetExportPreview } from './dataset-export-preview.js';
import { ExportJson } from './export-json.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';

/** @param {string} key */
function typeLabel(key) {
  return key
    .replace(/^native:/, '')
    .replace(/^HK(?:Quantity|Category|Correlation|Data)TypeIdentifier/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}
/** @param {{title:string,value:unknown}} props */
function JsonExample({ title, value }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-medium">{title}</h3>
      <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed">
        <code>{JSON.stringify(value, null, 2)}</code>
      </pre>
    </section>
  );
}
/** @param {{dataset:string}} props */
export function DatasetDocumentation({ dataset }) {
  const included =
    dataset === 'all'
      ? Object.values(datasets)
      : [datasets[/** @type {keyof typeof datasets} */ (dataset)]];
  const data =
    dataset === 'all'
      ? {
          ...datasets.health,
          title: 'All data',
          introduction:
            'Configure health, screen time, and location together in one profile. Choose individual types across all datasets and see their combined export JSON.',
          sources: included.map((item) => `${item.title}: ${item.sources}`).join(' '),
          limitations: included.flatMap((item) => item.limitations),
        }
      : (included[0] ?? datasets.health);
  const groups = included.flatMap((item) =>
    item.groups.map((group) => ({
      ...group,
      domain: item.domain,
      title: dataset === 'all' ? `${item.title} · ${group.title}` : group.title,
    })),
  );
  const [search, setSearch] = useState('');
  const [added, setAdded] = useState(
    /** @type {import('./export-json.js').AddedSelection|null} */ (null),
  );
  const [selected, setSelected] = useState(
    /** @type {Record<import('../core/data.js').Domain,string[]>} */ ({
      health: [],
      time: [],
      location: [],
      ...Object.fromEntries(included.map((item) => [item.domain, [...item.defaults]])),
    }),
  );
  const selectedCount = Object.values(selected).reduce((total, keys) => total + keys.length, 0);
  const examples = included.map((item) =>
    record(item.domain, item.sampleType, item.sampleSource, item.sample),
  );
  const profile = parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Example export',
    selection: selected,
  });
  const preview = datasetExportPreview(profile);
  const exportPreview = (
    <section className="space-y-3">
      <ExportJson value={preview.value} added={added} />
      {preview.emptyTypes.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No sample readings for{' '}
          {preview.emptyTypes.map(({ domain, type }) => `${domain}: ${type}`).join(', ')}. These
          selections currently contribute no records to this preview.
        </p>
      )}
    </section>
  );
  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b py-5">
        <a href="/" className="font-semibold">
          myself.md
        </a>
        <Button asChild size="sm">
          <a href="/login">
            Join myself.md <IconChevronRight />
          </a>
        </Button>
      </header>
      <main className="space-y-10 py-8 sm:py-12">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="min-w-0 space-y-10">
            <div className="space-y-4">
              <section className="space-y-6 py-6 sm:py-10" aria-labelledby="landing-title">
                <p className="text-sm font-medium text-muted-foreground">
                  Apps come and go. Your data should stay.
                </p>
                <h1
                  id="landing-title"
                  className="max-w-4xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl"
                >
                  Your life, in files.
                  <br />
                  Yours to keep.
                </h1>
                <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                  Save your health, screen time, and location as files you can read, back up, and
                  take with you. Keep your history, even when you change apps.
                </p>
                <p className="text-sm text-muted-foreground">
                  Choose what to keep. See exactly what’s in your files.
                </p>
              </section>
              <nav aria-label="Dataset documentation" className="flex flex-wrap gap-2">
                {Object.entries({ all: { title: 'All' }, ...datasets }).map(([key, item]) => (
                  <Button
                    key={key}
                    variant={key === dataset ? 'secondary' : 'ghost'}
                    asChild
                    size="sm"
                  >
                    <a
                      href={`/datasets/${key}`}
                      aria-current={key === dataset ? 'page' : undefined}
                      onClick={(event) => {
                        if (
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        )
                          return;
                        event.preventDefault();
                        if (key === dataset) return;
                        history.pushState(null, '', `/datasets/${key}`);
                        window.dispatchEvent(new Event('popstate'));
                      }}
                    >
                      {item.title}
                    </a>
                  </Button>
                ))}
              </nav>
            </div>
            <section className="min-w-0 space-y-5" aria-labelledby="types-title">
              <h2 id="types-title" className="text-xl font-semibold">
                Individual dataset types
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Try the checkboxes to update the export JSON preview. These are documentation
                controls; they do not change your phone, permissions, or account. Disabling a type
                excludes it from subsequent reads and exports; it does not delete existing files.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  className="max-w-md"
                  aria-label="Search dataset types"
                  placeholder="Search types or identifiers…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAdded(null);
                    setSelected({ health: [], time: [], location: [] });
                  }}
                >
                  Clear selection
                </Button>
                <span role="status" className="text-sm text-muted-foreground">
                  {selectedCount} {selectedCount === 1 ? 'type' : 'types'} selected
                </span>
              </div>
              {groups.map((group) => {
                const keys = group.keys.filter((key) =>
                  `${group.title} ${key} ${typeLabel(key)}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                );
                return keys.length ? (
                  <details
                    key={group.title}
                    open={Boolean(search) || group.domain !== 'health'}
                    className="rounded-lg border p-4"
                  >
                    <summary className="cursor-pointer text-sm font-medium">
                      {group.title} · {keys.length} {keys.length === 1 ? 'type' : 'types'}
                    </summary>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {keys.map((key) => (
                        <label key={key} className="flex min-w-0 items-start gap-3 text-sm">
                          <input
                            className="mt-1 accent-current"
                            type="checkbox"
                            checked={selected[group.domain].includes(key)}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setAdded(checked ? { domain: group.domain, key } : null);
                              setSelected((current) => ({
                                ...current,
                                [group.domain]: checked
                                  ? [...new Set([...current[group.domain], key])]
                                  : current[group.domain].filter((item) => item !== key),
                              }));
                            }}
                          />
                          <span className="min-w-0">
                            <span className="block">{typeLabel(key)}</span>
                            <code className="break-all text-xs text-muted-foreground">{key}</code>
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                ) : null;
              })}
              {!groups.some((group) =>
                group.keys.some((key) =>
                  `${group.title} ${key} ${typeLabel(key)}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ),
              ) && <p className="text-sm text-muted-foreground">No matching dataset types.</p>}
            </section>
            <div className="lg:hidden">{exportPreview}</div>
            <section className="space-y-3" aria-labelledby="sources-title">
              <h2 id="sources-title" className="text-xl font-semibold">
                What this dataset contains
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{data.sources}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Each record has a shared envelope. Its native payload keeps the original source
                fields; it is not converted into one universal schema. All examples here use
                fictional data.
              </p>
            </section>
            <section className="space-y-5" aria-labelledby="json-title">
              <h2 id="json-title" className="text-xl font-semibold">
                JSON structures
              </h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ['domain', 'health, time, or location.'],
                  ['type', 'The source metric or collection identifier.'],
                  [
                    'source',
                    'The platform adapter, such as healthkit, health-connect, native-usage, or expo-location.',
                  ],
                  [
                    'start / end',
                    'ISO UTC timestamps, or null when the source has no valid timestamp. When no end is supplied, end falls back to start.',
                  ],
                  [
                    'native',
                    'The unchanged source payload. Its fields depend on the platform and dataset type.',
                  ],
                  [
                    'Selection keys',
                    'Profiles use native:<type>. These authorization keys differ from the source value stored on a record.',
                  ],
                ].map(([label, description]) => (
                  <div key={label}>
                    <dt className="font-mono text-sm">{label}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </dd>
                  </div>
                ))}
              </dl>
              {included.map((item, index) => (
                <JsonExample
                  key={item.domain}
                  title={`${item.title} · example record`}
                  value={examples[index]}
                />
              ))}
              {data.domain === 'time' && (
                <JsonExample
                  title="Android application record"
                  value={record('time', 'applications', 'native-usage', {
                    identifier: 'com.example.reader',
                    startMs: 1791417600000,
                    endMs: 1791504000000,
                    lastTimeUsedMs: 1791446400000,
                    durationMs: 1200000,
                    granularity: 'system-daily-aggregate',
                  })}
                />
              )}
              {data.domain === 'health' && (
                <JsonExample
                  title="Android Health Connect record · Steps"
                  value={record('health', 'Steps', 'health-connect', {
                    startTime: '2026-10-08T08:00:00.000Z',
                    endTime: '2026-10-08T08:30:00.000Z',
                    count: 1250,
                  })}
                />
              )}
              <JsonExample
                title="JSON export file · completed daily profile export"
                value={{
                  schema: 'myself.md.export.v1',
                  records: examples,
                  profileId: 'example-profile',
                  profileName: profile.name,
                  interval: {
                    day: '2026-10-08',
                    start: '2026-10-08T00:00:00.000Z',
                    end: '2026-10-09T00:00:00.000Z',
                  },
                  recordCount: examples.length,
                  captures: [],
                  status: 'complete',
                  failures: [],
                  exportedAt: '2026-10-09T00:00:00.000Z',
                }}
              />
              <p className="text-sm leading-relaxed text-muted-foreground">
                JSONL writes one record envelope per line, with daily metadata in a separate
                .jsonl.manifest.json file. JSON places records and metadata in one document. The
                captures and failures arrays report source coverage; a file can have partial status
                when some selected sources could not be read.
              </p>
            </section>
            <section className="space-y-4" aria-labelledby="limits-title">
              <h2 id="limits-title" className="text-xl font-semibold">
                Availability and limitations
              </h2>
              <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
                {data.limitations.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </section>
          </div>
          <aside
            aria-label="Live export JSON preview"
            className="hidden min-w-0 lg:block lg:sticky lg:top-6"
          >
            {exportPreview}
          </aside>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <p className="text-sm text-muted-foreground">
            Your data stays in files. You control what agents can read.
          </p>
          <Button asChild>
            <a href="/login">
              Join myself.md <IconChevronRight />
            </a>
          </Button>
        </div>
      </main>
    </div>
  );
}
