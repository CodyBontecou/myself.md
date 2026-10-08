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
