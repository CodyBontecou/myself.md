/** @param {string} tag @param {string} [text] @param {string} [className] */
function el(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
/** @param {number|null} value @param {string} unit */
function format(value, unit) {
  return value === null
    ? 'Unknown'
    : unit === 'h'
      ? `${value.toFixed(2)} h`
      : `${value.toLocaleString()} steps`;
}
/** @param {string} text @param {()=>void} action */
function button(text, action) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = text;
  node.addEventListener('click', action);
  return node;
}
/** Self-contained MCP Apps renderer; inputs come from the authorized review operation. */
function mountHealthReview() {
  const root = document.getElementById('health-review');
  if (!root) return;
  /** @typedef {ReturnType<typeof import('../core/health-review.js').healthReview> & {exports:{id:string,day:string,partial:boolean}[]}} Review */
  /** @type {Review|null} */
  let review = null;
  let selectedDay = '';
  const choices = { activity: 0, sleep: 0 };
  function render() {
    if (!review || !root) return;
    const data = review;
    root.replaceChildren(
      el('p', data.fictional ? 'MYSELF.MD · FICTIONAL EXAMPLE' : 'MYSELF.MD · HEALTH', 'eyebrow'),
      el('h1', 'Activity & sleep'),
    );
    const overview = el('section', '', 'overview');
    overview.setAttribute('aria-label', 'Loaded health overview');
    overview.append(
      el('p', `${data.days[0]?.date} – ${data.days.at(-1)?.date} · ${data.timezone}`),
      el('p', 'Observed records · gaps are unknown', 'muted'),
    );
    if (selectedDay)
      overview.append(
        button('Back to all days', () => {
          selectedDay = '';
          render();
        }),
        el('strong', `Selected day: ${selectedDay}`),
      );
    root.append(overview);
    for (const kind of /** @type {const} */ (['activity', 'sleep'])) {
      const series = data.series.filter((s) => s.kind === kind),
        section = el('section', '', 'metric');
      section.append(el('h2', kind === 'activity' ? 'Daily activity' : 'Sleep timing'));
      if (!series.length) {
        section.append(
          el(
            'p',
            kind === 'activity'
              ? 'No supported step records in the selected exports.'
              : 'No supported sleep records in the selected exports.',
            'muted',
          ),
        );
        root.append(section);
        continue;
      }
      const label = el('label', 'Source '),
        select = document.createElement('select');
      select.setAttribute('aria-label', `${kind} source`);
      series.forEach((s, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${s.source} · ${s.type} · ${s.device} · ${s.unit}`;
        option.selected = index === choices[kind];
        select.append(option);
      });
      select.addEventListener('change', () => {
        choices[kind] = Number(select.value);
        render();
      });
      label.append(select);
      section.append(label);
      const s = series[choices[kind]] ?? series[0];
      if (!s) continue;
      const count = s.daily.filter((d) => d.value !== null).length;
      section.append(
        el(
          'p',
          `${count}/${data.days.length} days with ${kind === 'activity' ? 'step' : 'asleep'} observations. Recorded days may be incomplete.`,
          'muted',
        ),
      );
      const maximum = Math.max(1, ...s.daily.map((d) => d.value ?? 0));
      if (selectedDay) {
        const mini = el('div', '', 'mini');
        mini.dataset.kind = kind;
        mini.setAttribute('role', 'img');
        mini.setAttribute(
          'aria-label',
          s.daily.map((d) => `${d.date}: ${format(d.value, s.unit)}`).join('; '),
        );
        for (const d of s.daily) {
          const bar = el('span', '', d.value === null ? 'missing' : '');
          bar.style.height = `${d.value === null ? 5 : Math.max(2, (d.value / maximum) * 35)}px`;
          bar.title = `${d.date}: ${format(d.value, s.unit)}`;
          bar.dataset.selected = String(d.date === selectedDay);
          mini.append(bar);
        }
        overview.append(mini);
      }
      if (kind === 'sleep') {
        section.append(
          el(
            'p',
            'Sleep intervals across each local calendar day. 00:00 → next midnight; awake/in-bed intervals are shown separately.',
            'muted',
          ),
        );
        const legend = el('div', '', 'sleep-legend');
        for (const stage of [
          'Asleep',
          'Core',
          'Light',
          'Deep',
          'REM',
          'Awake / in bed / unknown',
        ]) {
          const item = el('span', stage);
          item.dataset.kind = stage;
          legend.append(item);
        }
        section.append(legend);
      }
      for (const d of s.daily.filter(
        (observation) => !selectedDay || observation.date === selectedDay,
      )) {
        const row = el('div', '', 'day');
        row.append(
          button(`${d.date} · ${format(d.value, s.unit)}`, () => {
            selectedDay = d.date;
            render();
          }),
        );
        if (kind === 'activity') {
          const track = el('div', '', 'track'),
            bar = el('div', '', d.value === null ? 'missing' : 'step-bar');
          bar.style.width =
            d.value === null
              ? '100%'
              : `${Math.max(d.value === 0 ? 0 : 1, (d.value / maximum) * 100)}%`;
          track.append(bar);
          row.append(track);
        } else {
          const day = data.days.find((item) => item.date === d.date);
          const track = el('div', '', 'sleep-track');
          track.setAttribute('role', 'img');
          track.setAttribute(
            'aria-label',
            `${d.date}: ${d.intervals.length} recorded sleep intervals; ${format(d.value, 'h')} asleep`,
          );
          if (day)
            for (const i of d.intervals) {
              const segment = el('span', '', 'sleep-segment');
              segment.style.left = `${((Date.parse(i.start) - Date.parse(day.start)) / (Date.parse(day.end) - Date.parse(day.start))) * 100}%`;
              segment.style.width = `${((Date.parse(i.end) - Date.parse(i.start)) / (Date.parse(day.end) - Date.parse(day.start))) * 100}%`;
              segment.dataset.kind = i.kind;
              segment.title = `${i.kind}: ${i.start} – ${i.end}`;
              track.append(segment);
            }
          if (!d.intervals.length) track.append(el('span', 'No recorded intervals', 'muted'));
          row.append(track);
          if (selectedDay) {
            const breakdown = el('section', '', 'stage-breakdown');
            breakdown.setAttribute('aria-label', 'Observed sleep stage durations');
            breakdown.append(
              el('h3', 'Recorded stage durations'),
              el(
                'p',
                `Bars run from 0 to ${day ? (Date.parse(day.end) - Date.parse(day.start)) / 3600000 : 24} hours. Each label is unioned separately; conflicting labels may overlap. These are calendar-day portions.`,
                'muted',
              ),
            );
            for (const stage of d.stageDurations ?? []) {
              const item = el('div');
              item.append(el('p', `${stage.kind} · ${stage.hours.toFixed(2)} h`));
              const stageTrack = el('div', '', 'track'),
                bar = el('div', '', 'stage-bar');
              bar.dataset.kind = stage.kind;
              bar.style.width = `${day ? (stage.hours / ((Date.parse(day.end) - Date.parse(day.start)) / 3600000)) * 100 : 0}%`;
              stageTrack.append(bar);
              item.append(stageTrack);
              breakdown.append(item);
            }
            row.append(breakdown);
            const list = el('ul');
            const clock = new Intl.DateTimeFormat('en', {
              timeZone: data.timezone,
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short',
            });
            for (const i of d.intervals)
              list.append(
                el(
                  'li',
                  `${i.kind} · ${clock.format(new Date(i.start))} – ${clock.format(new Date(i.end))}`,
                ),
              );
            row.append(list);
          }
        }
        section.append(row);
      }
      root.append(section);
    }
    const limits = el('details');
    limits.append(el('summary', 'Sources & limits'));
    for (const warning of data.warnings) limits.append(el('p', warning));
    limits.append(
      el(
        'p',
        `Excluded: ${data.counts.invalid} invalid, ${data.counts.crossingDay} midnight-crossing steps, ${data.counts.overlaps} overlapping steps, ${data.counts.unsupported} unsupported records. ${data.counts.duplicates} exact duplicates removed.`,
      ),
    );
    for (const file of data.exports)
      limits.append(
        el('p', `${file.id} · uploaded day ${file.day}${file.partial ? ' · partial export' : ''}`),
      );
    root.append(
      limits,
      el(
        'p',
        'Select a day to inspect. Navigation uses the loaded review without additional reads.',
        'muted',
      ),
    );
    if (data.exports.some((f) => f.partial))
      overview.append(el('p', 'A selected export is partial.', 'muted'));
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
    if (event.data.id === 'health-init' && event.data.result)
      window.parent.postMessage(
        { jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} },
        '*',
      );
    if (event.data.method !== 'ui/notifications/tool-result') return;
    if (event.data.params?.isError) {
      root.replaceChildren(
        el('h1', 'Health review unavailable'),
        el('p', 'Refresh shared export discovery and retry.'),
      );
      return;
    }
    const data = event.data.params?.structuredContent;
    if (data?.version !== 'myself.md.health-review.v1' || !Array.isArray(data.series)) return;
    review = data;
    selectedDay = '';
    choices.activity = 0;
    choices.sleep = 0;
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
      id: 'health-init',
      method: 'ui/initialize',
      params: {
        protocolVersion: '2026-01-26',
        appInfo: { name: 'myself.md health review', version: '1.0.0' },
        appCapabilities: {},
      },
    },
    '*',
  );
}

mountHealthReview();
