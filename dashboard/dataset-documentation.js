import { defaultExportSchema } from '../core/export-schemas.js';
import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'radix-ui';
import { IconChevronRight, IconSearch, IconX } from '@tabler/icons-react';
import { datasets } from './dataset-catalog.js';
import { parseProfile } from '../core/profiles.js';
import { datasetExportPreview } from './dataset-export-preview.js';
import { ExportJson } from './export-json.js';
import { DownloadBadges } from './download-badges.js';
import { Button } from './components/ui/button.js';
import { privacyPolicy } from '../core/privacy.js';
import { Input } from './components/ui/input.js';

// Replace each videoId with its tutorial's YouTube ID before launch.
const tutorials = [
  { id: 'launch', label: 'Launch video', videoId: 'dQw4w9WgXcQ' },
  { id: 'mcp', label: 'MCP', videoId: 'dQw4w9WgXcQ' },
  { id: 'agent-design', label: 'Agent-first design', videoId: 'dQw4w9WgXcQ' },
];

/** @param {string} key */
function typeLabel(key) {
  return key
    .replace(/^native:/, '')
    .replace(/^HK(?:Quantity|Category|Correlation|Data)TypeIdentifier/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}
/** @param {{dataset:string, landing?:boolean}} props */
export function DatasetDocumentation({ dataset, landing = false }) {
  const [filter, setFilter] = useState(dataset);
  const datasetPane = useRef(/** @type {HTMLDivElement|null} */ (null));
  useEffect(() => {
    const pane = datasetPane.current;
    if (!pane) return;
    let frame = 0;
    function measure() {
      if (!pane) return;
      const viewport = window.innerHeight;
      const top = Math.max(0, pane.getBoundingClientRect().top);
      // Cap at the viewport even after the panel scrolls above the screen.
      const height = Math.min(viewport, Math.max(Math.min(240, viewport), viewport - top));
      pane.style.setProperty('--dataset-pane-height', `${height}px`);
    }
    function schedule() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    }
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  const included = Object.values(datasets);
  const data = {
    ...datasets.health,
    sources: included.map((item) => `${item.title}: ${item.sources}`).join('\n'),
    limitations: included.flatMap((item) => item.limitations),
  };
  const selectable =
    filter === 'all'
      ? included
      : included.filter((item) => datasets[/** @type {keyof typeof datasets} */ (filter)] === item);
  const groups = selectable.flatMap((item) =>
    item.groups.map((group) => ({
      ...group,
      domain: item.domain,
      title: `${item.title} · ${group.title}`,
    })),
  );
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef(/** @type {HTMLInputElement|null} */ (null));
  const searchTrigger = useRef(/** @type {HTMLButtonElement|null} */ (null));
  const searchWasOpen = useRef(false);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus({ preventScroll: true });
    else if (searchWasOpen.current) searchTrigger.current?.focus({ preventScroll: true });
    searchWasOpen.current = searchOpen;
  }, [searchOpen]);
  function closeSearch() {
    setSearchOpen(false);
    setSearch('');
  }
  const filteredGroups = groups
    .map((group) => ({
      domain: group.domain,
      title: group.title,
      keys: group.keys.filter((key) =>
        `${group.title} ${key} ${typeLabel(key)}`.toLowerCase().includes(search.toLowerCase()),
      ),
    }))
    .filter((group) => group.keys.length > 0);
  const accordionGroups = [
    ...['iOS', 'Android'].map((platform) => ({
      title: `Health · ${platform}`,
      defaultOpen: platform === 'iOS',
      groups: filteredGroups.filter(
        (group) => group.domain === 'health' && group.title.includes(platform),
      ),
    })),
    ...filteredGroups
      .filter((group) => group.domain !== 'health')
      .map((group) => ({
        title:
          group.domain === 'location'
            ? 'Location'
            : group.title.split(' · ').slice(0, 2).join(' · '),
        defaultOpen: false,
        groups: [group],
      })),
  ].filter((accordion) => accordion.groups.length > 0);

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
  const totalCount = included.reduce(
    (total, item) => total + new Set(item.groups.flatMap((group) => group.keys)).size,
    0,
  );
  const profile = parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Example export',
    selection: selected,
    export: { schema: defaultExportSchema },
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
      <main className="space-y-10 py-8 sm:py-12">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="min-w-0 space-y-10">
            {landing ? (
              <div className="space-y-4">
                <DownloadBadges />
                <section className="space-y-6 pb-6 sm:pb-10" aria-labelledby="landing-title">
                  <h1
                    id="landing-title"
                    className="max-w-4xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl"
                  >
                    File over app.
                    <br />
                    Yours to keep.
                  </h1>
                  <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                    Save your health, screen time, and location as files you can read, back up, and
                    take with you. Keep your history, even when you change apps.
                  </p>
                  <Tabs.Root defaultValue="launch" className="space-y-4">
                    <Tabs.List
                      aria-label="Video tutorials"
                      className="inline-flex max-w-full items-center divide-x divide-border"
                    >
                      {tutorials.map((tutorial) => (
                        <Tabs.Trigger
                          key={tutorial.id}
                          value={tutorial.id}
                          className="cursor-pointer px-3 text-sm font-medium text-muted-foreground outline-none first:pl-0 last:pr-0 hover:text-foreground focus-visible:underline focus-visible:underline-offset-4 data-[state=active]:text-foreground"
                        >
                          {tutorial.label}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                    {tutorials.map((tutorial) => (
                      <Tabs.Content
                        key={tutorial.id}
                        value={tutorial.id}
                        className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <figure className="space-y-3">
                          {/* oxlint-disable react/iframe-missing-sandbox -- Cross-origin YouTube needs scripts and its own origin for playback; it cannot access this page. */}
                          <iframe
                            className="block aspect-video min-h-[200px] w-full rounded-lg border-0 bg-black shadow-2xl shadow-black/25 dark:shadow-black/60"
                            src={`https://www.youtube-nocookie.com/embed/${tutorial.videoId}?playsinline=1&rel=0`}
                            title={`${tutorial.label} — Rick Astley placeholder`}
                            loading="lazy"
                            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                          {/* oxlint-enable react/iframe-missing-sandbox */}
                          <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                              {tutorial.label} coming soon. Enjoy a little Rick Astley for now.
                            </span>
                          </figcaption>
                        </figure>
                      </Tabs.Content>
                    ))}
                  </Tabs.Root>
                  <nav className="flex gap-4 text-sm underline" aria-label="Privacy and support">
                    <a href="/docs">Developer docs</a>
                    <a href="/about">About</a>
                    <a href="/contact">Contact</a>
                    <a href={privacyPolicy.url}>Privacy policy</a>
                    <a href={privacyPolicy.supportUrl}>Support</a>
                  </nav>
                </section>
              </div>
            ) : (
              <header className="space-y-4">
                <nav className="flex gap-4 text-sm text-muted-foreground" aria-label="Site">
                  <a className="underline underline-offset-4" href="/">
                    myself.md
                  </a>
                  <a className="underline underline-offset-4" href="/docs">
                    Docs
                  </a>
                </nav>
                <h1 className="text-4xl font-semibold tracking-tight">Datasets</h1>
                <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                  Explore supported data types and see how they appear in an export. Select a type
                  to update the fictional example.
                </p>
              </header>
            )}
            <section id="dataset-types" className="min-w-0 space-y-5" aria-label="Dataset types">
              <div className="bg-background py-3">
                <div className="relative">
                  <div
                    aria-label="Filter dataset types"
                    className="flex flex-wrap items-center gap-2"
                    inert={searchOpen}
                    aria-hidden={searchOpen}
                  >
                    {Object.entries({ all: { title: 'All' }, ...datasets }).map(([key, item]) => (
                      <Button
                        key={key}
                        type="button"
                        variant={key === filter ? 'secondary' : 'ghost'}
                        size="sm"
                        aria-pressed={key === filter}
                        aria-controls="dataset-types"
                        onClick={() => {
                          setFilter(key);
                          datasetPane.current?.scrollTo({ top: 0, left: 0 });
                        }}
                      >
                        {item.title}
                      </Button>
                    ))}
                    <div className="ml-auto flex flex-wrap items-center gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 justify-end px-1 text-xs tabular-nums text-muted-foreground"
                        aria-label="Clear selection"
                        title="Clear selection"
                        onClick={() => {
                          setAdded(null);
                          setSelected({ health: [], time: [], location: [] });
                        }}
                      >
                        <span
                          role="status"
                          aria-label={`${selectedCount} of ${totalCount} types selected`}
                        >
                          ({selectedCount}/{totalCount})
                        </span>
                      </Button>
                      <Button
                        ref={searchTrigger}
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Open dataset search"
                        aria-expanded={searchOpen}
                        aria-controls="dataset-search"
                        onClick={() => setSearchOpen(true)}
                      >
                        <IconSearch aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div
                    id="dataset-search"
                    className="dataset-search-reveal absolute inset-x-0 top-1/2 -translate-y-1/2"
                    data-open={searchOpen}
                    aria-hidden={!searchOpen}
                    inert={!searchOpen}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        closeSearch();
                      }
                    }}
                  >
                    <Input
                      ref={searchInput}
                      className="bg-background pr-11 dark:bg-background"
                      aria-label="Search dataset types"
                      placeholder="Search types or identifiers…"
                      value={search}
                      disabled={!searchOpen}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        datasetPane.current?.scrollTo({ top: 0, left: 0 });
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      aria-label="Close dataset search"
                      disabled={!searchOpen}
                      onClick={closeSearch}
                    >
                      <IconX aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
              <div
                ref={datasetPane}
                className="h-[var(--dataset-pane-height,100dvh)] overflow-y-auto"
                aria-label="Scrollable dataset types"
                tabIndex={0}
              >
                <div className="py-2">
                  {accordionGroups.map(({ title, defaultOpen, groups: platformSections }) => (
                    <details
                      key={`${filter}:${title}`}
                      open={Boolean(search) || defaultOpen}
                      className="group"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md bg-background py-4 pl-3 text-base font-medium hover:bg-muted group-open:sticky group-open:top-0 group-open:z-10 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                        <span>{title}</span>
                        <span className="ml-auto px-1 text-xs font-medium tabular-nums text-muted-foreground">
                          {platformSections.reduce(
                            (count, group) =>
                              count +
                              group.keys.filter((key) => selected[group.domain].includes(key))
                                .length,
                            0,
                          )}
                          /{platformSections.reduce((count, group) => count + group.keys.length, 0)}
                        </span>
                        <span className="flex size-8 shrink-0 items-center justify-center text-foreground">
                          <IconChevronRight
                            className="size-4 transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none"
                            aria-hidden="true"
                          />
                        </span>
                      </summary>
                      <div className="space-y-6 px-4 pb-5">
                        {platformSections.map((group) => (
                          <section key={group.title} className="space-y-3">
                            <h3 className="text-sm font-medium text-muted-foreground">
                              {group.title}
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {group.keys.map((key) => (
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
                                    <code className="break-all text-xs text-muted-foreground">
                                      {key}
                                    </code>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
                {accordionGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground">No matching dataset types.</p>
                )}
              </div>
            </section>
            <div className="lg:hidden">{exportPreview}</div>
          </div>
          <aside
            aria-label="Live export JSON preview"
            className="hidden min-w-0 lg:-mt-6 lg:block lg:sticky lg:top-6"
          >
            {exportPreview}
          </aside>
        </div>
        <div className="mx-auto max-w-4xl space-y-12 py-12 sm:space-y-16 sm:py-20">
          <section className="space-y-6" aria-labelledby="sources-title">
            <h2 id="sources-title" className="text-2xl font-medium tracking-tight">
              What this dataset contains
            </h2>
            <p className="text-base leading-8 whitespace-pre-line text-muted-foreground sm:text-lg">
              {data.sources}
            </p>
          </section>
          <section className="space-y-6" aria-labelledby="limits-title">
            <h2 id="limits-title" className="text-2xl font-medium tracking-tight">
              Availability and limitations
            </h2>
            <ul className="list-disc space-y-4 pl-5 text-base leading-8 text-muted-foreground sm:text-lg">
              {data.limitations.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </section>
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
