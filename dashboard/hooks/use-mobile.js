import { useSyncExternalStore } from 'react';
/** @param {()=>void} notify */
function subscribe(notify) {
  const query = window.matchMedia('(max-width: 767px)');
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}
function snapshot() {
  return window.matchMedia('(max-width: 767px)').matches;
}
export function useIsMobile() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
