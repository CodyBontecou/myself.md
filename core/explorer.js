import { sorted } from './collections.js';
/** @typedef {string|number|boolean|null} Scalar */
/** @typedef {{exportId:string,index:number,profileId:string,profileName:string,deviceId:string,day:string}} Provenance */
/** @typedef {{id:string,domain:string,type:string,metric:string,source:string,start:string|null,end:string|null,value:number|null,unit:string|null,duration:number|null,application:string|null,latitude:number|null,longitude:number|null,accuracy:number|null,summary:string,archive:boolean,fields:Record<string,Scalar>,provenance:Provenance[]}} ExplorerRow */
/** @typedef {{field:string,operator:'eq'|'ne'|'contains'|'gt'|'gte'|'lt'|'lte'|'exists'|'missing',value:string}} Filter */
/** @typedef {{exportIds:string[],profileIds:string[],deviceIds:string[],domain:string,metric:string,source:string,start:string,end:string,timezone:string,filters:Filter[],sort:string,direction:'asc'|'desc',offset:number,limit:number,deduplicate:boolean,includeArchives:boolean,aggregation:'auto'|'sum'|'mean'|'count',bucket:'day'|'hour'}} ExplorerQuery */
/** @param {unknown} value @returns {Record<string,unknown>} */
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string,unknown>} */ (value)
    : {};
}
/** @param {unknown} value @returns {number|null} */
function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
/** @param {unknown[]} values */
function firstNumber(values) {
  for (const value of values) {
    const result = number(value);
    if (result !== null) return result;
  }
  return null;
}
/** @param {unknown[]} values */
function firstString(values) {
  return values.find((value) => typeof value === 'string' && value.length) ?? null;
}
/** @param {string} identifier */
function metricLabel(identifier) {
  return identifier
    .replace(/^HK(?:Quantity|Category|Correlation|Workout)TypeIdentifier/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ');
}
/** @param {unknown} value @param {string} prefix @param {Record<string,Scalar>} output @param {number} [depth] */
function flatten(value, prefix, output, depth = 0) {
  for (const [key, child] of Object.entries(object(value))) {
    if (Object.keys(output).length >= 96) return;
    const path = `${prefix}.${key}`;
    if (
      child === null ||
      typeof child === 'string' ||
      typeof child === 'boolean' ||
      typeof child === 'number'
    )
      output[path] = typeof child === 'number' && !Number.isFinite(child) ? null : child;
    else if (depth < 4 && !Array.isArray(child)) flatten(child, path, output, depth + 1);
  }
}
/** @param {import('./data.js').DataRecord} record @param {Provenance} provenance @param {string} id @returns {ExplorerRow} */
export function normalizeRecord(record, provenance, id) {
  const native = object(record.native),
    coords = object(native.coords);
  const quantity = object(native.quantity),
    canonical = object(native.value);
  const durationMs = firstNumber([native.durationMs, native.totalActivityDurationMs]);
  const duration =
    durationMs !== null
      ? durationMs / 1000
      : record.start && record.end && Date.parse(record.end) >= Date.parse(record.start)
        ? (Date.parse(record.end) - Date.parse(record.start)) / 1000
        : null;
  let value = firstNumber([
    native.quantity,
    quantity.value,
    native.value,
    canonical.value,
    native.numeric_value,
    native.count,
  ]);
  let unit = /** @type {string|null} */ (
    firstString([native.unit, quantity.unit, canonical.unit, native.unit_string])
  );
  const application = /** @type {string|null} */ (
    firstString([
      native.displayName,
      native.identifier,
      native.packageName,
      native.application,
      native.name,
    ])
  );
  const latitude = firstNumber([coords.latitude, native.latitude]),
    longitude = firstNumber([coords.longitude, native.longitude]),
    accuracy = firstNumber([coords.accuracy, native.accuracy]);
  if (record.domain === 'time' && durationMs !== null) {
    value = durationMs / 1000;
    unit = 's';
  }
  const sleep = /sleep/i.test(record.type);
  if (sleep && value === null && duration !== null) {
    value = duration;
    unit = 's';
  }
  const metric = metricLabel(record.type);
  const category = firstString([native.category, native.categoryValue, native.value]);
  const summary =
    latitude !== null && longitude !== null
      ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
      : value !== null
        ? `${value}${unit ? ` ${unit}` : ''}${application && record.domain === 'time' ? ` · ${application}` : ''}`
        : typeof category === 'string'
          ? category
          : (application ?? metric);
  const archive = record.type === 'archive' || record.source === 'imported-original';
  /** @type {Record<string,Scalar>} */
  const fields = {
    domain: record.domain,
    type: record.type,
    metric,
    source: record.source,
    start: record.start,
    end: record.end,
    value,
    unit,
    duration,
    application,
    latitude,
    longitude,
    accuracy,
  };
  flatten(record.native, 'native', fields);
  return {
    id,
    domain: record.domain,
    type: record.type,
    metric,
    source: record.source,
    start: record.start,
    end: record.end,
    value,
    unit,
    duration,
    application,
    latitude,
    longitude,
    accuracy,
    summary,
    archive,
    fields,
    provenance: [provenance],
  };
}
/** @param {Scalar|undefined} actual @param {Filter} filter */
function matchesFilter(actual, filter) {
  const missing = actual === null || actual === undefined;
  if (filter.operator === 'missing') return missing;
  if (filter.operator === 'exists') return !missing;
  if (missing) return false;
  if (filter.operator === 'contains')
    return String(actual).toLowerCase().includes(filter.value.toLowerCase());
  let expected = /** @type {Scalar} */ (filter.value);
  if (typeof actual === 'number') {
    if (!filter.value.trim() || !Number.isFinite(Number(filter.value))) return false;
    expected = Number(filter.value);
  }
  if (typeof actual === 'boolean') {
    if (!['true', 'false'].includes(filter.value)) return false;
    expected = filter.value === 'true';
  }
  if (filter.operator === 'eq') return actual === expected;
  if (filter.operator === 'ne') return actual !== expected;
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  switch (filter.operator) {
    case 'gt':
      return actual > expected;
    case 'gte':
      return actual >= expected;
    case 'lt':
      return actual < expected;
    case 'lte':
      return actual <= expected;
    default:
      return false;
  }
}
/** @param {ExplorerRow} row @param {ExplorerQuery} query */
export function matchesQuery(row, query) {
  return (
    (!query.domain || row.domain === query.domain) &&
    (!query.metric || row.type === query.metric) &&
    (!query.source || row.source === query.source) &&
    (!query.start || (row.start !== null && row.start >= query.start)) &&
    (!query.end || (row.start !== null && row.start < query.end)) &&
    query.filters.every((filter) => matchesFilter(row.fields[filter.field], filter))
  );
}
/** @param {ExplorerRow[]} rows @param {ExplorerQuery} query */
export function sortRecords(rows, query) {
  return sorted(rows, (a, b) => {
    const left = a.fields[query.sort],
      right = b.fields[query.sort];
    if (left === null || left === undefined)
      return right === null || right === undefined ? a.id.localeCompare(b.id) : 1;
    if (right === null || right === undefined) return -1;
    const comparison =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right));
    return (query.direction === 'asc' ? comparison : -comparison) || a.id.localeCompare(b.id);
  });
}
/** @param {ExplorerRow} row */
function additive(row) {
  return (
    row.domain === 'time' ||
    /(?:ActiveEnergyBurned|BasalEnergyBurned|StepCount|Distance|FlightsClimbed|Dietary|ExerciseTime|MoveTime)$/.test(
      row.type,
    )
  );
}
/** @param {ExplorerRow[]} rows @param {ExplorerQuery} query */
export function visualizeRecords(rows, query) {
  const numeric = rows.filter((row) => row.value !== null);
  const groups = new Set(numeric.map((row) => `${row.type}\u0000${row.unit ?? ''}`));
  const compatible = groups.size === 1;
  const aggregation =
    !compatible || query.aggregation === 'count'
      ? 'count'
      : query.aggregation === 'auto'
        ? numeric.length && numeric.every(additive)
          ? 'sum'
          : 'mean'
        : query.aggregation;
  const unit = aggregation === 'count' ? 'records' : (numeric[0]?.unit ?? 'value');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: query.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(query.bucket === 'hour' ? { hour: '2-digit', hourCycle: 'h23' } : {}),
  });
  /** @type {Map<string,{sum:number,count:number,records:number,min:number,max:number}>} */
  const buckets = new Map();
  for (const row of rows) {
    if (!row.start || !Number.isFinite(Date.parse(row.start))) continue;
    const parts = formatter.formatToParts(new Date(row.start));
    const part = (/** @type {string} */ name) => parts.find((p) => p.type === name)?.value ?? '';
    const key = `${part('year')}-${part('month')}-${part('day')}${query.bucket === 'hour' ? `T${part('hour')}:00` : ''}`;
    const bucket = buckets.get(key) ?? {
      sum: 0,
      count: 0,
      records: 0,
      min: Infinity,
      max: -Infinity,
    };
    bucket.records++;
    if (row.value !== null) {
      bucket.sum += row.value;
      bucket.count++;
      bucket.min = Math.min(bucket.min, row.value);
      bucket.max = Math.max(bucket.max, row.value);
    }
    buckets.set(key, bucket);
  }
  const trend = sorted([...buckets], ([a], [b]) => a.localeCompare(b)).map(([date, b]) => ({
    date,
    value:
      aggregation === 'count'
        ? b.records
        : b.count
          ? aggregation === 'sum'
            ? b.sum
            : b.sum / b.count
          : null,
    count: b.records,
    min: b.count && compatible ? b.min : null,
    max: b.count && compatible ? b.max : null,
  }));
  const values = compatible ? numeric.map((row) => row.value ?? 0) : [];
  const minimum = values.length ? Math.min(...values.slice(0, 100000)) : 0,
    maximum = values.length ? Math.max(...values.slice(0, 100000)) : 0;
  const width = maximum === minimum ? 1 : (maximum - minimum) / 12;
  const distribution = values.length
    ? Array.from({ length: maximum === minimum ? 1 : 12 }, (_v, i) => ({
        label: `${(minimum + i * width).toFixed(2)}–${(minimum + (i + 1) * width).toFixed(2)}`,
        from: minimum + i * width,
        to: minimum + (i + 1) * width,
        count: 0,
      }))
    : [];
  for (const value of values) {
    const bin =
      distribution[Math.min(distribution.length - 1, Math.floor((value - minimum) / width))];
    if (bin) bin.count++;
  }
  /** @type {Map<string,{value:number,count:number}>} */
  const rankingMap = new Map();
  for (const row of rows) {
    const label = row.application ?? row.metric,
      entry = rankingMap.get(label) ?? { value: 0, count: 0 };
    entry.value += aggregation === 'count' ? 1 : (row.value ?? 0);
    entry.count += row.value !== null ? 1 : 0;
    rankingMap.set(label, entry);
  }
  const ranking = sorted(
    [...rankingMap].map(([label, v]) => ({
      label,
      value: aggregation === 'mean' && v.count ? v.value / v.count : v.value,
    })),
    (a, b) => b.value - a.value,
  ).slice(0, 20);
  const intervals = rows
    .filter((row) => row.start && row.end && row.duration !== null && row.duration > 0)
    .slice(0, 200)
    .map((row) => ({
      id: row.id,
      label: row.application ?? row.summary,
      start: row.start,
      end: row.end,
      duration: row.duration ?? 0,
    }));
  const locations = rows.filter(
    (row) =>
      row.latitude !== null &&
      row.longitude !== null &&
      Math.abs(row.latitude) <= 90 &&
      Math.abs(row.longitude) <= 180,
  );
  const stride = Math.max(1, Math.ceil(locations.length / 1000));
  const points = locations
    .filter((_row, i) => i % stride === 0)
    .map((row) => ({
      id: row.id,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy: row.accuracy,
      start: row.start,
    }));
  return {
    aggregation,
    unit,
    compatible,
    trend,
    distribution,
    ranking,
    intervals,
    points,
    locationCount: locations.length,
    intervalCount: rows.filter((row) => row.duration !== null && row.duration > 0).length,
    undated: rows.filter((row) => !row.start || !Number.isFinite(Date.parse(row.start))).length,
  };
}
