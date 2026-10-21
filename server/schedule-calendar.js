/** Resolve calendar dates in the phone's registered IANA timezone, including DST.
 * @param {string} timeZone */
export function scheduleCalendar(timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  /** @param {string} instant */
  const parts = (instant) =>
    Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return {
    /** @param {string} instant */
    day(instant) {
      const p = parts(instant);
      return `${p.year}-${p.month}-${p.day}`;
    },
    /** @param {string} day @param {number} hour @param {number} minute */
    instant(day, hour, minute) {
      const target = Date.parse(
        `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
      );
      let value = target;
      const seen = new Set();
      for (let i = 0; i < 4; i++) {
        const p = parts(new Date(value).toISOString());
        const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
        const next = value + target - wall;
        if (next === value) break;
        // Resolve a nonexistent local time forward through the DST gap.
        if (seen.has(next)) {
          value = Math.max(value, next);
          break;
        }
        seen.add(value);
        value = next;
      }
      // During a repeated hour, match the device Date constructor's earlier instant.
      const resolved = value;
      for (const delta of [-86400000, 86400000]) {
        const sample = resolved + delta;
        const p = parts(new Date(sample).toISOString());
        const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
        const candidate = target - (wall - sample);
        const c = parts(new Date(candidate).toISOString());
        if (
          candidate < value &&
          Date.parse(`${c.year}-${c.month}-${c.day}T${c.hour}:${c.minute}:00Z`) === target
        )
          value = candidate;
      }
      return new Date(value).toISOString();
    },
  };
}
