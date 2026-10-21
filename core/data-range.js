import { addDays } from './schedules.js';
/** @typedef {{start:string|null,end:string|null}} DataRange */
/** @param {string} start @param {string} end @param {import('./schedules.js').Calendar} calendar */
export function exportIntervals(start, end, calendar) {
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start)
  )
    throw new Error('Choose an end later than the start.');
  const result = [];
  for (
    let day = calendar.day(start);
    Date.parse(calendar.instant(day, 0, 0)) < Date.parse(end);
    day = addDays(day, 1)
  ) {
    if (result.length >= 100000) throw new Error('Export exceeds the supported calendar range.');
    result.push({
      day,
      start: new Date(
        Math.max(Date.parse(start), Date.parse(calendar.instant(day, 0, 0))),
      ).toISOString(),
      end: new Date(
        Math.min(Date.parse(end), Date.parse(calendar.instant(addDays(day, 1), 0, 0))),
      ).toISOString(),
    });
  }
  return result;
}
const windowMs = 31 * 86400000;
/** Split provider work behind the existing paginated query interface.
 * @param {import('./data.js').DataQuery} query */
export function queryWindow(query) {
  let start = query.start,
    token = '';
  if (query.cursor) {
    const value = JSON.parse(query.cursor);
    const { windowStart, token: continuation, ...identity } = value;
    if (
      JSON.stringify(identity) !==
        JSON.stringify({
          domain: query.domain,
          type: query.type,
          source: query.source,
          start: query.start,
          end: query.end,
        }) ||
      typeof windowStart !== 'string' ||
      typeof continuation !== 'string' ||
      !Number.isFinite(Date.parse(windowStart)) ||
      Date.parse(windowStart) < Date.parse(query.start) ||
      Date.parse(windowStart) >= Date.parse(query.end) ||
      (Date.parse(windowStart) - Date.parse(query.start)) % windowMs !== 0
    )
      throw new Error('Cursor belongs to a different query.');
    start = windowStart;
    token = continuation;
  }
  const end = new Date(Math.min(Date.parse(start) + windowMs, Date.parse(query.end))).toISOString();
  return { start, end, token };
}
/** @param {import('./data.js').DataQuery} query @param {{start:string,end:string}} window @param {string|null} token */
export function nextQueryWindow(query, window, token) {
  if (token === null && Date.parse(window.end) >= Date.parse(query.end)) return null;
  return JSON.stringify({
    domain: query.domain,
    type: query.type,
    source: query.source,
    start: query.start,
    end: query.end,
    windowStart: token === null ? window.end : window.start,
    token: token ?? '',
  });
}
