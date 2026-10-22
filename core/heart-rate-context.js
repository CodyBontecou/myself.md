import { explicitTimeSeries } from './time-series.js';
import { locationReview } from './location-review.js';
import { screenTimeReview } from './screen-time-review.js';
import { sorted } from './collections.js';
/** @param {unknown} value @returns {Record<string,unknown>} */
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string,unknown>} */ (value)
    : {};
}
/** @typedef {{id:string,time:string,end:string,bpm:number,exportIds:string[]}} HeartSample */
/** @typedef {{id:string,label:string,samples:HeartSample[]}} HeartSource */
/** Pure observed heart-rate overlays. No interpolation or causal interpretation.
 * @param {import('./health-review.js').HealthDay[]} days
 * @param {import('./screen-time-review.js').ReviewRecord[]} healthRows
 * @param {import('./screen-time-review.js').ReviewRecord[]} contextRows
 * @param {'location'|'time'} context
 * @param {string} timezone
 * @param {number} windowSeconds
 * @param {import('./attention-heatmap.js').ReviewHourSlot[]} slots */
export function heartRateContext(
  days,
  healthRows,
  contextRows,
  context,
  timezone,
  windowSeconds,
  slots = [],
) {
  /** @type {Map<string,HeartSource>} */
  const groups = new Map();
  /** @type {Map<string,HeartSample>} */
  const seen = new Map();
  const counts = { invalid: 0, unsupported: 0, duplicates: 0 };
  for (const { record: r, exportId } of healthRows) {
    if (r.domain !== 'health') continue;
    if (!['HKQuantityTypeIdentifierHeartRate', 'HeartRate'].includes(r.type)) {
      counts.unsupported++;
      continue;
    }
    const n = object(r.native),
      key = JSON.stringify([
        r.source,
        r.type,
        n.sourceRevision ?? object(n.metadata).dataOrigin ?? '',
        n.device ?? '',
      ]);
    const values = Object.values(explicitTimeSeries(n, r.start)).flat();
    if (!values.length) counts.invalid++;
    for (const sample of values) {
      const time = Date.parse(sample.timestamp ?? ''),
        bpm = sample.value;
      if (
        !Number.isFinite(time) ||
        typeof bpm !== 'number' ||
        !Number.isFinite(bpm) ||
        bpm <= 0 ||
        !['count/min', 'bpm'].includes(String(sample.unit ?? n.unit ?? ''))
      ) {
        counts.invalid++;
        continue;
      }
      if (!days.some((d) => time >= Date.parse(d.start) && time < Date.parse(d.end))) continue;
      const sampleEnd =
        sample.endDate ??
        sample.endTime ??
        (typeof n.quantity === 'number' ? r.end : sample.timestamp);
      const end =
        typeof sampleEnd === 'string' &&
        Number.isFinite(Date.parse(sampleEnd)) &&
        Date.parse(sampleEnd) >= time
          ? new Date(sampleEnd).toISOString()
          : new Date(time).toISOString();
      const identity = JSON.stringify([key, time, bpm, end]);
      const previous = seen.get(identity);
      if (previous) {
        counts.duplicates++;
        if (!previous.exportIds.includes(exportId)) previous.exportIds.push(exportId);
        continue;
      }
      if (!groups.has(key)) {
        if (groups.size >= 8) throw new Error('Choose at most eight heart-rate sources.');
        groups.set(key, { id: key, label: key, samples: [] });
      }
      const point = {
        id: String(seen.size + 1),
        time: new Date(time).toISOString(),
        end,
        bpm,
        exportIds: [exportId],
      };
      if (seen.size >= 10000)
        throw new Error('Choose exports with at most 10,000 heart-rate samples.');
      seen.set(identity, point);
      groups.get(key)?.samples.push(point);
    }
  }
  const healthSources = [...groups.values()];
  for (const source of healthSources)
    source.samples = sorted(
      source.samples,
      (a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id),
    );
  const locations = locationReview(days, contextRows, timezone);
  const usage = screenTimeReview(days, contextRows, [], timezone, undefined, slots, 0);
  const contextSources =
    context === 'location'
      ? locations.series.map((s, index) => ({
          id: String(index),
          label: `${s.source} · ${s.type}`,
          observations: s.points.map((p) => ({
            id: p.id,
            start: p.start,
            end: p.start,
            latitude: p.latitude,
            longitude: p.longitude,
            accuracy: p.accuracy,
            minutes: /** @type {number|null} */ (null),
            apps: '',
            exportIds: p.exportIds,
          })),
        }))
      : usage.series.map((s, index) => ({
          id: String(index),
          label: `${s.source} · ${s.type} · ${s.granularity} · ${s.device}`,
          observations: s.heatmap.cells.flatMap((cell) => {
            const slot = slots.find((v) => v.date === cell.date && v.hour === cell.hour);
            return slot
              ? [
                  {
                    id: `${cell.date}:${cell.hour}`,
                    start: new Date(slot.start).toISOString(),
                    end: new Date(slot.end).toISOString(),
                    latitude: /** @type {number|null} */ (null),
                    longitude: /** @type {number|null} */ (null),
                    accuracy: /** @type {number|null} */ (null),
                    minutes: cell.durationMs / 60000,
                    apps: cell.topApps
                      .map((a) => `${a.name}: ${(a.durationMs / 60000).toFixed(1)} min`)
                      .join('; '),
                    exportIds: s.exportIds,
                  },
                ]
              : [];
          }),
        }));
  if (contextSources.length > 32) throw new Error('Choose at most 32 context sources.');
  const sources = contextSources.map((s) => ({
    id: s.id,
    label: s.label,
    observations: s.observations.map((o) =>
      Object.assign({}, o, {
        heartRates: healthSources.map((h) => {
          const start = Date.parse(o.start),
            end = Date.parse(o.end);
          const matches =
            context === 'location'
              ? nearest(h.samples, start, windowSeconds)
              : h.samples.slice(lowerBound(h.samples, start), lowerBound(h.samples, end));
          const values = matches.map((p) => p.bpm);
          return {
            sourceId: h.id,
            sampleIds: matches.map((p) => p.id),
            bpm: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
            min: values.length ? Math.min(...values) : null,
            max: values.length ? Math.max(...values) : null,
            offsetSeconds:
              context === 'location' && matches[0]
                ? (Date.parse(matches[0].time) - start) / 1000
                : null,
          };
        }),
      }),
    ),
  }));
  return {
    version: 'myself.md.heart-rate-context.v1',
    context,
    timezone,
    windowSeconds,
    days,
    healthSources,
    sources,
    counts,
    contextCounts: context === 'location' ? locations.counts : usage.counts,
    fictional:
      [...healthRows, ...contextRows].length > 0 &&
      [...healthRows, ...contextRows].every((r) => object(r.record.native).fictional === true),
    warnings: [
      'Sample matching anchors the recorded sample start timestamp. Interval ends are returned; a quantity interval may summarize multiple beats rather than an instantaneous measurement.',
      'Location colors use the closest observed heart-rate timestamp within the stated window. Signed offsets show earlier/later samples. No interpolation across gaps. Ties prefer the earlier timestamp.',
      'Screen-time bars summarize observed app usage within local clock hours. Heart-rate colors show the unweighted mean of observed samples within that same hour, with count/range and exact timestamps. This does not establish heart rate during actual app use. Daily/hour-crossing usage is excluded from the hourly overlay.',
      'Heart-rate sources/devices remain separate. No clinical thresholds or causal conclusions. Gray means unmatched or unknown. Only heart rate in count/min or bpm is supported; other health types are excluded.',
      ...(context === 'location' ? locations.warnings : usage.warnings),
    ],
  };
}
/** @param {HeartSample[]} samples @param {number} time @param {number} windowSeconds */
function nearest(samples, time, windowSeconds) {
  const low = lowerBound(samples, time);
  const choices = [samples[low - 1], samples[low]].filter((p) => p !== undefined);
  const point = sorted(
    choices,
    (a, b) =>
      Math.abs(Date.parse(a.time) - time) - Math.abs(Date.parse(b.time) - time) ||
      a.time.localeCompare(b.time),
  )[0];
  return point && Math.abs(Date.parse(point.time) - time) <= windowSeconds * 1000 ? [point] : [];
}

/** @param {HeartSample[]} samples @param {number} time */
function lowerBound(samples, time) {
  let low = 0,
    high = samples.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(samples[middle]?.time ?? '') < time) low = middle + 1;
    else high = middle;
  }
  return low;
}
