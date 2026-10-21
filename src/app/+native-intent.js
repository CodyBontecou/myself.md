/** Route native handoffs to existing screens; their listeners handle the original URL.
 * @param {{path:string,initial:boolean}} event */
export function redirectSystemPath({ path }) {
  try {
    const url = new URL(path, 'myselfmd://app');
    if (url.protocol === 'myselfmd:' && url.hostname === 'watch') return '/settings/watch';

    if (url.protocol === 'myselfmd:' && url.hostname === 'profile' && !url.pathname)
      return '/profiles';
    if (
      url.protocol === 'myselfmd:' &&
      url.hostname === 'cloud-storage' &&
      (url.pathname === '' || url.pathname === '/')
    )
      return '/cloud-storage';
    if (
      url.protocol === 'myselfmd:' &&
      ((url.hostname === 'oauth' && (url.pathname === '' || url.pathname === '/')) ||
        (url.hostname === 'app' && url.pathname === '/oauth'))
    )
      return '/account';
  } catch {
    // Unrelated native intents retain their existing routing behavior.
  }
  return path;
}
