/** Bounded, persisted outbox. Adapters own consent, identity and transport.
 * @param {{read:()=>string|null,write:(value:string)=>void,id:()=>string,surface:import('./analytics.js').AnalyticsSurface,send:(batch:import('./analytics.js').AnalyticsBatch)=>Promise<{enabled?:boolean}>,now:()=>number}} adapter */
export function createAnalyticsClient(adapter) {
  /** @type {{enabled:boolean|null,anonymousId:string,scope:string,events:import('./analytics.js').AnalyticsEvent[]}} */
  let state = { enabled: null, anonymousId: '', scope: '', events: [] };
  try {
    const stored = adapter.read();
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        !parsed ||
        ![null, true, false].includes(parsed.enabled) ||
        typeof parsed.anonymousId !== 'string' ||
        typeof parsed.scope !== 'string' ||
        !Array.isArray(parsed.events) ||
        parsed.events.length > 200
      )
        throw new Error('Invalid analytics outbox.');
      state = parsed;
    }
  } catch {
    /* Fail closed when storage is unavailable. */
  }
  let sending = false;
  let revision = 0;
  function persist() {
    try {
      adapter.write(JSON.stringify(state));
      return true;
    } catch {
      state.enabled = false;
      state.events = [];
      return false;
    }
  }
  /** @param {boolean} enabled */
  function choose(enabled) {
    revision++;
    state = { enabled, anonymousId: enabled ? adapter.id() : '', scope: state.scope, events: [] };
    persist();
  }
  /** Rotate on sign-out/account switch; retain anonymous journey on first sign-in.
   * @param {string} scope */
  function identify(scope) {
    if (scope === state.scope) return;
    revision++;
    if (state.scope) state = { enabled: null, anonymousId: '', scope, events: [] };
    else state.scope = scope;
    persist();
  }
  async function flush() {
    if (sending || state.enabled !== true || !state.events.length) return;
    sending = true;
    const version = revision;
    try {
      const events = state.events
        .filter((event) => event.at >= adapter.now() - 7 * 86400000)
        .slice(0, 25);
      if (!events.length) {
        state.events = [];
        persist();
        return;
      }
      const response = await adapter.send({ anonymousId: state.anonymousId, events });
      if (version !== revision) return;
      if (response.enabled === false) {
        choose(false);
        return;
      }
      const ids = new Set(events.map((event) => event.id));
      state.events = state.events.filter((event) => !ids.has(event.id));
      persist();
    } catch {
      /* Keep stable event IDs for retry; analytics never breaks product operations. */
    } finally {
      sending = false;
    }
  }
  /** @param {import('./analytics.js').AnalyticsEventName} name @param {string} [step] */
  function track(name, step) {
    if (state.enabled !== true) return;
    try {
      if (!state.anonymousId) state.anonymousId = adapter.id();
      state.events.push({
        id: adapter.id(),
        name,
        at: adapter.now(),
        surface: adapter.surface,
        ...(step ? { step } : {}),
      });
      state.events = state.events.slice(-200);
      if (persist()) void flush();
    } catch {
      /* Storage failure must never affect the application. */
    }
  }
  return { choose, identify, track, flush, choice: () => state.enabled };
}
