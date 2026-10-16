import { sorted } from './collections.js';
/** Diagnostic operation vocabulary. Entries carry metadata and raw errors only. */
export const debugOperations = [
  'app',
  'connection',
  'history',
  'query',
  'profile',
  'billing',
  'cloud',
  'export',
  'other',
];
export const debugOutcomes = [
  'started',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
  'partial',
];
/** @typedef {{time:number,operation:string,outcome:string,durationMs:number|null,httpStatus:number|null,error?:string,errorTruncated?:boolean}} DebugEntry */
/** @typedef {{schema:'myself.md.debug.v1',generatedAt:number,revision:number,shared:boolean,platform:string,entries:DebugEntry[]}} DebugReport */
export const debugRetentionMs = 7 * 86400000;
export const debugLimit = 300;
/** Validate bounded diagnostic fields. Attachment fields written by older app versions are dropped.
 * @param {unknown} value @returns {DebugEntry} */
export function parseDebugEntry(value) {
  const entry = /** @type {Partial<DebugEntry>|null} */ (value);
  if (
    !entry ||
    !Number.isSafeInteger(entry.time) ||
    Number(entry.time) < 0 ||
    !debugOperations.includes(entry.operation ?? '') ||
    !debugOutcomes.includes(entry.outcome ?? '') ||
    (entry.durationMs !== null &&
      (!Number.isSafeInteger(entry.durationMs) ||
        Number(entry.durationMs) < 0 ||
        Number(entry.durationMs) > 86400000)) ||
    (entry.httpStatus !== null &&
      (!Number.isInteger(entry.httpStatus) ||
        Number(entry.httpStatus) < 100 ||
        Number(entry.httpStatus) > 599))
  )
    throw new Error('Invalid debug entry.');
  if (entry.error !== undefined && (typeof entry.error !== 'string' || entry.error.length > 16000))
    throw new Error('Invalid log error.');
  if (entry.errorTruncated !== undefined && typeof entry.errorTruncated !== 'boolean')
    throw new Error('Invalid log error truncation.');
  return {
    ...(entry.error === undefined ? {} : { error: entry.error }),
    ...(entry.errorTruncated === undefined ? {} : { errorTruncated: entry.errorTruncated }),
    time: Number(entry.time),
    operation: String(entry.operation),
    outcome: String(entry.outcome),
    durationMs: entry.durationMs ?? null,
    httpStatus: entry.httpStatus ?? null,
  };
}
/** @param {unknown} value @returns {DebugReport} */
export function parseDebugReport(value) {
  const report = /** @type {Partial<DebugReport>|null} */ (value);
  if (
    !report ||
    report.schema !== 'myself.md.debug.v1' ||
    typeof report.shared !== 'boolean' ||
    !Number.isSafeInteger(report.generatedAt) ||
    Number(report.generatedAt) < 0 ||
    !Number.isSafeInteger(report.revision) ||
    Number(report.revision) < 0 ||
    !['ios', 'android', 'web'].includes(report.platform ?? '') ||
    !Array.isArray(report.entries) ||
    report.entries.length > debugLimit
  )
    throw new Error('Invalid debug report.');
  return {
    schema: 'myself.md.debug.v1',
    generatedAt: Number(report.generatedAt),
    revision: Number(report.revision),
    shared: report.shared,
    platform: String(report.platform),
    entries: report.entries.map(parseDebugEntry),
  };
}
/** @param {DebugEntry[]} entries @param {number} now @param {'all'|'issues'} [filter] */
export function debugEntries(entries, now, filter = 'all') {
  const retained = sorted(
    entries.filter(
      (entry) =>
        entry.time <= now &&
        entry.time >= now - debugRetentionMs &&
        (filter === 'all' ||
          ['failed', 'cancelled', 'interrupted', 'partial'].includes(entry.outcome)),
    ),
    (a, b) => b.time - a.time,
  ).slice(0, debugLimit);
  let size = 0;
  return retained.filter((entry) => {
    size += JSON.stringify(entry).length;
    return size <= 128000;
  });
}
/** Classify a route without retaining its identifiers or query string.
 * @param {string} path */
export function debugOperation(path) {
  if (path.includes('/poll')) return 'connection';
  if (path.includes('/result')) return 'query';
  if (path.startsWith('/api/history')) return 'history';
  if (path.startsWith('/api/billing')) return 'billing';
  if (path.startsWith('/api/cloud')) return 'cloud';
  return 'other';
}
