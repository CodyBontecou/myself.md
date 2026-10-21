import { createAnalyticsClient } from '../core/analytics-client.js';
import { browserTrafficExcluded } from './analytics-exclusion.js';
// Embedded previews may deny storage. Consent can still last for this page;
// never assume it survives a reload when the browser cannot persist it.
/** @type {Map<string,string>} */
const memory = new Map();
/** @param {'localStorage'|'sessionStorage'} storage @param {string} key */
function readStorage(storage, key) {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
}
/** @param {'localStorage'|'sessionStorage'} storage @param {string} key @param {string} value */
function writeStorage(storage, key, value) {
  memory.set(key, value);
  try {
    window[storage].setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function browserChoice() {
  return (
    readStorage('localStorage', 'myself-analytics-choice') ??
    readStorage('sessionStorage', 'myself-analytics-choice')
  );
}
/** @param {boolean} enabled */
function saveBrowserChoice(enabled) {
  if (!writeStorage('localStorage', 'myself-analytics-choice', String(enabled)))
    writeStorage('sessionStorage', 'myself-analytics-choice', String(enabled));
}
function excludedPath() {
  return (
    /^\/(demo|share\/profile|delete-account|claim|operator)(\/|$)/.test(location.pathname) ||
    new URLSearchParams(location.search).has('client_id')
  );
}
const available =
  !excludedPath() &&
  (location.hostname === 'myself.md' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1');
/** @type {null|{api:<T>(path:string,method?:string,body?:unknown)=>Promise<T>}} */
let account = null;
const collector = createAnalyticsClient({
  read: () =>
    available
      ? (readStorage('sessionStorage', 'myself-usage-analytics-v1') ??
        JSON.stringify({
          enabled: browserChoice() === 'true' ? true : browserChoice() === 'false' ? false : null,
          anonymousId: '',
          scope: '',
          events: [],
        }))
      : null,
  write: (value) => {
    if (available) writeStorage('sessionStorage', 'myself-usage-analytics-v1', value);
  },
  id: () => crypto.randomUUID().replaceAll('-', ''),
  now: Date.now,
  surface: location.pathname.startsWith('/dashboard') ? 'dashboard' : 'website',
  send: async (batch) => {
    if (browserTrafficExcluded()) return {};
    if (
      navigator.doNotTrack === '1' ||
      /** @type {Navigator & {globalPrivacyControl?:boolean}} */ (navigator).globalPrivacyControl
    )
      return { enabled: false };
    const target = account;
    if (target) {
      const preference = /** @type {{enabled:boolean}} */ (
        await target.api('/api/analytics/preferences')
      );
      if (!preference.enabled) {
        saveBrowserChoice(false);
        return { enabled: false };
      }
      return target.api('/api/analytics/events', 'POST', batch);
    }
    const response = await fetch('/api/analytics/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      keepalive: true,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Analytics unavailable.');
    return response.json();
  },
});
/** @param {import('../core/analytics.js').AnalyticsEventName} name @param {string} [step] */
export function trackWebAnalytics(name, step) {
  if (
    available &&
    !browserTrafficExcluded() &&
    location.pathname !== '/dashboard/callback' &&
    !location.pathname.startsWith('/operator')
  )
    collector.track(name, step);
}
/** @param {<T>(path:string,method?:string,body?:unknown)=>Promise<T>} api */
export async function connectWebAnalytics(api) {
  if (!available || excludedPath()) return;
  const identity = /** @type {{subject:string}} */ (await api('/api/account'));
  collector.identify(identity.subject);
  const connection = { api };
  account = connection;
  const preference = /** @type {{enabled:boolean,decided:boolean}} */ (
    await api('/api/analytics/preferences')
  );
  if (account !== connection) return;
  if (!preference.decided && collector.choice() === true)
    await api('/api/analytics/preferences', 'PUT', {
      enabled: true,
      confirmation: 'ALLOW_USAGE_ANALYTICS',
    });
  else if (!preference.enabled && collector.choice() === true) collector.choose(false);
  else if (preference.enabled && collector.choice() === null) collector.choose(true);
  if (account === connection) trackWebAnalytics('signed_in');
}
export function resetWebAnalytics() {
  collector.identify('');
  account = null;
}
/** @param {boolean} enabled */
async function choose(enabled) {
  saveBrowserChoice(enabled);
  if (!enabled) collector.choose(false);
  const target = account;
  if (target)
    await target.api('/api/analytics/preferences', 'PUT', {
      enabled,
      ...(enabled ? { confirmation: 'ALLOW_USAGE_ANALYTICS' } : {}),
    });
  if (account !== target) return;
  collector.choose(enabled);
  if (enabled) trackWebAnalytics('page_viewed', pageStep());
}
function pageStep() {
  return location.pathname === '/'
    ? 'home'
    : location.pathname.startsWith('/datasets')
      ? 'datasets'
      : location.pathname.startsWith('/dashboard')
        ? 'dashboard'
        : location.pathname === '/login'
          ? 'login'
          : 'other';
}
export function initializeWebAnalytics() {
  if (!available) return;
  if (location.pathname !== '/dashboard/callback') collector.identify('');
  const controls = document.createElement('aside');
  controls.className = 'analytics-consent';
  controls.setAttribute('aria-label', 'Usage analytics privacy');
  const privacyHeading = /^\/privacy\/?$/.test(location.pathname)
    ? document.getElementById('usage-analytics-and-website-measurement')
    : null;
  let reviewing = false;
  const message = document.createElement('p');
  const enable = document.createElement('button'),
    disable = document.createElement('button'),
    settings = document.createElement('button');
  enable.type = disable.type = settings.type = 'button';
  enable.textContent = 'Allow usage analytics';
  disable.textContent = 'Keep analytics off';
  settings.textContent = 'Analytics preferences';
  const render = () => {
    const privacySignal =
      navigator.doNotTrack === '1' ||
      /** @type {Navigator & {globalPrivacyControl?:boolean}} */ (navigator)
        .globalPrivacyControl === true;
    message.textContent = `${browserTrafficExcluded() ? 'This browser is excluded from analytics. ' : privacySignal ? 'Analytics is off because of your browser privacy signal. ' : collector.choice() === true ? 'Usage analytics is on. ' : ''}Basic usage stats help improve myself.md. No health data, locations, file contents or recordings.`;
    enable.disabled = privacySignal;
    const expanded = reviewing || collector.choice() === null;
    controls.hidden = excludedPath() || (!expanded && !privacyHeading);
    message.hidden = enable.hidden = disable.hidden = !expanded;
    settings.hidden = expanded;
  };
  const review = () => {
    reviewing = true;
    render();
  };
  const save = (/** @type {boolean} */ enabled) => {
    reviewing = true;
    enable.disabled = disable.disabled = true;
    void choose(enabled)
      .then(() => {
        reviewing = false;
        render();
        return null;
      })
      .catch(() => {
        message.textContent = 'Could not save your account choice. Try again.';
      })
      .finally(() => {
        disable.disabled = false;
        enable.disabled =
          navigator.doNotTrack === '1' ||
          /** @type {Navigator & {globalPrivacyControl?:boolean}} */ (navigator)
            .globalPrivacyControl === true;
      });
  };
  enable.addEventListener('click', () => save(true));
  disable.addEventListener('click', () => save(false));
  settings.addEventListener('click', review);
  controls.append(message, enable, disable, settings);
  if (privacyHeading) {
    controls.classList.add('analytics-consent-inline');
    privacyHeading.after(controls);
  } else document.body.append(controls);
  window.addEventListener('myself-analytics-preferences', review);
  window.addEventListener('popstate', render);
  render();
  trackWebAnalytics('page_viewed', pageStep());
  const timer = setInterval(() => {
    void collector.flush().then(render);
  }, 30000);
  window.addEventListener('pagehide', () => {
    clearInterval(timer);
    void collector.flush();
  });
  window.addEventListener('online', () => {
    void collector.flush();
  });
  window.addEventListener('storage', (event) => {
    if (
      event.key === 'myself-analytics-choice' &&
      event.newValue === 'false' &&
      collector.choice() !== false
    ) {
      collector.choose(false);
      render();
    }
  });
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(target instanceof HTMLAnchorElement)) return;
    const url = new URL(target.href);
    if (url.hostname === 'apps.apple.com') trackWebAnalytics('download_clicked', 'ios');
    else if (url.hostname === 'play.google.com') trackWebAnalytics('download_clicked', 'android');
  });
}
