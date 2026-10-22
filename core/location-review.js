import { sorted } from './collections.js';
/** @typedef {{id:string,start:string,latitude:number,longitude:number,accuracy:number|null,exportIds:string[]}} LocationPoint */
/** Recorded points only: no route, visits, distance or dwell-time inference.
 * @param {import('./health-review.js').HealthDay[]} days
 * @param {{exportId:string,record:import('./data.js').DataRecord}[]} rows
 * @param {string} timezone */
export function locationReview(days, rows, timezone) {
  /** @type {Map<string,{source:string,type:string,points:LocationPoint[]}>} */
  const groups = new Map();
  /** @type {Map<string,LocationPoint>} */
  const seen = new Map();
  const counts = { invalid: 0, duplicates: 0, unsupported: 0 };
  let fictional = rows.length > 0;
  for (const { record: r, exportId } of rows) {
    if (r.domain !== 'location') continue;
    const n =
      r.native && typeof r.native === 'object'
        ? /** @type {Record<string,unknown>} */ (r.native)
        : {};
    fictional &&= n.fictional === true;
    if (r.type !== 'points') {
      counts.unsupported++;
      continue;
    }
    const c =
      n.coords && typeof n.coords === 'object'
        ? /** @type {Record<string,unknown>} */ (n.coords)
        : n;
    const latitude = c.latitude,
      longitude = c.longitude,
      accuracy = c.accuracy;
    const time = Date.parse(r.start ?? '');
    if (
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180 ||
      !Number.isFinite(time)
    ) {
      counts.invalid++;
      continue;
    }
    if (!days.some((d) => time >= Date.parse(d.start) && time < Date.parse(d.end))) continue;
    const key = JSON.stringify([r.source, r.type]);
    const identity = JSON.stringify([key, time, n]);
    const prior = seen.get(identity);
    if (prior) {
      counts.duplicates++;
      if (!prior.exportIds.includes(exportId)) prior.exportIds.push(exportId);
      continue;
    }
    const point = {
      id: String(seen.size + 1),
      start: new Date(time).toISOString(),
      latitude,
      longitude,
      accuracy:
        typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0
          ? accuracy
          : null,
      exportIds: [exportId],
    };
    seen.set(identity, point);
    if (!groups.has(key)) groups.set(key, { source: r.source, type: r.type, points: [] });
    groups.get(key)?.points.push(point);
  }
  return {
    version: 'myself.md.location-review.v1',
    timezone,
    fictional,
    days,
    counts,
    series: [...groups.values()].map((s) => ({
      source: s.source,
      type: s.type,
      points: sorted(s.points, (a, b) => a.start.localeCompare(b.start)),
      daily: days.map((d) => {
        const points = s.points.filter(
          (p) =>
            Date.parse(p.start) >= Date.parse(d.start) && Date.parse(p.start) < Date.parse(d.end),
        );
        return { date: d.date, count: points.length || null, pointIds: points.map((p) => p.id) };
      }),
    })),
    warnings: [
      'Recorded points do not establish a complete route, confirmed visits, distance traveled or time spent at a place. Gaps are unknown.',
      'The coordinate plot uses latitude/longitude degrees, not a distance-preserving map. No external map tiles or geocoding requests are made. Accuracy is the provider-reported radius in meters; absent or invalid accuracy is unknown.',
      'Only points records are supported. Sources remain separate. The plot shows at most 1,000 evenly sampled points; all accepted points remain available in daily paginated details.',
    ],
  };
}
