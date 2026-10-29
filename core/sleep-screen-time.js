import { whoopSleepReview } from './whoop-sleep-review.js';
import { preSleepUsage } from './pre-sleep-usage.js';
import { screenTimeReview, usageRecordGroups } from './screen-time-review.js';
/** @typedef {'same_day'|'previous_day'} SleepUsageAlignment */
/** @typedef {'daily'|'before_sleep'|'sleep_performance'} SleepUsageView */
/** Pair explicit local dates; observed totals do not establish coverage or causation.
 * @param {import('./health-review.js').HealthDay[]} days
 * @param {{daily:{date:string,value:number|null,records:number}[]}|undefined} sleep
 * @param {{daily:{date:string,durationMs:number|null,records:number}[]}|undefined} usage
 * @param {SleepUsageAlignment} alignment */
export function sleepUsageRows(days, sleep, usage, alignment) {
  return days.map((day) => {
    const usageDate =
      alignment === 'same_day'
        ? day.date
        : new Date(Date.parse(day.date) - 86400000).toISOString().slice(0, 10);
    const s = sleep?.daily.find((d) => d.date === day.date),
      u = usage?.daily.find((d) => d.date === usageDate);
    const sleepHours = s?.value ?? null,
      screenHours =
        u?.durationMs === null || u?.durationMs === undefined ? null : u.durationMs / 3600000;
    return {
      date: day.date,
      usageDate,
      sleepHours,
      screenHours,
      sleepRecords: s?.records ?? 0,
      usageRecords: u?.records ?? 0,
      paired: sleepHours !== null && screenHours !== null,
    };
  });
}
/** Shared WHOOP/screen-time comparison. Keep sources, units and date assignment explicit.
 * @param {import('./health-review.js').HealthDay[]} days
 * @param {import('./health-review.js').HealthDay[]} usageDays Includes the preceding day when available.
 * @param {import('./screen-time-review.js').ReviewRecord[]} healthRows
 * @param {import('./screen-time-review.js').ReviewRecord[]} timeRows
 * @param {string} timezone
 * @param {{view?:SleepUsageView,alignment?:SleepUsageAlignment,sleepSourceId?:string|undefined,usageSourceId?:string|undefined}} [options] */
export function sleepScreenTime(days, usageDays, healthRows, timeRows, timezone, options = {}) {
  const sleep = whoopSleepReview(days, healthRows);
  if (sleep.series.length > 8) throw new Error('Choose at most eight WHOOP sources.');
  const usage = screenTimeReview(usageDays, timeRows, [], timezone, undefined, [], 0);
  const sleepSources = sleep.series.map((s) => ({
    id: JSON.stringify([s.source, s.device]),
    label: `WHOOP · ${s.device}`,
    daily: s.daily.map(({ date, value, records, sessions }) => ({
      date,
      value,
      records,
      sessions: sessions ?? [],
    })),
  }));
  if (
    sleepSources.reduce((n, s) => n + s.daily.reduce((m, d) => m + d.sessions.length, 0), 0) > 128
  )
    throw new Error('Select exports with at most 128 WHOOP sleep sessions.');
  const windows = usageRecordGroups(undefined, timeRows);
  const usageSources = [...windows.groups].map(([id, group]) => {
    const s = usage.series.find(
      (item) => JSON.stringify([item.source, item.type, item.granularity, item.device]) === id,
    );
    return {
      id,
      label: `${group.source} · ${group.type} · ${group.granularity} · ${group.device}`,
      exportIds: [...new Set(group.rows.filter((r) => !r.conflict).map((r) => r.exportId))],
      daily:
        s?.dayBreakdowns ??
        usageDays.map((d) => ({
          date: d.date,
          durationMs: null,
          records: 0,
          topApps: [],
          otherDurationMs: null,
        })),
      preSleep: preSleepUsage(group, sleepSources),
    };
  });
  const sleepSourceId = options.sleepSourceId ?? sleepSources[0]?.id ?? '',
    usageSourceId = options.usageSourceId ?? usageSources[0]?.id ?? '';
  if (
    (options.sleepSourceId !== undefined &&
      !sleepSources.some((s) => s.id === options.sleepSourceId)) ||
    (options.usageSourceId !== undefined &&
      !usageSources.some((s) => s.id === options.usageSourceId))
  )
    throw new Error('Selected source unavailable. Refresh review source discovery.');
  const alignment = options.alignment ?? 'previous_day';
  return {
    version: 'myself.md.sleep-screen-time.v3',
    view: options.view ?? 'daily',
    timezone,
    days,
    fictional:
      healthRows.length + timeRows.length > 0 &&
      [...healthRows, ...timeRows].every(
        (r) =>
          r.record.native &&
          typeof r.record.native === 'object' &&
          'fictional' in r.record.native &&
          r.record.native.fictional === true,
      ),
    sleepSources,
    usageSources,
    selection: { sleepSourceId, usageSourceId },
    alignment,
    rows: sleepUsageRows(
      days,
      sleepSources.find((s) => s.id === sleepSourceId),
      usageSources.find((s) => s.id === usageSourceId),
      alignment,
    ),
    counts: { sleep: sleep.counts, usage: usage.counts },
    preSleepCounts: {
      ...windows.counts,
      overlaps: [...windows.groups.values()].reduce(
        (n, g) => n + g.rows.filter((r) => r.conflict).length,
        0,
      ),
    },
    warnings: [
      'Sleep performance is WHOOP’s reported score.sleep_performance_percentage (0–100) for this session, never calculated from sleep duration or substituted with recovery, efficiency or consistency. Missing, invalid or unscored performance stays unknown. Compare sessions descriptively; no midpoint estimates, correlation, trend fit, clinical or causal inference is supplied.',
      'Before-sleep windows are the two elapsed hours immediately before each WHOOP session starts, including naps. Bounds describe only observed records, not complete screen-on time. Boundary aggregates use mathematically possible minimum/maximum contributions, never proportional allocation. Missing records remain unknown. Observed interval spans do not prove collection completeness; apps and websites remain separate.',
      'WHOOP whole-session asleep totals belong to their local session-end date, including naps. Stage timing is unavailable; totals are not split across midnight.',
      'Previous day pairs sleep ending on date D with app usage on D−1. Same day pairs both on D. Neither is an exact pre-bed window or a causal effect.',
      'Missing data is unknown, not zero. A paired row only means both sides have observations; it does not establish complete-day coverage.',
      'Sources remain separate. App durations can overlap between apps; observed app-duration sums are not deduplicated device time. Invalid and conflicting usage is excluded. Daily comparisons exclude midnight-crossing records; session windows retain valid crossing intervals without proration.',
      'No correlation, clinical interpretation or recommendation is inferred from these observations.',
    ],
  };
}
