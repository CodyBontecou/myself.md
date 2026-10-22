/** @param {string} tag @param {string} [text] @param {string} [className] */
function el(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
/** @param {string} text @param {()=>void} action */
function button(text, action) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = text;
  node.addEventListener('click', action);
  return node;
}
function mount() {
  const root = document.getElementById('location-review');
  if (!root) return;
  /** @typedef {ReturnType<typeof import('../core/location-review.js').locationReview> & {exports:{id:string,day:string,partial:boolean}[]}} Review */
  /** @type {Review|null} */
  let review = null;
  let choice = 0,
    day = '',
    selected = '',
    page = 0;
  function render() {
    if (!review || !root) return;
    const data = review,
      series = data.series[choice];
    root.replaceChildren(
      el('p', data.fictional ? 'MYSELF.MD · FICTIONAL EXAMPLE' : 'MYSELF.MD · LOCATION', 'eyebrow'),
      el('h1', 'Recorded locations'),
    );
    const overview = el('section', '', 'overview');
    overview.setAttribute('aria-label', 'Loaded location overview');
    overview.append(
      el('p', `${data.days[0]?.date} – ${data.days.at(-1)?.date} · ${data.timezone}`),
      el('p', 'Observed points · gaps are unknown', 'muted'),
    );
    if (day)
      overview.append(
        button('Back to all days', () => {
          day = '';
          selected = '';
          page = 0;
          render();
        }),
        el('strong', `Selected day: ${day}`),
      );
    root.append(overview);
    if (series) {
      const label = el('label', 'Source '),
        select = document.createElement('select');
      select.setAttribute('aria-label', 'Location source');
      data.series.forEach((s, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = `${s.source} · ${s.type}`;
        option.selected = i === choice;
        select.append(option);
      });
      select.addEventListener('change', () => {
        choice = Number(select.value);
        selected = '';
        page = 0;
        render();
      });
      label.append(select);
      root.append(label);
      const mini = el('div', '', 'mini');
      mini.setAttribute('role', 'img');
      mini.setAttribute(
        'aria-label',
        series.daily.map((d) => `${d.date}: ${d.count ?? 'Unknown'} points`).join('; '),
      );
      const maximum = Math.max(1, ...series.daily.map((d) => d.count ?? 0));
      for (const d of series.daily) {
        const bar = el('span', '', d.count === null ? 'missing' : '');
        bar.style.height = `${d.count === null ? 4 : Math.max(2, (d.count / maximum) * 28)}px`;
        bar.dataset.selected = String(d.date === day);
        mini.append(bar);
      }
      overview.append(mini);
      const points = series.points.filter(
        (p) => !day || series.daily.find((d) => d.date === day)?.pointIds.includes(p.id),
      );
      root.append(
        el(
          'p',
          `${series.daily.filter((d) => d.count !== null).length}/${data.days.length} days with recorded points. Recording may be sparse.`,
          'muted',
        ),
      );
      const plot = el('section', '', 'plot');
      plot.setAttribute('aria-label', 'Recorded coordinate plot');
      plot.append(el('h2', 'Recorded coordinates'));
      if (points.length) {
        const stride = Math.max(1, Math.ceil(points.length / 1000)),
          shown = points.filter((_, i) => i % stride === 0);
        const picked = points.find((p) => p.id === selected);
        if (picked && !shown.includes(picked)) shown[shown.length - 1] = picked;
        let south = 90,
          north = -90,
          west = 180,
          east = -180;
        for (const p of points) {
          south = Math.min(south, p.latitude);
          north = Math.max(north, p.latitude);
          west = Math.min(west, p.longitude);
          east = Math.max(east, p.longitude);
        }
        const field = el('div', '', 'coordinate-field');
        field.setAttribute('role', 'img');
        field.setAttribute(
          'aria-label',
          `${shown.length} of ${points.length} points. Latitude ${south} to ${north}; longitude ${west} to ${east}. Point details follow.`,
        );
        for (const p of shown) {
          const dot = el('span', '', 'dot');
          dot.style.left = `${5 + (east === west ? 45 : ((p.longitude - west) / (east - west)) * 90)}%`;
          dot.style.top = `${5 + (north === south ? 45 : ((north - p.latitude) / (north - south)) * 90)}%`;
          dot.dataset.selected = String(p.id === selected);
          field.append(dot);
        }
        plot.append(
          el('p', `North ↑ · latitude ${south.toFixed(4)}° to ${north.toFixed(4)}°`, 'muted'),
          field,
          el('p', `West → East · longitude ${west.toFixed(4)}° to ${east.toFixed(4)}°`, 'muted'),
          el(
            'p',
            `${shown.length} of ${points.length} points plotted · coordinate degrees, not distance scale`,
            'muted',
          ),
        );
      } else plot.append(el('p', 'No recorded points in this selection. Coverage is unknown.'));
      root.append(plot);
      const days = el('section');
      days.append(el('h2', 'Daily observations'));
      for (const d of series.daily.filter((entry) => !day || entry.date === day)) {
        const row = el('div', '', 'day');
        row.append(
          button(`${d.date} · ${d.count === null ? 'Unknown' : `${d.count} points`}`, () => {
            day = d.date;
            selected = '';
            page = 0;
            render();
          }),
        );
        const track = el('div', '', 'track'),
          bar = el('div', '', d.count === null ? 'missing' : 'count-bar');
        bar.style.width = d.count === null ? '100%' : `${(d.count / maximum) * 100}%`;
        track.append(bar);
        row.append(track);
        days.append(row);
      }
      root.append(days);
      if (day && points.length) {
        const list = el('section');
        list.append(el('h2', 'Point details'));
        const clock = new Intl.DateTimeFormat('en', {
          timeZone: data.timezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        });
        for (const p of points.slice(page * 25, (page + 1) * 25)) {
          list.append(
            button(
              `${clock.format(new Date(p.start))} · ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`,
              () => {
                selected = p.id;
                render();
              },
            ),
          );
          if (selected === p.id) {
            const detail = el(
              'p',
              `${p.start} · latitude ${p.latitude} · longitude ${p.longitude} · accuracy ${p.accuracy === null ? 'Unknown' : `${p.accuracy} m`} · exports: ${p.exportIds.join(', ')}`,
              'point-detail',
            );
            list.append(detail);
          }
        }
        list.append(
          el(
            'p',
            `Points ${page * 25 + 1}–${Math.min((page + 1) * 25, points.length)} of ${points.length}`,
            'muted',
          ),
        );
        if (page > 0)
          list.append(
            button('Previous points', () => {
              page--;
              selected = '';
              render();
            }),
          );
        if ((page + 1) * 25 < points.length)
          list.append(
            button('Next points', () => {
              page++;
              selected = '';
              render();
            }),
          );
        root.append(list);
      }
    } else root.append(el('p', 'No supported location points in the selected exports.'));
    const limits = el('details');
    limits.append(el('summary', 'Sources & limits'));
    for (const warning of data.warnings) limits.append(el('p', warning));
    limits.append(
      el(
        'p',
        `${data.counts.invalid} invalid records excluded; ${data.counts.unsupported} unsupported records; ${data.counts.duplicates} exact duplicates removed.`,
      ),
    );
    for (const file of data.exports)
      limits.append(
        el('p', `${file.id} · uploaded day ${file.day}${file.partial ? ' · partial export' : ''}`),
      );
    if (data.exports.some((f) => f.partial))
      overview.append(el('p', 'A selected export is partial.', 'muted'));
    root.append(
      limits,
      el(
        'p',
        'Day, source and point navigation use loaded data without additional reads.',
        'muted',
      ),
    );
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
    if (event.data.id === 'location-init' && event.data.result)
      window.parent.postMessage(
        { jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} },
        '*',
      );
    if (event.data.method !== 'ui/notifications/tool-result') return;
    if (event.data.params?.isError) {
      root.replaceChildren(
        el('h1', 'Location review unavailable'),
        el('p', 'Refresh shared export discovery and retry.'),
      );
      return;
    }
    const data = event.data.params?.structuredContent;
    if (data?.version !== 'myself.md.location-review.v1' || !Array.isArray(data.series)) return;
    review = data;
    choice = 0;
    day = '';
    selected = '';
    page = 0;
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
      id: 'location-init',
      method: 'ui/initialize',
      params: {
        protocolVersion: '2026-01-26',
        appInfo: { name: 'myself.md location review', version: '1.0.0' },
        appCapabilities: {},
      },
    },
    '*',
  );
}
mount();
