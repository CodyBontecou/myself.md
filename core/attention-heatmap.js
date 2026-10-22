import { sorted } from './collections.js';
/** @typedef {{date:string,hour:number,start:number,end:number}} ReviewHourSlot */
/** @typedef {{day:number,start:number,end:number,durationMs:number,identifier:string,name:string}} HeatmapRecord */
/** Aggregate only records fully bounded by one supplied local clock hour; never prorate.
 * Calendar/timezone conversion belongs to the server boundary.
 * @param {{date:string,durationMs:number|null,records:number}[]} daily
 * @param {HeatmapRecord[]} records Already validated, deduplicated and conflict-free.
 * @param {string} granularity @param {ReviewHourSlot[]} slots */
export function attentionHeatmap(daily, records, granularity, slots) {
  /** @type {Map<string,{date:string,hour:number,durationMs:number,records:number,apps:Map<string,{identifier:string,name:string,durationMs:number}>}>} */
  const cells = new Map();
  const unallocated = daily.map(() => 0);
  const dailyGranularity = /(^|[-_ ])(day|daily)([-_ ]|$)/i.test(granularity);
  const byDay = daily.map((day) => slots.filter((slot) => slot.date === day.date));
  for (const row of records) {
    const slot =
      !dailyGranularity &&
      byDay[row.day]?.find((value) => row.start >= value.start && row.end <= value.end);
    if (!slot) {
      unallocated[row.day] = (unallocated[row.day] ?? 0) + 1;
      continue;
    }
    const key = `${slot.date}:${slot.hour}`;
    const cell = cells.get(key) ?? {
      date: slot.date,
      hour: slot.hour,
      durationMs: 0,
      records: 0,
      apps: new Map(),
    };
    cell.durationMs += row.durationMs;
    cell.records++;
    const app = cell.apps.get(row.identifier) ?? {
      identifier: row.identifier,
      name: row.name,
      durationMs: 0,
    };
    app.durationMs += row.durationMs;
    cell.apps.set(row.identifier, app);
    cells.set(key, cell);
  }
  const values = sorted(
    [...cells.values()],
    (a, b) => a.date.localeCompare(b.date) || a.hour - b.hour,
  ).map((cell) => {
    const topApps = sorted(
      [...cell.apps.values()],
      (a, b) => b.durationMs - a.durationMs || a.identifier.localeCompare(b.identifier),
    ).slice(0, 10);
    return {
      date: cell.date,
      hour: cell.hour,
      durationMs: cell.durationMs,
      records: cell.records,
      topApps,
      otherDurationMs: cell.durationMs - topApps.reduce((sum, app) => sum + app.durationMs, 0),
    };
  });
  return {
    status: values.length ? 'ready' : records.length ? 'unavailable' : 'no_data',
    cells: values,
    days: daily.map((day, index) => {
      const observed = values.filter((cell) => cell.date === day.date);
      const attributedDurationMs = observed.length
        ? observed.reduce((sum, cell) => sum + cell.durationMs, 0)
        : null;
      return {
        date: day.date,
        attributedDurationMs,
        unallocatedDurationMs:
          day.durationMs === null ? null : day.durationMs - (attributedDurationMs ?? 0),
        unallocatedRecords: unallocated[index] ?? 0,
      };
    }),
    clockChanges: slots.length
      ? daily.flatMap((day, index) =>
          Array.from({ length: 24 }, (_, hour) => {
            const slot = byDay[index]?.find((value) => value.hour === hour);
            return { date: day.date, hour, durationMs: slot ? slot.end - slot.start : 0 };
          }).filter((value) => value.durationMs !== 3600000),
        )
      : [],
    note: 'Cells contain observed app usage only from records whose entire interval fits one local clock hour. Daily and hour-crossing aggregates are left unallocated, never spread across hours. Missing cells are unknown, not zero. App durations can overlap; totals are not unique screen-on time. Repeated local clock hours are combined; clockChanges describes shortened, repeated or nonexistent hours. Partial files and other review exclusions still apply. Switching weeks or inspecting a cell uses the loaded result without additional reads.',
  };
}
