import { addDays } from '../core/schedules.js';

/** Device-local calendar; Date resolves DST gaps forward and overlaps to the earlier instant. */
export const localCalendar = {
  /** @param {string} instant */
  day(instant) {
    const d = new Date(instant);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  /** @param {string} day @param {number} hour @param {number} minute */
  instant(day, hour, minute) {
    const [y = 0, m = 0, d = 0] = day.split('-').map(Number);
    return new Date(y, m - 1, d, hour, minute).toISOString();
  },
};

/** @param {string} instant @param {string} now */
export function formatNextExport(instant, now) {
  const day = localCalendar.day(instant);
  const today = localCalendar.day(now);
  const relativeDay = day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : null;
  const date = new Date(instant);
  const timeOptions = /** @type {const} */ ({ hour: 'numeric', minute: '2-digit' });
  const label =
    relativeDay ?? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${label} at ${date.toLocaleTimeString(undefined, timeOptions)}`;
}
