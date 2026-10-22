import { scheduleCalendar } from './schedule-calendar.js';
/** Resolve real intervals for local clock-hour labels, including timezone offset changes.
 * Repeated occurrences of an hour share a slot; nonexistent hours have no slot.
 * @param {import('../core/screen-time-review.js').ReviewDay[]} days
 * @param {string} timezone @returns {import('../core/attention-heatmap.js').ReviewHourSlot[]} */
export function screenTimeHourSlots(days, timezone) {
  const calendar = scheduleCalendar(timezone);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  });
  return days.flatMap((day) =>
    Array.from({ length: 24 }, (_, hour) => {
      const start = Date.parse(calendar.instant(day.date, hour, 0));
      const end =
        hour === 23 ? Date.parse(day.end) : Date.parse(calendar.instant(day.date, hour + 1, 0));
      return { date: day.date, hour, start, end };
    }).filter(
      (slot) =>
        slot.end > slot.start &&
        slot.start >= Date.parse(day.start) &&
        slot.end <= Date.parse(day.end) &&
        Number(formatter.format(new Date(slot.start))) === slot.hour,
    ),
  );
}
