/** Explicit, content-free product events shared by every surface. */
const analyticsEvents = /** @type {const} */ ([
  'page_viewed',
  'download_clicked',
  'sign_in_started',
  'signed_in',
  'signup_completed',
  'onboarding_started',
  'onboarding_step_viewed',
  'onboarding_completed',
  'phone_connected',
  'profile_saved',
  'export_started',
  'export_completed',
  'export_partial',
  'export_failed',
  'export_cancelled',
  'paywall_viewed',
  'dashboard_viewed',
  'app_opened',
]);
export const analyticsSurfaces = /** @type {const} */ (['ios', 'android', 'website', 'dashboard']);
export const analyticsAudiences = /** @type {const} */ (['customers', 'internal', 'all']);
/** @typedef {typeof analyticsEvents[number]} AnalyticsEventName */
/** @typedef {typeof analyticsSurfaces[number]} AnalyticsSurface */
/** @typedef {{id:string,name:AnalyticsEventName,at:number,surface:AnalyticsSurface,step?:string}} AnalyticsEvent */
/** @typedef {{anonymousId:string,events:AnalyticsEvent[]}} AnalyticsBatch */
/** @typedef {typeof analyticsAudiences[number]} AnalyticsAudience */
/** @typedef {{start:string,end:string,surface?:AnalyticsSurface,audience:AnalyticsAudience}} AnalyticsRange */
/** @typedef {{enabled:boolean,decided:boolean}} AnalyticsPreference */
/** @typedef {{canRead:(subject:string)=>Promise<boolean>,report:(subject:string,input:unknown)=>Promise<unknown>,preferences:(subject:string,input?:unknown)=>Promise<AnalyticsPreference>,ingest:(subject:string,input:unknown)=>Promise<unknown>}} AnalyticsService */
export const analyticsSteps = /** @type {const} */ ([
  'home',
  'datasets',
  'demo',
  'login',
  'dashboard',
  'exports',
  'history',
  'agents',
  'support',
  'pricing',
  'blog',
  'docs',
  'profiles',
  'settings',
  'account',
  'pair',
  'privacy',
  'unlock',
  'cloud-storage',
  'onboarding',
  'setup',
  'data',
  'output',
  'review',
  'other',
  'ios',
  'android',
  'github',
  'google',
  'apple',
]);
/** @param {unknown} value @returns {Record<string,unknown>} */
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid analytics input.');
  return /** @type {Record<string,unknown>} */ (value);
}
/** @param {Record<string,unknown>} value @param {string[]} keys */
function exact(value, keys) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error('Unknown analytics property.');
}
/** @param {unknown} value @param {number} now @returns {AnalyticsBatch} */
export function parseAnalyticsBatch(value, now) {
  const batch = object(value);
  exact(batch, ['anonymousId', 'events']);
  if (typeof batch.anonymousId !== 'string' || !/^[a-f0-9]{32}$/.test(batch.anonymousId))
    throw new Error('Invalid anonymous identifier.');
  if (!Array.isArray(batch.events) || batch.events.length < 1 || batch.events.length > 25)
    throw new Error('Expected 1–25 events.');
  const events = batch.events.map((raw) => {
    const event = object(raw);
    exact(event, ['id', 'name', 'at', 'surface', 'step']);
    if (
      typeof event.id !== 'string' ||
      !/^[a-f0-9]{32}$/.test(event.id) ||
      !analyticsEvents.includes(/** @type {AnalyticsEventName} */ (event.name)) ||
      !analyticsSurfaces.includes(/** @type {AnalyticsSurface} */ (event.surface)) ||
      typeof event.at !== 'number' ||
      !Number.isInteger(event.at) ||
      event.at < now - 7 * 86400000 ||
      event.at > now + 300000 ||
      (event.step !== undefined &&
        !analyticsSteps.includes(/** @type {typeof analyticsSteps[number]} */ (event.step)))
    )
      throw new Error('Invalid analytics event.');
    return /** @type {AnalyticsEvent} */ (event);
  });
  return { anonymousId: batch.anonymousId, events };
}
/** @param {unknown} value @returns {AnalyticsRange} */
export function parseAnalyticsRange(value) {
  const range = object(value);
  exact(range, ['start', 'end', 'surface', 'audience']);
  for (const date of [range.start, range.end]) {
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error('Expected a UTC date.');
  }
  const start = String(range.start),
    end = String(range.end);
  const duration = Date.parse(end) - Date.parse(start);
  if (duration <= 0 || duration > 90 * 86400000)
    throw new Error('Report range must be 1–90 days, with an exclusive end.');
  if (
    range.surface !== undefined &&
    !analyticsSurfaces.includes(/** @type {AnalyticsSurface} */ (range.surface))
  )
    throw new Error('Invalid surface.');
  if (
    range.audience !== undefined &&
    !analyticsAudiences.includes(/** @type {AnalyticsAudience} */ (range.audience))
  )
    throw new Error('Invalid audience.');
  return {
    start,
    end,
    audience: /** @type {AnalyticsAudience} */ (range.audience ?? 'customers'),
    ...(range.surface === undefined
      ? {}
      : { surface: /** @type {AnalyticsSurface} */ (range.surface) }),
  };
}
/** @param {unknown} value */
export function parseAnalyticsPreference(value) {
  const input = object(value);
  exact(input, ['enabled', 'confirmation']);
  if (
    typeof input.enabled !== 'boolean' ||
    (input.enabled && input.confirmation !== 'ALLOW_USAGE_ANALYTICS')
  )
    throw new Error('Explicit usage analytics consent required.');
  return { enabled: input.enabled };
}
