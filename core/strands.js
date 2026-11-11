import { healthReview } from './health-review.js';
import { heartRateContext } from './heart-rate-context.js';
import { locationReview } from './location-review.js';
import { usageRecordGroups } from './screen-time-review.js';
import { sorted } from './collections.js';

/** @typedef {import('./screen-time-review.js').ReviewRecord} ReviewRecord */
/** @typedef {import('./screen-time-review.js').ReviewDay} ReviewDay */
/** @typedef {import('./attention-heatmap.js').ReviewHourSlot} HourSlot */
/** @typedef {{id:string,label:string,latitude:number,longitude:number,points:number}} StrandsPlace */
/** @typedef {{kind:'phone_down',cutoffHour:number,allowanceMinutes:number}} StrandsRule */
/** @typedef {{id:string,title:string,rule:StrandsRule,startDate:string,nights:number,timezone:string,createdAt:string,cancelledAt:string|null,sourcePattern:string|null}} StrandsExperiment */

/** Native types each strand reads. Agents and the phone use the same list. */
export const strandsTypes = {
  health: [
    'HKQuantityTypeIdentifierHeartRate',
    'HeartRate',
    'HKCategoryTypeIdentifierSleepAnalysis',
    'SleepSession',
    'HKQuantityTypeIdentifierStepCount',
    'Steps',
    'HKQuantityTypeIdentifierRestingHeartRate',
    'RestingHeartRate',
  ],
  time: ['applications', 'application', 'websites', 'sessions'],
  location: ['points'],
};

const placeRadiusMeters = 150;
const runGapMs = 60 * 60000;
const minimumGroup = 3;
const minimumPlacePoints = 3;
const minimumStayMs = 10 * 60000;
// Grid cells about 330 m tall, so a 150 m radius only needs neighbouring cells.
const cellDegrees = 0.003;
const momentSpacingMs = 15 * 60000;

/** @param {number} a @param {number} b @param {number} c @param {number} d */
function meters(a, b, c, d) {
  const rad = Math.PI / 180,
    x = (d - b) * rad * Math.cos(((a + c) / 2) * rad),
    y = (c - a) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
}

/** @param {number[]} values */
function median(values) {
  const ordered = sorted(values, (a, b) => a - b);
  if (!ordered.length) return null;
  const mid = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? (ordered[mid] ?? null)
    : ((ordered[mid - 1] ?? 0) + (ordered[mid] ?? 0)) / 2;
}

/** Slot containing [start,end], by binary search over slots sorted by start.
 * @param {HourSlot[]} slots */
function slotFinder(slots) {
  const ordered = sorted(slots, (a, b) => a.start - b.start);
  /** @param {number} start @param {number} [end] */
  return (start, end = start) => {
    let lo = 0,
      hi = ordered.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const slot = ordered[mid];
      if (!slot) break;
      if (start < slot.start) hi = mid - 1;
      else if (start >= slot.end) lo = mid + 1;
      else return end <= slot.end ? slot : undefined;
    }
    return undefined;
  };
}

/** Group recorded points into numbered places by proximity. No geocoding; labels are
 * ranked by recorded point count so "Place 1" is the most-recorded location.
 * @param {ReviewDay[]} days @param {ReviewRecord[]} rows @param {string} timezone
 * @returns {StrandsPlace[]} */
export function strandsPlaces(days, rows, timezone) {
  const points = locationReview(days, rows, timezone).series.flatMap((s) => s.points);
  /** @type {{latitude:number,longitude:number,points:number,stayMs:number}[]} */
  const clusters = [];
  /** @type {Map<string,(typeof clusters)[number][]>} */
  const grid = new Map();
  /** @type {{cluster:(typeof clusters)[number],start:number,last:number}|null} */
  let visit = null;
  for (const p of sorted(points, (a, b) => a.start.localeCompare(b.start))) {
    const time = Date.parse(p.start);
    const cx = Math.floor(p.latitude / cellDegrees),
      cy = Math.floor(p.longitude / cellDegrees);
    let near;
    for (let dx = -1; dx <= 1 && !near; dx++)
      for (let dy = -1; dy <= 1 && !near; dy++)
        near = grid
          .get(`${cx + dx}:${cy + dy}`)
          ?.find(
            (c) => meters(c.latitude, c.longitude, p.latitude, p.longitude) <= placeRadiusMeters,
          );
    if (near) {
      near.latitude += (p.latitude - near.latitude) / (near.points + 1);
      near.longitude += (p.longitude - near.longitude) / (near.points + 1);
      near.points++;
    } else {
      near = { latitude: p.latitude, longitude: p.longitude, points: 1, stayMs: 0 };
      clusters.push(near);
      const key = `${cx}:${cy}`;
      grid.set(key, [...(grid.get(key) ?? []), near]);
    }
    // A visit continues while consecutive points stay in one cluster without a long gap.
    if (visit && visit.cluster === near && time - visit.last <= runGapMs) visit.last = time;
    else visit = { cluster: near, start: time, last: time };
    near.stayMs = Math.max(near.stayMs, visit.last - visit.start);
  }
  // A place needs repeated points and at least one stay; points passed while moving stay unlisted.
  return sorted(
    clusters.filter((c) => c.points >= minimumPlacePoints && c.stayMs >= minimumStayMs),
    (a, b) => b.points - a.points,
  ).map((c, index) => ({
    id: `place-${index + 1}`,
    label: `Place ${index + 1}`,
    latitude: c.latitude,
    longitude: c.longitude,
    points: c.points,
  }));
}

/** @param {StrandsPlace[]} places @param {number} latitude @param {number} longitude */
function placeOf(places, latitude, longitude) {
  let best = /** @type {StrandsPlace|null} */ (null),
    distance = Infinity;
  for (const place of places) {
    const d = meters(place.latitude, place.longitude, latitude, longitude);
    if (d < distance) [best, distance] = [place, d];
  }
  return best && distance <= placeRadiusMeters * 2 ? best.id : null;
}

/** Observed attention per local clock hour from one usage series. Series are never summed:
 * the series with the most observed duration is chosen and named.
 * @param {ReviewDay[]} days @param {ReviewRecord[]} rows @param {HourSlot[]} slots */
function attentionHours(days, rows, slots) {
  const { groups, counts } = usageRecordGroups(days, rows);
  const candidates = [...groups.values()].map((g) =>
    Object.assign({}, g, { rows: g.rows.filter((r) => !r.conflict) }),
  );
  const chosen = sorted(
    candidates,
    (a, b) =>
      b.rows.reduce((s, r) => s + r.durationMs, 0) - a.rows.reduce((s, r) => s + r.durationMs, 0),
  )[0];
  /** @type {Map<string,{minutes:number,apps:Map<string,{name:string,minutes:number}>}>} */
  const cells = new Map();
  let unallocated = 0;
  const findSlot = slotFinder(slots);
  for (const row of chosen?.rows ?? []) {
    const slot = findSlot(row.start, row.end);
    if (!slot) {
      unallocated++;
      continue;
    }
    const key = `${slot.date}:${slot.hour}`;
    const cell = cells.get(key) ?? { minutes: 0, apps: new Map() };
    cell.minutes += row.durationMs / 60000;
    const app = cell.apps.get(row.identifier) ?? { name: row.name, minutes: 0 };
    app.minutes += row.durationMs / 60000;
    cell.apps.set(row.identifier, app);
    cells.set(key, cell);
  }
  /** @type {Set<string>} */
  const observedDates = new Set();
  for (const row of chosen?.rows ?? []) {
    const day = days[row.day];
    if (day) observedDates.add(day.date);
  }
  return {
    series: chosen
      ? {
          source: chosen.source,
          type: chosen.type,
          granularity: chosen.granularity,
          device: chosen.device,
        }
      : null,
    otherSeries: Math.max(0, candidates.length - 1),
    observedDates,
    unallocated,
    counts,
    /** @param {string} date @param {number} hour */
    cell(date, hour) {
      const cell = cells.get(`${date}:${hour}`);
      if (!cell) return { minutes: observedDates.has(date) ? 0 : null, apps: [] };
      return {
        minutes: Math.round(cell.minutes * 10) / 10,
        apps: sorted([...cell.apps.values()], (a, b) => b.minutes - a.minutes)
          .slice(0, 3)
          .map((a) => ({ name: a.name, minutes: Math.round(a.minutes) })),
      };
    },
  };
}

const asleepKinds = new Set(['Asleep', 'Core', 'Light', 'Deep', 'REM']);
/** @param {number[]} values */
const sum = (values) => values.reduce((a, b) => a + b, 0);

/** Body signals besides heart-rate samples: sleep intervals, hourly steps from the source
 * with most steps, and the day's latest resting heart rate. Observed values only.
 * @param {ReviewDay} day @param {ReviewRecord[]} rows @param {HourSlot[]} daySlots @param {string} timezone */
function bodySignals(day, rows, daySlots, timezone) {
  const dayStart = Date.parse(day.start),
    dayEnd = Date.parse(day.end);
  const sleepSeries = healthReview([day], rows, timezone).series.filter((x) => x.kind === 'sleep');
  const sleepSource = sorted(
    sleepSeries,
    (a, b) =>
      b.daily.reduce((n, d) => n + d.intervals.length, 0) -
      a.daily.reduce((n, d) => n + d.intervals.length, 0),
  )[0];
  /** @type {{start:string,end:string,kind:string}[]} */
  const sleep = sorted(
    (sleepSource?.daily ?? [])
      .flatMap((d) => d.intervals)
      .filter((i) => asleepKinds.has(i.kind))
      .map((i) => ({
        start: Math.max(Date.parse(i.start), dayStart),
        end: Math.min(Date.parse(i.end), dayEnd),
        kind: i.kind,
      }))
      .filter((i) => i.end > i.start),
    (a, b) => a.start - b.start,
  ).map((i) => ({
    start: new Date(i.start).toISOString(),
    end: new Date(i.end).toISOString(),
    kind: i.kind,
  }));
  let asleepMs = 0,
    edge = -Infinity;
  for (const i of sleep) {
    const a = Date.parse(i.start),
      b = Date.parse(i.end);
    asleepMs += Math.max(0, b - Math.max(edge, a));
    edge = Math.max(edge, b);
  }
  /** Step series stay separate per source and device; phone and watch counts are never summed.
   * @type {Map<string,number[]>} */
  const stepSeries = new Map();
  /** @type {{time:string,bpm:number}|null} */
  let resting = null;
  for (const { record: r } of rows) {
    if (r.domain !== 'health') continue;
    const n = /** @type {Record<string,unknown>} */ (
      r.native && typeof r.native === 'object' ? r.native : {}
    );
    const start = Date.parse(r.start ?? ''),
      end = Date.parse(r.end ?? r.start ?? '');
    if (!Number.isFinite(start) || start >= dayEnd || Math.max(end, start) < dayStart) continue;
    const value = typeof n.quantity === 'number' ? n.quantity : n.count;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
    if (r.type === 'HKQuantityTypeIdentifierRestingHeartRate' || r.type === 'RestingHeartRate') {
      const unit = String(n.unit ?? 'count/min');
      if (value > 0 && ['count/min', 'bpm'].includes(unit) && start >= dayStart)
        if (!resting || start > Date.parse(resting.time))
          resting = { time: new Date(start).toISOString(), bpm: Math.round(value) };
      continue;
    }
    if (r.type !== 'HKQuantityTypeIdentifierStepCount' && r.type !== 'Steps') continue;
    if (r.type !== 'Steps' && n.unit !== 'count') continue;
    const metadata = /** @type {Record<string,unknown>} */ (
      n.metadata && typeof n.metadata === 'object' ? n.metadata : {}
    );
    const key = JSON.stringify([
      r.source,
      r.type,
      n.sourceRevision ?? metadata.dataOrigin ?? '',
      n.device ?? '',
    ]);
    const hours = stepSeries.get(key) ?? daySlots.map(() => 0);
    const length = Math.max(end - start, 1);
    daySlots.forEach((slot, index) => {
      const overlap = Math.min(slot.end, Math.max(end, start + 1)) - Math.max(slot.start, start);
      if (overlap > 0) hours[index] = (hours[index] ?? 0) + (value * overlap) / length;
    });
    stepSeries.set(key, hours);
  }
  const stepHours = sorted([...stepSeries.values()], (a, b) => sum(b) - sum(a))[0] ?? [];
  const steps = daySlots
    .map((slot, index) => ({
      start: new Date(slot.start).toISOString(),
      end: new Date(slot.end).toISOString(),
      count: Math.round(stepHours[index] ?? 0),
    }))
    .filter((h) => h.count > 0);
  return {
    sleep,
    sleepMinutes: Math.round(asleepMs / 60000),
    steps,
    stepsTotal: steps.length ? steps.reduce((a, h) => a + h.count, 0) : null,
    stepSources: stepSeries.size,
    resting,
  };
}

/** One local day braided into Place, Attention and Body. Observed values only.
 * @param {ReviewDay} day @param {ReviewRecord[]} rows @param {HourSlot[]} slots
 * @param {string} timezone @param {StrandsPlace[]} [places] */
export function strandsDay(day, rows, slots, timezone, places) {
  const days = [day];
  const daySlots = slots.filter((s) => s.date === day.date);
  const known = places ?? strandsPlaces(days, rows, timezone);
  const points = locationReview(days, rows, timezone)
    .series.flatMap((s) => s.points)
    .map((p) => ({ time: p.start, placeId: placeOf(known, p.latitude, p.longitude) }));
  const ordered = sorted(points, (a, b) => a.time.localeCompare(b.time));
  /** @type {{placeId:string|null,start:string,end:string,points:number}[]} */
  const runs = [];
  for (const p of ordered) {
    const last = runs.at(-1);
    if (
      last &&
      last.placeId === p.placeId &&
      Date.parse(p.time) - Date.parse(last.end) <= runGapMs
    ) {
      last.end = p.time;
      last.points++;
    } else runs.push({ placeId: p.placeId, start: p.time, end: p.time, points: 1 });
  }
  const usage = attentionHours(days, rows, daySlots);
  const hours = daySlots.map((s) => ({
    hour: s.hour,
    start: new Date(s.start).toISOString(),
    end: new Date(s.end).toISOString(),
    ...usage.cell(day.date, s.hour),
  }));
  const heart = heartRateContext(days, rows, [], 'time', timezone, 60, daySlots);
  const signals = bodySignals(day, rows, daySlots, timezone);
  const source = sorted(heart.healthSources, (a, b) => b.samples.length - a.samples.length)[0];
  const samples = (source?.samples ?? []).map((s) => ({ time: s.time, bpm: s.bpm }));
  const peak = samples.reduce(
    (best, s) => (!best || s.bpm > best.bpm ? s : best),
    /** @type {{time:string,bpm:number}|null} */ (null),
  );
  const observedHours = hours.filter((h) => h.minutes !== null);
  const totalMinutes = observedHours.length
    ? Math.round(observedHours.reduce((s, h) => s + (h.minutes ?? 0), 0))
    : null;
  const busiest = observedHours.reduce(
    (best, h) => (!best || (h.minutes ?? 0) > (best.minutes ?? 0) ? h : best),
    /** @type {(typeof hours)[number]|null} */ (null),
  );
  /** @type {{kind:'peak_heart'|'busiest_hour'|'place_change',time:string,label:string}[]} */
  const moments = [];
  if (peak) moments.push({ kind: 'peak_heart', time: peak.time, label: `${peak.bpm} bpm peak` });
  if (busiest && (busiest.minutes ?? 0) > 0)
    moments.push({
      kind: 'busiest_hour',
      time: busiest.start,
      label: `${Math.round(busiest.minutes ?? 0)} min on phone`,
    });
  for (const run of runs
    .slice(1)
    .filter((r) => r.placeId !== null)
    .slice(0, 3))
    moments.push({
      kind: 'place_change',
      time: run.start,
      label: `At ${known.find((p) => p.id === run.placeId)?.label ?? 'an unlisted place'}`,
    });
  /** @type {typeof moments} */
  const spaced = [];
  for (const m of sorted(moments, (a, b) => a.time.localeCompare(b.time))) {
    const last = spaced.at(-1);
    if (!last || Date.parse(m.time) - Date.parse(last.time) >= momentSpacingMs) spaced.push(m);
  }
  return {
    version: 'myself.md.strands-day.v1',
    date: day.date,
    start: day.start,
    end: day.end,
    timezone,
    place: { places: known, runs, points: ordered.length },
    attention: {
      series: usage.series,
      otherSeries: usage.otherSeries,
      hours,
      totalMinutes,
      unallocatedRecords: usage.unallocated,
    },
    body: {
      samples,
      peak,
      heartSources: heart.healthSources.length,
      sleep: signals.sleep,
      steps: signals.steps,
      stepsTotal: signals.stepsTotal,
      resting: signals.resting,
    },
    moments: spaced,
    coverage: {
      placePoints: ordered.length,
      attentionObserved: usage.observedDates.has(day.date),
      heartSamples: samples.length,
      stepHours: signals.steps.length,
      sleepMinutes: signals.sleepMinutes,
    },
    warnings: [
      'Place runs join recorded points at the same place at most 60 minutes apart. Time between runs is unknown, not travel.',
      'Places are numbered by recorded point count and need at least three points and one stay of 10 minutes; points elsewhere, such as while moving, are shown as Elsewhere. No geocoding or map lookups are made.',
      ...(usage.series
        ? [
            `Attention shows one usage series (${usage.series.source} · ${usage.series.type}). ${usage.otherSeries ? `${usage.otherSeries} other series are not added to it.` : ''} Hours without records on an observed day are shown as 0; days without usage records are unknown.`.trim(),
          ]
        : ['No usage records for this day. Attention is unknown.']),
      ...(usage.unallocated
        ? [`${usage.unallocated} usage records span more than one clock hour and are not placed.`]
        : []),
      ...(samples.length
        ? []
        : signals.steps.length || signals.sleep.length || signals.resting
          ? [
              'No heart-rate samples for this day. Body shows the other recorded signals instead: sleep, hourly steps and resting heart rate where present. None of these is a heart-rate trace.',
            ]
          : ['No heart-rate samples, steps or sleep for this day. Body is unknown.']),
      ...(signals.stepSources > 1
        ? [
            `Steps come from the one source with the most steps; ${signals.stepSources - 1} other step ${signals.stepSources === 2 ? 'source is' : 'sources are'} not added, so the total can differ from the Health app.`,
          ]
        : []),
    ],
  };
}

/** Per-night features shared by patterns and experiments.
 * Night D runs from 18:00 on D to 14:00 on D+1. Days must be consecutive and include D+1.
 * @param {ReviewDay[]} days @param {ReviewRecord[]} rows @param {HourSlot[]} slots
 * @param {string} timezone @param {StrandsPlace[]} places @param {number} cutoffHour */
function strandsNights(days, rows, slots, timezone, places, cutoffHour = 22) {
  const sleep = healthReview(days, rows, timezone).series.filter((s) => s.kind === 'sleep');
  const chosen = sorted(
    sleep,
    (a, b) =>
      b.daily.filter((d) => d.value !== null).length -
      a.daily.filter((d) => d.value !== null).length,
  )[0];
  const asleep = (chosen?.daily ?? [])
    .flatMap((d) => d.intervals)
    .filter((i) => ['Asleep', 'Core', 'Light', 'Deep', 'REM'].includes(i.kind));
  const usage = attentionHours(days, rows, slots);
  const located = locationReview(days, rows, timezone)
    .series.flatMap((s) => s.points)
    .map((p) => ({ time: Date.parse(p.start), placeId: placeOf(places, p.latitude, p.longitude) }))
    .filter((p) => p.placeId !== null);
  return days.slice(0, -1).map((day) => {
    const evening = slots.find((s) => s.date === day.date && s.hour === 18);
    const nextDay = days.find((d) => d.date > day.date);
    const nextMorning = nextDay && slots.find((s) => s.date === nextDay.date && s.hour === 14);
    const from = evening?.start ?? Date.parse(day.start) + 18 * 3600000;
    const to = nextMorning?.start ?? Date.parse(day.end) + 14 * 3600000;
    const night = asleep
      .map((i) => [Math.max(Date.parse(i.start), from), Math.min(Date.parse(i.end), to)])
      .filter(([a = 0, b = 0]) => b > a);
    let total = 0,
      edge = -Infinity;
    for (const [a = 0, b = 0] of sorted(night, (x, y) => (x[0] ?? 0) - (y[0] ?? 0))) {
      total += Math.max(0, b - Math.max(edge, a));
      edge = Math.max(edge, b);
    }
    const onset = night.length ? Math.min(...night.map(([a = 0]) => a)) : null;
    const late = usage.observedDates.has(day.date)
      ? Array.from({ length: 24 - cutoffHour }, (_, k) => usage.cell(day.date, cutoffHour + k))
          .map((c) => c.minutes ?? 0)
          .reduce((s, v) => s + v, 0)
      : null;
    const eveningEnd = slots.find((s) => s.date === day.date && s.hour === 22)?.start ?? from;
    const eveningPlaces = new Set(
      located
        .filter((p) => p.time >= from - 3600000 && p.time < eveningEnd)
        .map((p) => /** @type {string} */ (p.placeId)),
    );
    return {
      date: day.date,
      sleepHours: night.length ? Math.round((total / 3600000) * 100) / 100 : null,
      onsetMinutesAfter18: onset === null ? null : Math.round((onset - from) / 60000),
      onset: onset === null ? null : new Date(onset).toISOString(),
      phoneAfterCutoffMinutes: late === null ? null : Math.round(late),
      eveningPlaces: [...eveningPlaces],
    };
  });
}

/** @param {string} id @param {[string,string]} strands @param {string} title @param {string} unit
 * @param {{label:string,values:number[]}} a @param {{label:string,values:number[]}} b @param {number} coverage */
function comparison(id, strands, title, unit, a, b, coverage) {
  const ma = median(a.values),
    mb = median(b.values);
  return {
    id,
    strands,
    title,
    unit,
    groups: [a, b].map((g, index) => ({
      label: g.label,
      n: g.values.length,
      median: index ? mb : ma,
      values: g.values,
    })),
    delta: ma === null || mb === null ? null : Math.round((ma - mb) * 100) / 100,
    coverage,
    claim: 'observed',
    caveat:
      'Observed together in your recorded data. Small groups, missing records and other differences between these days can explain this; it is not evidence that one caused the other.',
  };
}

/** Cross-strand observations over a window of nights. Requires at least three nights per group.
 * @param {ReviewDay[]} days Consecutive local days; the last day only closes the final night.
 * @param {ReviewRecord[]} rows @param {HourSlot[]} slots @param {string} timezone */
export function strandsPatterns(days, rows, slots, timezone) {
  const places = strandsPlaces(days, rows, timezone);
  const nights = strandsNights(days, rows, slots, timezone, places, 22);
  const total = nights.length || 1;
  const patterns = [];
  /** @type {Set<string>} */
  const seenEvenings = new Set();
  for (const place of places.slice(0, 8)) {
    const at = nights.filter((n) => n.sleepHours !== null && n.eveningPlaces.includes(place.id));
    const away = nights.filter((n) => n.sleepHours !== null && !n.eveningPlaces.includes(place.id));
    if (at.length < minimumGroup || away.length < minimumGroup) continue;
    // Nearby places that share exactly the same evenings would repeat one comparison.
    const evenings = at.map((n) => n.date).join(',');
    if (seenEvenings.has(evenings)) continue;
    seenEvenings.add(evenings);
    patterns.push(
      comparison(
        `place-sleep:${place.id}`,
        ['place', 'body'],
        `Sleep after evenings at ${place.label}`,
        'h',
        { label: `Evenings at ${place.label}`, values: at.map((n) => n.sleepHours ?? 0) },
        { label: 'Other evenings', values: away.map((n) => n.sleepHours ?? 0) },
        (at.length + away.length) / total,
      ),
    );
  }
  const scored = nights.filter((n) => n.phoneAfterCutoffMinutes !== null && n.onset !== null);
  const heavy = scored.filter((n) => (n.phoneAfterCutoffMinutes ?? 0) >= 45);
  const light = scored.filter((n) => (n.phoneAfterCutoffMinutes ?? 0) < 45);
  if (heavy.length >= minimumGroup && light.length >= minimumGroup)
    patterns.push(
      comparison(
        'late-phone-onset',
        ['attention', 'body'],
        'Sleep onset after late phone use',
        'min after 18:00',
        { label: '45+ min after 22:00', values: heavy.map((n) => n.onsetMinutesAfter18 ?? 0) },
        { label: 'Under 45 min', values: light.map((n) => n.onsetMinutesAfter18 ?? 0) },
        scored.length / total,
      ),
    );
  const usage = attentionHours(days, rows, slots);
  // One pass: which places each observed clock hour saw (null when off any known place).
  const findSlot = slotFinder(slots);
  /** @type {Map<HourSlot,Set<string|null>>} */
  const hourPlaces = new Map();
  for (const p of locationReview(days, rows, timezone).series.flatMap((s) => s.points)) {
    const slot = findSlot(Date.parse(p.start));
    if (!slot || !usage.observedDates.has(slot.date)) continue;
    const ids = hourPlaces.get(slot) ?? new Set();
    ids.add(placeOf(places, p.latitude, p.longitude));
    hourPlaces.set(slot, ids);
  }
  /** @type {Map<string,number[]>} */
  const perPlace = new Map();
  for (const [slot, ids] of hourPlaces) {
    const [only] = [...ids];
    if (ids.size !== 1 || !only) continue;
    perPlace.set(only, [
      ...(perPlace.get(only) ?? []),
      usage.cell(slot.date, slot.hour).minutes ?? 0,
    ]);
  }
  const placeHours = sorted(
    places
      .map((p) => ({ place: p, minutes: perPlace.get(p.id) ?? [] }))
      .filter((p) => p.minutes.length >= minimumGroup),
    (a, b) => (median(a.minutes) ?? 0) - (median(b.minutes) ?? 0),
  );
  if (placeHours.length >= 2)
    patterns.push({
      id: 'place-attention',
      strands: ['attention', 'place'],
      title: 'Phone minutes per hour by place',
      unit: 'min/h',
      groups: placeHours.map((p) => ({
        label: p.place.label,
        n: p.minutes.length,
        median: median(p.minutes),
        values: p.minutes,
      })),
      delta: null,
      coverage: placeHours.reduce((s, p) => s + p.minutes.length, 0) / (slots.length || 1),
      claim: 'observed',
      caveat:
        'Hours count only when every recorded point in that hour is at one place. Usage records are hourly aggregates, so the exact moment of use is unknown.',
    });
  return {
    version: 'myself.md.strands-patterns.v1',
    timezone,
    start: days[0]?.date ?? '',
    end: days.at(-1)?.date ?? '',
    places,
    nights,
    patterns: sorted(
      patterns,
      (a, b) => Math.abs(Number(b.delta ?? 0)) - Math.abs(Number(a.delta ?? 0)),
    ),
    warnings: [
      `Groups need at least ${minimumGroup} nights each; smaller comparisons are omitted.`,
      'Night D runs from 18:00 on D to 14:00 the next day. Sleep uses the union of asleep, core, deep and REM intervals from one source.',
      'Patterns describe what was observed together. They never establish cause.',
    ],
  };
}

/** Validate a user-chosen phone-down experiment before it is stored.
 * @param {unknown} input @returns {Omit<StrandsExperiment,'id'|'createdAt'|'cancelledAt'>} */
export function parseStrandsExperiment(input) {
  const v = input && typeof input === 'object' ? /** @type {Record<string,unknown>} */ (input) : {};
  const rule =
    v.rule && typeof v.rule === 'object' ? /** @type {Record<string,unknown>} */ (v.rule) : {};
  const cutoffHour = rule.cutoffHour,
    allowance = rule.allowanceMinutes ?? 10,
    nights = v.nights ?? 7;
  if (rule.kind !== 'phone_down') throw new Error('Only phone_down experiments are supported.');
  if (
    typeof cutoffHour !== 'number' ||
    !Number.isInteger(cutoffHour) ||
    cutoffHour < 18 ||
    cutoffHour > 23
  )
    throw new Error('cutoffHour must be a whole local hour from 18 to 23.');
  if (
    typeof allowance !== 'number' ||
    !Number.isInteger(allowance) ||
    allowance < 0 ||
    allowance > 60
  )
    throw new Error('allowanceMinutes must be 0–60.');
  if (typeof nights !== 'number' || !Number.isInteger(nights) || nights < 3 || nights > 28)
    throw new Error('nights must be 3–28.');
  if (
    typeof v.startDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.startDate) ||
    new Date(`${v.startDate}T00:00:00Z`).toISOString().slice(0, 10) !== v.startDate
  )
    throw new Error('startDate must be YYYY-MM-DD.');
  if (typeof v.timezone !== 'string' || !v.timezone || v.timezone.length > 100)
    throw new Error('timezone must be an IANA timezone.');
  const title =
    typeof v.title === 'string' && v.title.trim()
      ? v.title.trim().slice(0, 120)
      : `Phone down by ${String(cutoffHour).padStart(2, '0')}:00`;
  return {
    title,
    rule: { kind: 'phone_down', cutoffHour, allowanceMinutes: allowance },
    startDate: v.startDate,
    nights,
    timezone: v.timezone,
    sourcePattern:
      typeof v.sourcePattern === 'string' && v.sourcePattern ? v.sourcePattern.slice(0, 120) : null,
  };
}

/** @param {(number|null)[]} values */
const med = (values) => median(values.filter((v) => v !== null).map(Number));

/** Night-by-night progress for a phone-down experiment against the preceding baseline.
 * @param {StrandsExperiment} experiment
 * @param {ReviewDay[]} days Baseline nights, then trial nights, then one closing day.
 * @param {ReviewRecord[]} rows @param {HourSlot[]} slots @param {string} today Local date. */
export function strandsExperimentReview(experiment, days, rows, slots, today) {
  const places = strandsPlaces(days, rows, experiment.timezone);
  const nights = strandsNights(
    days,
    rows,
    slots,
    experiment.timezone,
    places,
    experiment.rule.cutoffHour,
  );
  const baseline = nights.filter((n) => n.date < experiment.startDate);
  const trialDates = Array.from({ length: experiment.nights }, (_, k) =>
    new Date(Date.parse(experiment.startDate) + k * 86400000).toISOString().slice(0, 10),
  );
  const trial = trialDates.map((date) => {
    const n = nights.find((x) => x.date === date);
    const state =
      date > today
        ? 'upcoming'
        : date === today
          ? 'tonight'
          : n?.phoneAfterCutoffMinutes === null || n?.phoneAfterCutoffMinutes === undefined
            ? 'unknown'
            : n.phoneAfterCutoffMinutes <= experiment.rule.allowanceMinutes
              ? 'kept'
              : 'slipped';
    return {
      date,
      state,
      phoneAfterCutoffMinutes: n?.phoneAfterCutoffMinutes ?? null,
      onset: date < today ? (n?.onset ?? null) : null,
      sleepHours: date < today ? (n?.sleepHours ?? null) : null,
    };
  });
  const done = trial.filter((n) => n.state === 'kept' || n.state === 'slipped');
  const last = trialDates.at(-1);
  const finished = last !== undefined && last < today;
  return {
    version: 'myself.md.strands-experiment-review.v1',
    experiment,
    status: experiment.cancelledAt ? 'cancelled' : finished ? 'complete' : 'running',
    nights: trial,
    kept: done.filter((n) => n.state === 'kept').length,
    observed: done.length,
    baseline: {
      nights: baseline.length,
      phoneAfterCutoffMedian: med(baseline.map((n) => n.phoneAfterCutoffMinutes)),
      onsetMinutesAfter18Median: med(baseline.map((n) => n.onsetMinutesAfter18)),
    },
    trial: {
      phoneAfterCutoffMedian: med(done.map((n) => n.phoneAfterCutoffMinutes)),
      onsetMinutesAfter18Median: med(
        nights
          .filter((n) => trialDates.includes(n.date) && n.date < today)
          .map((n) => n.onsetMinutesAfter18),
      ),
    },
    caveat:
      'Nights without usage records are unknown, not kept. iOS reports usage per clock hour, so the cutoff applies to whole hours. A few nights cannot show that the rule caused any change.',
  };
}
