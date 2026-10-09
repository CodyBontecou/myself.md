import { useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { quantities, categories, androidTypes, special } from '../client/health-types.js';
import { record } from '../core/data.js';
import { parseProfile } from '../core/profiles.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';

const datasets = {
  health: {
    title: 'Health',
    domain: /** @type {const} */ ('health'),
    introduction:
      'Export the health samples your phone can read into files. Select individual metrics and keep the original units, metadata, and source fields.',
    sources: 'HealthKit on iOS, Health Connect on Android, and imported health JSON archives.',
    groups: [
      { title: 'iOS · Quantity samples', keys: quantities.map((key) => `native:${key}`) },
      { title: 'iOS · Category samples', keys: categories.map((key) => `native:${key}`) },
      { title: 'iOS · Workouts and other samples', keys: special.map((key) => `native:${key}`) },
      { title: 'Android · Health Connect', keys: androidTypes.map((key) => `native:${key}`) },
      {
        title: 'Imported data · discovered from your file',
        keys: [
          'imported:HKQuantityTypeIdentifierStepCount',
          'imported:samples',
          'imported:records',
          'imported:workouts',
          'imported:archive',
        ],
      },
    ],
    defaults: [
      'native:HKQuantityTypeIdentifierStepCount',
      'native:HKQuantityTypeIdentifierHeartRate',
    ],
    controls: [
      [
        'Health permissions',
        'Authorize reads on your phone. The OS controls which samples are available. The app requests read access, and platform permissions remain separate from profile selection.',
      ],
      [
        'Individual metric selection',
        'Toggle each available type in a profile. Health sections such as Sleep, Heart, and Activity & fitness can select or clear their available types together. Newly discovered types remain off.',
      ],
      [
        'Imported archive selection',
        'Import health JSON, then select discovered types separately. Original archive chunks preserve the full file and need explicit selection; Select all excludes imported:archive.',
      ],
    ],
    limitations: [
      'The catalog below is the installed adapter’s complete type list. The phone shows types according to device support and permissions; selecting an identifier does not grant OS access.',
      'HealthKit does not reveal read denial. Empty results can mean no samples or no authorization.',
      'The native iOS adapter excludes clinical FHIR, attachments, audiograms, medications, and vision prescriptions. Import an original archive to preserve those fields.',
      'Health Connect can limit historical reads to 30 days without historical access. Exercise routes may require separate consent.',
    ],
    sampleType: 'HKQuantityTypeIdentifierStepCount',
    sampleSource: 'healthkit',
    sample: {
      startDate: '2026-10-08T08:00:00.000Z',
      endDate: '2026-10-08T08:30:00.000Z',
      quantity: 1250,
      unit: 'count',
    },
  },
  'screen-time': {
    title: 'Screen time',
    domain: /** @type {const} */ ('time'),
    introduction:
      'Export application and website usage aggregates. Each profile chooses the collections it includes, while the source payload preserves timing and duration fields.',
    sources: 'The PhoneUsage native adapter on iOS and Android, plus imported time JSON archives.',
    groups: [
      { title: 'iOS · Native usage', keys: ['native:applications', 'native:websites'] },
      { title: 'Android · Native usage', keys: ['native:applications'] },
      {
        title: 'Imported data · discovered from your file',
        keys: [
          'imported:rawScreenTime',
          'imported:applications',
          'imported:websites',
          'imported:dailyTrends',
          'imported:hourlyActivity',
          'imported:archive',
        ],
      },
    ],
    defaults: ['native:applications'],
    controls: [
      [
        'System usage authorization',
        'Authorize Screen Time on iOS or enable Usage Access in Android settings. A profile selection does not bypass system authorization.',
      ],
      [
        'Application and website collections',
        'Select native:applications or native:websites individually. Websites are available in the native iOS adapter; the Android adapter exports applications only.',
      ],
      [
        'Imported collections',
        'Select each collection discovered in a time archive. Select imported:archive separately when you need the complete original file.',
      ],
    ],
    limitations: [
      'Native iOS reads require iOS 26.4+, the approved Family Controls data entitlement, EU eligibility, and authorization with data access.',
      'iOS exports hourly aggregates and can include other devices on the same Screen Time account. Identifiers may be redacted or omitted.',
      'Android exports system daily foreground-usage aggregates. Buckets may extend outside the requested interval; retention depends on the OS.',
      'Usage aggregates are not individual sessions or browser history. Pagination re-reads live data, so completed intervals are more stable.',
    ],
    sampleType: 'applications',
    sampleSource: 'native-usage',
    sample: {
      identifier: 'com.example.reader',
      displayName: 'Reader',
      category: 'Education',
      deviceName: 'Example iPhone',
      startMs: 1791446400000,
      endMs: 1791450000000,
      durationMs: 1200000,
      pickups: 2,
      notifications: 0,
      granularity: 'hourly-aggregate',
    },
  },
  location: {
    title: 'Location',
    domain: /** @type {const} */ ('location'),
    introduction:
      'Keep the location points you explicitly record, or import an existing location archive. Export coordinates and their original accuracy, altitude, and timing fields.',
    sources:
      'Points recorded by myself.md through Expo Location, plus imported location JSON archives.',
    groups: [
      { title: 'iOS and Android · Recorded data', keys: ['native:points'] },
      {
        title: 'Imported data · discovered from your file',
        keys: ['imported:points', 'imported:visits', 'imported:outings', 'imported:archive'],
      },
    ],
    defaults: ['native:points'],
    controls: [
      [
        'Foreground location permission',
        'Allow location access on your phone to capture a point. Capture current location records a single point; it does not enable background tracking.',
      ],
      [
        'Background tracking',
        'Start or stop optional recording in the app. Recording requires foreground and background permission, belongs to the current account, and shows the system location indicator or Android foreground-service notification.',
      ],
      [
        'Point and imported collection selection',
        'Toggle native:points in a profile. Imported points, visits, outings, and original archives have separate selection keys.',
      ],
    ],
    limitations: [
      'The OS does not expose a historical location archive to this adapter. Only points recorded by myself.md and imported history are available.',
      'Background recording requests highest accuracy, a 5 metre distance interval, and a 10 second time interval. These are requested settings, not a guaranteed sampling rate.',
      'If background access is denied, tracking does not start. On iOS, Allow Once or denied Always access can require a trip to system settings.',
      'Stopping tracking stops future recording; previously saved points remain. Local queries include records whose start is inside the UTC interval.',
    ],
    sampleType: 'points',
    sampleSource: 'expo-location',
    sample: {
      timestamp: 1791446400000,
      coords: {
        latitude: 38.7223,
        longitude: -9.1393,
        accuracy: 8,
        altitude: 24,
        altitudeAccuracy: 10,
        heading: null,
        speed: null,
      },
    },
  },
};
/** @param {string} key */
function typeLabel(key) {
  return key
    .replace(/^(native|imported):/, '')
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
            'Configure health, screen time, and location together in one profile. Choose individual types across all datasets and see their combined JSON selection.',
          sources: included.map((item) => `${item.title}: ${item.sources}`).join(' '),
          controls: included.flatMap((item) =>
            item.controls.map(([label, description]) => [`${item.title} · ${label}`, description]),
          ),
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
    schema: 'qr-connect.profile.v1',
    name: `${data.title} example`,
    selection: selected,
  });
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
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft className="size-4" /> Back to dashboard
        </a>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Dataset documentation</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{data.title}</h1>
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
            {data.introduction}
          </p>
          <nav aria-label="Dataset documentation" className="flex flex-wrap gap-2">
            {Object.entries({ ...datasets, all: { title: 'All' } }).map(([key, item]) => (
              <Button key={key} variant={key === dataset ? 'secondary' : 'ghost'} asChild size="sm">
                <a href={`/datasets/${key}`} aria-current={key === dataset ? 'page' : undefined}>
                  {item.title}
                </a>
              </Button>
            ))}
          </nav>
        </div>
        <section className="space-y-3" aria-labelledby="sources-title">
          <h2 id="sources-title" className="text-xl font-semibold">
            What this dataset contains
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{data.sources}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Each record has a shared envelope. Its native payload keeps the original source fields;
            it is not converted into one universal schema. All examples here use fictional data.
          </p>
        </section>
        <section className="space-y-4" aria-labelledby="controls-title">
          <h2 id="controls-title" className="text-xl font-semibold">
            Controls you can turn on or off
          </h2>
          <dl className="divide-y rounded-lg border px-5">
            {[
              ...data.controls,
              [
                'Live agent access',
                'Allow or deny this domain for live phone requests in the app. The active profile’s explicit type selection and system permissions also apply. Domain access starts off for a new account.',
              ],
              [
                'Cloud uploads and sharing',
                'Choose local, HTTPS, or cloud exports. Authorize cloud uploads separately; then choose whether all allowed agents can read this profile’s stored exports. Revoke sharing or block a connected agent in the dashboard.',
              ],
              [
                'Export format and schedule',
                'Choose JSON, JSONL, or both; include 1–30 completed days and optionally today. Configure automatic exports separately from data selection.',
              ],
            ].map(([label, description]) => (
              <div key={label} className="grid gap-2 py-5 sm:grid-cols-[14rem_1fr]">
                <dt className="text-sm font-medium">{label}</dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <section className="min-w-0 space-y-5" aria-labelledby="types-title">
            <h2 id="types-title" className="text-xl font-semibold">
              Individual dataset types
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Try the checkboxes to update the profile JSON preview. These are documentation
              controls; they do not change your phone, permissions, or account. Imported types
              depend on the file and may include additional identifiers. Disabling a type excludes
              it from subsequent reads and exports; it does not delete existing files.
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
                onClick={() => setSelected({ health: [], time: [], location: [] })}
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
                          onChange={(event) =>
                            setSelected((current) => ({
                              ...current,
                              [group.domain]: event.target.checked
                                ? [...new Set([...current[group.domain], key])]
                                : current[group.domain].filter((item) => item !== key),
                            }))
                          }
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
          <aside
            aria-label="Live profile JSON preview"
            className="min-w-0 lg:sticky lg:top-6 [&_pre]:lg:max-h-[calc(100dvh-7rem)] [&_pre]:lg:overflow-auto"
          >
            <JsonExample title="Profile JSON · updates with your selections" value={profile} />
          </aside>
        </div>
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
                'The adapter or import source, such as healthkit, health-connect, native-usage, or expo-location.',
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
                'Profiles use native:<type> or imported:<type>. These authorization keys differ from the source value stored on a record.',
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
              schema: 'qr-connect.export.v1',
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
            captures and failures arrays report source coverage; a file can have partial status when
            some selected sources could not be read.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Original imported files are preserved as imported-original archive records with native
            fields archiveId, name, index, total, and text. Join text chunks in index order for each
            archiveId to reconstruct the original file. Archive chunks are not filtered by event
            date and contain all data from that archive.
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
