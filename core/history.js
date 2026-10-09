import { parseProfile } from './profiles.js';
/** @typedef {'running'|'ready'|'complete'|'partial'|'failed'|'cancelled'|'expired'|'interrupted'} HistoryStatus */
/** @typedef {{id:string,name:string,selection:Record<import('./data.js').Domain,string[]>}} ProfileSnapshot */
/** @typedef {{day:string,name:string,format:string,recordCount:number,bytes:number,uri:string|null,cloudId:string|null,checksum:string|null,partial:boolean,warnings?:string[]}} HistoryArtifact */
/** @typedef {{id:string,kind:'export'|'access',startedAt:string,updatedAt:string,status:HistoryStatus,actor:'manual'|'schedule'|'agent',client:string|null,target:'local'|'http'|'cloud'|'phone'|'share',destination:string,profile:ProfileSnapshot,interval:{start:string,end:string},timezone:string,formats:string[],recordCount:number|null,artifacts:HistoryArtifact[],warnings:string[],relatedId:string|null,error:string|null,request?:{domain:string,source:string,type:string}|null}} HistoryEvent */
/** Metadata snapshots deliberately exclude credentials, records, and destination URL paths.
 * @param {{id:string,profile:import('./profiles.js').ExportProfile,actor:'manual'|'schedule',interval:HistoryEvent['interval'],stamp:string,timezone:string}} input
 * @returns {HistoryEvent} */
export function exportEvent({ id, profile, actor, interval, stamp, timezone }) {
  return {
    id,
    kind: 'export',
    startedAt: stamp,
    updatedAt: stamp,
    status: 'running',
    actor,
    client: null,
    target: profile.export.destination,
    destination:
      profile.export.destination === 'http'
        ? destinationHost(profile.export.httpUrl ?? '')
        : profile.export.destination === 'cloud'
          ? 'myself.md Cloud'
          : 'On this phone',
    profile: {
      id: profile.id,
      name: profile.name,
      selection: JSON.parse(JSON.stringify(profile.selection)),
    },
    interval: { ...interval },
    timezone,
    formats: [...profile.export.formats],
    recordCount: null,
    artifacts: [],
    warnings: [],
    relatedId: null,
    error: null,
  };
}
/** Strip paths, query parameters, and credentials without depending on environment URL APIs.
 * @param {string} value */
function destinationHost(value) {
  return /^https?:\/\/(?:[^/@]+@)?([^/?#]+)/i.exec(value)?.[1] ?? 'Custom endpoint';
}
/** Each day has one record count even when it produces multiple formats. Retries replace artifacts.
 * @param {HistoryEvent} event @param {HistoryArtifact} artifact @param {string} stamp @returns {HistoryEvent} */
export function addArtifact(event, artifact, stamp) {
  const artifacts = event.artifacts.filter(
    (a) => a.day !== artifact.day || a.format !== artifact.format,
  );
  artifacts.push(artifact);
  const counts = new Map(artifacts.map((a) => [a.day, a.recordCount]));
  return {
    ...event,
    updatedAt: stamp,
    artifacts,
    warnings: [...new Set(artifacts.flatMap((a) => a.warnings ?? []))].slice(0, 100),
    recordCount: [...counts.values()].reduce((a, b) => a + b, 0),
  };
}
const historyString = (/** @type {unknown} */ x) => {
  if (typeof x !== 'string' || x.length > 2000) throw new Error('Invalid history text.');
  return x;
};
const historyNumber = (/** @type {unknown} */ x) => {
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0)
    throw new Error('Invalid history count.');
  return x;
};
/** Validate persisted or remotely received metadata and retain only the documented fields.
 * @param {unknown} value @returns {HistoryEvent} */
export function parseHistoryEvent(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid history entry.');
  const v = /** @type {Record<string,unknown>} */ (value);
  const nullable = (/** @type {unknown} */ x) => (x === null ? null : historyString(x));
  const strings = (/** @type {unknown} */ x) => {
    if (!Array.isArray(x) || x.length > 100) throw new Error('Invalid history list.');
    return x.map(historyString);
  };
  if (
    !['export', 'access'].includes(historyString(v.kind)) ||
    !['manual', 'schedule', 'agent'].includes(historyString(v.actor)) ||
    !['local', 'http', 'cloud', 'phone', 'share'].includes(historyString(v.target)) ||
    ![
      'running',
      'ready',
      'complete',
      'partial',
      'failed',
      'cancelled',
      'expired',
      'interrupted',
    ].includes(historyString(v.status))
  )
    throw new Error('Invalid history state.');
  if (
    !v.profile ||
    typeof v.profile !== 'object' ||
    !v.interval ||
    typeof v.interval !== 'object' ||
    !Array.isArray(v.artifacts) ||
    v.artifacts.length > 1000
  )
    throw new Error('Invalid history metadata.');
  const p = /** @type {Record<string,unknown>} */ (v.profile),
    interval = /** @type {Record<string,unknown>} */ (v.interval);
  const profile = parseProfile({
    schema: 'myself.md.profile.v1',
    name: p.name,
    selection: p.selection,
  });
  const startedAt = historyString(v.startedAt),
    updatedAt = historyString(v.updatedAt),
    start = historyString(interval.start),
    end = historyString(interval.end);
  if ([startedAt, updatedAt, start, end].some((s) => !Number.isFinite(Date.parse(s))))
    throw new Error('Invalid history date.');
  return {
    id: historyString(v.id),
    kind: /** @type {HistoryEvent['kind']} */ (v.kind),
    actor: /** @type {HistoryEvent['actor']} */ (v.actor),
    target: /** @type {HistoryEvent['target']} */ (v.target),
    status: /** @type {HistoryStatus} */ (v.status),
    startedAt,
    updatedAt,
    client: nullable(v.client),
    destination: historyString(v.destination),
    profile: { id: historyString(p.id), name: profile.name, selection: profile.selection },
    interval: { start, end },
    timezone: historyString(v.timezone),
    formats: strings(v.formats),
    recordCount: v.recordCount === null ? null : historyNumber(v.recordCount),
    warnings: strings(v.warnings),
    relatedId: nullable(v.relatedId),
    error: nullable(v.error),
    request:
      v.request && typeof v.request === 'object'
        ? {
            domain: historyString(/** @type {{domain:unknown}} */ (v.request).domain),
            source: historyString(/** @type {{source:unknown}} */ (v.request).source),
            type: historyString(/** @type {{type:unknown}} */ (v.request).type),
          }
        : null,
    artifacts: v.artifacts.map((raw) => {
      if (!raw || typeof raw !== 'object') throw new Error('Invalid history file.');
      const a = /** @type {Record<string,unknown>} */ (raw);
      return {
        day: historyString(a.day),
        name: historyString(a.name),
        format: historyString(a.format),
        recordCount: historyNumber(a.recordCount),
        bytes: historyNumber(a.bytes),
        uri: nullable(a.uri),
        cloudId: nullable(a.cloudId),
        checksum: nullable(a.checksum ?? null),
        partial: a.partial === true,
        warnings: strings(a.warnings ?? []),
      };
    }),
  };
}
