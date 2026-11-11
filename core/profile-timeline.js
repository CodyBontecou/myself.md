import { addDays, nextOccurrence, scheduleIntervalMs } from './schedules.js';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Scheduled eligibility instants in [start, end), from the same rules as the export worker.
 * These are slots, not proof that an export ran.
 * @param {import('./schedules.js').ScheduleConfig} config @param {import('./schedules.js').ScheduleProgress} progress
 * @param {string} start @param {string} end @param {import('./schedules.js').Calendar} calendar @param {number} [limit] */
export function scheduledRuns(config, progress, start, end, calendar, limit = 48) {
  /** @type {string[]} */ const runs = [];
  let cursor = new Date(Date.parse(start) - 1).toISOString();
  while (runs.length < limit) {
    const next = nextOccurrence(config, progress, cursor, calendar);
    if (!next || next >= end || next <= cursor) break;
    runs.push(next);
    cursor = next;
  }
  return runs;
}

/** Compact time until an instant: "in 2h 40m", "in 5m", "in 3d 4h", or "due now".
 * @param {string} instant @param {string} now */
export function countdownLabel(instant, now) {
  const minutes = Math.ceil((Date.parse(instant) - Date.parse(now)) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return 'due now';
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
  const days = Math.floor(hours / 24);
  return `in ${days}d${hours % 24 ? ` ${hours % 24}h` : ''}`;
}

/** Short cadence label for profile rows, e.g. "Daily · 07:00", "Weekly · Mon 08:00", "Every 4 hours".
 * @param {import('./schedules.js').ScheduleConfig} schedule */
export function cadenceLabel(schedule) {
  const time = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;
  if (schedule.frequency === 'weekly')
    return `Weekly · ${weekdays[schedule.weekday - 1] ?? 'Mon'} ${time}`;
  if (schedule.frequency === 'daily')
    return `Daily · ${schedule.dailyTimes?.length ? schedule.dailyTimes.join(', ') : time}`;
  const unit = `${schedule.unit}${schedule.interval === 1 ? '' : 's'}`;
  return `Every ${schedule.interval === 1 ? '' : `${schedule.interval} `}${unit}${scheduleIntervalMs(schedule) ? '' : ` · ${time}`}`;
}

/** The seven local days ending today, oldest first.
 * @param {string} today */
export function lastSevenDays(today) {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
}

/** @typedef {string[]} DaySelection Selected local days, oldest first, without duplicates. */

/** Next selection after tapping a day: tapping toggles that day independently of the others.
 * Deselecting the last day clears the selection.
 * @param {DaySelection|null} current @param {string} day @returns {DaySelection|null} */
export function selectDay(current, day) {
  const days = current ?? [];
  const next = days.includes(day)
    ? days.filter((d) => d !== day)
    : [...days.filter((d) => d < day), day, ...days.filter((d) => d > day)];
  return next.length ? next : null;
}

/** @param {DaySelection|null} selection @param {string} day */
export function daySelected(selection, day) {
  return !!selection && selection.includes(day);
}
