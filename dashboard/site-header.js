import { useSyncExternalStore } from 'react';
import { publicNavigation } from '../core/public-site.js';

/** @param {()=>void} listener */
function subscribe(listener) {
  window.addEventListener('hashchange', listener);
  window.addEventListener('popstate', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('popstate', listener);
  };
}
function snapshot() {
  return location.pathname + location.hash;
}
export function SiteHeader() {
  const current = useSyncExternalStore(subscribe, snapshot);
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-label="Site">
        {publicNavigation
          .filter(({ href }) => href !== '/' || current.split('#')[0] !== '/')
          .map(({ label, href }) => (
            <a
              key={label}
              href={href}
              aria-current={current === href ? 'page' : undefined}
              className="underline-offset-4 hover:underline aria-[current=page]:underline"
            >
              {label}
            </a>
          ))}
      </nav>
    </header>
  );
}
