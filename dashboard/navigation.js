export function subscribeRoute(/** @type {()=>void} */ listener) {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
export function routeSnapshot() {
  return location.search;
}
/** @param {string} search */
export function navigateRoute(search) {
  history.pushState(
    null,
    '',
    `${/^\/demo\/?$/.test(location.pathname) ? '/demo' : '/dashboard'}${search}`,
  );
  window.dispatchEvent(new Event('popstate'));
}
