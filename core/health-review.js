import { sorted } from './collections.js';
/** @typedef {{date:string,start:string,end:string}} HealthDay */
/** @typedef {{start:string,end:string,kind:string,exportIds:string[]}} SleepInterval */
/** @typedef {{date:string,value:number|null,records:number,intervals:SleepInterval[],stageDurations:{kind:string,hours:number}[]}} HealthObservation */
/** @typedef {{source:string,type:string,device:string,unit:string,kind:'activity'|'sleep',daily:HealthObservation[]}} HealthSeries */
/** @param {unknown} value @returns {Record<string,unknown>} */
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string,unknown>} */ (value)
    : {};
}
/** Union duration, so overlapping sleep stages never inflate observed sleep.
 * @param {{start:string,end:string}[]} intervals */
function duration(intervals) {
  const ordered = sorted(
    intervals.map((i) => [Date.parse(i.start), Date.parse(i.end)]),
    (a, b) => (a[0] ?? 0) - (b[0] ?? 0),
  );
  let total = 0,
    edge = -Infinity;
  for (const [start = 0, end = 0] of ordered) {
    total += Math.max(0, end - Math.max(edge, start));
    edge = Math.max(edge, end);
  }
  return total / 3600000;
}
/** Pure bounded review of selected export records. No medical interpretation.
 * @param {HealthDay[]} days
 * @param {{exportId:string,record:import('./data.js').DataRecord}[]} rows
 * @param {string} timezone */
export function healthReview(days, rows, timezone) {
  /** @type {Map<string,HealthSeries>} */
  const groups = new Map();
  const seen = new Set();
  const counts = { duplicates: 0, invalid: 0, unsupported: 0, crossingDay: 0, overlaps: 0 };
  let fictional = rows.length > 0;
  /** @type {Map<string,{start:number,end:number,day:HealthObservation,value:number}[]>} */
  const activity = new Map();
  for (const { exportId, record: r } of rows) {
    const n = object(r.native);
    fictional &&= n.fictional === true;
    if (r.domain !== 'health') continue;
    const kind =
      r.type === 'HKQuantityTypeIdentifierStepCount' || r.type === 'Steps'
        ? 'activity'
        : r.type === 'HKCategoryTypeIdentifierSleepAnalysis' || r.type === 'SleepSession'
          ? 'sleep'
          : null;
    if (!kind) {
      counts.unsupported++;
      continue;
    }
    const start = Date.parse(r.start ?? ''),
      end = Date.parse(r.end ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      counts.invalid++;
      continue;
    }
    const device = JSON.stringify([
      n.sourceRevision ?? object(n.metadata).dataOrigin ?? '',
      n.device ?? '',
    ]);
    const unit =
      kind === 'sleep'
        ? 'h'
        : typeof n.unit === 'string'
          ? n.unit
          : r.type === 'Steps'
            ? 'count'
            : '';
    const key = JSON.stringify([r.source, r.type, device, unit]);
    const duplicate = JSON.stringify([key, r.start, r.end, n]);
    if (seen.has(duplicate)) {
      counts.duplicates++;
      continue;
    }
    seen.add(duplicate);
    if (!days.some((d) => end > Date.parse(d.start) && start < Date.parse(d.end))) continue;
    if (!groups.has(key))
      groups.set(key, {
        source: r.source,
        type: r.type,
        device,
        unit,
        kind,
        daily: days.map((d) => ({
          date: d.date,
          value: null,
          records: 0,
          intervals: [],
          stageDurations: [],
        })),
      });
    const series = groups.get(key);
    if (!series) continue;
    if (kind === 'activity') {
      const value = typeof n.quantity === 'number' ? n.quantity : n.count;
      if (unit !== 'count' || typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        counts.invalid++;
        continue;
      }
      const index = days.findIndex((d) => start >= Date.parse(d.start) && end <= Date.parse(d.end));
      const day = series.daily[index];
      if (!day) {
        counts.crossingDay++;
        continue;
      }
      const samples = activity.get(key) ?? [];
      samples.push({ start, end, day, value });
      activity.set(key, samples);
    } else {
      const parts =
        r.type === 'SleepSession'
          ? Array.isArray(n.stages) && n.stages.length
            ? n.stages.map(object).map((stage) => ({
                start: Date.parse(String(stage.startTime ?? '')),
                end: Date.parse(String(stage.endTime ?? '')),
                label:
                  typeof stage.stage === 'number'
                    ? {
                        0: 'Unknown stage',
                        1: 'Awake',
                        2: 'Asleep',
                        3: 'Out of bed',
                        4: 'Light',
                        5: 'Deep',
                        6: 'REM',
                        7: 'Awake',
                      }[stage.stage]
                    : undefined,
              }))
            : [{ start, end, label: 'Session (stage unknown)' }]
          : [
              {
                start,
                end,
                label:
                  typeof (n.value ?? n.categoryValue ?? n.category) === 'number'
                    ? { 0: 'In bed', 1: 'Asleep', 2: 'Awake', 3: 'Core', 4: 'Deep', 5: 'REM' }[
                        Number(n.value ?? n.categoryValue ?? n.category)
                      ]
                    : undefined,
              },
            ];
      for (const part of parts) {
        if (
          !part.label ||
          !Number.isFinite(part.start) ||
          !Number.isFinite(part.end) ||
          part.end <= part.start ||
          part.start < start ||
          part.end > end
        ) {
          counts.invalid++;
          continue;
        }
        for (const [index, d] of days.entries()) {
          const a = Math.max(part.start, Date.parse(d.start)),
            b = Math.min(part.end, Date.parse(d.end));
          const day = series.daily[index];
          if (a >= b || !day) continue;
          day.records++;
          day.intervals.push({
            start: new Date(a).toISOString(),
            end: new Date(b).toISOString(),
            kind: part.label,
            exportIds: [exportId],
          });
        }
      }
    }
  }
  for (const samples of activity.values()) {
    const ordered = sorted(samples, (a, b) => a.start - b.start);
    let edge = -Infinity;
    for (const [index, sample] of ordered.entries()) {
      const overlaps = edge > sample.start || (ordered[index + 1]?.start ?? Infinity) < sample.end;
      edge = Math.max(edge, sample.end);
      if (overlaps) {
        counts.overlaps++;
        continue;
      }
      sample.day.value = (sample.day.value ?? 0) + sample.value;
      sample.day.records++;
    }
  }
  const series = [...groups.values()];
  for (const s of series)
    if (s.kind === 'sleep')
      for (const day of s.daily) {
        const asleep = day.intervals.filter((i) =>
          ['Asleep', 'Core', 'Light', 'Deep', 'REM'].includes(i.kind),
        );
        day.stageDurations = [...new Set(day.intervals.map((i) => i.kind))].map((kind) => ({
          kind,
          hours: duration(day.intervals.filter((i) => i.kind === kind)),
        }));
        day.value = asleep.length ? duration(asleep) : null;
        day.intervals = sorted(day.intervals, (a, b) => a.start.localeCompare(b.start));
      }
  return {
    version: 'myself.md.health-review.v1',
    timezone,
    fictional,
    days,
    series,
    counts,
    warnings: [
      'Observed records are not full-day coverage. Missing values are unknown, not zero. No clinical targets or health conclusions are inferred.',
      'Activity shows steps only. Separate sources/devices are never added together. Overlapping step intervals and intervals crossing local midnight are excluded; totals may be incomplete.',
      'Sleep shows HealthKit intervals and Health Connect stages, split at local midnight. Observed asleep hours use the union of asleep/core/deep/REM intervals; in-bed and awake intervals are not sleep. These are calendar-day portions, not whole-night totals.',
      'Other health types, including WHOOP provider records, are counted as unsupported. Discover and select supported exports before reviewing.',
    ],
  };
}
