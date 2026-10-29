import { sorted } from './collections.js';
/** @typedef {{kind:string,hours:number}} StageDuration */
/** @typedef {{id:string,start:string,end:string,nap:boolean|null,scoreState:string,asleepHours:number|null,sleepPerformancePercent:number|null,performanceStatus:'available'|'missing'|'not_scored'|'invalid',stageDurations:StageDuration[],exportIds:string[]}} WhoopSleep */
/** WHOOP exposes session totals, not timestamped sleep stages. Assign the complete session to its local end day.
 * @param {import('./health-review.js').HealthDay[]} days
 * @param {{exportId:string,record:import('./data.js').DataRecord}[]} rows */
export function whoopSleepReview(days, rows) {
  /** @type {Map<string,{native:Record<string,unknown>,record:import('./data.js').DataRecord,exportIds:string[],conflict:boolean}>} */
  const sessions = new Map();
  const counts = { invalid: 0, duplicates: 0, overlaps: 0 };
  for (const { record, exportId } of rows) {
    if (record.domain !== 'health' || record.type !== 'whoop.sleep' || record.source !== 'whoop')
      continue;
    const n =
      record.native && typeof record.native === 'object' && !Array.isArray(record.native)
        ? /** @type {Record<string,unknown>} */ (record.native)
        : {};
    if (typeof n.id !== 'string' || !n.id) {
      counts.invalid++;
      continue;
    }
    const key = JSON.stringify([n.user_id ?? '', n.id]);
    const previous = sessions.get(key);
    if (previous) {
      counts.duplicates++;
      const updated = Date.parse(String(n.updated_at ?? ''));
      const old = Date.parse(String(previous.native.updated_at ?? ''));
      if (JSON.stringify(n) === JSON.stringify(previous.native)) previous.exportIds.push(exportId);
      else if (Number.isFinite(updated) && Number.isFinite(old) && updated !== old) {
        if (updated > old)
          sessions.set(key, { native: n, record, exportIds: [exportId], conflict: false });
      } else previous.conflict = true;
    } else sessions.set(key, { native: n, record, exportIds: [exportId], conflict: false });
  }
  /** @type {Map<string,import('./health-review.js').HealthSeries>} */
  const groups = new Map();
  for (const { native: n, record: r, exportIds, conflict } of sessions.values()) {
    const start = Date.parse(r.start ?? ''),
      end = Date.parse(r.end ?? '');
    if (
      conflict ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      !['SCORED', 'PENDING_SCORE', 'UNSCORABLE'].includes(String(n.score_state))
    ) {
      counts.invalid++;
      continue;
    }
    const index = days.findIndex((d) => end >= Date.parse(d.start) && end < Date.parse(d.end));
    if (index < 0) continue;
    const device = JSON.stringify(['WHOOP account', n.user_id ?? '']);
    if (!groups.has(device))
      groups.set(device, {
        source: 'whoop',
        type: 'whoop.sleep',
        device,
        unit: 'h',
        kind: 'sleep',
        basis: 'session_end',
        daily: days.map((d) => ({
          date: d.date,
          value: null,
          records: 0,
          intervals: [],
          stageDurations: [],
          sessions: [],
        })),
      });
    const day = groups.get(device)?.daily[index];
    if (!day) continue;
    /** @type {WhoopSleep} */
    const session = {
      id: String(n.id),
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      nap: typeof n.nap === 'boolean' ? n.nap : null,
      scoreState: String(n.score_state),
      asleepHours: null,
      sleepPerformancePercent: null,
      performanceStatus: n.score_state === 'SCORED' ? 'missing' : 'not_scored',
      stageDurations: [],
      exportIds: [...new Set(exportIds)],
    };
    if (n.score_state === 'SCORED') {
      const score =
        n.score && typeof n.score === 'object'
          ? /** @type {Record<string,unknown>} */ (n.score)
          : {};
      const performance = score.sleep_performance_percentage;
      if (performance !== undefined && performance !== null) {
        if (
          typeof performance === 'number' &&
          Number.isFinite(performance) &&
          performance >= 0 &&
          performance <= 100
        ) {
          session.sleepPerformancePercent = performance;
          session.performanceStatus = 'available';
        } else session.performanceStatus = 'invalid';
      }
      const stage =
        score.stage_summary && typeof score.stage_summary === 'object'
          ? /** @type {Record<string,unknown>} */ (score.stage_summary)
          : {};
      const fields = [
        ['Light', 'total_light_sleep_time_milli'],
        ['Deep', 'total_slow_wave_sleep_time_milli'],
        ['REM', 'total_rem_sleep_time_milli'],
        ['Awake', 'total_awake_time_milli'],
        ['No data', 'total_no_data_time_milli'],
        ['In bed', 'total_in_bed_time_milli'],
      ];
      const values = fields.map(([, field]) => stage[field ?? '']);
      if (values.every((v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)) {
        const ms = values.map(Number),
          bed = ms[5] ?? 0;
        if (ms.slice(0, 5).reduce((sum, v) => sum + v, 0) <= bed + 1) {
          session.asleepHours = ms.slice(0, 3).reduce((sum, v) => sum + v, 0) / 3600000;
          session.stageDurations = fields.map(([kind], i) => ({
            kind: kind ?? '',
            hours: (ms[i] ?? 0) / 3600000,
          }));
        } else counts.invalid++;
      } else counts.invalid++;
    }
    day.records++;
    day.sessions?.push(session);
  }
  for (const series of groups.values()) {
    const all = sorted(
      series.daily.flatMap((d) => d.sessions ?? []),
      (a, b) => a.start.localeCompare(b.start),
    );
    const overlaps = new Set();
    let edge = -Infinity;
    for (const [i, s] of all.entries()) {
      const start = Date.parse(s.start),
        end = Date.parse(s.end);
      if (edge > start || Date.parse(all[i + 1]?.start ?? '') < end) overlaps.add(s.id);
      edge = Math.max(edge, end);
    }
    counts.overlaps += overlaps.size;
    for (const day of series.daily) {
      const list = sorted(day.sessions ?? [], (a, b) => a.start.localeCompare(b.start));
      day.sessions = list;
      const overlapping = list.some((s) => overlaps.has(s.id));
      if (!list.length || overlapping || list.some((s) => s.asleepHours === null)) continue;
      day.value = list.reduce((sum, s) => sum + (s.asleepHours ?? 0), 0);
      day.stageDurations = [
        ...new Set(list.flatMap((s) => s.stageDurations.map((v) => v.kind))),
      ].map((kind) => ({
        kind,
        hours: list.reduce(
          (sum, s) => sum + (s.stageDurations.find((v) => v.kind === kind)?.hours ?? 0),
          0,
        ),
      }));
    }
  }
  return { series: [...groups.values()], counts };
}
