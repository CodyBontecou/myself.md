import { Marked } from 'marked';
import { z } from 'zod';
import { blogPosts } from './blog-content.js';
import { publicNavigation } from '../core/public-site.js';
import { sorted } from '../core/collections.js';

const origin = 'https://myself.md';
/** @param {string} text */
function escape(text) {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}
/** @param {string} text */
function anchor(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
/** Resolve vault note links only to published posts. @param {string} target */
function note(target) {
  const name = target.replace(/\.md$/, '').toLowerCase();
  return blogPosts.find((post) =>
    [
      post.source.replace(/\.md$/, ''),
      post.source.split('/').at(-1)?.replace(/\.md$/, ''),
      post.title,
      post.slug,
    ].some((value) => value?.toLowerCase() === name),
  );
}
/** @param {string} href */
function safeUrl(href) {
  if (
    /^(https?:\/\/|mailto:|\/(?![/\\])|#)/i.test(href) &&
    ![...href].some((character) => character.charCodeAt(0) <= 32 || character === '\\')
  )
    return href;
  return '';
}
const markdown = new Marked({
  renderer: {
    html({ text }) {
      return escape(text);
    },
    heading({ tokens, depth, text }) {
      const level = Math.max(2, depth);
      return `<h${level} id="${escape(anchor(text))}">${this.parser.parseInline(tokens)}</h${level}>`;
    },
    link({ href, tokens }) {
      let decoded;
      try {
        decoded = decodeURIComponent(href);
      } catch {
        decoded = href;
      }
      const [target = '', fragment] = decoded.split('#');
      const post = note(target.replace(/^\.\//, ''));
      const url = post
        ? `/blog/${post.slug}${fragment ? `#${anchor(fragment)}` : ''}`
        : safeUrl(href);
      const label = this.parser.parseInline(tokens);
      return url ? `<a href="${escape(url)}">${label}</a>` : label;
    },
    image({ href, text }) {
      const url = safeUrl(href);
      return url
        ? `<img src="${escape(url)}" alt="${escape(text)}" loading="lazy" decoding="async">`
        : escape(text);
    },
  },
  extensions: [
    {
      name: 'wikilink',
      level: 'inline',
      start(source) {
        return source.indexOf('[[');
      },
      tokenizer(source) {
        const match = /^\[\[([^\]\n]+)\]\]/.exec(source);
        return match ? { type: 'wikilink', raw: match[0], text: match[1] ?? '' } : undefined;
      },
      renderer(token) {
        const [target = '', alias] = String(token.text).split('|');
        const [name = '', fragment] = target.split('#');
        const post = note(name);
        const url = post ? `/blog/${post.slug}` : '';
        const href = url
          ? `${url}${fragment ? `#${anchor(fragment)}` : ''}`
          : !name && fragment
            ? `#${anchor(fragment)}`
            : '';
        const label = escape(alias || name || fragment || '');
        return href ? `<a href="${escape(href)}">${label}</a>` : label;
      },
    },
  ],
});
/** @param {typeof blogPosts[number]} post */
function summary(post) {
  return {
    slug: post.slug,
    title: post.title,
    date: post.date,
    updated: post.updated,
    description: post.description,
    author: post.author,
    minutes: post.minutes,
    url: `${origin}/blog/${post.slug}`,
    markdownUrl: `${origin}/blog/${post.slug}.md`,
  };
}
/** Previous is older; next is newer in the published chronological sequence.
 * @param {typeof blogPosts[number]} post */
function neighbors(post) {
  const index = blogPosts.findIndex((entry) => entry.slug === post.slug);
  const previous = blogPosts[index + 1];
  const next = index > 0 ? blogPosts[index - 1] : undefined;
  return {
    previousPost: previous ? summary(previous) : null,
    nextPost: next ? summary(next) : null,
  };
}
/** @param {typeof blogPosts[number]} post */
function postNavigation(post) {
  const { previousPost, nextPost } = neighbors(post);
  if (!previousPost && !nextPost) return '';
  return `<nav class="blog-post-nav" aria-label="Post navigation">${previousPost ? `<a class="blog-previous" rel="prev" href="/blog/${previousPost.slug}"><span>← Previous post</span><strong>${escape(previousPost.title)}</strong></a>` : ''}${nextPost ? `<a class="blog-next" rel="next" href="/blog/${nextPost.slug}"><span>Next post →</span><strong>${escape(nextPost.title)}</strong></a>` : ''}</nav>`;
}
/** One shared read for HTTP and MCP. @param {string} [slug] */
function readBlog(slug) {
  if (!slug) return { posts: blogPosts.map(summary), total: blogPosts.length };
  const post = blogPosts.find((entry) => entry.slug === slug);
  return post
    ? {
        post: {
          ...summary(post),
          ...neighbors(post),
          markdown: `# ${post.title}\n\n${authorMarkdown('By', post.author)} · ${post.date}\n\n${post.markdown}\n`,
        },
      }
    : { error: 'Post not found.', indexUrl: `${origin}/blog` };
}
/** @param {import('@modelcontextprotocol/server').McpServer} mcp */
export function registerBlogTool(mcp) {
  mcp.registerTool(
    'read_public_blog',
    {
      title: 'Read the public blog',
      description:
        'List all published posts, newest first, or read one complete post as Markdown with previous (older) and next (newer) post links. Public editorial content; no phone, account or location metadata.',
      inputSchema: z
        .object({
          slug: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .optional()
            .describe(
              'Published post slug returned by this tool. Omit to list posts and discover canonical URLs.',
            ),
        })
        .strict(),
      annotations: {
        title: 'Read the public blog',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ slug }) => {
      const result = readBlog(slug);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
        isError: 'error' in result,
      };
    },
  );
}

export const blogAgentIndex = `\n## Blog\n\n- [Latest writing and all posts](${origin}/blog)\n- [RSS feed](${origin}/blog/feed.xml)\n\nGET /blog or /blog/{slug} with Accept: text/markdown, or use /blog/{slug}.md. The full MCP endpoint exposes read_public_blog: omit slug to list, then pass a returned slug to read. Public posts require no HTTP authentication.\n${blogPosts.map((post) => `- [${post.title}](${origin}/blog/${post.slug}): ${post.description}`).join('\n')}\n`;
export const blogSitemap = `<url><loc>${origin}/blog</loc>${
  blogPosts[0] ? `<lastmod>${sorted(blogPosts.map((post) => post.updated)).at(-1)}</lastmod>` : ''
}</url>${blogPosts.map((post) => `<url><loc>${origin}/blog/${post.slug}</loc><lastmod>${post.updated}</lastmod></url>`).join('')}`;

const authorProfiles = /** @type {Record<string, string>} */ ({
  'Cody Bontecou': 'https://x.com/CodyBontecou',
});
/** Credit phrase such as "By Name", linked whole when the author has a profile. @param {string} prefix @param {string} name */
function authorMarkdown(prefix, name) {
  const text = `${prefix} ${name}`;
  return authorProfiles[name] ? `[${text}](${authorProfiles[name]})` : text;
}
/** @param {string} prefix @param {string} name */
function authorHtml(prefix, name) {
  const text = escape(`${prefix} ${name}`);
  return authorProfiles[name] ? `<a href="${authorProfiles[name]}" rel="author">${text}</a>` : text;
}
/** @param {typeof blogPosts[number]} post */
function byline(post) {
  const date = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(post.date));
  return `<p class="blog-meta"><time datetime="${post.date}">${date}</time> · ${post.minutes} minute${post.minutes === 1 ? '' : 's'} read</p>`;
}
/** Shared Node/Worker public representations. @param {string} path @param {string} accept */
export function blogResponse(path, accept) {
  if (path !== '/blog' && !path.startsWith('/blog/')) return null;
  const headers = {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    Vary: 'Accept',
    'X-Content-Type-Options': 'nosniff',
  };
  if (path === '/blog/feed.xml') {
    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/rss+xml; charset=utf-8' },
      body: `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>myself.md blog</title><link>${origin}/blog</link><description>Notes on building myself.md, personal data and ownership.</description><language>en</language><atom:link href="${origin}/blog/feed.xml" rel="self" type="application/rss+xml"/>${blogPosts.map((post) => `<item><title>${escape(post.title)}</title><link>${origin}/blog/${post.slug}</link><guid>${origin}/blog/${post.slug}</guid><pubDate>${new Date(post.date).toUTCString()}</pubDate><description>${escape(post.description)}</description></item>`).join('')}</channel></rss>`,
    };
  }
  const explicitMarkdown = path.endsWith('.md');
  const slug = path === '/blog' ? undefined : path.slice(6).replace(/\.md$/, '');
  const result = readBlog(slug);
  const post = slug ? blogPosts.find((entry) => entry.slug === slug) : undefined;
  const missing = 'error' in result;
  const title = post?.title ?? (missing ? 'Post not found' : 'Blog');
  const description =
    post?.description ??
    'Notes on building myself.md, personal data and ownership. Written by Cody Bontecou.';
  const canonical = `${origin}/blog${post ? `/${post.slug}` : ''}`;
  const plain = post
    ? `# ${post.title}\n\n${authorMarkdown('By', post.author)} · ${post.date}\n\n${post.markdown}\n`
    : missing
      ? '# Post not found\n\n[Browse all posts](https://myself.md/blog)\n'
      : `# Blog\n\n${description}\n\n${blogPosts.map((entry) => `- ${entry.date} · [${entry.title}](${origin}/blog/${entry.slug}) — ${entry.description}`).join('\n')}\n`;
  if (explicitMarkdown || accept.includes('text/markdown'))
    return {
      status: missing ? 404 : 200,
      headers: {
        ...headers,
        'Content-Type': 'text/markdown; charset=utf-8',
        Link: `<${canonical}>; rel="canonical"`,
      },
      body: plain,
    };
  const latest = blogPosts[0];
  const content = post
    ? `<article><header><a class="blog-back" href="/blog">← All posts</a><h1>${escape(post.title)}</h1>${byline(post)}<p class="blog-author">${authorHtml('By', post.author)}</p></header><div class="blog-prose">${markdown.parse(post.markdown, { async: false })}</div><footer class="blog-post-footer">${postNavigation(post)}<div class="blog-post-utilities"><a href="/blog">All posts</a><a href="/blog/${post.slug}.md">Read as Markdown</a></div></footer></article>`
    : missing
      ? '<h1>Post not found</h1><p>This post may have moved or is no longer published.</p><a href="/blog">Browse all posts →</a>'
      : `${latest ? `<section class="blog-latest" aria-labelledby="latest"><h1 id="latest" class="blog-label">Latest</h1><a class="blog-feature" href="/blog/${latest.slug}"><h2>${escape(latest.title)}</h2>${byline(latest)}<p>${escape(latest.description)}</p><span class="blog-continue">Keep reading →</span></a></section><section aria-labelledby="writing"><h2 id="writing" class="blog-label">Writing</h2><ul class="blog-list">${blogPosts.map((entry) => `<li><a href="/blog/${entry.slug}"><time datetime="${entry.date}">${entry.date.slice(0, 7).replace('-', ' · ')}</time><span>${escape(entry.title)}</span></a></li>`).join('')}</ul></section>` : '<p class="blog-empty">Writing is on its way. Check back soon.</p>'}`;
  const schema = post
    ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description,
        datePublished: post.date,
        dateModified: post.updated,
        author: { '@type': 'Person', name: post.author },
        publisher: { '@type': 'Organization', name: 'myself.md', url: origin },
        mainEntityOfPage: canonical,
        url: canonical,
        inLanguage: 'en',
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'myself.md blog',
        url: canonical,
        description,
        blogPost: blogPosts.map((entry) => ({
          '@type': 'BlogPosting',
          headline: entry.title,
          url: `${origin}/blog/${entry.slug}`,
          datePublished: entry.date,
        })),
      };
  return {
    status: missing ? 404 : 200,
    headers: {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' https:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    },
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="is-agentic-site-type" content="content"><title>${escape(title)} · myself.md</title><meta name="description" content="${escape(description)}">${missing ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}<meta property="og:type" content="${post ? 'article' : 'website'}"><meta property="og:title" content="${escape(title)} · myself.md"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}"><meta property="og:site_name" content="myself.md"><meta property="og:image" content="${origin}/dashboard/favicon.png"><meta name="twitter:card" content="summary">${post ? `<meta property="article:published_time" content="${post.date}"><meta property="article:modified_time" content="${post.updated}"><meta name="author" content="${escape(post.author)}">` : ''}<link rel="icon" href="/dashboard/favicon.png"><link rel="alternate" type="application/rss+xml" title="myself.md blog" href="/blog/feed.xml"><link rel="alternate" type="text/markdown" href="${post ? `/blog/${post.slug}.md` : '/blog'}"><link rel="stylesheet" href="/dashboard/style.css"><link rel="stylesheet" href="/dashboard/docs.css"><link rel="stylesheet" href="/dashboard/blog.css">${missing ? '' : `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`}</head><body><div class="blog-page"><a class="blog-skip" href="#content">Skip to content</a><div class="blog-shell"><div class="hero-portrait blog-portrait" aria-hidden="true"><div class="hero-portrait-sculpture"></div></div><header class="blog-header"><a href="/" class="blog-brand">myself.md</a><nav aria-label="Site">${publicNavigation
      .filter(({ label }) => ['Blog', 'Docs', 'Pricing', 'Contact', 'Privacy'].includes(label))
      .map(
        ({ label, href }) =>
          `<a href="${href}"${label === 'Blog' ? ' aria-current="page"' : ''}>${label}</a>`,
      )
      .join(
        '',
      )}</nav></header><main id="content">${content}</main><footer class="blog-footer"><span>myself.md · ${authorHtml('Writing by', 'Cody Bontecou')}</span><a href="/blog/feed.xml">RSS</a></footer></div></div></body></html>`,
  };
}
