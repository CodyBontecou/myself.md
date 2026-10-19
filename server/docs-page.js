import { publicSiteHeader } from '../core/site-header.js';

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
/** @param {string} line */
function cells(line) {
  return line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
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
            lines.length >= 2 &&
            lines.every((line) => line.startsWith('|') && line.endsWith('|')) &&
            /^\|(?:\s*:?-+:?\s*\|)+$/.test(lines[1] ?? '')
          ) {
            return `<div class="docs-table"><table><thead><tr>${cells(lines[0] ?? '')
              .map((cell) => `<th scope="col">${inline(cell)}</th>`)
              .join('')}</tr></thead><tbody>${lines
              .slice(2)
              .map(
                (line) =>
                  `<tr>${cells(line)
                    .map((cell) => `<td>${inline(cell)}</td>`)
                    .join('')}</tr>`,
              )
              .join('')}</tbody></table></div>`;
          }
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
  const startLinks = documentation
    ? `<p>Start here</p><a href="/docs" ${reference ? '' : 'aria-current="page"'}>Getting started</a><a href="/docs/reference" ${reference ? 'aria-current="page"' : ''}>API reference</a>`
    : '';
  const contents = headings.length
    ? `<p>On this page</p>${headings.map((heading) => `<a href="#${anchor(heading)}">${escape(heading)}</a>`).join('')}`
    : '';
  const footer = documentation
    ? `<a href="${reference ? '/docs' : '/docs/reference'}">${reference ? '← Getting started' : 'Continue to API reference →'}</a><a href="/contact">Need a hand?</a>`
    : '<a href="/">← Home</a><a href="/delete-account">Delete account</a>';
  const navigation = `${startLinks}${contents}${documentation ? '<p>Resources</p><a href="/datasets">Datasets</a><a href="/pricing">Pricing</a><a href="/privacy">Privacy</a><a href="/contact">Get help</a>' : ''}`;
  return `<div class="docs-page"><a class="docs-skip" href="#docs-content">Skip to content</a><div class="docs-public-header">${publicSiteHeader(path)}</div><div class="docs-layout"><details class="docs-mobile-navigation"><summary>${documentation ? 'Documentation navigation' : 'On this page'}</summary><nav aria-label="${documentation ? 'Mobile documentation' : 'Mobile page navigation'}">${navigation}</nav></details><aside class="docs-sidebar${documentation ? '' : ' docs-sidebar-toc'}"><nav aria-label="${documentation ? 'Documentation' : 'Page navigation'}">${navigation}</nav></aside><main id="docs-content" class="docs-content">${content}<footer class="docs-footer">${footer}</footer></main></div></div>`;
}
