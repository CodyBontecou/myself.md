/** @typedef {Record<string,unknown> & {timestamp:string|null,value:unknown,unit?:string|undefined,metadata?:unknown,offsetSeconds?:number|undefined}} TimePoint */
/** @typedef {Record<string,TimePoint[]>} TimeSeries */
/** Explicit observations are a projection; the original payload remains authoritative.
 * No sorting, resampling, deduplication or numeric unit conversion takes place.
 * @param {unknown} value @returns {Record<string,unknown>} */
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string,unknown>} */ (value)
    : {};
}
/** @param {unknown} value @returns {string|null} */
function instant(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
/** @param {Record<string,unknown>} sample @param {string|null} start @param {unknown} value @param {string} [unit] @returns {TimePoint} */
function point(sample, start, value, unit) {
  const timeKey = ['timestamp', 'time', 'startDate', 'startTime', 'date'].find(
    (key) => sample[key] !== undefined,
  );
  const time = timeKey ? sample[timeKey] : undefined;
  return {
    ...sample,
    timestamp: time === undefined ? start : instant(time),
    value,
    ...(unit ? { unit } : {}),
    ...(sample.metadata === undefined ? {} : { metadata: sample.metadata }),
  };
}
/** @param {Record<string,unknown>} sample @param {unknown} fallback */
function observation(sample, fallback) {
  if (sample.quantity !== undefined) return sample.quantity;
  if (sample.value !== undefined) return sample.value;
  for (const key of ['beatsPerMinute', 'revolutionsPerMinute', 'rate'])
    if (sample[key] !== undefined) return sample[key];
  for (const [key, unitKey] of [
    ['speed', 'inMetersPerSecond'],
    ['power', 'inWatts'],
    ['delta', 'inCelsius'],
  ]) {
    if (!key || !unitKey) continue;
    const value = object(sample[key])[unitKey];
    if (value !== undefined) return value;
  }
  return fallback;
}
/** @param {Record<string,unknown>} sample */
function observationUnit(sample) {
  if (typeof sample.unit === 'string') return sample.unit;
  if (
    sample.beatsPerMinute !== undefined ||
    sample.revolutionsPerMinute !== undefined ||
    sample.rate !== undefined
  )
    return 'count/min';
  if (object(sample.speed).inMetersPerSecond !== undefined) return 'm/s';
  if (object(sample.power).inWatts !== undefined) return 'W';
  if (object(sample.delta).inCelsius !== undefined) return 'degC';
  return undefined;
}
/** Keep nested observations, including unknown future series, as complete values.
 * @param {unknown} payload @param {string|null} start @returns {TimeSeries} */
export function explicitTimeSeries(payload, start) {
  const native = object(payload);
  /** @type {TimeSeries} */ const series = {};
  if (
    !Array.isArray(native.quantitySeries) &&
    (native.quantity !== undefined || native.value !== undefined)
  )
    series.samples = [
      point(
        native,
        start,
        observation(native, native),
        typeof native.unit === 'string' ? native.unit : undefined,
      ),
    ];
  for (const key of [
    'samples',
    'quantitySeries',
    'deltas',
    'stages',
    'segments',
    'laps',
    'objects',
  ]) {
    const values = native[key];
    if (!Array.isArray(values)) continue;
    series[key] = values.flatMap((value) => {
      const sample = object(value);
      if (key === 'objects' && Array.isArray(sample.quantitySeries))
        return sample.quantitySeries.map((child) => {
          const detail = object(child);
          return point(
            { ...detail, metadata: sample.metadata },
            null,
            observation(detail, child),
            observationUnit(detail),
          );
        });
      return point(sample, null, observation(sample, value), observationUnit(sample));
    });
  }
  for (const [key, values] of Object.entries(object(native.timeSeries))) {
    if (Array.isArray(values))
      series[key] = values.map((value) => {
        const sample = object(value);
        return point(
          sample,
          null,
          observation(sample, value),
          typeof sample.unit === 'string' ? sample.unit : undefined,
        );
      });
  }
  if (Array.isArray(native.routes))
    series.route = native.routes.flatMap((route) => {
      const locations = object(route).locations;
      return Array.isArray(locations)
        ? locations.map((location) => point(object(location), null, location))
        : [];
    });
  for (const [key, offsetKey, valueKey, unit] of [
    ['heartbeats', 'timeSinceSeriesStart', 'precededByGap', ''],
    ['voltages', 'timeSinceSampleStart', 'voltage', 'V'],
  ]) {
    if (!key || !offsetKey || !valueKey) continue;
    const values = native[key];
    if (!Array.isArray(values)) continue;
    series[key] = values.map((value) => {
      const sample = object(value),
        offset = sample[offsetKey];
      const timestamp =
        start && typeof offset === 'number' ? instant(Date.parse(start) + offset * 1000) : null;
      const result = point(sample, timestamp, sample[valueKey] ?? value, unit);
      if (typeof offset === 'number') result.offsetSeconds = offset;
      return result;
    });
  }
  if (!Object.keys(series).length) series.samples = [point(native, start, payload)];
  return series;
}
