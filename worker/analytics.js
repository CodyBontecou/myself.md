import { createHmac } from 'node:crypto';
import {
  parseAnalyticsBatch,
  parseAnalyticsPreference,
  parseAnalyticsRange,
} from '../core/analytics.js';
import { PairingError } from '../server/errors.js';
import { reviewerUserId } from '../server/reviewer.js';
/** @param {Env} env @param {string} value */
function hash(env, value) {
  return createHmac('sha256', env.IDENTITY_SECRET).update(`analytics:v1:${value}`).digest('hex');
}
/** @param {Env} env */
export function createAnalytics(env) {
  const db = env.ANALYTICS;
  /** @param {string} subject */
  const actor = (subject) => hash(env, `account:${subject}`);
  /** Server configuration classifies known internal activity without changing consent or events. */
  async function internalKeys() {
    const subjects = [
      ...env.ANALYTICS_OPERATORS.split(','),
      ...(env.ANALYTICS_INTERNAL_SUBJECTS ?? '').split(','),
      `${env.ACCOUNT_NAMESPACE || env.OAUTH_ISSUER}|${reviewerUserId}`,
    ]
      .map((value) => value.trim())
      .filter(Boolean);
    const keys = (env.ANALYTICS_INTERNAL_KEYS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const anonymousIds = (env.ANALYTICS_INTERNAL_ANONYMOUS_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      subjects.some((value) => !/^[^|]+\|[^|]+$/.test(value)) ||
      keys.some((value) => !/^[a-f0-9]{64}$/.test(value)) ||
      anonymousIds.some((value) => !/^[a-f0-9]{32}$/.test(value))
    )
      throw new PairingError(503, 'Analytics audience configuration is invalid.');
    if (env.ANALYTICS_OPERATOR_GITHUB_ID) {
      const owners = await env.IDENTITY.prepare(
        'SELECT userId FROM account WHERE providerId=? AND accountId=?',
      )
        .bind('github', env.ANALYTICS_OPERATOR_GITHUB_ID)
        .all();
      for (const owner of owners.results)
        subjects.push(`${env.ACCOUNT_NAMESPACE || env.OAUTH_ISSUER}|${owner.userId}`);
    }
    return JSON.stringify([
      ...new Set([
        ...keys,
        ...subjects.map(actor),
        ...anonymousIds.map((value) => hash(env, `anonymous:${value}`)),
      ]),
    ]);
  }
  /** @param {string} subject */
  async function canRead(subject) {
    const id = subject.slice(subject.indexOf('|') + 1);
    if (id === reviewerUserId) return false;
    if (env.ANALYTICS_OPERATORS.split(',').filter(Boolean).includes(subject)) return true;
    if (!env.ANALYTICS_OPERATOR_GITHUB_ID) return false;
    return Boolean(
      await env.IDENTITY.prepare(
        'SELECT id FROM account WHERE userId=? AND providerId=? AND accountId=?',
      )
        .bind(id, 'github', env.ANALYTICS_OPERATOR_GITHUB_ID)
        .first(),
    );
  }
  /** @param {string} subject */
  async function enabled(subject) {
    return (
      (await db
        .prepare('SELECT enabled FROM analytics_preferences WHERE actor=?')
        .bind(actor(subject))
        .first('enabled')) === 1
    );
  }
  /** @param {string} subject */
  async function erase(subject) {
    const key = actor(subject);
    await db.batch([
      db
        .prepare(
          'INSERT OR REPLACE INTO analytics_revocations SELECT anonymous,? FROM analytics_aliases WHERE actor=?',
        )
        .bind(Date.now() + 180 * 86400000, key),
      db
        .prepare(
          'DELETE FROM analytics_events WHERE actor=? OR anonymous IN (SELECT anonymous FROM analytics_aliases WHERE actor=?)',
        )
        .bind(key, key),
      db.prepare('DELETE FROM analytics_aliases WHERE actor=?').bind(key),
    ]);
  }
  /** @param {string} subject @param {unknown} [input] */
  async function preferences(subject, input) {
    if (input !== undefined) {
      let preference;
      try {
        preference = parseAnalyticsPreference(input);
      } catch {
        throw new PairingError(400, 'Explicit usage analytics consent required.');
      }
      await db
        .prepare(
          'INSERT INTO analytics_preferences VALUES(?,?,?) ON CONFLICT(actor) DO UPDATE SET enabled=excluded.enabled,updated=excluded.updated',
        )
        .bind(actor(subject), preference.enabled ? 1 : 0, Date.now())
        .run();
      if (!preference.enabled) await erase(subject);
    }
    const row = await db
      .prepare('SELECT enabled FROM analytics_preferences WHERE actor=?')
      .bind(actor(subject))
      .first();
    return { enabled: row?.enabled === 1, decided: row !== null };
  }
  /** @param {string|null} subject @param {unknown} input */
  async function ingest(subject, input) {
    let batch;
    try {
      batch = parseAnalyticsBatch(input, Date.now());
    } catch {
      throw new PairingError(400, 'Invalid analytics batch.');
    }
    if (subject && (!(await enabled(subject)) || subject.endsWith(`|${reviewerUserId}`)))
      return { accepted: 0, enabled: false };
    if (
      !subject &&
      batch.events.some(
        (e) =>
          ![
            'page_viewed',
            'download_clicked',
            'sign_in_started',
            'onboarding_started',
            'onboarding_step_viewed',
            'onboarding_completed',
            'profile_saved',
            'export_started',
            'export_completed',
            'export_partial',
            'export_failed',
            'export_cancelled',
            'app_opened',
            'paywall_viewed',
          ].includes(e.name),
      )
    )
      throw new PairingError(400, 'Event requires sign-in.');
    if (batch.events.some((e) => ['signup_completed', 'phone_connected'].includes(e.name)))
      throw new PairingError(400, 'Event requires server verification.');
    const anonymous = hash(env, `anonymous:${batch.anonymousId}`),
      key = subject ? actor(subject) : null;
    if (
      await db
        .prepare('SELECT anonymous FROM analytics_revocations WHERE anonymous=? AND expires>?')
        .bind(anonymous, Date.now())
        .first()
    )
      return { accepted: 0, enabled: false };
    const previous = await db
      .prepare('SELECT actor FROM analytics_aliases WHERE anonymous=?')
      .bind(anonymous)
      .first('actor');
    if ((previous && previous !== key) || (!subject && previous))
      throw new PairingError(409, 'Rotate analytics identity before continuing.');
    const statements = [];
    if (key)
      statements.push(
        db
          .prepare(
            'INSERT INTO analytics_aliases SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM analytics_preferences WHERE actor=? AND enabled=1) ON CONFLICT(anonymous) DO NOTHING',
          )
          .bind(anonymous, key, Date.now(), key),
      );
    statements.push(
      ...batch.events.map((event) =>
        db
          .prepare(
            'INSERT OR IGNORE INTO analytics_events SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM analytics_aliases WHERE anonymous=? AND actor<>?) AND NOT EXISTS(SELECT 1 FROM analytics_revocations WHERE anonymous=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM analytics_preferences WHERE actor=? AND enabled=1))',
          )
          .bind(
            hash(env, `event:${anonymous}:${event.id}`),
            key,
            anonymous,
            event.name,
            event.at,
            Date.now(),
            event.surface,
            event.step ?? null,
            0,
            anonymous,
            key ?? '',
            anonymous,
            key,
            key,
          ),
      ),
    );
    await db.batch(statements);
    if (subject) {
      const created = await env.IDENTITY.prepare('SELECT createdAt FROM user WHERE id=?')
        .bind(subject.slice(subject.indexOf('|') + 1))
        .first('createdAt');
      const at = typeof created === 'string' ? Date.parse(created) : NaN;
      if (Number.isFinite(at) && at >= Date.now() - 86400000 && at <= Date.now())
        await milestone(subject, 'signup_completed', 'signup', at, batch.events[0]?.surface);
    }
    return { accepted: batch.events.length, enabled: true };
  }
  /** Only trusted application operations call this; failures never change the operation's result.
   * @param {string} subject @param {'phone_connected'|'signup_completed'} name @param {string} operation @param {number} [at] @param {import('../core/analytics.js').AnalyticsSurface|'server'} [surface] */
  async function milestone(subject, name, operation, at = Date.now(), surface = 'server') {
    if (!(await enabled(subject))) return;
    const key = actor(subject);
    await db
      .prepare(
        'INSERT OR IGNORE INTO analytics_events SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM analytics_preferences WHERE actor=? AND enabled=1)',
      )
      .bind(
        hash(env, `milestone:${key}:${name}:${operation}`),
        key,
        key,
        name,
        at,
        Date.now(),
        surface,
        null,
        1,
        key,
      )
      .run();
  }
  /** @param {string} subject @param {unknown} input */
  async function report(subject, input) {
    if (!(await canRead(subject)))
      throw new PairingError(403, 'Analytics operator access required.');
    let range;
    try {
      range = parseAnalyticsRange(input);
    } catch {
      throw new PairingError(400, 'Expected a UTC date range of 1–90 days and a valid audience.');
    }
    const start = Date.parse(range.start),
      end = Date.parse(range.end),
      now = Date.now();
    // Resolve aliases before classification. A known QA anonymous key also excludes the linked
    // account and its other aliases; an internal account excludes its pre-sign-in events.
    const people = `WITH internal_keys AS (SELECT value person FROM json_each(?)), internal_people AS (SELECT person FROM internal_keys UNION SELECT actor FROM analytics_aliases WHERE anonymous IN (SELECT person FROM internal_keys)), people AS (SELECT COALESCE(e.actor,a.actor,e.anonymous) person,e.* FROM analytics_events e LEFT JOIN analytics_aliases a ON a.anonymous=e.anonymous WHERE (?='all' OR (?='internal')=EXISTS(SELECT 1 FROM internal_people i WHERE i.person=COALESCE(e.actor,a.actor,e.anonymous) OR i.person=e.anonymous)) AND (? IS NULL OR e.surface=?))`;
    const peopleArgs = [
      await internalKeys(),
      range.audience,
      range.audience,
      range.surface ?? null,
      range.surface ?? null,
    ];
    const base = `${people}, events AS (SELECT * FROM people WHERE at>=? AND at<?)`;
    const args = [...peopleArgs, start, end];
    const counts = await db
      .prepare(
        `${base} SELECT name,COUNT(*) events,COUNT(DISTINCT person) users,SUM(verified) verified FROM events GROUP BY name ORDER BY name`,
      )
      .bind(...args)
      .all();
    const steps = await db
      .prepare(
        `${base} SELECT name,step,COUNT(*) events,COUNT(DISTINCT person) users FROM events WHERE step IS NOT NULL GROUP BY name,step ORDER BY name,step`,
      )
      .bind(...args)
      .all();
    const daily = await db
      .prepare(
        `${base} SELECT strftime('%Y-%m-%d',at/1000,'unixepoch') day,COUNT(*) events,COUNT(DISTINCT person) users FROM events GROUP BY day ORDER BY day`,
      )
      .bind(...args)
      .all();
    const funnel = await db
      .prepare(
        `${base}, visits AS (SELECT person,MIN(at) at FROM events WHERE name='page_viewed' GROUP BY person), signups AS (SELECT e.person,MIN(e.at) at FROM events e JOIN visits v ON v.person=e.person AND e.at>=v.at WHERE e.name='signup_completed' GROUP BY e.person), onboarded AS (SELECT e.person,MIN(e.at) at FROM events e JOIN signups s ON s.person=e.person AND e.at>=s.at WHERE e.name='onboarding_completed' GROUP BY e.person), exported AS (SELECT e.person,MIN(e.at) at FROM events e JOIN onboarded o ON o.person=e.person AND e.at>=o.at WHERE e.name='export_completed' GROUP BY e.person) SELECT 'visit' step,COUNT(*) users FROM visits UNION ALL SELECT 'signup',COUNT(*) FROM signups UNION ALL SELECT 'onboarding',COUNT(*) FROM onboarded UNION ALL SELECT 'first_export',COUNT(*) FROM exported`,
      )
      .bind(...args)
      .all();
    const activation = await db
      .prepare(
        `${base}, started AS (SELECT person,MIN(at) at FROM events WHERE name='onboarding_started' GROUP BY person), completed AS (SELECT e.person,MIN(e.at) at FROM events e JOIN started s ON s.person=e.person AND e.at>=s.at WHERE e.name='onboarding_completed' GROUP BY e.person), exported AS (SELECT e.person,MIN(e.at) at FROM events e JOIN completed c ON c.person=e.person AND e.at>=c.at WHERE e.name='export_completed' GROUP BY e.person) SELECT 'onboarding_started' step,COUNT(*) users FROM started UNION ALL SELECT 'onboarding_completed',COUNT(*) FROM completed UNION ALL SELECT 'first_export',COUNT(*) FROM exported`,
      )
      .bind(...args)
      .all();
    // Exact-day UTC retention from first successful export. Incomplete cohorts stay null.
    const retention = await db
      .prepare(
        `${people}, firsts AS (SELECT person,MIN(at) first_at FROM people WHERE name='export_completed' GROUP BY person), cohort AS (SELECT person,first_at,CAST(first_at/86400000 AS INTEGER) day FROM firsts WHERE first_at>=? AND first_at<?), offsets AS (SELECT 1 days UNION ALL SELECT 7 UNION ALL SELECT 30) SELECT days,COUNT(DISTINCT CASE WHEN (c.day+days+1)*86400000<=? THEN c.person END) eligible,COUNT(DISTINCT CASE WHEN (c.day+days+1)*86400000<=? AND EXISTS(SELECT 1 FROM people p WHERE p.person=c.person AND CAST(p.at/86400000 AS INTEGER)=c.day+days AND p.name IN ('app_opened','dashboard_viewed','export_completed','profile_saved')) THEN c.person END) retained FROM offsets LEFT JOIN cohort c ON 1=1 GROUP BY days ORDER BY days`,
      )
      .bind(...peopleArgs, start, end, now, now)
      .all();
    return {
      range,
      generatedAt: new Date(now).toISOString(),
      browserExclusion: {
        setupUrl: new URL('/operator/analytics', env.PUBLIC_URL).href,
        scope: 'browser',
        requiresBrowser: true,
      },
      counts: counts.results,
      steps: steps.results,
      daily: daily.results,
      funnel: funnel.results,
      activation: activation.results,
      retention: retention.results,
      notes: [
        `Audience: ${range.audience}. Known internal activity includes operators, reviewer and configured QA identities, including linked anonymous history. Filtering does not erase events.`,
        'Customer reports exclude known internal activity; unrecognized signed-out owner/QA traffic may remain. Consented activity only; QA/demo builds disable collection.',
        'Open the browser exclusion setup link and choose Exclude this browser in each owner/QA browser. MCP cannot set a cookie on a different device.',
        'Funnel is ordered within the selected range. Counts show independent milestones.',
        'Anonymous website and app-store installs cannot be linked without sign-in on both surfaces.',
        'Retention is exact UTC day 1/7/30 after first recorded successful export; eligible excludes incomplete days.',
        'Events retained for 180 days; first export means first within retained history.',
        'Client events are reported outcomes, not server verification. No sampling.',
        'Phone pairing is a server milestone without device-surface attribution. A surface filter applies to events, not acquisition cohorts.',
      ],
    };
  }
  return {
    canRead,
    preferences,
    ingest: (/** @type {string} */ subject, /** @type {unknown} */ input) => ingest(subject, input),
    anonymous: (/** @type {unknown} */ input) => ingest(null, input),
    report,
    milestone,
    erase: async (/** @type {string} */ subject) => {
      await preferences(subject, { enabled: false });
    },
    cleanup: async () => {
      const cutoff = Date.now() - 180 * 86400000;
      await db.batch([
        db.prepare('DELETE FROM analytics_events WHERE at<?').bind(cutoff),
        db.prepare('DELETE FROM analytics_aliases WHERE updated<?').bind(cutoff),
        db.prepare('DELETE FROM analytics_revocations WHERE expires<?').bind(Date.now()),
      ]);
    },
  };
}
