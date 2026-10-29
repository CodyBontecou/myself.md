import { compactReview } from './review-presentation.js';
import { sleepPerformanceChart } from './sleep-performance-chart.js';
import { preSleepUsage } from '../core/pre-sleep-usage.js';
import { sleepUsageRows } from '../core/sleep-screen-time.js';
/** @template {keyof HTMLElementTagNameMap} T @param {T} tag @param {string} [text] @returns {HTMLElementTagNameMap[T]} */
function node(tag, text = '') {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
}
/** Explanation stays available without competing with the plot. @param {string} text */
function note(text) {
  const p = node('p', text);
  p.className = 'review-note';
  return p;
}
/** @param {number|null} value */
const hours = (value) => (value === null ? 'Unknown' : `${value.toFixed(2)} h`);
/** @param {string} text @param {()=>void} action */
function button(text, action) {
  const b = node('button', text);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
}
const range = (/** @type {number|null} */ a, /** @type {number|null} */ b) =>
  a === null || b === null
    ? 'Unknown'
    : a === b
      ? `${(a / 60000).toFixed(1)} min`
      : `${(a / 60000).toFixed(1)}–${(b / 60000).toFixed(1)} min`;

function mount() {
  const root = document.getElementById('sleep-screen-time');
  if (!root) return;
  /** @type {(ReturnType<typeof import('../core/sleep-screen-time.js').sleepScreenTime> & {exports:{id:string,day:string,partial:boolean}[]})|null} */ let data =
    null;
  let day = '',
    sleepId = '',
    usageId = '',
    sessionId = '';
  /** @type {import('../core/sleep-screen-time.js').SleepUsageView} */ let view = 'daily';
  /** @type {import('../core/sleep-screen-time.js').SleepUsageAlignment} */ let alignment =
    'previous_day';
  /** @param {string} label @param {{id:string,label:string}[]} choices @param {string} value @param {(value:string)=>void} change */
  function select(label, choices, value, change) {
    const wrap = node('label', label),
      s = document.createElement('select');
    s.setAttribute('aria-label', label);
    for (const c of choices) {
      const o = node('option', c.label);
      o.value = c.id;
      o.selected = c.id === value;
      s.append(o);
    }
    s.disabled = !choices.length;
    s.addEventListener('change', () => {
      change(s.value);
      render();
    });
    wrap.append(s);
    return wrap;
  }
  function render() {
    if (!data || !root) return;
    const d = data;
    const sleep = d.sleepSources.find((s) => s.id === sleepId),
      usage = d.usageSources.find((s) => s.id === usageId),
      rows = sleepUsageRows(d.days, sleep, usage, alignment);
    root.replaceChildren(node('h1', 'WHOOP sleep & screen time'));
    if (d.fictional) {
      const demo = node('p', 'Demo data');
      demo.className = 'eyebrow';
      root.prepend(demo);
    }
    const overview = node('section');
    overview.className = 'overview';
    overview.setAttribute('aria-label', 'Loaded comparison overview');
    overview.append(
      node('p', `${d.days[0]?.date} – ${d.days.at(-1)?.date}`),
      node('p', `${rows.filter((r) => r.paired).length}/${rows.length} paired dates`),
    );
    if (day || sessionId) {
      overview.append(
        button(view !== 'daily' ? 'Back to all sessions' : 'Back to all days', () => {
          day = '';
          sessionId = '';
          render();
        }),
        node('strong', sessionId ? 'Selected sleep session' : `Sleep ending: ${day}`),
      );
      const mini = node('div');
      mini.className = 'mini';
      mini.setAttribute('role', 'img');
      mini.setAttribute(
        'aria-label',
        rows
          .map((r) => `${r.date}: sleep ${hours(r.sleepHours)}, usage ${hours(r.screenHours)}`)
          .join('; '),
      );
      for (const r of rows) {
        const m = node('span', r.paired ? '●' : '○');
        m.title = r.date;
        mini.append(m);
      }
      overview.append(mini);
    }
    root.append(overview);
    const controls = node('section');
    controls.className = 'controls';
    controls.append(
      select(
        'Comparison',
        [
          { id: 'daily', label: 'Daily' },
          ...(['myself.md.sleep-screen-time.v2', 'myself.md.sleep-screen-time.v3'].includes(
            d.version,
          )
            ? [{ id: 'before_sleep', label: 'Before sleep' }]
            : []),
          ...(d.version === 'myself.md.sleep-screen-time.v3'
            ? [{ id: 'sleep_performance', label: 'Sleep performance' }]
            : []),
        ],
        view,
        (v) => {
          view =
            v === 'sleep_performance'
              ? 'sleep_performance'
              : v === 'before_sleep'
                ? 'before_sleep'
                : 'daily';
          day = '';
          sessionId = '';
        },
      ),
      select('WHOOP source', d.sleepSources, sleepId, (v) => {
        sleepId = v;
        sessionId = '';
      }),
      select('Screen-time source', d.usageSources, usageId, (v) => (usageId = v)),
      view === 'daily'
        ? select(
            'Date alignment',
            [
              { id: 'previous_day', label: 'Previous day usage' },
              { id: 'same_day', label: 'Same day usage' },
            ],
            alignment,
            (v) => (alignment = v === 'same_day' ? 'same_day' : 'previous_day'),
          )
        : note('Window: two hours before session start'),
    );
    root.append(controls);
    if (view === 'daily')
      root.append(
        note(
          alignment === 'previous_day'
            ? 'Sleep ending on D compared with observed app usage on D−1. This is not an exact pre-bed window.'
            : 'Sleep ending on D compared with observed app usage on D. This does not establish which came first.',
        ),
      );
    if (!sleep)
      root.append(node('p', 'No supported WHOOP sleep sessions in the selected health exports.'));
    if (!usage)
      root.append(
        node(
          'p',
          'No screen-time observations in the selected exports. Missing usage is unknown, not zero.',
        ),
      );
    if (view !== 'daily') {
      const windows = (
        usage?.preSleep ??
        preSleepUsage(
          { source: '', type: '', granularity: '', device: '', rows: [] },
          d.sleepSources,
        )
      ).filter((w) => w.sleepSourceId === sleepId);
      const mini = overview.querySelector('.mini');
      if (mini) {
        mini.setAttribute(
          'aria-label',
          windows
            .map(
              (item) =>
                `${item.sessionStart}: ${range(item.lowerMs, item.upperMs)}, WHOOP performance ${item.sleepPerformancePercent ?? 'Unknown'}${typeof item.sleepPerformancePercent === 'number' ? '%' : ''}`,
            )
            .join('; '),
        );
        mini.replaceChildren(...windows.map((item) => node('span', item.records ? '●' : '○')));
      }
      overview
        .querySelector('p:nth-child(2)')
        ?.replaceChildren(
          document.createTextNode(
            view === 'sleep_performance'
              ? `${windows.filter((w) => w.records > 0 && w.sleepPerformancePercent !== null).length}/${windows.length} paired sessions`
              : `${windows.filter((w) => w.records > 0).length}/${windows.length} observed sessions`,
          ),
        );
      root.append(
        note(
          'Each window is the two elapsed hours before the WHOOP session starts, including naps. Dates above select sessions by their local end date; times use your selected timezone.',
        ),
        note(
          'Observed usage bounds account for aggregate records crossing a window edge; no proportional estimates. Gaps remain unknown. Observed interval spans do not prove complete collection. App totals may overlap; no causal inference.',
        ),
      );
      const usageScale = Math.max(120, ...windows.map((w) => (w.upperMs ?? 0) / 60000));
      root.append(
        note(
          `Observed-usage scale: 0–${usageScale.toFixed(0)} min. Solid = minimum; dashed = additional possible usage within observed records.`,
        ),
      );
      if (view === 'sleep_performance') {
        root.append(
          note(
            'WHOOP’s reported sleep performance percentage uses a fixed 0–100 scale. It is not a recovery or sleep-efficiency score. Missing, invalid and unscored values remain unknown; no replacement score is calculated.',
          ),
        );
        if (!sessionId)
          root.append(
            sleepPerformanceChart(windows, usageScale, (id) => {
              sessionId = id;
              render();
            }),
          );
      }
      if (!windows.length)
        root.append(node('p', 'No WHOOP sessions or usage sources available for this comparison.'));
      const clock = new Intl.DateTimeFormat('en', {
        timeZone: d.timezone,
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });
      const stamp = (/** @type {string} */ v) => clock.format(new Date(v));
      const sessions = node('details');
      sessions.className = 'session-list';
      sessions.append(node('summary', `Sessions · ${windows.length}`));
      sessions.open = view !== 'sleep_performance';
      for (const w of windows.filter((item) => !sessionId || sessionId === item.sessionId)) {
        const section = node('section');
        section.className = 'day';
        const open = button(`${w.nap ? 'Nap' : 'Sleep'} · ${stamp(w.sessionStart)}`, () => {
          sessionId = w.sessionId;
          render();
        });
        open.setAttribute(
          'aria-label',
          `${w.nap ? 'Nap' : 'Sleep'} starting ${stamp(w.sessionStart)}`,
        );
        section.append(open);
        const score =
          typeof w.sleepPerformancePercent === 'number'
            ? `${w.sleepPerformancePercent.toFixed(1)}%`
            : 'Unknown';
        if (sessionId) {
          const metrics = node('div');
          metrics.className = 'session-metrics';
          for (const [value, label] of [
            [range(w.lowerMs, w.upperMs), 'Pre-sleep usage · observed range'],
            ...(view === 'sleep_performance' ? [[score, 'WHOOP performance']] : []),
            [hours(w.sleepHours), 'Asleep'],
          ]) {
            const metric = node('div');
            metric.append(node('strong', value), node('span', label));
            metrics.append(metric);
          }
          section.append(metrics);
        } else {
          const value = node('div', range(w.lowerMs, w.upperMs));
          value.className = 'session-value';
          if (view === 'sleep_performance') value.append(node('small', `${score} WHOOP`));
          section.append(value);
        }
        const track = node('div');
        track.className = 'track';
        track.style.display = 'flex';
        track.setAttribute('role', 'img');
        track.setAttribute('aria-label', `Observed usage bounds · ${range(w.lowerMs, w.upperMs)}`);
        const minimum = node('div');
        minimum.className = 'usage';
        minimum.style.width = `${((w.lowerMs ?? 0) / 60000 / usageScale) * 100}%`;
        const uncertain = node('div');
        uncertain.className = 'missing';
        uncertain.style.width =
          w.upperMs === null
            ? '100%'
            : `${((w.upperMs - (w.lowerMs ?? 0)) / 60000 / usageScale) * 100}%`;
        track.append(minimum, uncertain);
        section.append(track);
        if (sessionId) {
          section.append(node('h2', 'Apps / sites'));
          for (const app of w.topApps) {
            const row = node('div');
            row.className = 'app-value';
            row.append(node('span', app.name), node('span', range(app.lowerMs, app.upperMs)));
            section.append(row);
          }
          if (w.topApps.length === 0) section.append(node('p', 'No usage observations'));
          if (w.otherUpperMs)
            section.append(node('p', `Other · ${range(w.otherLowerMs, w.otherUpperMs)}`));
          const detail = node('details');
          detail.append(
            node('summary', 'Session details'),
            node('p', `Before-sleep window: ${stamp(w.windowStart)} – ${stamp(w.windowEnd)}`),
            node('p', `WHOOP asleep · ${hours(w.sleepHours)} · ${w.scoreState}`),
            ...(view === 'sleep_performance'
              ? [node('p', `WHOOP sleep performance · ${score} · ${w.performanceStatus}`)]
              : []),
            node(
              'p',
              `${w.records} observed records · ${w.boundaryRecords} cross a window edge · ${w.conflictingRecords} conflicting records excluded`,
            ),
            node(
              'p',
              `Intervals with records span ${(w.observedSpanMs / 60000).toFixed(1)} of 120 min; unobserved intervals are unknown.`,
            ),
            node('p', `Session ${w.sessionId} · sleep exports ${w.sleepExportIds.join(', ')}`),
            node('p', `Usage exports ${w.usageExportIds.join(', ') || 'None observed'}`),
          );
          section.append(detail);
          root.append(section);
        } else sessions.append(section);
      }
      if (!sessionId) root.append(sessions);
      const limits = node('details');
      limits.className = 'review-notes';
      limits.append(node('summary', 'About this data'), node('p', `Timezone: ${d.timezone}`));
      for (const warning of d.warnings) limits.append(node('p', warning));
      limits.append(node('p', JSON.stringify(d.preSleepCounts)));
      for (const f of d.exports)
        limits.append(node('p', `${f.id} · ${f.day}${f.partial ? ' · partial export' : ''}`));
      root.append(limits);
      if (d.exports.some((f) => f.partial))
        overview.append(node('p', 'A selected export is partial.'));
      compactReview(root);
      return;
    }
    const max = Math.max(1, ...rows.flatMap((r) => [r.sleepHours ?? 0, r.screenHours ?? 0]));
    root.append(
      note(
        `Both bars use hours on the same 0–${max.toFixed(2)} scale. Observed totals may be incomplete; no causal inference.`,
      ),
    );
    for (const r of rows.filter((item) => !day || item.date === day)) {
      const section = node('section');
      section.className = 'day';
      section.append(
        button(`Sleep ending ${r.date}`, () => {
          day = r.date;
          render();
        }),
      );
      for (const [label, value] of /** @type {[string,number|null][]} */ ([
        ['WHOOP asleep', r.sleepHours],
        [`Observed usage ${r.usageDate}`, r.screenHours],
      ])) {
        const row = node('div');
        row.className = 'measure';
        row.append(node('p', `${label} · ${hours(value)}`));
        const track = node('div');
        track.className = 'track';
        const bar = node('div');
        bar.className = value === null ? 'missing' : label === 'WHOOP asleep' ? 'sleep' : 'usage';
        bar.style.width = value === null ? '100%' : `${(value / max) * 100}%`;
        track.append(bar);
        row.append(track);
        section.append(row);
      }
      if (day) {
        section.append(node('h2', 'WHOOP sessions'));
        const sessions = sleep?.daily.find((item) => item.date === r.date)?.sessions ?? [];
        if (!sessions.length)
          section.append(node('p', 'No session ending this date was observed.'));
        const clock = new Intl.DateTimeFormat('en', {
          timeZone: d.timezone,
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        });
        for (const s of sessions) {
          section.append(
            node(
              'p',
              `${s.nap ? 'Nap' : 'Sleep session'} · ${clock.format(new Date(s.start))} – ${clock.format(new Date(s.end))} · ${hours(s.asleepHours)} asleep · ${s.scoreState}`,
            ),
            node('p', `Session ${s.id} · exports ${s.exportIds.join(', ')}`),
          );
        }
        section.append(node('h2', `Observed apps / sites · ${r.usageDate}`));
        const u = usage?.daily.find((item) => item.date === r.usageDate);
        if (u?.durationMs === null || !u)
          section.append(node('p', 'No app-usage observations for this date.'));
        for (const app of u?.topApps ?? [])
          section.append(node('p', `${app.name} · ${(app.durationMs / 60000).toFixed(1)} min`));
        if (u?.otherDurationMs)
          section.append(
            node('p', `Other observed apps · ${(u.otherDurationMs / 60000).toFixed(1)} min`),
          );
      }
      root.append(section);
    }
    const limits = node('details');
    limits.className = 'review-notes';
    limits.append(node('summary', 'About this data'), node('p', `Timezone: ${d.timezone}`));
    for (const w of d.warnings) limits.append(node('p', w));
    limits.append(node('p', JSON.stringify(d.counts)));
    for (const f of d.exports)
      limits.append(node('p', `${f.id} · ${f.day}${f.partial ? ' · partial export' : ''}`));
    root.append(limits);
    if (d.exports.some((f) => f.partial))
      overview.append(node('p', 'A selected export is partial.'));
    compactReview(root);
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
    if (event.data.id === 'sleep-usage-init' && event.data.result)
      window.parent.postMessage(
        { jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} },
        '*',
      );
    if (event.data.method !== 'ui/notifications/tool-result') return;
    if (event.data.params?.isError) {
      root.replaceChildren(
        node('h1', 'Comparison unavailable'),
        node('p', 'Refresh shared export discovery and retry.'),
      );
      return;
    }
    const result = event.data.params?.structuredContent;
    if (
      ![
        'myself.md.sleep-screen-time.v1',
        'myself.md.sleep-screen-time.v2',
        'myself.md.sleep-screen-time.v3',
      ].includes(result?.version)
    )
      return;
    data = result;
    day = '';
    sessionId = '';
    view = result.view ?? 'daily';
    sleepId = result.selection.sleepSourceId;
    usageId = result.selection.usageSourceId;
    alignment = result.alignment;
    render();
  });
  new ResizeObserver(() =>
    window.parent.postMessage(
      {
        jsonrpc: '2.0',
        method: 'ui/notifications/size-changed',
        params: { height: Math.ceil(root.getBoundingClientRect().height) },
      },
      '*',
    ),
  ).observe(root);
  window.parent.postMessage(
    {
      jsonrpc: '2.0',
      id: 'sleep-usage-init',
      method: 'ui/initialize',
      params: {
        protocolVersion: '2026-01-26',
        appInfo: { name: 'myself.md sleep and screen time', version: '1.0.0' },
        appCapabilities: {},
      },
    },
    '*',
  );
}
mount();
