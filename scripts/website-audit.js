import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const SITE = 'https://myself.md';
const CF_ACCOUNT = 'e4265f322e6380ee832b83ad45e3e8c0';
const CF_SITE = 'cb88fcc74dbb4b3d902f5ca2f61b654a';
const MAX_PAGES = 12;
const MAX_FINDINGS = 22;
const MAX_REPORT_BYTES = 12000;
const DAY = 86400000;

/**
 * @typedef {{id:string,severity:'error'|'warning',url:string,issue:string,evidence:string}} Finding
 * @typedef {{url:string,status:number|'error',indexable?:boolean,reason?:string}} PageSample
 * @typedef {{status?:number|'error',reason?:string,sitemapDeclared?:boolean,index?:boolean,allowedPageCount?:number,ignoredLocations?:number}} Discovery
 * @typedef {{status:'available'|'error',sampled:PageSample[],sitemap:Discovery,robots:Discovery,limitations:string,omittedFindings:number,omittedSamples:number}} PublicSource
 * @typedef {{agents:string[],rules:{allow:boolean,path:string}[]}} RobotsGroup
 * @typedef {{clicks:number,impressions:number,ctr:number,position:number}} SearchMetrics
 */

/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_object');
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @returns {unknown[]} */
function rows(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('invalid_rows');
  return value;
}

/** @param {unknown} value */
function number(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('invalid_number');
  return value;
}

/** @param {string|null|undefined} value @returns {value is string} */
function present(value) {
  return typeof value === 'string' && value.length > 0;
}

/** @param {string} body */
function jsonObject(body) {
  return object(/** @type {unknown} */ (JSON.parse(body)));
}

/** @param {unknown} value @returns {SearchMetrics} */
function metrics(value) {
  const row = object(value);
  return {
    clicks: number(row.clicks),
    impressions: number(row.impressions),
    ctr: Number(number(row.ctr).toFixed(4)),
    position: Number(number(row.position).toFixed(2)),
  };
}

/** @param {unknown} value */
function rumRow(value) {
  const row = object(value);
  /** @type {Record<string,unknown>} */
  const dimensions = row.dimensions ? object(row.dimensions) : {};
  return {
    count: number(row.count),
    visits: row.sum ? number(object(row.sum).visits) : null,
    sampleInterval: row.avg ? number(object(row.avg).sampleInterval) : null,
    requestPath: typeof dimensions.requestPath === 'string' ? dimensions.requestPath : '',
    refererHost: text(dimensions.refererHost, 100),
  };
}

/** @param {unknown} value @param {number} [length] */
function text(value, length = 180) {
  return String(value ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length);
}

/** @param {string} value */
function decode(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#39|#\d+|#x[\da-f]+);/gi, (entity) => {
    /** @type {Record<string,string>} */
    const named = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&#39;': "'",
    };
    const replacement = named[entity.toLowerCase()];
    if (replacement !== undefined) return replacement;
    const code = entity.toLowerCase().startsWith('&#x')
      ? parseInt(entity.slice(3), 16)
      : parseInt(entity.slice(2), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

/** Restrict discovery and every redirect to public, query-free, same-origin URLs. @param {string} value */
function publicURL(value) {
  try {
    const url = new URL(decode(value), SITE);
    if (
      url.origin !== SITE ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      url.href.length > 240
    )
      return null;
    if (/^\/(?:auth|api|dashboard|mcp|\.well-known)(?:\/|$)/i.test(url.pathname)) return null;
    if (/%(?:2f|5c|2e|00)/i.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Bounded response reads, including decoded bodies; never return upstream error bodies. @param {string} url @param {RequestInit} [options] @param {number} [maxBytes] @returns {Promise<{status:number,headers:Headers,body:string}>} */
async function request(url, options = {}, maxBytes = 512000) {
  /** @type {Response} */
  const response = await fetch(url, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.body) return { status: response.status, headers: response.headers, body: '' };
  const reader = response.body.getReader();
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  /** @returns {Promise<void>} */
  const next = async () => {
    const { value, done } = await reader.read();
    if (done) return;
    size += value.byteLength;
    if (size > maxBytes) throw new Error('response_size_limit');
    chunks.push(Buffer.from(value));
    await next();
  };
  try {
    await next();
  } finally {
    await reader.cancel();
  }
  return {
    status: response.status,
    headers: response.headers,
    body: Buffer.concat(chunks).toString('utf8'),
  };
}

/** @param {string} url @param {number} [redirects] @returns {Promise<{status:number,headers:Headers,body:string,url:string}>} */
async function publicRequest(url, redirects = 0) {
  if (redirects > 3) throw new Error('redirect_limit');
  const response = await request(url, {
    headers: {
      accept: 'text/html,application/xml,text/plain',
      'user-agent': 'myself-md-site-audit/1.0',
    },
  });
  if (![301, 302, 303, 307, 308].includes(response.status)) return { ...response, url };
  const location = response.headers.get('location');
  const destination = location ? publicURL(new URL(location, url).href) : null;
  if (!destination) throw new Error('unsafe_redirect');
  return publicRequest(destination, redirects + 1);
}

/** @param {string} tag */
function attributes(tag) {
  /** @type {Record<string,string>} */
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[(match[1] ?? '').toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

/** Conservative CSP match: report only explicit blocking, not policies whose nonce/hash semantics are ambiguous. @param {string} policy @param {string} directive @param {string} target */
function cspBlocks(policy, directive, target) {
  const directives = new Map(
    policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
  const sources =
    directives.get(directive) ??
    (directive === 'script-src-elem' ? directives.get('script-src') : undefined) ??
    directives.get('default-src');
  if (!sources || sources.some((source) => /nonce-|sha\d+-|'strict-dynamic'/.test(source)))
    return false;
  const url = new URL(target);
  return !sources.some(
    (source) =>
      source === '*' ||
      source === 'https:' ||
      source === url.origin ||
      source === target ||
      (source === "'self'" && url.origin === SITE) ||
      (source.startsWith('https://*.') && url.hostname.endsWith(source.slice(10))),
  );
}

/** @param {string} robots @param {string} pathname */
function robotsBlocks(robots, pathname) {
  /** @type {RobotsGroup[]} */
  const groups = [];
  /** @type {RobotsGroup|null} */
  let group = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const match = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!match) continue;
    const name = (match[1] ?? '').toLowerCase();
    if (name === 'user-agent') {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push((match[2] ?? '').trim().toLowerCase());
    } else if (group && match[2]) group.rules.push({ allow: name === 'allow', path: match[2] });
  }
  const rules = groups
    .filter((entry) => entry.agents.includes('*'))
    .flatMap((entry) => entry.rules);
  const best = rules.reduce((selected, rule) => {
    const pattern = rule.path
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')
      .replace(/\\\$$/, '$');
    if (!new RegExp(`^${pattern}`).test(pathname)) return selected;
    return !selected ||
      rule.path.length > selected.path.length ||
      (rule.path.length === selected.path.length && rule.allow)
      ? rule
      : selected;
  }, /** @type {{allow:boolean,path:string}|null} */ (null));
  return best ? !best.allow : false;
}

/** @param {Finding[]} findings @param {string} rule @param {string} url @param {string} issue @param {string} evidence @param {'error'|'warning'} [severity] */
function finding(findings, rule, url, issue, evidence, severity = 'warning') {
  if (findings.length >= MAX_FINDINGS) return;
  findings.push({
    id: `${rule}-${createHash('sha256').update(url).digest('hex').slice(0, 12)}`,
    severity,
    url,
    issue: text(issue, 140),
    evidence: text(evidence, 260),
  });
}

/** @param {Finding[]} findings */
async function collectPublic(findings) {
  /** @type {PublicSource} */
  const source = {
    status: 'available',
    sampled: [],
    sitemap: {},
    robots: {},
    omittedFindings: 0,
    omittedSamples: 0,
    limitations:
      'Bounded HTTP/HTML sample, not a browser render, full crawl, schema eligibility or indexing guarantee.',
  };
  const seeds = ['/', '/blog', '/docs', '/pricing'].map((path) => SITE + path);
  let robots = '';
  /** @type {string[]} */
  let discovered = [];
  try {
    const response = await publicRequest(`${SITE}/robots.txt`);
    source.robots = { status: response.status };
    if (response.status === 200) {
      robots = response.body;
      const declared = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)]
        .map((match) => publicURL(match[1] ?? ''))
        .filter(present);
      source.robots.sitemapDeclared = declared.includes(`${SITE}/sitemap.xml`);
      if (!source.robots.sitemapDeclared)
        finding(
          findings,
          'robots-sitemap',
          `${SITE}/robots.txt`,
          'Robots file lacks the public sitemap declaration',
          'HTTP 200 robots.txt has no Sitemap: https://myself.md/sitemap.xml declaration.',
        );
    } else
      finding(
        findings,
        'robots-status',
        `${SITE}/robots.txt`,
        'Robots file returned a non-200 response',
        `HTTP ${response.status}`,
      );
  } catch {
    source.robots = {
      status: 'error',
      reason:
        'Request failed, timed out, exceeded size limit or redirected outside allowed public URLs.',
    };
  }
  try {
    const response = await publicRequest(`${SITE}/sitemap.xml`);
    if (response.status !== 200)
      finding(
        findings,
        'sitemap-status',
        `${SITE}/sitemap.xml`,
        'Sitemap returned a non-200 response',
        `HTTP ${response.status}`,
        'error',
      );
    const locations = [...response.body.matchAll(/<loc\b[^>]*>([^<]+)<\/loc>/gi)].map((match) =>
      (match[1] ?? '').trim(),
    );
    const index = /<sitemapindex\b/i.test(response.body);
    const pageLocations = index ? [] : locations;
    if (index && response.status === 200) {
      const nestedResponses = await Promise.all(
        locations.slice(0, 2).map(async (location) => {
          const child = publicURL(location);
          return child ? publicRequest(child) : null;
        }),
      );
      for (const nested of nestedResponses) {
        if (nested?.status === 200 && /<urlset\b/i.test(nested.body))
          pageLocations.push(
            ...[...nested.body.matchAll(/<loc\b[^>]*>([^<]+)<\/loc>/gi)].map((match) =>
              (match[1] ?? '').trim(),
            ),
          );
      }
    }
    discovered = [...new Set(pageLocations.map(publicURL).filter(present))];
    source.sitemap = {
      status: response.status,
      index,
      allowedPageCount: discovered.length,
      ignoredLocations: pageLocations.length - discovered.length,
    };
    if (response.status === 200 && !/<(?:urlset|sitemapindex)\b/i.test(response.body))
      finding(
        findings,
        'sitemap-format',
        `${SITE}/sitemap.xml`,
        'Sitemap does not contain a sitemap root element',
        'HTTP 200 response lacks urlset or sitemapindex.',
      );
    if (response.status === 200 && !index) {
      for (const seed of seeds)
        if (!discovered.includes(seed) && !discovered.includes(`${seed}/`))
          finding(
            findings,
            'sitemap-missing',
            seed,
            'Public content page is absent from the sitemap',
            'Seed homepage/blog/docs/pricing URL was not found in the fetched sitemap.',
          );
    }
  } catch {
    source.sitemap = {
      status: 'error',
      reason:
        'Request failed, timed out, exceeded size limit or redirected outside allowed public URLs.',
    };
  }
  // Prefer an actual post and documentation subpage before filling the remaining sample.
  const preferred = [
    discovered.find((url) => new URL(url).pathname.startsWith('/blog/')),
    discovered.find((url) => new URL(url).pathname.startsWith('/docs/')),
  ].filter(present);
  const urls = [...new Set([...seeds, ...preferred, ...discovered])].slice(0, MAX_PAGES);
  /** @type {Map<string,string>} */
  const seenTitles = new Map();
  /** @type {Map<string,string>} */
  const seenDescriptions = new Map();
  /** @param {string} url */
  const inspectPage = async (url) => {
    try {
      const response = await publicRequest(url);
      /** @type {PageSample} */
      const sample = { url, status: response.status };
      source.sampled.push(sample);
      if (response.status !== 200) {
        finding(
          findings,
          'page-status',
          url,
          'Public content URL returned a non-200 response',
          `HTTP ${response.status}`,
          'error',
        );
        return;
      }
      if (!/text\/html/i.test(response.headers.get('content-type') ?? '')) {
        finding(
          findings,
          'page-content-type',
          url,
          'Public content URL is not served as HTML',
          `HTTP 200 Content-Type: ${text(response.headers.get('content-type'), 80)}`,
        );
        return;
      }
      const html = response.body.replace(/<!--[\s\S]*?-->/g, '');
      const tags = [...html.matchAll(/<(?:meta|link)\b[^>]*>/gi)].map((match) =>
        attributes(match[0]),
      );
      const robotMetadata = tags
        .filter((tag) => /^(?:robots|googlebot)$/i.test(tag.name ?? ''))
        .map((tag) => tag.content ?? '')
        .join(',');
      if (
        /\b(?:noindex|none)\b/i.test(
          `${robotMetadata},${response.headers.get('x-robots-tag') ?? ''}`,
        )
      ) {
        if (discovered.includes(url) || seeds.includes(url))
          finding(
            findings,
            'public-noindex',
            url,
            'Public sitemap or seed page excludes itself from search indexing',
            'The fetched HTML robots metadata or X-Robots-Tag contains noindex/none. Confirm intended visibility before changing.',
            'error',
          );
        sample.indexable = false;
        return;
      }
      sample.indexable = true;
      if (robotsBlocks(robots, new URL(url).pathname))
        finding(
          findings,
          'robots-blocked',
          url,
          'Public indexable page is disallowed for general crawlers',
          'Matching User-agent: * Disallow rule in fetched robots.txt.',
        );
      const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((match) =>
        text(decode((match[1] ?? '').replace(/<[^>]*>/g, '')), 180),
      );
      const descriptions = tags
        .filter((tag) => tag.name?.toLowerCase() === 'description')
        .map((tag) => text(tag.content, 220));
      /** @type {{kind:string,values:string[],seen:Map<string,string>}[]} */
      const metadata = [
        { kind: 'title', values: titles, seen: seenTitles },
        { kind: 'description', values: descriptions, seen: seenDescriptions },
      ];
      for (const { kind, values, seen } of metadata) {
        if (!values[0])
          finding(
            findings,
            `missing-${kind}`,
            url,
            `Public page has no nonempty ${kind}`,
            `HTTP 200 indexable HTML; ${kind} absent or empty.`,
          );
        else {
          if (values.length > 1)
            finding(
              findings,
              `multiple-${kind}`,
              url,
              `Public page has multiple ${kind} tags`,
              `${values.length} ${kind} tags in indexable HTML.`,
            );
          if (seen.has(values[0]))
            finding(
              findings,
              `duplicate-${kind}`,
              url,
              `Public pages share the same ${kind}`,
              `Same ${kind} as ${seen.get(values[0])}: ${text(values[0], 130)}`,
            );
          else seen.set(values[0], url);
        }
      }
      const canonicals = tags.filter((tag) => /(?:^|\s)canonical(?:\s|$)/i.test(tag.rel ?? ''));
      if (canonicals.length !== 1)
        finding(
          findings,
          'canonical-count',
          url,
          'Public page needs one canonical URL',
          `Found ${canonicals.length} canonical links.`,
        );
      else {
        const canonical = canonicals[0]?.href;
        const safe = canonical ? publicURL(canonical) : null;
        if (!safe || !canonical?.startsWith(`${SITE}/`))
          finding(
            findings,
            'canonical-invalid',
            url,
            'Canonical is missing, non-absolute or outside the public site',
            `Canonical href: ${text(canonical, 160)}`,
          );
        else if (safe.replace(/\/$/, '') !== response.url.replace(/\/$/, ''))
          finding(
            findings,
            'canonical-target',
            url,
            'Indexable page canonical points to another URL',
            `Final URL ${response.url}; canonical ${safe}. This may be intentional; inspect before changing.`,
          );
      }
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        const attrs = attributes(match[1] ?? '');
        if (attrs.type?.toLowerCase() === 'application/ld+json') {
          try {
            JSON.parse(match[2] ?? '');
          } catch {
            finding(
              findings,
              'structured-data-json',
              url,
              'Structured data is not valid JSON',
              'An application/ld+json script could not be parsed as JSON.',
              'error',
            );
          }
        }
        if (attrs.src && /^https:\/\/static\.cloudflareinsights\.com\//i.test(attrs.src)) {
          const policies = [
            response.headers.get('content-security-policy'),
            ...tags
              .filter((tag) => tag['http-equiv']?.toLowerCase() === 'content-security-policy')
              .map((tag) => tag.content),
          ].filter(present);
          const scriptURL = attrs.src;
          if (policies.some((policy) => cspBlocks(policy, 'script-src-elem', scriptURL)))
            finding(
              findings,
              'beacon-script-csp',
              url,
              'CSP blocks the installed Cloudflare analytics script',
              'Cloudflare beacon script exists, but an enforced CSP source list excludes its HTTPS origin.',
              'error',
            );
          if (
            policies.some(
              (policy) =>
                cspBlocks(policy, 'connect-src', 'https://cloudflareinsights.com/cdn-cgi/rum') &&
                cspBlocks(policy, 'connect-src', `${SITE}/cdn-cgi/rum`),
            )
          )
            finding(
              findings,
              'beacon-connect-csp',
              url,
              'CSP blocks the installed Cloudflare analytics beacon',
              'Cloudflare beacon exists, but an enforced connect-src/default-src excludes both the same-origin and cloudflareinsights.com beacon endpoints.',
              'error',
            );
        }
      }
    } catch {
      source.sampled.push({
        url,
        status: 'error',
        reason: 'Request failed, timed out, exceeded size limit or encountered an unsafe redirect.',
      });
    }
  };
  await urls.reduce((previous, url) => previous.then(() => inspectPage(url)), Promise.resolve());
  source.status = source.sampled.some((page) => page.status === 200) ? 'available' : 'error';
  return source;
}

/** @param {Date} now */
async function collectCloudflare(now) {
  const token = process.env.CF_ANALYTICS_API_TOKEN;
  if (!token) return { status: 'unavailable', reason: 'CF_ANALYTICS_API_TOKEN is not configured.' };
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 7 * DAY);
  try {
    // Verified against the live CF GraphQL schema on 2026-10-16:
    // AccountRumPageloadEventsAdaptiveGroups: count, sum.visits, avg.sampleInterval;
    // dimensions.requestPath/refererHost; Filter_InputObject datetime_geq/lt, siteTag/requestHost.
    const filter = `{siteTag:"${CF_SITE}",requestHost:"myself.md",datetime_geq:"${start.toISOString()}",datetime_lt:"${end.toISOString()}"}`;
    const query = `{viewer{accounts(filter:{accountTag:"${CF_ACCOUNT}"}){totals:rumPageloadEventsAdaptiveGroups(limit:1,filter:${filter}){count sum{visits} avg{sampleInterval}} pages:rumPageloadEventsAdaptiveGroups(limit:5,filter:${filter},orderBy:[count_DESC]){count sum{visits} dimensions{requestPath}} referrers:rumPageloadEventsAdaptiveGroups(limit:5,filter:${filter},orderBy:[count_DESC]){count dimensions{refererHost}}}}}`;
    const response = await request(
      'https://api.cloudflare.com/client/v4/graphql',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      },
      64000,
    );
    if (response.status !== 200)
      return {
        status: 'error',
        reason: `Cloudflare API HTTP ${response.status}; check token Analytics:Read account access.`,
      };
    const data = jsonObject(response.body);
    if (data.errors && rows(data.errors).length)
      return {
        status: 'error',
        reason:
          'Cloudflare GraphQL returned errors; check read permissions, dataset availability and retention.',
      };
    const accounts = rows(object(object(data.data).viewer).accounts);
    const account = object(accounts[0]);
    const totals = rows(account.totals);
    const total = totals[0] === undefined ? null : rumRow(totals[0]);
    if (!total)
      return {
        status: 'available',
        window: { start: start.toISOString(), endExclusive: end.toISOString() },
        assessment: 'No RUM rows returned; absence is not evidence of zero traffic.',
        pageviews: null,
        visits: null,
        limitations:
          'Recent analytics setup; EU exclusions, blocked beacons and adaptive sampling limit audience coverage.',
      };
    if (total.visits === null || total.sampleInterval === null) throw new Error('invalid_data');
    return {
      status: 'available',
      window: { start: start.toISOString(), endExclusive: end.toISOString() },
      pageviews: total.count,
      visits: total.visits,
      sampling: { averageInterval: total.sampleInterval, adaptive: true },
      measurementStart: '2026-10-16',
      comparableBaseline: start >= new Date('2026-10-17T00:00:00Z'),
      assessment:
        start < new Date('2026-10-17T00:00:00Z')
          ? 'Window crosses beacon activation on 2026-10-16; incomplete baseline, report only.'
          : total.count < 100
            ? 'Insufficient volume for traffic or conversion conclusions.'
            : 'Descriptive counts only; no causal or ranking inference.',
      pages: rows(account.pages)
        .map(rumRow)
        .slice(0, 5)
        .map((row) => ({
          url: publicURL(`${SITE}${row.requestPath.split(/[?#]/)[0] ?? ''}`),
          pageviews: row.count,
          visits: row.visits,
        }))
        .filter((row) => row.url),
      referrers: rows(account.referrers)
        .map(rumRow)
        .slice(0, 5)
        .map((row) => ({
          host: row.refererHost || '(direct/unknown)',
          pageviews: row.count,
        })),
      limitations:
        'Beacon was blocked by CSP until 2026-10-16. Enabled Cloudflare lite mode excludes EU visitors; absent EU traffic is not a decline. Blocked beacons and adaptive sampling further limit coverage. Visits are Cloudflare visits, not unique users. Top groups are truncated.',
    };
  } catch {
    return {
      status: 'error',
      reason:
        'Cloudflare request failed, timed out, exceeded bounds or returned invalid data; no traffic conclusion is available.',
    };
  }
}

/** @param {Date} date */
function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

/** @param {Date} now @param {Finding[]} findings */
async function collectSearchConsole(now, findings) {
  if (!process.env.GSC_ACCESS_TOKEN && !process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON)
    return {
      status: 'unavailable',
      reason:
        'Configure GSC_ACCESS_TOKEN (Workload Identity Federation preferred) or GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON, and grant the service account Search Console access.',
    };
  try {
    let token = process.env.GSC_ACCESS_TOKEN;
    if (!token) {
      const credentials = jsonObject(
        process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON ?? '{}',
      );
      if (
        credentials.type !== 'service_account' ||
        typeof credentials.client_email !== 'string' ||
        typeof credentials.private_key !== 'string'
      )
        return { status: 'error', reason: 'Search Console service-account JSON is invalid.' };
      const auth = new GoogleAuth({
        credentials: {
          type: 'service_account',
          client_email: credentials.client_email,
          private_key: credentials.private_key,
        },
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      });
      /** @type {ReturnType<typeof setTimeout>|undefined} */
      let timer;
      try {
        /** @type {Promise<never>} */
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('auth_timeout')), 15000);
        });
        token = (await Promise.race([auth.getAccessToken(), deadline])) ?? undefined;
      } finally {
        clearTimeout(timer);
      }
    }
    if (typeof token !== 'string' || !token)
      return { status: 'error', reason: 'Google authentication did not return an access token.' };
    const property = encodeURIComponent('sc-domain:myself.md');
    const base = `https://www.googleapis.com/webmasters/v3/sites/${property}`;
    const end = new Date(`${dateOnly(now)}T00:00:00.000Z`);
    // Four UTC calendar days leaves >=72 hours after the final Pacific day closes.
    end.setUTCDate(end.getUTCDate() - 4);
    const start = new Date(end.getTime() - 27 * DAY);
    const previousEnd = new Date(start.getTime() - DAY);
    const previousStart = new Date(previousEnd.getTime() - 27 * DAY);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const window = { startDate: dateOnly(start), endDate: dateOnly(end) };
    const previousWindow = { startDate: dateOnly(previousStart), endDate: dateOnly(previousEnd) };
    /** @param {{startDate:string,endDate:string}} dates @param {string[]} [dimensions] */
    const query = async (dates, dimensions = []) => {
      const response = await request(
        `${base}/searchAnalytics/query`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...dates,
            dimensions,
            type: 'web',
            dataState: 'final',
            rowLimit: dimensions.length ? 5 : 1,
          }),
        },
        32000,
      );
      if (response.status !== 200) throw new Error(`google_http_${response.status}`);
      return rows(jsonObject(response.body).rows);
    };
    const [currentRows, previousRows, pages, sitemapResponse] = await Promise.all([
      query(window),
      query(previousWindow),
      query(window, ['page']),
      request(`${base}/sitemaps`, { headers }, 32000),
    ]);
    const current = currentRows[0] === undefined ? null : metrics(currentRows[0]);
    const previous = previousRows[0] === undefined ? null : metrics(previousRows[0]);
    const pageRows = pages
      .map((value) => {
        const row = object(value);
        const key = rows(row.keys)[0];
        return Object.assign(metrics(row), {
          url: typeof key === 'string' ? publicURL(key) : null,
        });
      })
      .filter((row) => row.url);
    for (const page of pageRows) {
      if (!page.url) continue;
      if (page.impressions >= 1000 && page.ctr < 0.01 && page.position >= 3 && page.position <= 15)
        finding(
          findings,
          'gsc-opportunity',
          page.url,
          'Measured search snippet optimization opportunity (hypothesis)',
          `${window.startDate}–${window.endDate}: ${page.impressions} impressions, ${page.clicks} clicks, CTR ${(page.ctr * 100).toFixed(2)}%, average position ${page.position}. Review factual title/description fit; no ranking or traffic guarantee.`,
        );
    }
    let sitemaps;
    if (sitemapResponse.status !== 200)
      sitemaps = { status: 'error', reason: `Google sitemap API HTTP ${sitemapResponse.status}.` };
    else {
      const data = jsonObject(sitemapResponse.body);
      sitemaps = {
        status: 'available',
        entries: rows(data.sitemap)
          .slice(0, 3)
          .map((value) => {
            const row = object(value);
            return {
              url: typeof row.path === 'string' ? publicURL(row.path) : null,
              pending: typeof row.isPending === 'boolean' ? row.isPending : null,
              errors: text(row.errors, 20),
              warnings: text(row.warnings, 20),
              lastSubmitted: text(row.lastSubmitted, 40),
              lastDownloaded: text(row.lastDownloaded, 40),
            };
          }),
      };
    }
    return {
      status: 'available',
      property: 'sc-domain:myself.md',
      window,
      previousWindow,
      current,
      previous,
      pages: pageRows,
      sitemaps,
      assessment:
        !current || current.impressions < 1000
          ? 'Insufficient search volume; report only, no optimization conclusion.'
          : 'Measured page opportunities are hypotheses, not proof of a ranking or content defect.',
      limitations:
        'Finalized web-search data only, ending at least 72 hours ago (Search Console dates use Pacific time). Recent setup may not cover both windows. Top-five page rows are click-ranked, not exhaustive; query terms are intentionally not collected. API aggregation differs from totals. No percentage trend is inferred from missing or low-volume windows.',
    };
  } catch (error) {
    const status = error instanceof Error ? error.message.match(/^google_http_(\d+)$/)?.[1] : null;
    return {
      status: 'error',
      reason: status
        ? `Search Console API HTTP ${status}; confirm token scope and property user grant (403 commonly means access is not granted).`
        : 'Search Console authentication/request failed, timed out, exceeded bounds or returned invalid data. No traffic conclusion is available.',
    };
  }
}

/** Fixed-site read-only evidence collector. @param {{mode?:string, now?:Date|string}} [options] */
export async function collectWebsiteAudit({ mode = 'daily', now = new Date() } = {}) {
  if (!['daily', 'weekly'].includes(mode)) throw new Error('Mode must be daily or weekly.');
  const timestamp = new Date(now);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('Invalid audit date.');
  /** @type {Finding[]} */
  const findings = [];
  const publicSource = await collectPublic(findings);
  const [cloudflare, searchConsole] =
    mode === 'weekly'
      ? await Promise.all([collectCloudflare(timestamp), collectSearchConsole(timestamp, findings)])
      : [
          { status: 'unavailable', reason: 'Analytics collection runs in weekly mode only.' },
          { status: 'unavailable', reason: 'Analytics collection runs in weekly mode only.' },
        ];
  const report = {
    version: 1,
    mode,
    site: SITE,
    generatedAt: timestamp.toISOString(),
    findings,
    sources: { public: publicSource, cloudflare, searchConsole },
  };
  // Preserve source status and observations; omit surplus rows/findings, never invent zeroes.
  publicSource.omittedFindings = 0;
  publicSource.omittedSamples = 0;
  while (Buffer.byteLength(JSON.stringify(report)) > MAX_REPORT_BYTES && report.findings.length) {
    report.findings.pop();
    publicSource.omittedFindings++;
  }
  if (Buffer.byteLength(JSON.stringify(report)) > MAX_REPORT_BYTES) {
    if ('pages' in searchConsole) searchConsole.pages = [];
    if ('pages' in cloudflare) cloudflare.pages = [];
    if ('referrers' in cloudflare) cloudflare.referrers = [];
    publicSource.limitations += ' Analytics detail rows omitted to keep the report bounded.';
  }
  while (
    Buffer.byteLength(JSON.stringify(report)) > MAX_REPORT_BYTES &&
    publicSource.sampled.length
  ) {
    publicSource.sampled.pop();
    publicSource.omittedSamples++;
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  collectWebsiteAudit({ mode: process.argv[2] ?? 'daily' })
    .then((report) => process.stdout.write(`${JSON.stringify(report)}\n`))
    .catch(() => {
      process.stderr.write(
        'Website audit could not complete; check mode and runtime configuration.\n',
      );
      process.exitCode = 1;
    });
}
