/** @typedef {'yesterday'|'last_7_days'|'last_30_days'} ScreenTimePreset */
/** Resolve inclusive completed-day ranges from an explicit local calendar date.
 * The UI and server supply today in the requested timezone; this function has no clock or I/O.
 * @param {ScreenTimePreset} preset @param {string} today */
export function screenTimePresetPeriod(preset, today) {
  const count = { yesterday: 1, last_7_days: 7, last_30_days: 30 }[preset];
  const instant = Date.parse(`${today}T00:00:00Z`);
  if (
    !count ||
    !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
    !Number.isFinite(instant) ||
    new Date(instant).toISOString().slice(0, 10) !== today
  )
    throw new Error('Choose a valid screen-time preset and local calendar date.');
  /** @param {number} offset */
  const date = (offset) => new Date(instant + offset * 86400000).toISOString().slice(0, 10);
  return {
    weekStart: date(-count),
    weekEnd: date(-1),
    comparisonWeekStart: date(-count * 2),
    comparisonWeekEnd: date(-count - 1),
  };
}
