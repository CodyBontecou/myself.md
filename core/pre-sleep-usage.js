import { sorted } from './collections.js';

/** Bounds on observed usage inside [session start − 2 hours, session start).
 * Aggregate durations have no finer timing: never prorate boundary records.
 * @param {ReturnType<typeof import('./screen-time-review.js').usageRecordGroups>['groups'] extends Map<string,infer T> ? T : never} group
 * @param {{id:string,daily:{date:string,sessions:import('./whoop-sleep-review.js').WhoopSleep[]}[]}[]} sources */
export function preSleepUsage(group, sources) {
  return sources.flatMap((source) =>
    source.daily.flatMap((day) =>
      day.sessions.map((session) => {
        const end = Date.parse(session.start),
          start = end - 7200000;
        const rows = group.rows.filter((r) => r.start < end && r.end > start);
        const valid = rows.filter((r) => !r.conflict);
        /** @type {Map<string,{identifier:string,name:string,lowerMs:number,upperMs:number,records:number}>} */
        const apps = new Map();
        let lowerMs = 0,
          upperMs = 0,
          containedMs = 0,
          boundaryRecords = 0;
        /** @type {[number,number][]} */ const spans = [];
        const exportIds = new Set();
        for (const r of valid) {
          const overlap = Math.min(end, r.end) - Math.max(start, r.start);
          const lower = Math.max(0, r.durationMs - (r.end - r.start - overlap));
          const upper = Math.min(r.durationMs, overlap);
          lowerMs += lower;
          upperMs += upper;
          if (r.start >= start && r.end <= end) containedMs += r.durationMs;
          else boundaryRecords++;
          spans.push([Math.max(start, r.start), Math.min(end, r.end)]);
          exportIds.add(r.exportId);
          const app = apps.get(r.identifier) ?? {
            identifier: r.identifier,
            name: r.name,
            lowerMs: 0,
            upperMs: 0,
            records: 0,
          };
          app.lowerMs += lower;
          app.upperMs += upper;
          app.records++;
          apps.set(r.identifier, app);
        }
        let observedSpanMs = 0,
          edge = -Infinity;
        for (const [a, b] of sorted(spans, (left, right) => left[0] - right[0])) {
          observedSpanMs += Math.max(0, b - Math.max(a, edge));
          edge = Math.max(edge, b);
        }
        const topApps = sorted(
          [...apps.values()],
          (a, b) => b.upperMs - a.upperMs || a.identifier.localeCompare(b.identifier),
        ).slice(0, 10);
        return {
          sleepSourceId: source.id,
          sessionId: session.id,
          date: day.date,
          sessionStart: session.start,
          sessionEnd: session.end,
          nap: session.nap,
          scoreState: session.scoreState,
          sleepHours: session.asleepHours,
          sleepPerformancePercent: session.sleepPerformancePercent,
          performanceStatus: session.performanceStatus,
          windowStart: new Date(start).toISOString(),
          windowEnd: new Date(end).toISOString(),
          lowerMs: valid.length ? lowerMs : null,
          upperMs: valid.length ? upperMs : null,
          containedMs: valid.length ? containedMs : null,
          records: valid.length,
          boundaryRecords,
          conflictingRecords: rows.length - valid.length,
          observedSpanMs,
          topApps,
          otherLowerMs: valid.length ? lowerMs - topApps.reduce((n, a) => n + a.lowerMs, 0) : null,
          otherUpperMs: valid.length ? upperMs - topApps.reduce((n, a) => n + a.upperMs, 0) : null,
          sleepExportIds: session.exportIds,
          usageExportIds: [...exportIds],
        };
      }),
    ),
  );
}
