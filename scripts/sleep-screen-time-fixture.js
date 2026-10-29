export const day = {
  date: '2026-10-19',
  start: '2026-10-19T00:00:00Z',
  end: '2026-10-20T00:00:00Z',
};
export const prior = { date: '2026-10-18', start: '2026-10-18T00:00:00Z', end: day.start };
/** @type {import('../core/data.js').DataRecord} */
export const sleep = {
  domain: 'health',
  source: 'whoop',
  type: 'whoop.sleep',
  start: '2026-10-18T22:00:00Z',
  end: '2026-10-19T06:00:00Z',
  native: {
    id: 'fixture-sleep',
    nap: false,
    fictional: true,
    score_state: 'SCORED',
    score: {
      sleep_performance_percentage: 82.5,
      stage_summary: {
        total_light_sleep_time_milli: 4 * 3600000,
        total_slow_wave_sleep_time_milli: 3600000,
        total_rem_sleep_time_milli: 2 * 3600000,
        total_awake_time_milli: 3600000,
        total_no_data_time_milli: 0,
        total_in_bed_time_milli: 8 * 3600000,
      },
    },
  },
};
/** @type {import('../core/data.js').DataRecord} */
export const usage = {
  domain: 'time',
  source: 'fictional-usage',
  type: 'application',
  start: '2026-10-18T12:00:00Z',
  end: '2026-10-18T14:00:00Z',
  native: {
    identifier: 'fixture.reader',
    displayName: 'Fictional Reader',
    durationMs: 7200000,
    granularity: 'daily',
    fictional: true,
  },
};
