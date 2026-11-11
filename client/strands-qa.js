/** Fictional Strands records for QA builds. Never reads native sources.
 * @typedef {import('../core/screen-time-review.js').ReviewRecord} ReviewRecord */

/** @type {import('../core/profiles.js').ExportProfile} */
export const qaStrandsProfile = /** @type {never} */ ({
  id: 'qa-strands',
  name: 'Synthetic Strands',
  schema: 'myself.md.profile.v1',
  selection: {
    health: [
      'native:HKQuantityTypeIdentifierHeartRate',
      'native:HKCategoryTypeIdentifierSleepAnalysis',
    ],
    time: ['native:applications'],
    location: ['native:points'],
  },
});

/** @param {number} seed */
function noise(seed) {
  const r = Math.sin(seed * 12.9898) * 43758.5453;
  return r - Math.floor(r);
}

/** @param {string} domain @param {string} type @param {number} start @param {number} end @param {Record<string,unknown>} native @returns {ReviewRecord} */
function row(domain, type, start, end, native) {
  return {
    exportId: 'qa',
    record: /** @type {never} */ ({
      domain,
      type,
      source: 'native',
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      native: { ...native, fictional: true },
    }),
  };
}

/** Deterministic days: home, a studio on weekdays, a beach some evenings, late scrolling.
 * @param {string} start @param {string} end @returns {ReviewRecord[]} */
export function qaStrandsRows(start, end) {
  /** @type {ReviewRecord[]} */
  const rows = [];
  const first = new Date(start);
  for (
    let d = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    d.getTime() < Date.parse(end);
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const seed = Math.floor(d.getTime() / 86400000);
    const at = (/** @type {number} */ h, m = 0) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const beach = noise(seed) < (weekend ? 0.5 : 0.25);
    const late = beach ? 8 : Math.round(20 + noise(seed + 1) * 50);
    for (let m = 6 * 60; m < 24 * 60; m += 20) {
      const h = m / 60;
      const ride = !weekend && h >= 8.6 && h < 9.1;
      const bpm = Math.round(60 + noise(seed + m) * 10 + (ride ? 45 : 0) + (h > 22 ? late / 8 : 0));
      rows.push(
        row('health', 'HKQuantityTypeIdentifierHeartRate', at(0, m), at(0, m), {
          quantity: bpm,
          unit: 'count/min',
        }),
      );
    }
    const onset = at(23, beach ? 5 : Math.min(59, Math.round(late * 0.9)));
    const wake = onset + (beach ? 7.9 : 7.1) * 3600000;
    const midnight = at(24);
    rows.push(
      row('health', 'HKCategoryTypeIdentifierSleepAnalysis', onset, Math.min(wake, midnight), {
        value: 1,
      }),
    );
    if (wake > midnight)
      rows.push(
        row('health', 'HKCategoryTypeIdentifierSleepAnalysis', midnight, wake, { value: 1 }),
      );
    for (const [h, minutes, app] of /** @type {[number,number,string][]} */ ([
      [7, 18, 'Messages'],
      [10, weekend ? 25 : 6, 'Slack'],
      [12, 22, 'Instagram'],
      [16, 12, 'Safari'],
      [21, 14, 'YouTube'],
      [22, Math.min(59, late), 'Reels'],
      [23, Math.round(late / 3), 'Reels'],
    ]))
      rows.push(
        row('time', 'applications', at(h), at(h + 1), {
          identifier: app,
          displayName: app,
          durationMs: minutes * 60000,
          granularity: 'hour',
        }),
      );
    const home = [40.2033, -8.4103],
      studio = [40.2109, -8.4292],
      praia = [40.1508, -8.8618];
    for (let m = 6 * 60; m < 24 * 60; m += 30) {
      const h = m / 60;
      const place =
        !weekend && h >= 9.2 && h < 17.5
          ? studio
          : beach && h >= 17.8 && h < 19.6
            ? praia
            : h < 8.6 || h >= 19.8 || weekend
              ? home
              : null;
      if (place)
        rows.push(
          row('location', 'points', at(0, m), at(0, m), {
            coords: { latitude: place[0] ?? 0, longitude: place[1] ?? 0, accuracy: 12 },
          }),
        );
    }
  }
  return rows.filter(
    (r) =>
      Date.parse(r.record.start ?? '') >= Date.parse(start) &&
      Date.parse(r.record.start ?? '') < Date.parse(end),
  );
}
