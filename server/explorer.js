import { sorted } from '../core/collections.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { cloud } from './cloud.js';
import { PairingError } from './store.js';
import {
  createBucketKey,
  normalizeRecord,
  matchesQuery,
  sortRecords,
  visualizeRecords,
} from '../core/explorer.js';
const filterSchema = z.object({
  field: z.string().min(1).max(200),
  operator: z.enum(['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'missing']),
  value: z.string().max(500).default(''),
});
const instant = z
  .string()
  .max(40)
  .refine(
    (value) =>
      !value || (Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value),
    'Use an ISO UTC timestamp.',
  );
const schema = z
  .object({
    exportIds: z.array(z.string().uuid()).max(128).default([]),
    profileIds: z.array(z.string().max(100)).max(128).default([]),
    deviceIds: z.array(z.string().uuid()).max(128).default([]),
    domain: z.enum(['', 'health', 'time', 'location']).default(''),
    metric: z.string().max(200).default(''),
    source: z.string().max(200).default(''),
    start: instant.default(''),
    end: instant.default(''),
    timezone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions();
          return true;
        } catch {
          return false;
        }
      }, 'Unknown timezone.')
      .default('UTC'),
    filters: z.array(filterSchema).max(12).default([]),
    sort: z.string().max(200).default('start'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    offset: z.number().int().min(0).max(100000).default(0),
    limit: z.number().int().min(1).max(100).default(50),
    deduplicate: z.boolean().default(true),
    includeArchives: z.boolean().default(false),
    aggregation: z.enum(['auto', 'sum', 'mean', 'count']).default('auto'),
    bucket: z.enum(['day', 'hour']).default('day'),
  })
  .refine(
    (query) => !query.start || !query.end || query.start < query.end,
    'End must be after start.',
  );
/** Canonical order makes exact overlap detection independent of JSON key ordering.
 * @param {unknown} value @returns {string} */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${sorted(Object.entries(value), ([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
/** Owner-only, full-result query. Never writes derived records or indexes to disk.
 * @param {string} subject @param {unknown} input */
export function explore(subject, input) {
  const query = schema.parse(input);
  const bucketKey = createBucketKey(query.timezone, query.bucket);
  cloud.cleanup();
  const exports = cloud.list(subject);
  for (const id of query.exportIds)
    if (!exports.some((item) => item.id === id))
      throw new PairingError(404, 'Cloud export not found.');
  const scoped = exports.filter(
    (item) =>
      (!query.exportIds.length || query.exportIds.includes(item.id)) &&
      (!query.profileIds.length || query.profileIds.includes(item.profileId)) &&
      (!query.deviceIds.length || query.deviceIds.includes(item.deviceId)),
  );
  /** @type {import('../core/explorer.js').ExplorerRow[]} */
  const rows = [];
  /** @type {Map<string,import('../core/explorer.js').ExplorerRow>} */
  const unique = new Map();
  let scanned = 0,
    duplicates = 0,
    archives = 0;
  for (const item of scoped) {
    const stored = cloud.row(subject, item.id);
    if (!stored.content) continue;
    const records = cloud.records(stored, cloud.open(stored.content, `${subject}|${item.id}`));
    scanned += records.length;
    if (scanned > 100000)
      throw new PairingError(
        413,
        'This exploration exceeds 100,000 records. Select fewer exports or profiles; no partial chart was produced.',
      );
    /** @type {Map<string,number>} */
    const occurrences = new Map();
    for (const [index, record] of records.entries()) {
      const provenance = {
        exportId: item.id,
        index,
        profileId: item.profileId,
        profileName: item.profileName,
        deviceId: item.deviceId,
        day: item.day,
      };
      const row = normalizeRecord(record, provenance, `${item.id}:${index}`);
      row.fields.bucket = bucketKey(row.start);
      if (row.archive && !query.includeArchives) {
        archives++;
        continue;
      }
      const fingerprint = createHash('sha256').update(canonical(record)).digest('hex');
      const occurrence = occurrences.get(fingerprint) ?? 0;
      occurrences.set(fingerprint, occurrence + 1);
      const key = `${fingerprint}:${occurrence}`;
      const previous = query.deduplicate ? unique.get(key) : undefined;
      if (previous) {
        previous.provenance.push(provenance);
        duplicates++;
        continue;
      }
      unique.set(key, row);
      rows.push(row);
    }
  }
  const metrics = sorted(
    [
      ...new Map(
        rows.map((row) => [row.type, { type: row.type, label: row.metric, domain: row.domain }]),
      ).values(),
    ],
    (a, b) => a.label.localeCompare(b.label),
  );
  /** @type {Map<string,Set<string>>} */
  const discovered = new Map();
  for (const row of rows)
    for (const [field, value] of Object.entries(row.fields)) {
      if (discovered.size >= 256 && !discovered.has(field)) continue;
      const types = discovered.get(field) ?? new Set();
      if (value !== null)
        types.add(
          typeof value === 'string' &&
            /^\d{4}-\d{2}-\d{2}T/.test(value) &&
            Number.isFinite(Date.parse(value))
            ? 'date'
            : typeof value,
        );
      discovered.set(field, types);
    }
  const fields = sorted(
    [...discovered].map(([field, types]) => ({
      field,
      type: types.size === 1 ? ([...types][0] ?? 'string') : 'mixed',
    })),
    (a, b) => a.field.localeCompare(b.field),
  );
  const matched = sortRecords(
    rows.filter((row) => matchesQuery(row, query)),
    query,
  );
  const visuals = visualizeRecords(matched, query);
  return {
    query,
    rows: matched.slice(query.offset, query.offset + query.limit).map((row) =>
      Object.assign({}, row, {
        summary: row.summary.length > 256 ? `${row.summary.slice(0, 256)}…` : row.summary,
        fields: Object.fromEntries(
          Object.entries(row.fields).map(([field, value]) => [
            field,
            typeof value === 'string' && value.length > 256 ? `${value.slice(0, 256)}…` : value,
          ]),
        ),
      }),
    ),
    total: matched.length,
    scanned,
    duplicates,
    archives,
    nextOffset: query.offset + query.limit < matched.length ? query.offset + query.limit : null,
    facets: { metrics, sources: sorted([...new Set(rows.map((row) => row.source))]), fields },
    visuals,
    warnings: [
      ...(duplicates
        ? [`${duplicates} exact overlapping records collapsed; all export origins are retained.`]
        : []),
      ...(archives ? [`${archives} original archive containers excluded from analysis.`] : []),
      ...(!visuals.compatible && matched.some((row) => row.value !== null)
        ? [
            'Multiple metrics or units: charts show record counts. Select one metric and unit for numeric aggregation.',
          ]
        : []),
      ...(visuals.undated
        ? [
            `${visuals.undated} records have no valid start time and are excluded from the time chart.`,
          ]
        : []),
      'Field discovery includes up to 256 scalar paths (five nested levels). Table text previews are capped at 256 characters; record details retain the complete original payload.',
      'Totals describe stored samples. Source aggregates may overlap; only exact duplicate records are collapsed. Sleep intervals can overlap and are not added into nightly totals.',
    ],
  };
}
/** @param {string} subject @param {URLSearchParams} query */
export function recordDetail(subject, query) {
  const id = z.string().uuid().parse(query.get('export')),
    index = z.coerce.number().int().min(0).max(49999).parse(query.get('index'));
  cloud.cleanup();
  const row = cloud.row(subject, id);
  if (!row.content) throw new PairingError(404, 'Cloud export not found.');
  const record = cloud.records(row, cloud.open(row.content, `${subject}|${id}`))[index];
  if (!record) throw new PairingError(404, 'Record not found.');
  return { record };
}
