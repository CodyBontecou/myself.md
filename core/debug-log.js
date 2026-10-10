import { sorted } from './collections.js';
/** Diagnostic operation vocabulary. Optional attachments require phone-owner opt-in. */
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
/** @typedef {{records:boolean,credentials:boolean,urls:boolean}} DebugContent */
/** @typedef {{domain:import('./data.js').Domain,type:string,profileId:string,values:unknown[],truncated:boolean}} DebugRecords */
/** @typedef {{time:number,operation:string,outcome:string,durationMs:number|null,httpStatus:number|null,error?:string,errorTruncated?:boolean,url?:string,credentials?:Record<string,string>,records?:DebugRecords}} DebugEntry */
const debugContentDefault = { records: false, credentials: false, urls: false };
/** @param {unknown} value @returns {DebugContent} */
export function parseDebugContent(value) {
  if (value === undefined) return { ...debugContentDefault };
  const content = /** @type {Partial<DebugContent>|null} */ (value);
  if (
    !content ||
    typeof content.records !== 'boolean' ||
    typeof content.credentials !== 'boolean' ||
    typeof content.urls !== 'boolean'
  )
    throw new Error('Invalid log content settings.');
  return { records: content.records, credentials: content.credentials, urls: content.urls };
}
/** Remove explicit URL credential components when credential inclusion is off.
 * Error text remains raw; arbitrary tokens embedded in URL paths cannot be inferred.
 * @param {string} value @param {boolean} includeCredentials */
export function debugUrl(value, includeCredentials) {
  if (includeCredentials) return value;
  const url = value.replace(/^(https?:\/\/)[^/@]*@/i, '$1').split('#')[0] ?? '';
  return url.replace(/([?&])([^=&]*)(?:=([^&]*))?/g, (match, separator, key) => {
    let name;
    try {
      name = decodeURIComponent(key);
    } catch {
      name = key;
    }
    return /token|secret|password|credential|authorization|api.?key|signature|code/i.test(name)
      ? `${separator}${key}=[redacted]`
      : match;
  });
}
/** Apply inclusion settings at capture, view and sharing boundaries. Errors always remain.
 * @param {DebugEntry} entry @param {DebugContent} content @returns {DebugEntry} */
export function debugEntryContent(entry, content) {
  const { records, credentials, url, ...metadata } = entry;
  return {
    ...metadata,
    ...(content.records && records ? { records } : {}),
    ...(content.credentials && credentials ? { credentials } : {}),
    ...(content.urls && url ? { url: debugUrl(url, content.credentials) } : {}),
  };
}
/** @typedef {{schema:'myself.md.debug.v1',generatedAt:number,revision:number,shared:boolean,platform:string,content?:DebugContent,entries:DebugEntry[]}} DebugReport */
export const debugRetentionMs = 7 * 86400000;
export const debugLimit = 300;
/** Validate bounded diagnostic fields and project known attachments only.
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
  if (entry.url !== undefined && (typeof entry.url !== 'string' || entry.url.length > 4000))
    throw new Error('Invalid log URL.');
  if (
    entry.credentials !== undefined &&
    (!entry.credentials ||
      typeof entry.credentials !== 'object' ||
      Array.isArray(entry.credentials) ||
      Object.entries(entry.credentials).some(
        ([key, credential]) => key.length > 100 || typeof credential !== 'string',
      ) ||
      JSON.stringify(entry.credentials).length > 4000)
  )
    throw new Error('Invalid log credentials.');
  if (
    entry.records !== undefined &&
    (!entry.records ||
      !['health', 'time', 'location'].includes(entry.records.domain) ||
      typeof entry.records.type !== 'string' ||
      entry.records.type.length > 160 ||
      typeof entry.records.profileId !== 'string' ||
      entry.records.profileId.length > 100 ||
      !Array.isArray(entry.records.values) ||
      entry.records.values.length > 50 ||
      typeof entry.records.truncated !== 'boolean' ||
      JSON.stringify(entry.records).length > 8000)
  )
    throw new Error('Invalid log records.');
  return {
    ...(entry.error === undefined ? {} : { error: entry.error }),
    ...(entry.errorTruncated === undefined ? {} : { errorTruncated: entry.errorTruncated }),
    ...(entry.url === undefined ? {} : { url: entry.url }),
    ...(entry.credentials === undefined ? {} : { credentials: { ...entry.credentials } }),
    ...(entry.records === undefined
      ? {}
      : {
          records: {
            domain: entry.records.domain,
            type: entry.records.type,
            profileId: entry.records.profileId,
            values: JSON.parse(JSON.stringify(entry.records.values)),
            truncated: entry.records.truncated,
          },
        }),
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
    ...(report.content === undefined ? {} : { content: parseDebugContent(report.content) }),
    entries: report.entries
      .map(parseDebugEntry)
      .map((entry) => debugEntryContent(entry, parseDebugContent(report.content))),
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
