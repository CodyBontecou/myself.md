/** @typedef {import('../core/explorer.js').ExplorerQuery} ExplorerQuery */
/** @param {string} id @param {number} [offset] */
export function recordRoute(id, offset = 0) {
  return `?${new URLSearchParams({ export: id, offset: String(offset) })}`;
}
const defaultColumns = ['metric', 'value', 'unit', 'start', 'source'];
/** @param {string} search */
export function readExplorerRoute(search) {
  const params = new URLSearchParams(search);
  const list = (/** @type {string} */ name) => params.get(name)?.split(',').filter(Boolean) ?? [];
  const bounded = (
    /** @type {string} */ name,
    /** @type {number} */ fallback,
    /** @type {number} */ max,
  ) => {
    const n = Number(params.get(name) ?? fallback);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
  };
  /** @type {import('../core/explorer.js').Filter[]} */
  let filters = [];
  try {
    const parsed = JSON.parse(params.get('where') ?? '[]');
    if (Array.isArray(parsed))
      filters = parsed
        .filter(
          (f) =>
            f &&
            typeof f.field === 'string' &&
            typeof f.value === 'string' &&
            ['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'missing'].includes(
              f.operator,
            ),
        )
        .slice(0, 12);
  } catch {}
  /** @type {ExplorerQuery} */
  const query = {
    exportIds: list('export'),
    profileIds: list('profiles'),
    deviceIds: list('devices'),
    domain: params.get('domain') ?? '',
    metric: params.get('metric') ?? '',
    source: params.get('source') ?? '',
    start: params.get('from') ?? '',
    end: params.get('to') ?? '',
    timezone: params.get('tz') ?? 'UTC',
    filters,
    sort: params.get('sort') ?? 'start',
    direction: params.get('order') === 'asc' ? 'asc' : 'desc',
    offset: bounded('offset', 0, 100000),
    limit: bounded('limit', 50, 100) || 50,
    deduplicate: params.get('overlaps') !== 'all',
    includeArchives: params.get('archives') === '1',
    aggregation: ['sum', 'mean', 'count'].includes(params.get('aggregate') ?? '')
      ? /** @type {'sum'|'mean'|'count'} */ (params.get('aggregate'))
      : 'auto',
    bucket: params.get('bucket') === 'hour' ? 'hour' : 'day',
  };
  return {
    query,
    chart: params.get('chart') ?? 'auto',
    columns: list('columns').length
      ? list('columns')
      : query.domain === 'location'
        ? ['start', 'latitude', 'longitude', 'accuracy', 'source']
        : query.domain === 'time'
          ? ['application', 'duration', 'start', 'end', 'source']
          : /sleep/i.test(query.metric)
            ? ['metric', 'category', 'duration', 'start', 'end', 'source']
            : defaultColumns,
    record: params.get('record') ?? '',
  };
}
/** @param {ExplorerQuery} query @param {{chart:string,columns:string[],record:string}} view */
export function explorerRoute(query, view) {
  const params = new URLSearchParams({ explore: '1' });
  if (query.exportIds.length) params.set('export', query.exportIds.join(','));
  if (query.profileIds.length) params.set('profiles', query.profileIds.join(','));
  if (query.deviceIds.length) params.set('devices', query.deviceIds.join(','));
  for (const [key, value] of Object.entries({
    domain: query.domain,
    metric: query.metric,
    source: query.source,
    from: query.start,
    to: query.end,
    tz: query.timezone,
    sort: query.sort,
    order: query.direction,
    offset: String(query.offset),
    limit: String(query.limit),
    aggregate: query.aggregation,
    bucket: query.bucket,
    chart: view.chart,
    columns: view.columns.join(','),
    record: view.record,
  }))
    if (value) params.set(key, value);
  if (query.filters.length) params.set('where', JSON.stringify(query.filters));
  if (!query.deduplicate) params.set('overlaps', 'all');
  if (query.includeArchives) params.set('archives', '1');
  return `?${params}`;
}
