import { sorted } from './collections.js';
import { debugEntries } from './debug-log.js';
/** @typedef {'all'|'app'|'exports'|'agents'} LogCategory */
/** @typedef {{id:string,time:number,category:'app',entry:import('./debug-log.js').DebugEntry}|{id:string,time:number,category:'exports'|'agents',event:import('./history.js').HistoryEvent}} Log */
/** Merge metadata without widening either source's authorization. Callers supply only accessible entries.
 * @param {import('./history.js').HistoryEvent[]} history
 * @param {import('./debug-log.js').DebugEntry[]} diagnostics
 * @param {number} now
 * @param {{category?:LogCategory,issues?:boolean,profileId?:string|undefined}} [options]
 * @returns {Log[]} */
export function logs(history, diagnostics, now, options = {}) {
  const occurrences = new Map();
  /** @type {Log[]} */
  const result = history.map((event) => ({
    id: `history:${event.id}`,
    time: Date.parse(event.startedAt),
    category: event.kind === 'access' ? 'agents' : 'exports',
    event,
  }));
  // Number identical entries oldest-first so newer arrivals don't change existing identifiers.
  const retained = debugEntries(diagnostics, now);
  for (let index = retained.length - 1; index >= 0; index--) {
    const entry = retained[index];
    if (!entry) continue;
    const key = `${entry.time}:${entry.operation}:${entry.outcome}:${entry.durationMs}:${entry.httpStatus}`;
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    result.push({ id: `debug:${key}:${occurrence}`, time: entry.time, category: 'app', entry });
  }
  return sorted(
    result.filter((log) => {
      if (options.category && options.category !== 'all' && log.category !== options.category)
        return false;
      if (options.profileId && (!('event' in log) || log.event.profile.id !== options.profileId))
        return false;
      const outcome = 'entry' in log ? log.entry.outcome : log.event.status;
      return (
        !options.issues ||
        ['failed', 'partial', 'cancelled', 'expired', 'interrupted'].includes(outcome)
      );
    }),
    (a, b) => b.time - a.time || a.id.localeCompare(b.id),
  );
}

/** Raw structured metadata, with the same identifiers as the navigable timeline.
 * @param {Log} log @param {boolean} [pretty] */
export function logJson(log, pretty = false) {
  return JSON.stringify(log, null, pretty ? 2 : undefined);
}

/** Select from currently accessible logs; never retain old copies after content changes.
 * @param {Log[]} entries @param {string[]} ids */
export function selectLogs(entries, ids) {
  if (
    ids.length > 350 ||
    ids.some((id) => typeof id !== 'string' || !id || id.length > 1000) ||
    new Set(ids).size !== ids.length
  )
    throw new Error('Select up to 350 unique log IDs.');
  const selected = new Set(ids);
  const available = new Set(entries.map((entry) => entry.id));
  return {
    logs: entries.filter((entry) => selected.has(entry.id)),
    unavailableIds: ids.filter((id) => !available.has(id)),
  };
}
/** Shareable JSON lines, identical for native clipboard and MCP.
 * @param {Log[]} entries */
export function logsJson(entries) {
  return entries.map((entry) => logJson(entry)).join('\n');
}
