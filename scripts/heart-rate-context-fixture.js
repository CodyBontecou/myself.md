/** Deterministic fictional records for isolated overlay verification only.
 * @param {string} date @returns {import('../core/data.js').DataRecord[]} */
export function heartRateContextFixture(date) {
  const at = (/** @type {string} */ time) => `${date}T${time}:00.000Z`;
  /** @type {import('../core/data.js').DataRecord[]} */
  const rows = [];
  for (const [time, bpm] of /** @type {[string,number][]} */ ([
    ['09:00', 72],
    ['09:05', 90],
    ['09:30', 110],
    ['10:00', 80],
  ]))
    rows.push({
      domain: 'health',
      type: 'HKQuantityTypeIdentifierHeartRate',
      source: 'Fictional Watch',
      start: at(time),
      end: at(time),
      native: { quantity: bpm, unit: 'count/min', fictional: true },
    });
  for (const [i, time] of ['09:00', '09:04', '09:45'].entries())
    rows.push({
      domain: 'location',
      type: 'points',
      source: 'Fictional GPS',
      start: at(time),
      end: at(time),
      native: {
        coords: {
          latitude: 18.4 + i * 0.001,
          longitude: -66.1 + i * 0.002,
          accuracy: i === 2 ? null : 10,
        },
        fictional: true,
      },
    });
  for (const [i, hour] of [9, 10, 11].entries())
    rows.push({
      domain: 'time',
      type: 'application',
      source: 'Fictional Usage',
      start: at(`${String(hour).padStart(2, '0')}:00`),
      end: at(`${hour + 1}:00`),
      native: {
        identifier: `fictional.app.${i}`,
        displayName: ['Fictional Reader', 'Fictional Music', 'Fictional Chat'][i],
        durationMs: (30 - i * 10) * 60000,
        granularity: 'hour',
        fictional: true,
      },
    });
  return rows;
}
