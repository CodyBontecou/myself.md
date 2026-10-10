import { datasets } from '../dashboard/dataset-catalog.js';
import { publicDiscovery } from './public-discovery.js';
import { agentIndex, publicHTML, publicPages, publicFAQs } from '../core/public-site.js';

/** Shared public HTTP representations for Node and Workers. @param {string} pathname @param {string} accept @param {string} issuer @param {string} [resource] @param {URLSearchParams} [params] */
export function publicResponse(
  pathname,
  accept,
  issuer,
  resource = 'https://myself.md/mcp',
  params = new URLSearchParams(),
) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const path = publicApiPath(normalized) ?? normalized;
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept',
  };
  if (
    ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration'].includes(path)
  )
    return {
      status: 302,
      headers: { ...headers, Location: `${issuer}/.well-known/${path.split('/').at(-1)}` },
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
        ? { issuer, clientId: 'qr-phone', resource }
        : path === '/dashboard/config'
          ? { issuer, clientId: 'qr-dashboard' }
          : path === '/.well-known/oauth-protected-resource/mcp'
            ? {
                resource,
                authorization_servers: [issuer],
                scopes_supported: ['qr-connect'],
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
      'User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /api/\nDisallow: /auth/\nSitemap: https://myself.md/sitemap.xml\n';
  else if (path === '/llms.txt' || path === '/llms-full.txt') body = agentIndex;
  else if (path === '/sitemap.xml') {
    type = 'application/xml';
    body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...publicPages.keys(), '/demo', '/datasets'].map((page) => `<url><loc>https://myself.md${page}</loc><lastmod>2026-10-10</lastmod></url>`).join('')}</urlset>`;
  } else {
    const markdown = publicPages.get(path);
    if (!markdown) return null;
    if (accept.includes('text/markdown')) {
      type = 'text/markdown';
      body = markdown;
    } else if (['/docs', '/about', '/contact', '/faq'].includes(path)) {
      type = 'text/html';
      body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="myself.md personal health, screen time and location data for AI agents. Owner-approved MCP access and developer resources."><link rel="canonical" href="https://myself.md${path}">${path === '/faq' ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: publicFAQs.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) })}</script>` : ''}<script type="application/ld+json">${JSON.stringify(
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
      )}</script><title>${(markdown.split('\n')[0] ?? 'myself.md').slice(2)}</title><link rel="stylesheet" href="/dashboard/style.css"></head><body>${publicHTML(markdown)}</body></html>`;
    } else return null;
  }
  return { status: 200, headers: { ...headers, 'Content-Type': `${type}; charset=utf-8` }, body };
}
const privatePaths = new Set(['/mcp', '/pair', '/config', '/health']);
/** Unknown public paths must not masquerade as private resources. @param {string} pathname */
export function unknownPublicPath(pathname) {
  return (
    !privatePaths.has(pathname) &&
    !['/api/', '/qr/', '/auth/', '/.well-known/', '/dashboard/'].some((prefix) =>
      pathname.startsWith(prefix),
    )
  );
}
export const notFoundMarkdown =
  '# Page not found\n\nThis URL does not exist. Start at https://myself.md/llms.txt for agent instructions, https://myself.md/docs for MCP documentation, or https://myself.md/sitemap.xml for public pages.\n';

const apiPaths = new Set([
  '/dataset-catalog',
  '/health',
  '/config',
  '/dashboard/config',
  '/.well-known/oauth-protected-resource/mcp',
  '/llms.txt',
  '/docs',
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
