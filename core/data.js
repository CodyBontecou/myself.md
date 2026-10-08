/** @typedef {'health'|'time'|'location'} Domain */
/** @typedef {{domain:Domain,type:string,source:string,start:string|null,end:string|null,native:unknown}} DataRecord */
/** @typedef {{domain:Domain,type:string,source:'native'|'imported',start:string,end:string,cursor:string,limit:number,format:'json'|'jsonl'}} DataQuery */
/** @typedef {{records:DataRecord[],nextCursor:string|null,warnings:string[],capture:string}} DataPage */
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
  return { domain, type, source, start, end, native };
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
/** Index known export collections while retaining an exact, re-exportable original archive.
 * @param {Domain} domain @param {unknown} archive @returns {DataRecord[]} */
export function importRecords(domain, archive) {
  const root = object(archive);
  const records = [record(domain, 'archive', 'imported-original', archive)];
  const collections =
    domain === 'location'
      ? ['points', 'visits', 'outings']
      : domain === 'time'
        ? ['rawScreenTime', 'applications', 'websites', 'dailyTrends', 'hourlyActivity']
        : ['samples', 'records', 'workouts'];
  if (Array.isArray(archive)) {
    for (const item of archive)
      records.push(record(domain, String(object(item).type ?? 'imported'), 'imported', item));
  }
  if (domain === 'health') {
    const days = Array.isArray(archive)
      ? archive
      : Array.isArray(root.data)
        ? root.data
        : [archive];
    for (const day of days) {
      const healthArchive = object(object(day).healthkit_record_archive);
      for (const key of ['records', 'external_records']) {
        const values = healthArchive[key];
        if (!Array.isArray(values)) continue;
        for (const value of values)
          records.push(
            record(
              domain,
              String(object(value).object_type_identifier ?? key),
              'imported-health.md-canonical',
              value,
            ),
          );
      }
    }
  }
  for (const key of collections) {
    const values = root[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const row = object(value);
      const type =
        domain === 'health'
          ? String(
              row.object_type_identifier ??
                row.typeIdentifier ??
                row.quantityType ??
                row.categoryType ??
                row.type ??
                key,
            )
          : key;
      records.push(record(domain, type, 'imported', value));
    }
  }
  return records;
}
/** @param {DataPage} page @param {DataQuery['format']} format */
export function exportPage(page, format) {
  if (format === 'json') return JSON.stringify({ schema: 'qr-connect.export.v1', ...page });
  return page.records.map((r) => JSON.stringify(r)).join('\n') + (page.records.length ? '\n' : '');
}
