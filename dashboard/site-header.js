import { useSyncExternalStore } from 'react';
import { publicSiteHeader } from '../core/site-header.js';

/** @param {()=>void} listener */
function subscribe(listener) {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
function snapshot() {
  return location.pathname;
}
export function SiteHeader() {
  const current = useSyncExternalStore(subscribe, snapshot);
  return <div dangerouslySetInnerHTML={{ __html: publicSiteHeader(current) }} />;
}
