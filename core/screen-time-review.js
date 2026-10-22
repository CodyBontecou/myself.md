import { attentionHeatmap } from './attention-heatmap.js';
import { screenTimeAppName } from './screen-time-app-name.js';
import { sorted } from './collections.js';

/** @typedef {{date:string,start:string,end:string}} ReviewDay */
/** @typedef {{id:string,day:string,created:string,partial:boolean}} ReviewExport */
/** @typedef {{exportId:string,record:import('./data.js').DataRecord}} ReviewRecord */

/** Summarize only observed, non-overlapping usage. Calendar boundaries are supplied by I/O.
 * @param {ReviewDay[]} days Fourteen local days: comparison week first, review week second. Periods must not overlap.
 * @param {ReviewRecord[]} records Authorized screen-time records only.
 * @param {ReviewExport[]} exports
 * @param {string} timezone @param {string} [focusAppIdentifier]
 * @param {import('./attention-heatmap.js').ReviewHourSlot[]} [hourSlots]
 * @param {number} [previousDays] Number of leading comparison days; zero for a single period. */
export function screenTimeReview(
  days,
  records,
  exports,
  timezone,
  focusAppIdentifier,
  hourSlots = [],
  previousDays = 7,
) {
  const counts = { duplicates: 0, invalid: 0, outside: 0, crossingDay: 0, overlaps: 0 };
  const seen = new Set();
  /** @type {Map<string,{source:string,type:string,granularity:string,device:string,rows:{day:number,start:number,end:number,durationMs:number,identifier:string,name:string,exportId:string,conflict:boolean}[]}>} */
  const groups = new Map();
  let fictional = false;
  for (const { record, exportId } of records) {
    if (record.domain !== 'time') continue;
    const native =
      record.native && typeof record.native === 'object'
        ? /** @type {Record<string,unknown>} */ (record.native)
        : {};
    fictional ||= native.fictional === true;
    const start = Date.parse(record.start ?? ''),
      end = Date.parse(record.end ?? '');
    const durationMs = native.durationMs;
    const identifier = native.identifier ?? native.packageName ?? native.displayName;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      typeof durationMs !== 'number' ||
      !Number.isFinite(durationMs) ||
      durationMs < 0 ||
      durationMs > end - start ||
      typeof identifier !== 'string' ||
      !identifier ||
      identifier.length > 512 ||
      record.source.length > 200 ||
      !['application', 'applications', 'websites', 'sessions'].includes(record.type)
    ) {
      counts.invalid++;
      continue;
    }
    const day = days.findIndex(
      (value) => start >= Date.parse(value.start) && start < Date.parse(value.end),
    );
    if (day < 0) {
      counts.outside++;
      continue;
    }
    if (end > Date.parse(days[day]?.end ?? '')) {
      counts.crossingDay++;
      continue;
    }
    const granularity = typeof native.granularity === 'string' ? native.granularity : 'unspecified';
    const device = typeof native.deviceName === 'string' ? native.deviceName : '';
    if (granularity.length > 100 || device.length > 200) {
      counts.invalid++;
      continue;
    }
    const key = JSON.stringify([record.source, record.type, granularity, device]);
    const identity = JSON.stringify([key, identifier, start, end, durationMs]);
    if (seen.has(identity)) {
      counts.duplicates++;
      continue;
    }
    seen.add(identity);
    let group = groups.get(key);
    if (!group) {
      if (groups.size >= 32)
        throw new Error('Select exports with at most 32 usage sources per review.');
      group = { source: record.source, type: record.type, granularity, device, rows: [] };
      groups.set(key, group);
    }
    group.rows.push({
      day,
      start,
      end,
      durationMs,
      identifier,
      name: screenTimeAppName(identifier, native.displayName, record.type),
      exportId,
      conflict: false,
    });
  }
  const series = [...groups.values()].map((group) => {
    // Repeated snapshots with different values cannot be safely added or arbitrarily preferred.
    const ordered = sorted(
      group.rows,
      (a, b) => a.identifier.localeCompare(b.identifier) || a.start - b.start,
    );
    let active = ordered[0];
    for (const row of ordered.slice(1)) {
      if (active && active.identifier === row.identifier && row.start < active.end) {
        active.conflict = true;
        row.conflict = true;
      }
      if (!active || active.identifier !== row.identifier || row.end > active.end) active = row;
    }
    const daily = days.map((day) => ({
      date: day.date,
      durationMs: /** @type {number|null} */ (null),
      records: 0,
    }));
    /** @type {Map<string,{identifier:string,name:string,currentMs:number,previousMs:number}>} */
    const apps = new Map();
    const exportIds = new Set();
    let excluded = 0;
    for (const row of group.rows) {
      if (row.conflict) {
        counts.overlaps++;
        excluded++;
        continue;
      }
      const day = daily[row.day];
      if (!day) continue;
      day.durationMs = (day.durationMs ?? 0) + row.durationMs;
      day.records++;
      exportIds.add(row.exportId);
      const app = apps.get(row.identifier) ?? {
        identifier: row.identifier,
        name: row.name,
        currentMs: 0,
        previousMs: 0,
      };
      if (row.day >= previousDays) app.currentMs += row.durationMs;
      else app.previousMs += row.durationMs;
      apps.set(row.identifier, app);
    }
    const rankedApps = sorted(
      [...apps.values()],
      (a, b) => b.currentMs - a.currentMs || a.identifier.localeCompare(b.identifier),
    ).slice(0, 10);
    const included = new Set(rankedApps.map((app) => app.identifier));
    if (focusAppIdentifier && apps.has(focusAppIdentifier)) included.add(focusAppIdentifier);
    const dayBreakdowns = daily.map((day, index) => {
      const totals = new Map();
      for (const row of group.rows) {
        if (!row.conflict && row.day === index)
          totals.set(row.identifier, (totals.get(row.identifier) ?? 0) + row.durationMs);
      }
      const topApps = sorted([...totals], (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([identifier, durationMs]) => {
          included.add(identifier);
          return { identifier, name: apps.get(identifier)?.name ?? identifier, durationMs };
        });
      return {
        date: day.date,
        durationMs: day.durationMs,
        records: day.records,
        topApps,
        otherDurationMs:
          day.durationMs === null
            ? null
            : day.durationMs - topApps.reduce((sum, app) => sum + app.durationMs, 0),
      };
    });
    // At most ten weekly apps plus ten per day: bounded detail, never raw native records.
    const appDrilldowns = [...included].map((identifier) => ({
      identifier,
      name: apps.get(identifier)?.name ?? identifier,
      daily: days.map((day, index) => {
        const rows = group.rows.filter(
          (row) => !row.conflict && row.day === index && row.identifier === identifier,
        );
        return {
          date: day.date,
          durationMs: rows.length ? rows.reduce((sum, row) => sum + row.durationMs, 0) : null,
          records: rows.length,
        };
      }),
    }));
    const previous = period(daily.slice(0, previousDays)),
      current = period(daily.slice(previousDays));
    const comparable =
      previousDays > 0 &&
      previousDays === days.length - previousDays &&
      current.observedDays === days.length - previousDays &&
      previous.observedDays === previousDays &&
      !excluded &&
      !counts.invalid &&
      !counts.crossingDay &&
      !exports.some((file) => file.partial);
    const changeMs = comparable
      ? Number(current.observedDurationMs) - Number(previous.observedDurationMs)
      : null;
    return {
      source: group.source,
      type: group.type,
      granularity: group.granularity,
      device: group.device,
      daily,
      current,
      previous,
      comparable,
      changeMs,
      changePercent:
        changeMs !== null && Number(previous.observedDurationMs) > 0
          ? (changeMs / Number(previous.observedDurationMs)) * 100
          : null,
      topApps: rankedApps,
      dayBreakdowns,
      appDrilldowns,
      heatmap: attentionHeatmap(
        daily,
        group.rows.filter((row) => !row.conflict),
        group.granularity,
        hourSlots,
      ),
      exportIds: [...exportIds],
    };
  });
  return {
    version: 'myself.md.screen-time-review.v1',
    weekStart: days[previousDays]?.date ?? '',
    previousWeekStart: days[0]?.date ?? '',
    weekEnd: days.at(-1)?.date ?? '',
    comparisonWeekEnd: days[previousDays - 1]?.date ?? '',
    currentDays: days.length - previousDays,
    comparisonDays: previousDays,
    timezone,
    fictional,
    status: series.some((item) => item.current.observedDays > 0) ? 'ready' : 'no_data',
    exports,
    series,
    counts,
    warnings: [
      'Totals describe observed app usage, not complete device screen-on time. Missing days are unknown, not zero.',
      'Sources, record types, devices and granularities are kept separate. App usage can overlap across apps; do not add series together.',
      'Records crossing local midnight are excluded rather than prorated. Conflicting overlapping records are excluded; exact repeats are counted once.',
      'Even seven observed days do not prove complete collection. Changes compare observed totals only; no causal conclusions are supported.',
      ...(exports.some((file) => file.partial)
        ? ['At least one selected export is partial; week-over-week comparison is unavailable.']
        : []),
      ...(fictional ? ['These are fictional fixture records, not personal phone data.'] : []),
    ],
    nextStep:
      'Choose one app you want to spend less or more time with next week, and pick a small change to try.',
  };
}

/** @param {{date:string,durationMs:number|null,records:number}[]} values */
const period = (values) => ({
  start: values[0]?.date ?? '',
  end: values.at(-1)?.date ?? '',
  observedDays: values.filter((day) => day.durationMs !== null).length,
  missingDays: values.filter((day) => day.durationMs === null).map((day) => day.date),
  observedDurationMs: values.some((day) => day.durationMs !== null)
    ? values.reduce((sum, day) => sum + (day.durationMs ?? 0), 0)
    : null,
});
