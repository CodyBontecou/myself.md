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
    /`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*|#[^)\s]+)\)/g,
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
/** Server-rendered documentation remains readable without JavaScript. @param {string} markdown @param {boolean} reference */
export function docsHTML(markdown, reference) {
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
  return `<div class="docs-page"><a class="docs-skip" href="#docs-content">Skip to content</a><header class="docs-header"><a class="docs-brand" href="/">myself.md<span>Documentation</span></a><nav aria-label="Site"><a href="/datasets">Datasets</a><a href="https://github.com/CodyBontecou/myself.md">GitHub ↗</a></nav></header><div class="docs-layout"><aside class="docs-sidebar"><nav aria-label="Documentation"><p>Start here</p><a href="/docs" ${reference ? '' : 'aria-current="page"'}>Getting started</a><a href="/docs/reference" ${reference ? 'aria-current="page"' : ''}>API reference</a><p>On this page</p>${headings.map((heading) => `<a href="#${anchor(heading)}">${escape(heading)}</a>`).join('')}<p>Resources</p><a href="/pricing">Pricing</a><a href="/privacy">Privacy</a><a href="/contact">Get help</a></nav></aside><main id="docs-content" class="docs-content">${content}<footer class="docs-footer"><a href="${reference ? '/docs' : '/docs/reference'}">${reference ? '← Getting started' : 'Continue to API reference →'}</a><a href="/contact">Need a hand?</a></footer></main></div></div>`;
}
