/** Escape text included in an SVG preview. @param {string} text */
function escape(text) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
/** Use a shared scale for like units, separate labeled scales for steps/sleep. Null remains a gap.
 * @param {(number|null)[][]} groups @param {string[]} labels @param {boolean} [shared] */
function bars(groups, labels, shared = false) {
  return groups
    .map((values, group) => {
      const maximum = Math.max(1, ...(shared ? groups.flat() : values).map((v) => v ?? 0));
      const top = 18 + group * (132 / groups.length),
        height = 94 / groups.length;
      const step = 248 / Math.max(values.length, 1);
      return (
        `<text x="26" y="${top}" class="mini-label">${escape(labels[group] ?? '')}</text>` +
        values
          .map((v, i) =>
            v === null
              ? `<path d="M${26 + i * step},${top + height + 8}h${Math.max(2, step - 5)}" class="mini-gap"/>`
              : `<rect x="${26 + i * step}" y="${top + height + 8 - (v / maximum) * height}" width="${Math.max(2, step - 5)}" height="${Math.max(1, (v / maximum) * height)}" rx="2" class="mini-mark ${group ? 'mini-secondary' : ''}"/>`,
          )
          .join('')
      );
    })
    .join('');
}
/** @param {{baselineMs:number|null,experimentMs:number|null,hour:number}[]} cells */
function heatmap(cells) {
  const max = Math.max(1, ...cells.flatMap((c) => [c.baselineMs ?? 0, c.experimentMs ?? 0]));
  return ['baselineMs', 'experimentMs']
    .map((key, group) => {
      return (
        `<text x="${20 + group * 142}" y="20" class="mini-label">${group ? 'Review' : 'Baseline'}</text>` +
        cells
          .map((c, i) => {
            const value = key === 'baselineMs' ? c.baselineMs : c.experimentMs;
            return `<rect x="${20 + group * 142 + c.hour * 4.9}" y="${32 + Math.floor(i / 24) * 15}" width="4" height="11" rx="1" class="${value === null ? 'mini-empty' : 'mini-mark'}"${value === null ? '' : ` opacity="${0.2 + (0.8 * value) / max}"`}/>`;
          })
          .join('')
      );
    })
    .join('');
}
/** Decorative, data-derived thumbnail; exact values and controls live in the focused view.
 * @param {{id:string,data:unknown}} example */
export function catalogPreview(example) {
  const { id } = example;
  let marks = '';
  if (['comparison', 'heatmap'].includes(id)) {
    const data =
      /** @type {ReturnType<import('../core/screen-time-review.js').screenTimeReview>} */ (
        example.data
      );
    const series = data.series[0];
    if (series) {
      marks =
        id === 'heatmap'
          ? heatmap(
              Array.from({ length: 168 }, (_, i) => ({
                hour: i % 24,
                baselineMs:
                  series.heatmap.cells.find(
                    (c) => c.date === series.daily[Math.floor(i / 24)]?.date && c.hour === i % 24,
                  )?.durationMs ?? null,
                experimentMs:
                  series.heatmap.cells.find(
                    (c) =>
                      c.date === series.daily[7 + Math.floor(i / 24)]?.date && c.hour === i % 24,
                  )?.durationMs ?? null,
              })),
            )
          : bars(
              [
                series.daily.slice(0, 7).map((d) => d.durationMs),
                series.daily.slice(7).map((d) => d.durationMs),
              ],
              ['Previous week · usage', 'Review week · usage'],
              true,
            );
    }
  } else if (['activity-sleep', 'whoop-sleep'].includes(id)) {
    const data = /** @type {ReturnType<import('../core/health-review.js').healthReview>} */ (
      example.data
    );
    const series = data.series
      .filter((s) => id === 'whoop-sleep' || s.kind === 'activity')
      .slice(0, 1);
    if (id === 'activity-sleep')
      series.push(...data.series.filter((s) => s.kind === 'sleep').slice(0, 1));
    marks = bars(
      series.map((s) => s.daily.map((d) => d.value)),
      series.map((s) => (s.kind === 'activity' ? 'Daily steps' : 'Sleep · hours')),
    );
  } else if (id === 'locations' || id === 'heart-locations') {
    const location =
      /** @type {ReturnType<import('../core/location-review.js').locationReview>} */ (example.data);
    const heart =
      /** @type {ReturnType<import('../core/heart-rate-context.js').heartRateContext>} */ (
        example.data
      );
    const points =
      id === 'locations'
        ? (location.series[0]?.points ?? [])
        : (heart.sources[0]?.observations.flatMap((p) =>
            typeof p.latitude === 'number' && typeof p.longitude === 'number'
              ? [{ latitude: p.latitude, longitude: p.longitude }]
              : [],
          ) ?? []);
    const lat = points.map((p) => p.latitude),
      lon = points.map((p) => p.longitude);
    const left = Math.min(...lon),
      bottom = Math.min(...lat);
    marks =
      '<text x="26" y="20" class="mini-label">Recorded points</text>' +
      points
        .map(
          (p) =>
            `<circle cx="${26 + ((p.longitude - left) / Math.max(0.0001, Math.max(...lon) - left)) * 248}" cy="${136 - ((p.latitude - bottom) / Math.max(0.0001, Math.max(...lat) - bottom)) * 100}" r="3.5" class="mini-mark"/>`,
        )
        .join('');
  } else if (id === 'heart-screen-time') {
    const data =
      /** @type {ReturnType<import('../core/heart-rate-context.js').heartRateContext>} */ (
        example.data
      );
    marks = bars(
      [data.sources[0]?.observations.map((h) => ('minutes' in h ? h.minutes : null)) ?? []],
      ['Observed usage hours'],
    );
  } else if (['sleep-screen-time', 'before-sleep', 'sleep-performance'].includes(id)) {
    const data = /** @type {ReturnType<import('../core/sleep-screen-time.js').sleepScreenTime>} */ (
      example.data
    );
    const windows = data.usageSources[0]?.preSleep ?? [];
    if (id === 'sleep-performance') {
      marks =
        '<text x="26" y="20" class="mini-label">WHOOP performance × pre-sleep usage</text><path d="M26 34V140H280" class="mini-gap"/>';
      marks += windows
        .filter(
          (w) => w.lowerMs !== null && w.upperMs !== null && w.sleepPerformancePercent !== null,
        )
        .map((w) => {
          const x = 26 + (Number(w.lowerMs) / 7200000) * 248,
            end = 26 + (Number(w.upperMs) / 7200000) * 248,
            y = 136 - (Number(w.sleepPerformancePercent) / 100) * 100;
          return `<path d="M${x} ${y}H${end}" class="mini-range"/><circle cx="${x}" cy="${y}" r="3.5" class="mini-mark ${w.nap ? 'mini-secondary' : ''}"/>`;
        })
        .join('');
    } else
      marks =
        id === 'before-sleep'
          ? bars([windows.map((w) => w.lowerMs)], ['Observed pre-sleep usage'])
          : bars(
              [data.rows.map((r) => r.sleepHours), data.rows.map((r) => r.screenHours)],
              ['Sleep · hours', 'Screen time · hours'],
              true,
            );
  } else {
    const value =
      /** @type {{data?:{comparison?:{cells:Parameters<typeof heatmap>[0]},series?:{story?:{weeks:{durationMs:number|null}[]}}[],suggestions?:{targetMinutesPerDay:number}[],reflections?:{text:string}[],context?:{selected?:{topApps?:{durationMs:number}[]}|null}},experiments?:{latestReview:{observed:{daily:{durationMs:number|null}[]}}|null}[]}} */ (
        example.data
      );
    if (id === 'experiment-hours') marks = heatmap(value.data?.comparison?.cells ?? []);
    else if (id === 'monthly-attention')
      marks = bars(
        [value.data?.series?.[0]?.story?.weeks.map((w) => w.durationMs) ?? []],
        ['Weekly observed usage'],
      );
    else if (id === 'coaching')
      marks = bars(
        [value.data?.suggestions?.map((s) => s.targetMinutesPerDay) ?? []],
        ['Suggested daily caps · minutes'],
      );
    else if (id === 'experiments')
      marks = bars(
        [value.experiments?.[0]?.latestReview?.observed.daily.map((d) => d.durationMs) ?? []],
        ['Observed experiment days'],
      );
    else if (id === 'chart-context')
      marks = bars(
        [value.data?.context?.selected?.topApps?.map((a) => a.durationMs) ?? []],
        ['Apps in the selected hour'],
      );
    else if (id === 'reflections') {
      const text = value.data?.reflections?.[0]?.text.replace('Fictional reflection: ', '') ?? '';
      marks =
        '<text x="26" y="45" class="mini-quote">“</text>' +
        Array.from(
          { length: 3 },
          (_, i) =>
            `<text x="42" y="${64 + i * 22}" class="mini-label">${escape(text.slice(i * 33, (i + 1) * 33))}</text>`,
        ).join('');
    } else {
      const data =
        /** @type {{data:{series:{readiness:{observedDays:number,expectedDays:number}}[]}}} */ (
          example.data
        );
      const r = data.data.series[0]?.readiness;
      marks =
        '<text x="26" y="24" class="mini-label">Days with observations</text>' +
        Array.from(
          { length: r?.expectedDays ?? 0 },
          (_, i) =>
            `<rect x="${26 + i * 35}" y="52" width="27" height="44" rx="5" class="${i < (r?.observedDays ?? 0) ? 'mini-mark' : 'mini-empty'}"/>`,
        ).join('');
    }
  }
  return `<svg viewBox="0 0 300 160" aria-hidden="true" focusable="false">${marks}</svg>`;
}
