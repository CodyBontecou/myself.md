import { useEffect, useState } from 'react';
import { api, hasSession, initializeSession, signIn } from './session.js';
import { Button } from './components/ui/button.js';
import { browserTrafficExcluded, setBrowserTrafficExcluded } from './analytics-exclusion.js';
/** @typedef {{counts:{name:string,events:number,users:number,verified:number}[],steps:{name:string,step:string,events:number,users:number}[],daily:{day:string,events:number,users:number}[],funnel:{step:string,users:number}[],activation:{step:string,users:number}[],retention:{days:number,eligible:number,retained:number}[],notes:string[]}} Report */
export function AnalyticsReport() {
  const [start, setStart] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [end, setEnd] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10)),
    [surface, setSurface] = useState(''),
    [audience, setAudience] = useState('customers'),
    [excludedBrowser, setExcludedBrowser] = useState(browserTrafficExcluded);
  const [ready, setReady] = useState(false),
    [operator, setOperator] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [report, setReport] = useState(/** @type {Report|null} */ (null));
  useEffect(() => {
    void initializeSession()
      .then(async () => {
        if (!hasSession()) {
          setReady(true);
          return undefined;
        }
        const access = /** @type {{operator:boolean}} */ (await api('/api/analytics/access'));
        setOperator(access.operator);
        setReady(true);
        return undefined;
      })
      .catch(() => {
        setError('Could not verify operator access. Sign in again.');
        setReady(true);
        return undefined;
      });
  }, []);
  async function load() {
    setBusy(true);
    setError('');
    setReport(null);
    try {
      setReport(
        await api(
          `/api/analytics/report?${new URLSearchParams({ start, end, audience, ...(surface ? { surface } : {}) })}`,
        ),
      );
    } catch {
      setError('Report unavailable. Check your date range and operator access, then retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <a href="/dashboard" className="underline">
        Back to dashboard
      </a>
      <h1 className="text-2xl font-semibold">Product analytics</h1>
      <p>Private operator reports · consented activity · dates in UTC</p>
      <section className="space-y-2 rounded border p-4" aria-label="Browser traffic preference">
        <p>
          {excludedBrowser
            ? 'This browser is excluded from website analytics, including signed-out visits.'
            : 'Exclude your browser before browsing or testing the public site.'}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            try {
              setBrowserTrafficExcluded(!excludedBrowser);
              setExcludedBrowser(browserTrafficExcluded());
              setError('');
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : 'Could not save browser preference.',
              );
            }
          }}
        >
          {excludedBrowser ? 'Include this browser' : 'Exclude this browser'}
        </Button>
        <p className="text-sm text-muted-foreground">
          Applies to future visits in this browser for one year. It does not change usage consent or
          remove earlier activity. Other browsers and private windows need their own exclusion.
        </p>
      </section>
      {!ready ? (
        <p>Checking access…</p>
      ) : !hasSession() ? (
        <Button
          onClick={() => {
            void signIn('github').catch(() => setError('Sign-in failed. Retry.'));
          }}
        >
          Sign in as operator
        </Button>
      ) : !operator ? (
        <p role="alert">This account does not have analytics operator access.</p>
      ) : (
        <>
          <form
            className="flex flex-wrap items-end gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <label>
              From
              <input
                type="date"
                className="block rounded border p-2"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              Until (exclusive)
              <input
                type="date"
                className="block rounded border p-2"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
            <label>
              Audience
              <select
                className="block rounded border p-2"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
              >
                <option value="customers">Customer activity</option>
                <option value="internal">Internal and QA</option>
                <option value="all">All activity</option>
              </select>
            </label>
            <label>
              Surface
              <select
                className="block rounded border p-2"
                value={surface}
                onChange={(event) => setSurface(event.target.value)}
              >
                <option value="">All surfaces</option>
                {['ios', 'android', 'website', 'dashboard'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <Button disabled={busy} type="submit">
              {busy ? 'Loading…' : 'Load report'}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            Customer activity excludes known owner and QA identities. Unclassified anonymous
            activity may remain; this filter does not verify that every visitor is a customer.
          </p>
          {report && (
            <>
              {!report.counts.length && <p>No consented events in this period.</p>}
              <section>
                <h2 className="mb-2 text-lg font-medium">Ordered funnel</h2>
                <div className="flex flex-wrap gap-4">
                  {report.funnel.map((row) => (
                    <div key={row.step} className="rounded border p-4">
                      <p>{row.step.replaceAll('_', ' ')}</p>
                      <strong className="text-2xl">{row.users}</strong>
                      <p>users</p>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h2 className="text-lg font-medium">App activation (including app-first users)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.activation.map((row) => (
                        <tr key={row.step}>
                          <td>{row.step.replaceAll('_', ' ')}</td>
                          <td>{row.users}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h2 className="text-lg font-medium">Retention after first successful export</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
                    <thead>
                      <tr>
                        <th>UTC day</th>
                        <th>Eligible users</th>
                        <th>Returned</th>
                        <th>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.retention.map((row) => (
                        <tr key={row.days}>
                          <td>{row.days}</td>
                          <td>{row.eligible}</td>
                          <td>{row.retained}</td>
                          <td>
                            {row.eligible
                              ? `${((100 * row.retained) / row.eligible).toFixed(1)}%`
                              : 'Not mature'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h2 className="text-lg font-medium">Milestones and feature usage</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Events</th>
                        <th>Users</th>
                        <th>Verified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.counts.map((row) => (
                        <tr key={row.name}>
                          <td>{row.name.replaceAll('_', ' ')}</td>
                          <td>{row.events}</td>
                          <td>{row.users}</td>
                          <td>{row.verified}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h2 className="text-lg font-medium">Screen and onboarding steps</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Step</th>
                        <th>Events</th>
                        <th>Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.steps.map((row) => (
                        <tr key={`${row.name}:${row.step}`}>
                          <td>{row.name.replaceAll('_', ' ')}</td>
                          <td>{row.step}</td>
                          <td>{row.events}</td>
                          <td>{row.users}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h2 className="text-lg font-medium">Daily activity</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Events</th>
                        <th>Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.daily.map((row) => (
                        <tr key={row.day}>
                          <td>{row.day}</td>
                          <td>{row.events}</td>
                          <td>{row.users}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {report.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
