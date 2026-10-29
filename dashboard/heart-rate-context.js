import { compactReview } from './review-presentation.js';
import { mountLocationMap } from './chatgpt-catalog-map.js';
/** @param {string} tag @param {string} [text] @param {string} [className] */
function el(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
/** @param {string} text @param {()=>void} action */
function button(text, action) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', action);
  return b;
}
function mount() {
  const root = document.getElementById('heart-rate-context');
  if (!root) return;
  /** @typedef {ReturnType<typeof import('../core/heart-rate-context.js').heartRateContext> & {mapTiles?:boolean,exports:{id:string,day:string,partial:boolean}[],scope:{deviceId:string,healthProfileId:string,contextProfileId:string}}} Review */
  /** @type {Review|null} */ let review = null;
  let mapEnabled = false;
  /** @type {(()=>void)|undefined} */
  let mapCleanup;
  let sourceIndex = 0,
    healthIndex = 0,
    selected = '',
    selectedSample = '',
    day = '',
    page = 0;
  function render() {
    if (!review || !root) return;
    mapCleanup?.();
    root.dataset.map = String(mapEnabled);
    const data = review,
      source = data.sources[sourceIndex],
      health = data.healthSources[healthIndex] ?? {
        id: '',
        source: 'No supported heart-rate samples',
        samples: [],
      },
      location = data.context === 'location';
    const values = health.samples.map((p) => p.bpm);
    const minimum = values.length ? Math.min(...values) : 0,
      maximum = values.length ? Math.max(...values) : 0;
    /** @param {number|null} bpm */
    const color = (bpm) =>
      bpm === null
        ? '#92929e'
        : `hsl(${240 - ((bpm - minimum) / Math.max(1, maximum - minimum)) * 110} 62% 48%)`;
    const clock = new Intl.DateTimeFormat('en', {
      timeZone: data.timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
    root.replaceChildren(
      el(
        'p',
        data.fictional ? 'MYSELF.MD · FICTIONAL EXAMPLE' : 'MYSELF.MD · OBSERVED DATA',
        'eyebrow',
      ),
      el('h1', location ? 'Heart rate & locations' : 'Heart rate & screen time'),
    );
    const overview = el('section', '', 'overview');
    overview.setAttribute('aria-label', 'Loaded overlay overview');
    overview.append(
      el('p', `${data.days[0]?.date} – ${data.days.at(-1)?.date} · ${data.timezone}`),
      el(
        'p',
        location ? `Nearest sample · ±${data.windowSeconds}s` : 'Shared hours · timing approximate',
        'muted',
      ),
    );
    if (day)
      overview.append(
        button('Back to all days', () => {
          day = '';
          selected = '';
          selectedSample = '';
          page = 0;
          render();
        }),
        el('strong', `Selected day: ${day}`),
      );
    root.append(overview);
    /** @param {string} title @param {{label:string}[]} list @param {number} value @param {(index:number)=>void} set */
    function selector(title, list, value, set) {
      const label = el('label', title),
        select = document.createElement('select');
      select.setAttribute('aria-label', title);
      list.forEach((s, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = s.label;
        option.selected = i === value;
        select.append(option);
      });
      select.addEventListener('change', () => {
        set(Number(select.value));
        selectedSample = '';
        page = 0;
        render();
      });
      label.append(select);
      root?.append(label);
    }
    selector('Heart-rate source', data.healthSources, healthIndex, (v) => {
      healthIndex = v;
    });
    selector(
      location ? 'Location source' : 'Screen-time source',
      data.sources,
      sourceIndex,
      (v) => {
        sourceIndex = v;
        selected = '';
      },
    );
    if (!data.healthSources.length)
      root.append(
        el(
          'p',
          'No supported heart-rate samples. Location markers remain unknown; share timestamped heart-rate samples to color them.',
          'muted',
        ),
      );
    if (!source) {
      root.append(
        el(
          'p',
          !health
            ? 'No supported heart-rate samples.'
            : 'No eligible context observations. Daily and hour-crossing screen-time aggregates cannot be overlaid hourly.',
        ),
      );
    } else {
      const legend = el('section', '', 'legend');
      legend.setAttribute('aria-label', 'Heart-rate color scale');
      legend.append(
        el(
          'strong',
          !values.length
            ? 'Heart rate unknown'
            : minimum === maximum
              ? `${minimum} BPM`
              : `${minimum}–${maximum} BPM`,
        ),
      );
      const ramp = el('div', '', 'ramp');
      ramp.style.background = !values.length
        ? color(null)
        : minimum === maximum
          ? color(minimum)
          : `linear-gradient(90deg,${color(minimum)},${color((minimum + maximum) / 2)},${color(maximum)})`;
      legend.append(ramp, el('p', 'Gray = unknown', 'muted'));
      root.append(legend);
      const observations = source.observations.filter(
        (o) =>
          !day ||
          (data.days.find((d) => d.date === day) &&
            Date.parse(o.start) >= Date.parse(data.days.find((d) => d.date === day)?.start ?? '') &&
            Date.parse(o.start) < Date.parse(data.days.find((d) => d.date === day)?.end ?? '')),
      );
      const mini = el('div', '', 'mini');
      mini.setAttribute('role', 'img');
      mini.setAttribute(
        'aria-label',
        data.days
          .map(
            (d) =>
              `${d.date}: ${source.observations.filter((o) => Date.parse(o.start) >= Date.parse(d.start) && Date.parse(o.start) < Date.parse(d.end)).length} observed ${location ? 'points' : 'hours'}; empty days are unknown`,
          )
          .join('; '),
      );
      for (const d of data.days) {
        const count = source.observations.filter(
            (o) =>
              Date.parse(o.start) >= Date.parse(d.start) && Date.parse(o.start) < Date.parse(d.end),
          ).length,
          bar = el('span', '', count ? '' : 'missing');
        bar.style.height = `${count ? Math.min(26, 6 + count) : 4}px`;
        bar.dataset.selected = String(d.date === day);
        mini.append(bar);
      }
      overview.append(mini);
      root.append(
        el(
          'p',
          `${observations.length} ${location ? 'recorded points' : 'observed usage hours'} · ${
            observations.filter((o) => {
              const bpm = o.heartRates.find((h) => h.sourceId === health.id)?.bpm;
              return bpm !== null && bpm !== undefined;
            }).length
          } matched · gaps remain unknown`,
          'muted',
        ),
      );
      if (location && observations.length) {
        const plot = el('section');
        plot.append(el('h2', 'Heart rate at recorded coordinates'));
        const field = el('div', '', 'coordinate-field');
        field.setAttribute('role', 'img');
        field.setAttribute(
          'aria-label',
          'Coordinates colored by nearby heart rate. Select a point in the details below.',
        );
        const latitudes = observations.map((o) => o.latitude ?? 0),
          longitudes = observations.map((o) => o.longitude ?? 0),
          north = Math.max(...latitudes),
          south = Math.min(...latitudes),
          west = Math.min(...longitudes),
          east = Math.max(...longitudes);
        const stride = Math.max(1, Math.ceil(observations.length / 1000)),
          shown = observations.filter((_, i) => i % stride === 0),
          picked = observations.find((o) => o.id === selected);
        if (picked && !shown.includes(picked)) shown[shown.length - 1] = picked;
        for (const o of shown) {
          const dot =
            root.dataset.map === 'true'
              ? button('', () => {
                  day =
                    data.days.find(
                      (d) =>
                        Date.parse(o.start) >= Date.parse(d.start) &&
                        Date.parse(o.start) < Date.parse(d.end),
                    )?.date ?? '';
                  page = 0;
                  selected = o.id;
                  selectedSample =
                    o.heartRates.find((h) => h.sourceId === health.id)?.sampleIds[0] ?? '';
                  render();
                })
              : el('span', '', 'dot');
          dot.classList.add('dot');
          dot.dataset.latitude = String(o.latitude);
          dot.dataset.longitude = String(o.longitude);
          dot.setAttribute(
            'aria-label',
            `Location ${o.start} · ${o.heartRates.find((h) => h.sourceId === health.id)?.bpm ?? 'Unknown'} BPM`,
          );
          dot.style.left = `${east === west ? 50 : 5 + (((o.longitude ?? 0) - west) / (east - west)) * 90}%`;
          dot.style.top = `${north === south ? 50 : 5 + ((north - (o.latitude ?? 0)) / (north - south)) * 90}%`;
          dot.style.background = color(
            o.heartRates.find((h) => h.sourceId === health.id)?.bpm ?? null,
          );
          dot.dataset.selected = String(o.id === selected);
          field.append(dot);
        }
        plot.append(
          el('p', `North ↑ · latitude ${south.toFixed(4)}° to ${north.toFixed(4)}°`, 'muted'),
          field,
          el(
            'p',
            `West → East · longitude ${west.toFixed(4)}° to ${east.toFixed(4)}° · ${shown.length}/${observations.length} points plotted`,
            'muted review-note',
          ),
          el(
            'p',
            'Coordinate degrees, not a distance scale. Points do not establish a complete route.',
            'muted',
          ),
        );
        root.append(plot);
      }
      const days = el('section');
      days.append(el('h2', 'Daily observations'));
      for (const d of data.days.filter((value) => !day || value.date === day)) {
        const count = source.observations.filter(
          (o) =>
            Date.parse(o.start) >= Date.parse(d.start) && Date.parse(o.start) < Date.parse(d.end),
        ).length;
        days.append(
          button(
            `${d.date} · ${count ? `${count} ${location ? 'points' : 'hours'}` : 'Unknown'}`,
            () => {
              day = d.date;
              selected = '';
              selectedSample = '';
              page = 0;
              render();
            },
          ),
        );
      }
      root.append(days);
      if (day && values.length) {
        const interval = data.days.find((d) => d.date === day);
        const samples = health.samples.filter(
          (p) =>
            interval &&
            Date.parse(p.time) >= Date.parse(interval.start) &&
            Date.parse(p.time) < Date.parse(interval.end),
        );
        const timeline = el('section');
        timeline.append(
          el('h2', 'Heart rate on the same timeline'),
          el(
            'p',
            `Local midnight → next midnight · ${samples.length} recorded samples · no connecting lines across gaps`,
            'muted review-note',
          ),
        );
        const track = el('div', '', 'timeline');
        track.setAttribute('role', 'img');
        track.setAttribute(
          'aria-label',
          'Time runs left to right. Colored dots are heart-rate samples; shaded bands are context intervals. Exact values follow.',
        );
        if (interval) {
          const start = Date.parse(interval.start),
            length = Date.parse(interval.end) - start;
          for (const o of observations) {
            const band = el('span', '', 'band');
            band.style.left = `${((Date.parse(o.start) - start) / length) * 100}%`;
            band.style.width = `${Math.max(0.3, ((Date.parse(o.end) - Date.parse(o.start)) / length) * 100)}%`;
            band.dataset.selected = String(o.id === selected);
            track.append(band);
          }
          const stride = Math.max(1, Math.ceil(samples.length / 1000));
          const shownSamples = samples.filter((_, index) => index % stride === 0);
          const pickedSample = samples.find((sample) => sample.id === selectedSample);
          if (pickedSample && !shownSamples.includes(pickedSample))
            shownSamples[shownSamples.length - 1] = pickedSample;
          for (const p of shownSamples) {
            const dot = el('span', '', 'dot');
            dot.style.left = `${((Date.parse(p.time) - start) / length) * 100}%`;
            dot.style.top = `${maximum === minimum ? 50 : 85 - ((p.bpm - minimum) / (maximum - minimum)) * 70}%`;
            dot.style.background = color(p.bpm);
            dot.dataset.selected = String(p.id === selectedSample);
            track.append(dot);
          }
        }
        timeline.append(
          track,
          el(
            'p',
            `Vertical range ${minimum}–${maximum} BPM · dots may be sampled for display; all records remain in details`,
            'muted review-note',
          ),
        );
        root.append(timeline);
      }
      if (day || !location) {
        const details = el('section');
        details.append(el('h2', location ? 'Point matches' : 'Usage hours & heart rate'));
        const maximumMinutes = Math.max(1, ...source.observations.map((o) => o.minutes ?? 0));
        if (!location)
          details.append(
            el(
              'p',
              `Usage bars: 0–${maximumMinutes.toFixed(1)} minutes; color shows the hour’s observed heart-rate mean.`,
              'muted review-note',
            ),
          );
        for (const o of observations.slice(page * 25, (page + 1) * 25)) {
          const match = o.heartRates.find((h) => h.sourceId === health.id),
            bpm = match?.bpm ?? null;
          details.append(
            button(
              `${clock.format(new Date(o.start))} · ${location ? `${o.latitude?.toFixed(5)}, ${o.longitude?.toFixed(5)}` : `${o.minutes?.toFixed(1)} min`} · ${bpm === null ? 'Heart rate unknown' : `${bpm.toFixed(1)} BPM`}`,
              () => {
                if (!day)
                  day =
                    data.days.find(
                      (d) =>
                        Date.parse(o.start) >= Date.parse(d.start) &&
                        Date.parse(o.start) < Date.parse(d.end),
                    )?.date ?? '';
                page = 0;
                selected = o.id;
                selectedSample = match?.sampleIds[0] ?? '';
                render();
              },
            ),
          );
          if (!location) {
            const bar = el('div', '', 'usage-bar');
            bar.style.width = `${((o.minutes ?? 0) / maximumMinutes) * 100}%`;
            bar.style.background = color(bpm);
            details.append(bar);
          }
          if (selected === o.id) {
            const box = el('div', '', 'match-detail');
            box.append(
              el(
                'p',
                location
                  ? `Location accuracy: ${o.accuracy === null ? 'Unknown' : `${o.accuracy} m`}`
                  : `${clock.format(new Date(o.start))} – ${clock.format(new Date(o.end))} · ${o.apps}`,
              ),
            );
            box.append(
              el(
                'p',
                bpm === null
                  ? 'No matching heart-rate observations.'
                  : location
                    ? `Sample offset: ${match?.offsetSeconds} seconds (negative = earlier, positive = later)`
                    : `${match?.sampleIds.length} samples · mean ${bpm.toFixed(1)} BPM · range ${match?.min}–${match?.max} BPM`,
              ),
            );
            box.append(el('p', `Context exports: ${o.exportIds.join(', ')}`, 'muted'));
            const matched = health.samples.filter((p) => match?.sampleIds.includes(p.id));
            for (const p of matched.slice(0, 100))
              box.append(
                button(`${clock.format(new Date(p.time))} · ${p.bpm} BPM · sample ${p.id}`, () => {
                  selectedSample = p.id;
                  render();
                }),
              );
            if (matched.length > 100)
              box.append(
                el(
                  'p',
                  `${matched.length} samples; first 100 listed. All timestamps and values are in the structured result.`,
                  'muted',
                ),
              );
            const p = health.samples.find((s) => s.id === selectedSample);
            if (p)
              box.append(
                el(
                  'p',
                  `Selected sample: ${p.time} – ${p.end} · ${p.bpm} BPM · health exports: ${p.exportIds.join(', ')}`,
                  'sample-detail',
                ),
              );
            details.append(box);
          }
        }
        if (observations.length)
          details.append(
            el(
              'p',
              `Observations ${page * 25 + 1}–${Math.min((page + 1) * 25, observations.length)} of ${observations.length}`,
              'muted',
            ),
          );
        else details.append(el('p', 'No context observations. Coverage is unknown.'));
        if (page > 0)
          details.append(
            button('Previous observations', () => {
              page--;
              selected = '';
              render();
            }),
          );
        if ((page + 1) * 25 < observations.length)
          details.append(
            button('Next observations', () => {
              page++;
              selected = '';
              render();
            }),
          );
        root.append(details);
      }
    }
    const limits = el('details', '', 'review-notes');
    limits.append(el('summary', 'About this data'));
    for (const warning of data.warnings) limits.append(el('p', warning));
    limits.append(
      el(
        'p',
        `Health exclusions: ${JSON.stringify(data.counts)}. Context exclusions: ${JSON.stringify(data.contextCounts)}.`,
      ),
    );
    for (const f of data.exports)
      limits.append(
        el('p', `${f.id} · uploaded day ${f.day}${f.partial ? ' · partial export' : ''}`),
      );
    root.append(limits);
    if (data.exports.some((f) => f.partial))
      overview.append(el('p', 'Selected exports include partial data.', 'muted'));
    if (root.dataset.preview !== 'true' && location) {
      const toggle = button(
        mapEnabled ? 'Show coordinate plot' : 'Show map · OpenStreetMap',
        () => {
          mapEnabled = !mapEnabled;
          render();
        },
      );
      const notice = el('p', 'Map shares the viewed area with OpenStreetMap.', 'muted');
      root.prepend(toggle, notice);
    }
    compactReview(root);
    const mapField = root.querySelector('.coordinate-field');
    if (mapEnabled && mapField instanceof HTMLElement)
      mapCleanup = mountLocationMap(mapField, data.fictional);
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
    if (event.data.id === 'heart-init' && event.data.result)
      window.parent.postMessage(
        { jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} },
        '*',
      );
    if (event.data.method !== 'ui/notifications/tool-result') return;
    if (event.data.params?.isError) {
      root.replaceChildren(
        el('h1', 'Heart-rate overlay unavailable'),
        el('p', 'Refresh shared export discovery and retry.'),
      );
      return;
    }
    const data = event.data.params?.structuredContent;
    if (data?.version !== 'myself.md.heart-rate-context.v1') return;
    mapEnabled =
      data.mapTiles === true || (root.dataset.preview === 'true' && root.dataset.map === 'true');
    review = data;
    sourceIndex = 0;
    healthIndex = 0;
    selected = '';
    selectedSample = '';
    day = '';
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
      id: 'heart-init',
      method: 'ui/initialize',
      params: {
        protocolVersion: '2026-01-26',
        appInfo: { name: 'myself.md heart-rate context', version: '1.0.0' },
        appCapabilities: {},
      },
    },
    '*',
  );
}
mount();
