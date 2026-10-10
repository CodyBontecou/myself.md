import { sorted } from './collections.js';
/** @typedef {{kind:'resume'|'pause'|'stop'|'screen-off'|'shutdown'|'startup',timeMs:number,identifier:string,activity:string}} UsageEvent */
/** @typedef {{identifier:string,startMs:number,endMs:number,durationMs:number,observedStartMs:number,startClipped:boolean,endReason:string,granularity:'foreground-session'}} UsageSession */
/** Reconstruct package intervals from activity events, retaining overlapping apps.
 * The caller supplies a lookback and an end no later than observation time.
 * Unknown starts are omitted rather than fabricated.
 * @param {UsageEvent[]} events @param {number} start @param {number} end
 * @returns {UsageSession[]} */
export function usageSessions(events, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  /** @type {Map<string,{start:number,activities:Set<string>}>} */
  const active = new Map();
  /** @type {UsageSession[]} */
  const sessions = [];
  /** @param {string} identifier @param {number} time @param {string} reason */
  function close(identifier, time, reason) {
    const session = active.get(identifier);
    active.delete(identifier);
    if (!session) return;
    const clippedStart = Math.max(start, session.start);
    const clippedEnd = Math.min(end, time);
    if (clippedEnd <= clippedStart) return;
    sessions.push({
      identifier,
      startMs: clippedStart,
      endMs: clippedEnd,
      durationMs: clippedEnd - clippedStart,
      observedStartMs: session.start,
      startClipped: session.start < start,
      endReason: reason,
      granularity: 'foreground-session',
    });
  }
  const ordered = sorted(
    events.filter((event) => Number.isFinite(event.timeMs) && event.timeMs <= end),
    (a, b) => a.timeMs - b.timeMs,
  );
  for (const event of ordered) {
    if (event.kind === 'startup') {
      // Android says unresolved sessions across a restart have unknown end times.
      active.clear();
      continue;
    }
    if (['screen-off', 'shutdown'].includes(event.kind)) {
      for (const identifier of active.keys()) close(identifier, event.timeMs, event.kind);
      continue;
    }
    if (!event.identifier) continue;
    const session = active.get(event.identifier);
    if (event.kind === 'resume') {
      if (session) session.activities.add(event.activity);
      else
        active.set(event.identifier, {
          start: event.timeMs,
          activities: new Set([event.activity]),
        });
    } else if (session && (event.kind === 'pause' || event.kind === 'stop')) {
      session.activities.delete(event.activity);
      if (!session.activities.size) close(event.identifier, event.timeMs, event.kind);
    }
  }
  for (const identifier of active.keys()) close(identifier, end, 'query-boundary');
  return sorted(
    sessions,
    (a, b) => a.startMs - b.startMs || a.identifier.localeCompare(b.identifier),
  );
}
