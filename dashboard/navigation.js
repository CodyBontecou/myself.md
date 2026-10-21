export function subscribeRoute(/** @type {()=>void} */ listener) {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
export function routeSnapshot() {
  return location.search;
}
/** @param {string} search */
export function navigateRoute(search) {
  history.pushState(null, '', `/dashboard${search}`);
  window.dispatchEvent(new Event('popstate'));
}

/** Keep dashboard navigation inside the authenticated app; preserve modified-click behavior.
 * @param {import('react').MouseEvent<HTMLAnchorElement>} event */
export function followDashboardLink(event) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const destination = new URL(event.currentTarget.href);
  if (destination.origin !== location.origin || destination.pathname !== '/dashboard') return;
  event.preventDefault();
  navigateRoute(destination.search);
}
