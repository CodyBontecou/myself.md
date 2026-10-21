/** @typedef {{operation:Aggregation['operation'],groupBy:Aggregation['groupBy'],field:string|null,unitField:string|null,start:string,end:string,scannedRecords:number,skippedRecords:number}} AggregateCoverage */
/** @typedef {{operation:'count'|'sum'|'avg'|'min'|'max',field?:string|undefined,unitField?:string|undefined,groupBy:'day'|'interval'}} Aggregation */
/** Only explicit scalar native fields are aggregated; nested series remain untouched.
 * @param {unknown} value @param {string} path @returns {unknown} */
function field(value, path) {
  for (const key of path.split('.')) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw new Error('Unsupported aggregate field.');
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined;
    value = /** @type {Record<string,unknown>} */ (value)[key];
  }
  return value;
}
/** @param {import('./data.js').DataQuery} query */
export function aggregationWindow(query) {
  const aggregation = query.aggregation;
  if (!aggregation) throw new Error('Missing aggregation.');
  if (aggregation.operation !== 'count' && !aggregation.field)
    throw new Error('Numeric aggregation requires an explicit native field.');
  if (
    aggregation.groupBy === 'interval' &&
    Date.parse(query.end) - Date.parse(query.start) > 31 * 86400000
  )
    throw new Error(
      'Interval aggregation supports at most 31 days; use daily grouping for longer queries.',
    );
  const identity = JSON.stringify({
    domain: query.domain,
    type: query.type,
    source: query.source,
    start: query.start,
    end: query.end,
    aggregation,
  });
  let start = query.start;
  if (query.cursor) {
    const cursor = JSON.parse(query.cursor);
    if (
      cursor.identity !== identity ||
      typeof cursor.start !== 'string' ||
      !Number.isFinite(Date.parse(cursor.start)) ||
      Date.parse(cursor.start) <= Date.parse(query.start) ||
      Date.parse(cursor.start) >= Date.parse(query.end) ||
      new Date(cursor.start).toISOString().slice(11) !== '00:00:00.000Z'
    )
      throw new Error('Cursor belongs to a different aggregate query.');
    start = cursor.start;
  }
  // A page covers at most 31 UTC calendar days, regardless of source pagination.
  const end =
    aggregation.groupBy === 'interval'
      ? query.end
      : new Date(
          Math.min(
            Date.parse(query.end),
            Date.parse(start.slice(0, 10) + 'T00:00:00.000Z') +
              Math.min(query.limit, 31) * 86400000,
          ),
        ).toISOString();
  return {
    start,
    end,
    nextCursor:
      Date.parse(end) >= Date.parse(query.end) ? null : JSON.stringify({ identity, start: end }),
  };
}
/** Streaming reducer bounded independently of native pagination.
 * @param {import('./data.js').DataQuery} query @param {{start:string,end:string}} window */
export function aggregateRecords(query, window) {
  const spec = query.aggregation;
  if (!spec) throw new Error('Missing aggregation.');
  /** @type {Map<string,{source:string,start:string,end:string,unit:string|null,count:number,sum:number,min:number,max:number}>} */
  const groups = new Map();
  let scanned = 0,
    skipped = 0;
  return {
    /** @param {import('./data.js').DataRecord[]} records */
    add(records) {
      for (const record of records) {
        if (++scanned > 10000)
          throw new Error(
            'Aggregation exceeds 10000 records. Narrow the interval. No partial totals returned.',
          );
        if (
          !record.start ||
          !Number.isFinite(Date.parse(record.start)) ||
          Date.parse(record.start) < Date.parse(window.start) ||
          Date.parse(record.start) >= Date.parse(window.end)
        ) {
          skipped++;
          continue;
        }
        const value = spec.operation === 'count' ? 1 : field(record.native, spec.field ?? '');
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          skipped++;
          continue;
        }
        const rawUnit =
          spec.operation === 'count' ? null : field(record.native, spec.unitField ?? 'unit');
        if (rawUnit !== undefined && rawUnit !== null && typeof rawUnit !== 'string') {
          skipped++;
          continue;
        }
        const unit = typeof rawUnit === 'string' ? rawUnit : null;
        const start =
          spec.groupBy === 'day'
            ? new Date(
                Math.max(
                  Date.parse(window.start),
                  Date.parse(record.start.slice(0, 10) + 'T00:00:00.000Z'),
                ),
              ).toISOString()
            : window.start;
        const end =
          spec.groupBy === 'day'
            ? new Date(
                Math.min(
                  Date.parse(window.end),
                  Date.parse(start.slice(0, 10) + 'T00:00:00.000Z') + 86400000,
                ),
              ).toISOString()
            : window.end;
        const key = JSON.stringify([record.source, start, unit]);
        const group = groups.get(key) ?? {
          source: record.source,
          start,
          end,
          unit,
          count: 0,
          sum: 0,
          min: value,
          max: value,
        };
        group.count++;
        group.sum += value;
        group.min = Math.min(group.min, value);
        group.max = Math.max(group.max, value);
        if (!Number.isFinite(group.sum))
          throw new Error('Aggregate numeric overflow. Narrow the interval.');
        groups.set(key, group);
        if (groups.size > 50)
          throw new Error('Aggregation exceeds 50 source/unit buckets. Narrow the interval.');
      }
    },
    finish() {
      return {
        aggregation: {
          operation: spec.operation,
          groupBy: spec.groupBy,
          field: spec.field ?? null,
          unitField: spec.unitField ?? null,
          start: window.start,
          end: window.end,
          scannedRecords: scanned,
          skippedRecords: skipped,
        },
        records: [...groups.values()]
          // oxlint-disable-next-line no-array-sort -- This new array is owned here; ES2022 types do not include toSorted.
          .sort(
            (a, b) =>
              a.start.localeCompare(b.start) ||
              a.source.localeCompare(b.source) ||
              String(a.unit).localeCompare(String(b.unit)),
          )
          .map((group) => ({
            domain: query.domain,
            type: query.type,
            source: group.source,
            start: group.start,
            end: group.end,
            native: {
              aggregation: spec.operation,
              groupBy: spec.groupBy,
              field: spec.field ?? null,
              unit: group.unit,
              count: group.count,
              value:
                spec.operation === 'count'
                  ? group.count
                  : spec.operation === 'sum'
                    ? group.sum
                    : spec.operation === 'avg'
                      ? group.sum / group.count
                      : spec.operation === 'min'
                        ? group.min
                        : group.max,
            },
          })),
        warnings: [
          `Aggregated ${scanned} native records; skipped ${skipped} records with missing/non-numeric fields or timestamps outside coverage. Buckets use record start in UTC; intervals are not prorated, deduplicated, or unit-converted. Empty buckets are omitted; empty Health results do not prove authorization.`,
        ],
      };
    },
  };
}
