import { publicNavigation } from './public-site.js';

/** Shared public navigation. Paths select a known active link and are never reflected into markup. @param {string} [path] */
export function publicSiteHeader(path = '') {
  const links = publicNavigation
    .filter(({ label }) => ['Blog', 'Docs', 'Pricing', 'Contact', 'Privacy'].includes(label))
    .map(
      ({ label, href }) =>
        `<a href="${href}"${path === href || (href === '/docs' && path.startsWith('/docs/')) || (href === '/blog' && path.startsWith('/blog/')) ? ' aria-current="page"' : ''}>${label}</a>`,
    )
    .join('');
  return `<header class="public-site-header"><a class="public-site-brand" href="/" aria-label="myself.md home"><img class="public-site-logo" src="/dashboard/favicon.png" alt="" width="32" height="32">myself<span>.md</span></a><nav class="public-site-links" aria-label="Site">${links}</nav><details class="public-site-mobile"><summary>Menu <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 4.5 3 3 3-3"/></svg></summary><nav aria-label="Site menu">${links}</nav></details></header>`;
}

export const publicSiteHeaderStyles = `
.public-site-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; width: 100%; min-height: 64px; position: relative; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--foreground, var(--text, #171717)); }
.public-site-header .public-site-brand { display: inline-flex; align-items: center; flex-shrink: 0; min-height: 44px; font-size: 20px; font-weight: 650; letter-spacing: -.8px; line-height: 1.5; text-decoration: none; color: inherit; }
.public-site-brand span { color: var(--muted-foreground, var(--muted, #666)); }
.public-site-logo { width: 32px; height: 32px; margin-right: 10px; flex-shrink: 0; border-radius: 8px; object-fit: contain; }
.public-site-header .public-site-links { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 24px; }
.public-site-header nav a { display: inline-flex; align-items: center; min-height: 44px; font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--muted-foreground, var(--muted, #666)); text-decoration: none; }
.public-site-header nav a:hover, .public-site-header a[aria-current=page] { color: inherit; text-decoration: underline; text-underline-offset: 4px; }
.public-site-header a:focus-visible, .public-site-header summary:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; border-radius: 3px; }
.public-site-mobile { display: none; border: 0; }
.public-site-mobile summary { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 44px; padding: 10px 14px; border: 1px solid var(--border, var(--line, #e5e5e5)); border-radius: 9px; cursor: pointer; list-style: none; font-size: 13px; font-weight: 500; line-height: 1.5; }
.public-site-mobile summary::-webkit-details-marker { display: none; }
.public-site-mobile summary svg { flex-shrink: 0; }
.public-site-mobile nav { position: absolute; top: calc(100% + 4px); right: 0; z-index: 50; display: grid; gap: 0; width: min(260px, calc(100vw - 40px)); padding: 8px; border: 1px solid var(--border, var(--line, #e5e5e5)); border-radius: 12px; background: var(--card, var(--surface, #fff)); box-shadow: 0 8px 24px #0001; }
.public-site-mobile nav a { padding: 10px 14px; border-radius: 6px; }
@media (max-width: 760px) { .public-site-header { gap: 16px; } .public-site-header .public-site-links { display: none; } .public-site-mobile { display: block; } }
`;
