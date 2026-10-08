/** @typedef {{frequency:'daily'|'weekly'|'custom',interval:number,unit:'day'|'week'|'month',anchorDate:string|null,hour:number,minute:number,weekday:number,todayRefresh:boolean,refreshHours:3|6|12}} ScheduleConfig */
/** @typedef {{enabled:boolean,enabledAt:string|null,lastCompleted:string|null,lastRefresh:string|null}} ScheduleProgress */
/** @typedef {{day:(instant:string)=>string,instant:(day:string,hour:number,minute:number)=>string}} Calendar */
/** @typedef {{kind:'completed-day'|'today-refresh',fireDate:string}} Occurrence */
/** @param {unknown} value @returns {ScheduleConfig} */
export function parseSchedule(value) {
  const s = /** @type {Record<string,unknown>} */ (value ?? {});
  if (typeof s !== 'object' || Array.isArray(s)) throw new Error('Invalid schedule.');
  const frequency = s.frequency ?? 'daily',
    unit = s.unit ?? 'day',
    anchorDate = s.anchorDate ?? null;
  if (
    !['daily', 'weekly', 'custom'].includes(String(frequency)) ||
    !['day', 'week', 'month'].includes(String(unit)) ||
    (anchorDate !== null && (typeof anchorDate !== 'string' || !validDay(anchorDate)))
  )
    throw new Error('Invalid calendar cadence or anchor date.');
  /** @param {string} key @param {number} fallback @param {number} min @param {number} max */
  const integer = (key, fallback, min, max) => {
    const n = s[key] ?? fallback;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max)
      throw new Error(`Invalid schedule ${key}.`);
    return n;
  };
  const refreshHours = integer('refreshHours', 3, 3, 12);
  if (![3, 6, 12].includes(refreshHours)) throw new Error('Refresh every 3, 6 or 12 hours.');
  if (s.todayRefresh !== undefined && typeof s.todayRefresh !== 'boolean')
    throw new Error('Invalid Today Refresh setting.');
  return {
    frequency: /** @type {ScheduleConfig['frequency']} */ (frequency),
    unit: /** @type {ScheduleConfig['unit']} */ (unit),
    anchorDate: /** @type {string|null} */ (anchorDate),
    interval: integer('interval', 1, 1, 365),
    hour: integer('hour', 8, 0, 23),
    minute: integer('minute', 0, 0, 59),
    weekday: integer('weekday', 1, 1, 7),
    todayRefresh: s.todayRefresh === true,
    refreshHours: /** @type {3|6|12} */ (refreshHours),
  };
}
/** @param {string} day */
function validDay(day) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
  );
}
/** Calendar arithmetic is independent of the device's timezone; the boundary resolves instants.
 * @param {string} day @param {number} count */
export function addDays(day, count) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
/** @param {string} anchor @param {number} offset */
function addMonths(anchor, offset) {
  const date = new Date(`${anchor}T00:00:00Z`),
    day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}
/** @param {ScheduleConfig} s @param {ScheduleProgress} progress @param {string} now @param {Calendar} calendar */
function candidates(s, progress, now, calendar) {
  const today = calendar.day(now),
    anchor = s.anchorDate ?? calendar.day(progress.enabledAt ?? now);
  let day = today,
    step = 1;
  if (s.frequency === 'weekly') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
    day = addDays(today, -((weekday - s.weekday + 7) % 7));
    step = 7;
  } else if (s.frequency === 'custom') {
    if (s.unit === 'month') {
      const a = new Date(`${anchor}T00:00:00Z`),
        t = new Date(`${today}T00:00:00Z`);
      const months =
        (t.getUTCFullYear() - a.getUTCFullYear()) * 12 + t.getUTCMonth() - a.getUTCMonth();
      const offset = Math.max(0, Math.floor(months / s.interval) * s.interval);
      return [offset - s.interval, offset, offset + s.interval]
        .filter((n) => n >= 0)
        .map((n) => calendar.instant(addMonths(anchor, n), s.hour, s.minute));
    }
    step = s.interval * (s.unit === 'week' ? 7 : 1);
    const elapsed =
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86400000;
    day = addDays(anchor, Math.max(0, Math.floor(elapsed / step)) * step);
  }
  return [-step, 0, step]
    .map((n) => addDays(day, n))
    .filter((d) => s.frequency !== 'custom' || d >= anchor)
    .map((d) => calendar.instant(d, s.hour, s.minute));
}
/** Only the latest unsatisfied slot runs; pre-opt-in occurrences never become due.
 * @param {ScheduleConfig} config @param {ScheduleProgress} progress @param {string} now @param {Calendar} calendar @returns {Occurrence[]} */
export function dueOccurrences(config, progress, now, calendar) {
  if (!progress.enabled || !progress.enabledAt) return [];
  const s = parseSchedule(config),
    completed = candidates(s, progress, now, calendar)
      .filter((d) => d <= now)
      .reduce((latest, day) => (day > latest ? day : latest), '');
  /** @type {Occurrence[]} */ const result = [];
  if (
    completed &&
    completed > progress.enabledAt &&
    (!progress.lastCompleted || completed > progress.lastCompleted)
  )
    result.push({ kind: 'completed-day', fireDate: completed });
  if (s.todayRefresh) {
    let latest = '';
    for (let hour = s.hour; hour < 24; hour += s.refreshHours) {
      const fire = calendar.instant(calendar.day(now), hour, s.minute);
      if (fire <= now) latest = fire;
    }
    if (
      latest &&
      latest > progress.enabledAt &&
      (!progress.lastRefresh || latest > progress.lastRefresh)
    )
      result.push({ kind: 'today-refresh', fireDate: latest });
  }
  return result;
}
/** @param {ScheduleConfig} config @param {ScheduleProgress} progress @param {string} now @param {Calendar} calendar */
export function nextOccurrence(config, progress, now, calendar) {
  if (!progress.enabled) return null;
  const s = parseSchedule(config),
    dates = candidates(s, progress, now, calendar).filter((d) => d > now);
  if (s.todayRefresh)
    for (const day of [calendar.day(now), addDays(calendar.day(now), 1)])
      for (let hour = s.hour; hour < 24; hour += s.refreshHours) {
        const fire = calendar.instant(day, hour, s.minute);
        if (fire > now) dates.push(fire);
      }
  return dates.reduce((first, day) => (!first || day < first ? day : first), '') || null;
}
/** Freeze each day to an exact UTC interval at the client boundary, including DST.
 * @param {Occurrence} occurrence @param {number} lookbackDays @param {Calendar} calendar */
export function occurrenceDays(occurrence, lookbackDays, calendar) {
  const fireDay = calendar.day(occurrence.fireDate);
  return (
    occurrence.kind === 'today-refresh'
      ? [fireDay]
      : Array.from({ length: lookbackDays }, (_, i) => addDays(fireDay, i - lookbackDays))
  ).map((day) => ({
    day,
    start: calendar.instant(day, 0, 0),
    end: calendar.instant(addDays(day, 1), 0, 0),
  }));
}
