import { chatgptCatalogResponse } from './chatgpt-catalog.js';
import { randomUUID } from 'node:crypto';
import { notFoundPage } from './not-found-page.js';
import { pricingPage } from './pricing-page.js';
import { docsHTML } from './docs-page.js';
import { datasetPage } from './dataset-pages.js';
import { blogResponse, blogAgentIndex, blogSitemap } from './blog.js';
import { datasets, healthMetricExamples } from '../dashboard/dataset-catalog.js';
import {
  datasetWorkflows,
  workflowPrerequisites,
  workflowQuerySteps,
} from '../core/dataset-workflows.js';
import { publicDiscovery } from './public-discovery.js';
import { agentIndex, publicPages, publicFAQs } from '../core/public-site.js';
import { documentationGuides } from '../core/documentation.js';
import { projectSchema } from '../core/project-identity.js';

const pageDescriptions = new Map([
  ...documentationGuides.map(
    (guide) => /** @type {[string,string]} */ ([`/docs/${guide.slug}`, guide.description]),
  ),
  [
    '/docs',
    'Connect Apple Health, Android Health Connect and WHOOP to compatible AI assistants with myself.md. Set up MCP, pair your phone and approve specific data profiles.',
  ],
  [
    '/docs/reference',
    'myself.md API and MCP reference: OAuth, approved phone queries, asynchronous results, pagination, cloud exports and JavaScript integration.',
  ],
  [
    '/about',
    'Learn why myself.md exists: open-source personal data exports and owner-approved access for AI agents, built by Cody Bontecou.',
  ],
  [
    '/contact',
    'Contact myself.md support, report a bug or ask about personal data exports, MCP setup and account access.',
  ],
  [
    '/privacy',
    'How myself.md handles phone data, cloud exports, encryption, agent permissions, retention and deletion. Read the privacy policy before sharing records.',
  ],
  [
    '/terms',
    'myself.md service terms covering data access, purchases, optional cloud storage, subscriptions and your responsibilities.',
  ],
  [
    '/faq',
    'Answers about myself.md, Apple Health, Android Health Connect, Claude and Codex MCP setup, approvals, exports, pricing and revoking access.',
  ],
]);

/** Shared public HTTP representations for Node and Workers. @param {string} pathname @param {string} accept @param {string} issuer @param {string} [resource] @param {URLSearchParams} [params] */
export function publicResponse(
  pathname,
  accept,
  issuer,
  resource = 'https://myself.md/mcp',
  params = new URLSearchParams(),
) {
  const catalogPage = chatgptCatalogResponse(pathname, accept, params);
  if (catalogPage) return catalogPage;
  const withoutSlash = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const markdownAlias = withoutSlash.endsWith('.md') && publicPages.has(withoutSlash.slice(0, -3));
  const normalized = markdownAlias ? withoutSlash.slice(0, -3) : withoutSlash;
  const path = publicApiPath(normalized) ?? normalized;
  const blog = blogResponse(path, accept);
  if (blog)
    return {
      ...blog,
      body: blog.headers['Content-Type']?.startsWith('text/html')
        ? analyticsHTML(blog.body)
        : blog.body,
    };
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept',
  };
  const datasetDocument = datasetPage(path.endsWith('.md') ? path.slice(0, -3) : path);
  if (datasetDocument && (accept.includes('text/markdown') || path.endsWith('.md')))
    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' },
      body: datasetDocument.markdown,
    };
  // Public ownership proof issued by the verified OpenAI plugin portal.
  if (path === '/.well-known/openai-apps-challenge')
    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
      body: 'CmoL749Qa-jnr58RJB1pIK4jg2FlCVYpSLwXKy1ZZUA',
    };
  if (path === '/support')
    return { status: 308, headers: { ...headers, Location: '/contact' }, body: '' };
  if (
    [
      '/.well-known/oauth-authorization-server',
      '/.well-known/openid-configuration',
      `/.well-known/oauth-authorization-server${new URL(issuer).pathname.replace(/\/$/, '')}`,
    ].includes(path)
  )
    return {
      status: 302,
      headers: {
        ...headers,
        Location: `${issuer}/.well-known/${path === '/.well-known/openid-configuration' ? 'openid-configuration' : 'oauth-authorization-server'}`,
      },
      body: '',
    };
  if (path === '/dataset-catalog') {
    const limit = Number(params.get('limit') ?? 3);
    const cursor = params.get('cursor');
    const offset = cursor ? Number(cursor.match(/^catalog-v1:([0-3])$/)?.[1] ?? NaN) : 0;
    if (
      ![...params.keys()].every((key) => ['limit', 'cursor'].includes(key)) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 3 ||
      !Number.isInteger(offset)
    )
      return {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'limit must be 1–3; cursor must be a returned catalog-v1 cursor.',
        }),
      };
    const catalog = Object.entries(datasets).map(([slug, dataset]) => ({
      slug,
      name: dataset.title,
      domain: dataset.domain,
      description: dataset.introduction,
      sources: dataset.sources,
      url: `https://myself.md/datasets/${slug}`,
      groups: dataset.groups,
      limitations: dataset.limitations,
      metricExamples: slug === 'health' ? healthMetricExamples : [],
      workflows: datasetWorkflows
        .filter((workflow) => workflow.dataset === slug)
        .map((workflow) =>
          Object.assign({}, workflow, {
            exampleKind: 'fictional',
            prerequisites: workflowPrerequisites,
            querySteps: workflowQuerySteps,
            setupUrl: 'https://myself.md/docs',
            interpretation:
              'Check actual record coverage, source metadata, timestamps and units before answering. Report gaps and uncertainty; supported types do not establish records or authorization.',
          }),
        ),
    }));
    const next = offset + limit;
    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: catalog.slice(offset, next),
        nextCursor: next < catalog.length ? `catalog-v1:${next}` : null,
        hasMore: next < catalog.length,
        total: catalog.length,
      }),
    };
  }
  const data =
    path === '/health'
      ? { ok: true }
      : path === '/config'
        ? { issuer, clientId: 'myselfmd-phone', resource }
        : path === '/dashboard/config'
          ? { issuer, clientId: 'myselfmd-dashboard' }
          : [
                '/.well-known/oauth-protected-resource/mcp',
                '/.well-known/oauth-protected-resource/mcp/chatgpt',
              ].includes(path)
            ? {
                resource: path.endsWith('/chatgpt') ? `${resource}/chatgpt` : resource,
                authorization_servers: [issuer],
                scopes_supported: ['myselfmd', 'offline_access'],
                bearer_methods_supported: ['header'],
              }
            : publicDiscovery(path);
  const discovery = data;
  if (discovery)
    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(discovery),
    };
  let body;
  let type = 'text/plain';
  if (path === '/robots.txt')
    body =
      'User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /operator/\nDisallow: /api/\nDisallow: /auth/\nSitemap: https://myself.md/sitemap.xml\n';
  else if (path === '/llms.txt' || path === '/llms-full.txt') body = agentIndex + blogAgentIndex;
  else if (path === '/sitemap.xml') {
    type = 'application/xml';
    body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...publicPages.keys(), '/datasets', ...Object.keys(datasets).map((slug) => `/datasets/${slug}`)].map((page) => `<url><loc>https://myself.md${page}</loc></url>`).join('')}${blogSitemap}</urlset>`;
  } else {
    const markdown = publicPages.get(path);
    if (!markdown) return null;
    if (accept.includes('text/markdown') || markdownAlias) {
      type = 'text/markdown';
      body = markdown;
    } else if (path === '/pricing') {
      type = 'text/html';
      body = pricingPage();
    } else if (pageDescriptions.has(path)) {
      type = 'text/html';
      const title = `${(markdown.split('\n')[0] ?? '# myself.md').slice(2)} · myself.md`;
      body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${path.startsWith('/docs') ? '<meta name="is-agentic-site-type" content="content">' : ''}<meta name="description" content="${pageDescriptions.get(path)}"><link rel="canonical" href="https://myself.md${path}"><meta property="og:type" content="website"><meta property="og:site_name" content="myself.md"><meta property="og:title" content="${title}"><meta property="og:description" content="${pageDescriptions.get(path)}"><meta property="og:url" content="https://myself.md${path}"><meta property="og:image" content="https://myself.md/dashboard/favicon.png"><meta property="og:image:alt" content="myself.md app icon"><meta name="twitter:card" content="summary"><link rel="icon" href="/dashboard/favicon.png"><link rel="alternate" type="text/markdown" href="${path}.md"><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [projectSchema, { '@type': 'WebPage', '@id': `https://myself.md${path}#page`, url: `https://myself.md${path}`, name: title, about: { '@id': projectSchema['@id'] }, author: projectSchema.author, primaryImageOfPage: { '@type': 'ImageObject', url: projectSchema.image } }] }).replaceAll('<', '\\u003c')}</script>${path === '/faq' ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: publicFAQs.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) })}</script>` : ''}<script type="application/ld+json">${JSON.stringify(
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'myself.md', item: 'https://myself.md/' },
            {
              '@type': 'ListItem',
              position: 2,
              name: markdown.split('\n')[0]?.slice(2),
              item: `https://myself.md${path}`,
            },
          ],
        },
      )}</script><title>${(markdown.split('\n')[0] ?? '# myself.md').slice(2)} · myself.md</title><link rel="stylesheet" href="/dashboard/style.css"><link rel="stylesheet" href="/dashboard/docs.css"><script type="module" src="/dashboard/public-tools.js"></script></head><body>${docsHTML(markdown, path)}</body></html>`;
    } else return null;
  }
  return {
    status: 200,
    headers: { ...headers, 'Content-Type': `${type}; charset=utf-8` },
    body: type === 'text/html' ? analyticsHTML(body) : body,
  };
}
const privatePaths = new Set(['/mcp', '/mcp/chatgpt', '/pair', '/config', '/health']);
/** Unknown public paths must not masquerade as private resources. @param {string} pathname */
export function unknownPublicPath(pathname) {
  return (
    !privatePaths.has(pathname) &&
    !['/api/', '/qr/', '/auth/', '/.well-known/', '/dashboard/'].some((prefix) =>
      pathname.startsWith(prefix),
    )
  );
}
const notFoundMarkdown =
  '# Page not found\n\nThis URL does not exist. Start at https://myself.md/llms.txt for agent instructions, https://myself.md/docs for MCP documentation, or https://myself.md/sitemap.xml for public pages.\n';

/** Match public content negotiation: explicit Markdown stays machine-readable. @param {string} accept */
export function notFoundResponse(accept) {
  const html = accept.includes('text/html') && !accept.includes('text/markdown');
  const nonce = html ? randomUUID() : '';
  return {
    body: html ? notFoundPage(nonce) : notFoundMarkdown,
    headers: {
      'Content-Type': `${html ? 'text/html' : 'text/markdown'}; charset=utf-8`,
      'Cache-Control': 'no-store',
      Vary: 'Accept',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...(html
        ? {
            'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
          }
        : {}),
    },
  };
}

const apiPaths = new Set([
  ...documentationGuides.map((guide) => `/docs/${guide.slug}`),
  '/dataset-catalog',
  '/health',
  '/config',
  '/dashboard/config',
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-protected-resource/mcp/chatgpt',
  '/llms.txt',
  '/docs',
  '/docs/reference',
]);
/** Resolve only documented public reads; versioning never rewrites private routes. @param {string} path */
export function publicApiPath(path) {
  const normalized = path.length > 1 ? path.replace(/\/$/, '') : path;
  const canonical = normalized.startsWith('/v1/') ? normalized.slice(3) : normalized;
  return apiPaths.has(canonical) ? canonical : null;
}
/** Per-process/isolate public-read protection. No identity, token or account is stored. */
export function createPublicReadLimiter() {
  /** @type {Map<string, { count: number, until: number }>} */
  const windows = new Map();
  /** @param {string} key @param {number} [now] */
  return (key, now = Date.now()) => {
    let window = windows.get(key);
    if (!window || now >= window.until) {
      if (windows.size >= 10000) {
        const oldest = windows.keys().next().value;
        if (oldest !== undefined) windows.delete(oldest);
      }
      window = { count: 0, until: now + 60000 };
      windows.set(key, window);
    }
    window.count += 1;
    const headers = {
      'RateLimit-Limit': '120',
      'RateLimit-Remaining': String(Math.max(0, 120 - window.count)),
      'RateLimit-Reset': String(Math.ceil((window.until - now) / 1000)),
      'RateLimit-Policy': '120;w=60',
      'X-RateLimit-Limit': '120',
      'X-RateLimit-Remaining': String(Math.max(0, 120 - window.count)),
      'X-RateLimit-Reset': String(Math.ceil(window.until / 1000)),
    };
    return { allowed: window.count <= 120, headers };
  };
}

/** Public documents share collection controls; profile shares and identity forms never pass here.
 * @param {string} body */
function analyticsHTML(body) {
  const script =
    body.includes('/dashboard/public-tools.js') || body.includes('/dashboard/app.js')
      ? ''
      : '<script type="module" src="/dashboard/usage-analytics.js"></script>';
  return body.replace(
    '</head>',
    `<link rel="stylesheet" href="/dashboard/analytics.css">${script}</head>`,
  );
}
