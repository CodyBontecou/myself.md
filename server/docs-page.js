import { publicNavigation } from '../core/public-site.js';

/** @param {string} value */
function escape(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}
/** Render the controlled documentation source, with no raw HTML. @param {string} text */
function inline(text) {
  return escape(text).replace(
    /`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|\/[^)\s]*|#[^)\s]+)\)/g,
    (_match, code, label, url) => (code ? `<code>${code}</code>` : `<a href="${url}">${label}</a>`),
  );
}
/** @param {string} heading */
function anchor(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
/** Server-rendered documentation remains readable without JavaScript. @param {string} markdown @param {string} path */
export function docsHTML(markdown, path) {
  const reference = path === '/docs/reference';
  const documentation = path.startsWith('/docs');
  const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1] ?? '');
  const content = markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part) => {
      if (part.startsWith('```')) {
        const code = part.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '');
        return `<pre tabindex="0" aria-label="Code example"><code>${escape(code)}</code></pre>`;
      }
      return part
        .trim()
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((block) => {
          const heading = block.match(/^(#{1,2}) (.+)$/);
          if (heading?.[1] && heading[2])
            return `<h${heading[1].length} id="${anchor(heading[2])}">${inline(heading[2])}</h${heading[1].length}>`;
          const lines = block.split('\n');
          if (
            lines.every((line) => /^[-\d]/.test(line)) &&
            lines.every((line) => /^(?:- |\d+\. )/.test(line))
          ) {
            const tag = block.startsWith('- ') ? 'ul' : 'ol';
            return `<${tag}>${lines.map((line) => `<li>${inline(line.replace(/^(?:- |\d+\. )/, ''))}</li>`).join('')}</${tag}>`;
          }
          return `<p>${inline(block.replace(/\n/g, ' '))}</p>`;
        })
        .join('');
    })
    .join('');
  const links = publicNavigation
    .map(
      ({ label, href }) =>
        `<a href="${href}" ${path === href || (label === 'Docs' && documentation) ? 'aria-current="page"' : ''}>${label}</a>`,
    )
    .join('');
  const icons = `<div class="site-icons" aria-label="Get myself.md"><span tabindex="0" title="Coming soon" aria-label="App Store — coming soon"><img class="site-mono-icon" src="/dashboard/store-badges/apple-icon.svg" alt="" width="28" height="28"></span><span tabindex="0" title="Coming soon" aria-label="Google Play — coming soon"><svg viewBox="0 0 24 24" aria-hidden="true" width="28" height="28"><path fill="#4285F4" d="M3 2v20l10-10Z"/><path fill="#34A853" d="m3 2 12 7-5 3Z"/><path fill="#EA4335" d="m3 22 12-7-5-3Z"/><path fill="#FBBC04" d="m15 9 6 3-6 3-5-3Z"/></svg></span><a href="https://github.com/CodyBontecou/agent-bridge" target="_blank" rel="noopener noreferrer" aria-label="View myself.md on GitHub" title="View source on GitHub"><img class="site-mono-icon" src="/dashboard/store-badges/github-icon.svg" alt="" width="28" height="28"></a></div>`;
  const startLinks = documentation
    ? `<p>Start here</p><a href="/docs" ${reference ? '' : 'aria-current="page"'}>Getting started</a><a href="/docs/reference" ${reference ? 'aria-current="page"' : ''}>API reference</a>`
    : `<p>myself.md</p><a href="/">Home</a>${links}`;
  const contents = headings.length
    ? `<p>On this page</p>${headings.map((heading) => `<a href="#${anchor(heading)}">${escape(heading)}</a>`).join('')}`
    : '';
  const footer = documentation
    ? `<a href="${reference ? '/docs' : '/docs/reference'}">${reference ? '← Getting started' : 'Continue to API reference →'}</a><a href="/contact">Need a hand?</a>`
    : '<a href="/">← Home</a><a href="/delete-account">Delete account</a>';
  return `<div class="docs-page"><a class="docs-skip" href="#docs-content">Skip to content</a><header class="docs-header">${icons}<nav aria-label="Site">${links}</nav></header><div class="docs-layout"><aside class="docs-sidebar"><nav aria-label="${documentation ? 'Documentation' : 'Page navigation'}">${startLinks}${contents}${documentation ? '<p>Resources</p><a href="/datasets">Datasets</a><a href="/#pricing">Pricing</a><a href="/privacy">Privacy</a><a href="/contact">Get help</a>' : ''}</nav></aside><main id="docs-content" class="docs-content">${content}<footer class="docs-footer">${footer}</footer></main></div></div>`;
}
