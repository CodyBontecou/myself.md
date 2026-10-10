import { errorJSON } from '../packages/support-chat/errors.js';
import { useEffect, useState } from 'react';
import { parseHistoryEvent } from '../core/history.js';
import { historyDay, historyTitle, historyOutcome, historyRoute } from '../core/history-display.js';
import { api, hasSession } from './session.js';
import { navigateRoute } from './navigation.js';
import { recordRoute } from './explorer-route.js';
import { Button } from './components/ui/button.js';
import { Badge } from './components/ui/badge.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card.js';
/** @typedef {import('../core/history.js').HistoryEvent} Event */
/** @param {string} id */
function openEntry(id) {
  navigateRoute(`?history=1&activity=${encodeURIComponent(id)}`);
}
/** @param {{workspace:import('./workspace.js').Workspace,search:string,updated:string,onExpired:()=>void}} props */
export function HistoryView({ workspace, search, updated, onExpired }) {
  const [filter, setFilter] = useState('all'),
    [profile, setProfile] = useState('');
  const [limit, setLimit] = useState(50),
    [revision, setRevision] = useState(0);
  const id = new URLSearchParams(search).get('activity');
  const requestKey = `${updated}:${revision}:${limit}:${id}`;
  const [response, setResponse] = useState(
    /** @type {{key:string,events:Event[],detail:Event|null,related:Event[],hasMore:boolean,error:string}|null} */ (
      null
    ),
  );
  const loading = response?.key !== requestKey;
  const events = response?.events ?? [];
  const detail = loading ? null : response?.detail;
  const hasMore = response?.hasMore ?? false;
  const error = loading ? '' : response?.error;
  useEffect(() => {
    let active = true,
      pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        /** @type {Event[]} */ const collected = [];
        let more = false;
        async function page(offset = 0) {
          const result = await api('/api/dashboard/history?offset=' + offset);
          const value = /** @type {{events:unknown[],hasMore:boolean}} */ (result);
          collected.push(...value.events.map(parseHistoryEvent));
          if (value.hasMore && collected.length < limit) await page(offset + value.events.length);
          else more = value.hasMore;
        }
        await page();
        const entry = id
          ? /** @type {{event:unknown,related:unknown[]}} */ (
              await api(`/api/dashboard/history/entry?id=${encodeURIComponent(id)}`)
            )
          : null;
        const selected = entry ? parseHistoryEvent(entry.event) : null;
        const related = entry ? entry.related.map(parseHistoryEvent) : [];
        if (active) {
          setResponse({
            key: requestKey,
            events: collected,
            detail: selected,
            related,
            hasMore: more,
            error: '',
          });
        }
      } catch (err) {
        if (active) {
          setResponse((previous) => ({
            key: requestKey,
            events: previous?.events ?? [],
            detail: previous?.detail?.id === id ? previous.detail : null,
            related: previous?.detail?.id === id ? previous.related : [],
            hasMore: previous?.hasMore ?? false,
            error: errorJSON(err),
          }));
          if (!hasSession()) onExpired();
        }
      } finally {
        pending = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [limit, id, requestKey, onExpired]);
  const filtered = events.filter(
    (e) => (!profile || e.profile.id === profile) && (filter === 'all' || e.kind === filter),
  );
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>{id ? 'Activity details' : 'Export history'}</CardTitle>
          <CardDescription>
            Exports and agent access. Phone export metadata syncs when you refresh History in the
            app. History contains metadata, never records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {id ? (
              <Button variant="outline" onClick={() => navigateRoute('?history=1')}>
                Back to history
              </Button>
            ) : (
              <>
                {['all', 'export', 'access'].map((kind) => (
                  <Button
                    key={kind}
                    variant={filter === kind ? 'default' : 'outline'}
                    aria-pressed={filter === kind}
                    onClick={() => setFilter(kind)}
                  >
                    {kind === 'all' ? 'All' : kind === 'export' ? 'Exports' : 'Agent access'}
                  </Button>
                ))}
                <select
                  aria-label="Filter by profile"
                  className="rounded-md border bg-background px-3 text-sm"
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                >
                  <option value="">All profiles</option>
                  {[...new Map(events.map((e) => [e.profile.id, e.profile.name])).entries()].map(
                    ([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ),
                  )}
                </select>
              </>
            )}
            <Button variant="outline" disabled={loading} onClick={() => setRevision((r) => r + 1)}>
              Refresh
            </Button>
          </div>
          {error ? (
            <pre role="alert" className="whitespace-pre-wrap break-words font-mono text-xs">
              {errorJSON(error)}
            </pre>
          ) : null}
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading history…
            </p>
          ) : null}
          {id ? (
            detail ? (
              <HistoryDetails
                event={detail}
                related={response?.related ?? []}
                workspace={workspace}
              />
            ) : !loading && !error ? (
              <p>Activity unavailable.</p>
            ) : null
          ) : (
            <>
              {!loading && !filtered.length ? (
                <p className="py-8 text-sm text-muted-foreground">
                  {filter === 'access' ? 'No agent access yet.' : 'No export history yet.'} New
                  activity will appear here. Refresh History on your phone to sync its exports.
                </p>
              ) : null}
              {filtered.map((event, index) => (
                <div key={event.id}>
                  {index === 0 ||
                  historyDay(filtered[index - 1]?.startedAt ?? '') !==
                    historyDay(event.startedAt) ? (
                    <h3 className="py-3 text-sm font-semibold">{historyDay(event.startedAt)}</h3>
                  ) : null}
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-left hover:bg-muted focus-visible:ring-2"
                    onClick={() => openEntry(event.id)}
                  >
                    <span>
                      <span className="block font-medium">{historyTitle(event)}</span>
                      <span className="text-sm text-muted-foreground">{historyRoute(event)}</span>
                    </span>
                    <span className="space-x-2 text-sm">
                      <Badge variant={event.status === 'failed' ? 'destructive' : 'secondary'}>
                        {historyOutcome(event)}
                      </Badge>
                      <span>
                        {event.recordCount === null
                          ? ''
                          : `${event.recordCount.toLocaleString()} records · `}
                        {new Date(event.startedAt).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </button>
                </div>
              ))}
              {hasMore ? (
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => setLimit((n) => n + 50)}
                >
                  Load older activity
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
/** @param {{event:Event,related:Event[],workspace:import('./workspace.js').Workspace}} props */
function HistoryDetails({ event, related, workspace }) {
  const fields = [
    ['Outcome', historyOutcome(event)],
    ['Started', new Date(event.startedAt).toLocaleString()],
    ['Last update', new Date(event.updatedAt).toLocaleString()],
    [
      'Triggered by',
      event.actor === 'agent'
        ? 'Connected MCP client'
        : event.actor === 'schedule'
          ? 'Automatic schedule'
          : 'You · Manual export',
    ],
    ['Authenticated client ID', event.client],
    ['Destination', event.destination],
    ['Profile at the time', event.profile.name],
    [
      'Data interval',
      `${new Date(event.interval.start).toLocaleString(undefined, { timeZone: event.timezone })} – ${new Date(event.interval.end).toLocaleString(undefined, { timeZone: event.timezone })}`,
    ],
    ['Interval timezone', event.timezone],
    [
      'Requested data',
      event.request
        ? `${event.request.domain} · ${event.request.source}:${event.request.type}`
        : null,
    ],
    [
      'Records',
      event.recordCount === null
        ? 'Not confirmed'
        : `${event.recordCount.toLocaleString()}${event.kind === 'access' ? ' in this response page' : ''}`,
    ],
    ['Schema', event.schema ?? 'myself.md.export.v1'],
    ['Formats', event.formats.map((f) => f.toUpperCase()).join(', ')],
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{historyTitle(event)}</h2>
        <p className="text-sm text-muted-foreground">{historyRoute(event)}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        {fields
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="break-words text-sm">{value}</dd>
            </div>
          ))}
      </dl>
      {event.error ? (
        <p role="alert" className="rounded-lg border p-4">
          This activity did not finish: {errorJSON(event.error)}
        </p>
      ) : null}
      <div>
        <h3 className="font-medium">Data scope</h3>
        {Object.entries(event.profile.selection)
          .filter(([, types]) => types.length)
          .map(([domain, types]) => (
            <p key={domain} className="break-words text-sm">
              <strong>{domain === 'time' ? 'Screen time' : domain}</strong>: {types.join(', ')}
            </p>
          ))}
      </div>
      {event.artifacts.length ? (
        <div className="space-y-3">
          <h3 className="font-medium">Files</h3>
          {event.artifacts.map((a) => {
            const available = workspace.exports.some((item) => item.id === a.cloudId);
            return (
              <div
                key={`${a.day}-${a.format}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="break-all text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.recordCount.toLocaleString()} records ·{' '}
                    {Math.max(1, Math.round(a.bytes / 1024)).toLocaleString()} KB
                    {a.partial ? ' · Partial' : ''}
                  </p>
                </div>
                {available && a.cloudId ? (
                  <Button
                    variant="outline"
                    onClick={() => navigateRoute(recordRoute(a.cloudId ?? ''))}
                  >
                    View cloud data
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {event.target === 'local' || event.target === 'share'
                      ? 'Share from your phone'
                      : 'File availability unconfirmed'}
                  </span>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Cloud files are retained for 30 days. History remains after files expire or are
            replaced.
          </p>
        </div>
      ) : null}
      {event.warnings.length ? (
        <div>
          <h3 className="font-medium">Coverage & limitations</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {[...new Set(event.warnings)].map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {event.kind === 'access' ? (
        <p className="text-xs text-muted-foreground">
          Each entry represents one requested page. A returned response confirms data was sent
          through MCP; it does not identify a specific model or prove how it used the data.
        </p>
      ) : null}
      {related.length ? (
        <div>
          <h3 className="mb-2 font-medium">Related activity</h3>
          {related.map((item) => (
            <Button key={item.id} variant="link" onClick={() => openEntry(item.id)}>
              {historyTitle(item)} · {historyOutcome(item)} ·{' '}
              {new Date(item.startedAt).toLocaleString()}
            </Button>
          ))}
        </div>
      ) : null}
      <p className="break-all text-xs text-muted-foreground">Activity ID: {event.id}</p>
    </div>
  );
}
