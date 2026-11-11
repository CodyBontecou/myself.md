import { readPage } from './data.js';
import { phoneDatabase } from './phone-database.js';
import { strandsTypes } from '../core/strands.js';
import { qaEnabled } from './qa-runtime.js';
import { qaStrandsProfile, qaStrandsRows } from './strands-qa.js';
import { sorted } from '../core/collections.js';

/** @typedef {import('../core/profiles.js').ExportProfile} ExportProfile */
/** @typedef {import('../core/screen-time-review.js').ReviewDay} ReviewDay */
/** @typedef {import('../core/attention-heatmap.js').ReviewHourSlot} HourSlot */
/** @typedef {import('../core/screen-time-review.js').ReviewRecord} ReviewRecord */

const db = phoneDatabase();
db.execSync('CREATE TABLE IF NOT EXISTS strands_settings (owner TEXT PRIMARY KEY, value TEXT);');

export const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Strand types this profile selects, by domain.
 * @param {ExportProfile} profile */
function strandsSelection(profile) {
  return /** @type {const} */ (['health', 'time', 'location']).flatMap((domain) =>
    strandsTypes[domain]
      .filter((type) => profile.selection[domain].includes(`native:${type}`))
      .map((type) => ({ domain, type })),
  );
}

/** @param {ExportProfile} profile */
export function strandsCoverage(profile) {
  const selected = strandsSelection(profile);
  const has = (/** @type {string[]} */ types) => selected.some((s) => types.includes(s.type));
  return {
    place: has(strandsTypes.location),
    attention: has(strandsTypes.time),
    heart: has(['HKQuantityTypeIdentifierHeartRate', 'HeartRate']),
    sleep: has(['HKCategoryTypeIdentifierSleepAnalysis', 'SleepSession']),
    steps: has(['HKQuantityTypeIdentifierStepCount', 'Steps']),
    resting: has(['HKQuantityTypeIdentifierRestingHeartRate', 'RestingHeartRate']),
    count: selected.length,
  };
}

/** The saved Strands profile, else the profile selecting the most strand types.
 * @param {string} owner @param {ExportProfile[]} profiles */
export function strandsProfile(owner, profiles) {
  if (qaEnabled) return qaStrandsProfile;
  const row = /** @type {{value:string}|null} */ (
    db.getFirstSync('SELECT value FROM strands_settings WHERE owner=?', owner)
  );
  const saved = row ? profiles.find((p) => p.id === row.value) : undefined;
  if (saved && strandsCoverage(saved).count) return saved;
  return sorted(
    profiles.filter((p) => strandsCoverage(p).count),
    (a, b) => strandsCoverage(b).count - strandsCoverage(a).count,
  )[0];
}

/** @param {string} owner @param {string} profileId */
export function saveStrandsProfile(owner, profileId) {
  db.runSync(
    'INSERT INTO strands_settings(owner,value) VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET value=excluded.value',
    owner,
    profileId,
  );
}

/** @param {Date} date */
export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Consecutive local days on this phone's clock, ending with `last` (YYYY-MM-DD).
 * @param {string} last @param {number} count @returns {ReviewDay[]} */
export function localDays(last, count) {
  const [y = 0, m = 1, d = 1] = last.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(y, m - 1, d - (count - 1 - index));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return { date: dateKey(start), start: start.toISOString(), end: end.toISOString() };
  });
}

/** Local clock hours; nonexistent DST hours are skipped and repeated hours share a slot.
 * @param {ReviewDay[]} days @returns {HourSlot[]} */
export function localHourSlots(days) {
  return days.flatMap((day) => {
    const base = new Date(day.start);
    return Array.from({ length: 24 }, (_, hour) => {
      const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour);
      const end =
        hour === 23
          ? new Date(day.end)
          : new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour + 1);
      return {
        date: day.date,
        hour,
        start: start.getTime(),
        end: end.getTime(),
        real: start.getHours() === hour,
      };
    })
      .filter((s) => s.real && s.end > s.start)
      .map(({ real: _real, ...slot }) => slot);
  });
}

/** Page sizes per reader: Screen Time allows 50, HealthKit/Health Connect handle more,
 * and location is a local SQLite read. Fewer pages means fewer native round trips. */
const pageSize = { time: 50, health: 500, location: 2000 };
const maxRecords = 100000;
const freshMs = 2 * 60000;

/** Past days are immutable once read; the current day is re-read after two minutes.
 * @type {Map<string,{rows:ReviewRecord[],at:number}>} */
const dayCache = new Map();

/** Read every selected strand type through the same profile-checked path agents use.
 * Sources load in parallel; within a source, types and pages stay sequential.
 * Days already read are served from memory. Errors stay per type.
 * @param {string} owner @param {ExportProfile} profile @param {ReviewDay[]} days */
export async function loadStrandsRows(owner, profile, days) {
  const first = days[0],
    last = days.at(-1);
  if (!first || !last) return { rows: [], warnings: [] };
  if (qaEnabled) {
    const types = new Set(strandsSelection(profile).map((s) => s.type));
    return {
      rows: qaStrandsRows(first.start, last.end).filter((r) => types.has(r.record.type)),
      warnings: ['These are fictional QA records, not phone data.'],
    };
  }
  const now = Date.now();
  /** @param {{domain:import('../core/data.js').Domain,type:string}} selected */
  const loadType = async ({ domain, type }) => {
    const key = (/** @type {ReviewDay} */ day) => `${owner}|${profile.id}|${type}|${day.date}`;
    const stale = days.filter((day) => {
      const hit = dayCache.get(key(day));
      return !hit || (Date.parse(day.end) > hit.at && now - hit.at > freshMs);
    });
    /** @type {string[]} */
    const warnings = [];
    const from = stale[0],
      to = stale.at(-1);
    if (from && to) {
      try {
        const rows = await readType(owner, profile, domain, type, from.start, to.end, warnings);
        const span = days.filter((d) => d.date >= from.date && d.date <= to.date);
        /** @type {Map<string,ReviewRecord[]>} */
        const byDay = new Map(span.map((d) => [d.date, []]));
        for (const row of rows) {
          const t = Date.parse(row.record.start ?? '');
          const day = span.find((d) => t >= Date.parse(d.start) && t < Date.parse(d.end));
          if (day) byDay.get(day.date)?.push(row);
        }
        for (const d of span) dayCache.set(key(d), { rows: byDay.get(d.date) ?? [], at: now });
      } catch (error) {
        warnings.push(`${type}: ${error instanceof Error ? error.message : 'unreadable'}`);
      }
    }
    return {
      rows: days.flatMap((day) => dayCache.get(key(day))?.rows ?? []),
      warnings,
    };
  };
  // Sources load in parallel; types within one source stay sequential, because a native
  // reader (Screen Time especially) cannot serve overlapping queries reliably.
  const selected = strandsSelection(profile);
  const domains = [...new Set(selected.map((s) => s.domain))];
  const results = (
    await Promise.all(
      domains.map(async (domain) => {
        /** @type {Awaited<ReturnType<typeof loadType>>[]} */
        const out = [];
        // oxlint-disable-next-line eslint/no-await-in-loop
        for (const s of selected.filter((x) => x.domain === domain)) out.push(await loadType(s));
        return out;
      }),
    )
  ).flat();
  return {
    rows: thinLocation(results.flatMap((r) => r.rows)),
    warnings: results.flatMap((r) => r.warnings),
  };
}

/** @param {string} owner @param {ExportProfile} profile @param {import('../core/data.js').Domain} domain
 * @param {string} type @param {string} start @param {string} end @param {string[]} warnings */
async function readType(owner, profile, domain, type, start, end, warnings) {
  /** @type {ReviewRecord[]} */
  const rows = [];
  const limit = pageSize[domain];
  let cursor = '';
  do {
    // oxlint-disable-next-line eslint/no-await-in-loop
    const page = await readPage(
      owner,
      { domain, type, source: 'native', start, end, cursor, limit, format: 'json' },
      profile,
      false,
    );
    rows.push(...page.records.map((record) => ({ exportId: 'phone', record })));
    cursor = page.nextCursor ?? '';
    if (rows.length >= maxRecords && cursor) {
      warnings.push(`${type}: stopped after ${maxRecords} records; later ones are not shown.`);
      break;
    }
  } while (cursor);
  return rows;
}

/** Keep one location point per two minutes; dense tracking adds cost, not places.
 * @param {ReviewRecord[]} rows */
function thinLocation(rows) {
  const located = sorted(
    rows.filter((r) => r.record.domain === 'location'),
    (a, b) => (a.record.start ?? '').localeCompare(b.record.start ?? ''),
  );
  /** @type {ReviewRecord[]} */
  const kept = [];
  let last = -Infinity;
  for (const r of located) {
    const time = Date.parse(r.record.start ?? '');
    if (time - last < 120000) continue;
    kept.push(r);
    last = time;
  }
  return [...rows.filter((r) => r.record.domain !== 'location'), ...kept];
}
