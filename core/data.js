import { defaultExportSchema, parseExportSchema, serializeExportRecord } from './export-schemas.js';
/** @typedef {'health'|'time'|'location'} Domain */
import { explicitTimeSeries } from './time-series.js';
/** @typedef {{domain:Domain,type:string,source:string,start:string|null,end:string|null,native:unknown,timeSeries?:import('./time-series.js').TimeSeries|undefined}} DataRecord */
/** @typedef {{domain:Domain,type:string,source:'native',start:string,end:string,cursor:string,limit:number,format:'json'|'jsonl',schema?:import('./export-schemas.js').ExportSchema}} DataQuery */
/** @typedef {{records:DataRecord[],nextCursor:string|null,warnings:string[],capture:string,complete?:boolean|undefined}} DataPage */
export const domains = /** @type {const} */ (['health', 'time', 'location']);
/** Preserve platform fields; only the envelope is shared across domains.
 * @param {Domain} domain @param {string} type @param {string} source @param {unknown} native */
export function record(domain, type, source, native) {
  const value = object(native);
  const start = timestamp(
    value.start_date ??
      value.startDate ??
      value.startTime ??
      value.startMs ??
      value.timestamp ??
      value.arrivedAt ??
      value.time ??
      value.date,
  );
  const end =
    timestamp(
      value.end_date ?? value.endDate ?? value.endTime ?? value.endMs ?? value.departedAt,
    ) ?? start;
  return {
    domain,
    type,
    source,
    start,
    end,
    native,
    timeSeries: explicitTimeSeries(native, start),
  };
}
/** @param {unknown} value @returns {Record<string,unknown>} */
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string,unknown>} */ (value)
    : {};
}
/** @param {unknown} value */
function timestamp(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
/** @param {DataPage} page @param {DataQuery['format']} format @param {import('./export-schemas.js').ExportSchema} [schema] */
export function exportPage(page, format, schema = defaultExportSchema) {
  parseExportSchema(schema);
  if (format === 'json')
    return JSON.stringify({
      ...page,
      schema,
      records: page.records.map((r) => JSON.parse(serializeExportRecord(r, schema))),
    });
  return (
    page.records.map((r) => serializeExportRecord(r, schema)).join('\n') +
    (page.records.length ? '\n' : '')
  );
}
