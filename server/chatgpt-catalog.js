import { z } from 'zod';
import { catalogPreview } from './chatgpt-catalog-preview.js';
import {
  visualizationCatalog,
  visualizationIds,
  visualizationMarkdown,
} from '../core/chatgpt-catalog.js';
import { publicSiteHeader, publicSiteHeaderStyles } from '../core/site-header.js';
import { screenTimeReviewHtml } from './screen-time-review-ui.js';
import { sleepScreenTimeHtml } from './sleep-screen-time-ui.js';
import { healthReviewHtml } from './health-review-ui.js';
import { locationReviewHtml } from './location-review-ui.js';
import { heartRateContextHtml } from './heart-rate-context-ui.js';
import { chatgptCatalogClient, chatgptCatalogPreviewClient } from './chatgpt-catalog-client.js';

export { catalogMapTileResponse } from './chatgpt-catalog-tiles.js';

const catalog = visualizationCatalog();
/** Public deterministic data, shared by HTTP and MCP. @param {string|undefined} example @param {boolean} includeData */
export function readVisualizationCatalog(example, includeData) {
  const examples = catalog.examples.filter((e) => !example || e.id === example);
  if (example && !examples.length) throw new Error('Unknown visualization example.');
  return {
    ...catalog,
    examples: examples.map((e) =>
      Object.assign({}, e, {
        url: `https://myself.md/apps/chatgpt?example=${e.id}`,
        data: includeData ? e.data : null,
      }),
    ),
  };
}
/** @param {string} value */
function escape(value) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
/** @param {string|undefined} selected */
function page(selected) {
  const examples = readVisualizationCatalog(selected, !selected).examples;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ChatGPT visualization catalog · myself.md</title><meta name="description" content="Try interactive screen-time, health, location and heart-rate visualizations from the myself.md ChatGPT app with fictional data."><link rel="canonical" href="https://myself.md/apps/chatgpt"><link rel="icon" href="/dashboard/favicon.png"><link rel="alternate" type="text/markdown" href="/apps/chatgpt.md"><style>
@font-face{font-family:Geist;src:url('/dashboard/geist-regular.ttf')}@font-face{font-family:Geist;src:url('/dashboard/geist-semibold.ttf');font-weight:600}*{box-sizing:border-box}:root{color-scheme:light dark;--text:light-dark(#23232a,#efeff4);--muted:light-dark(#696971,#a6a6b2);--line:light-dark(#dfdfe4,#36363f);--surface:light-dark(#fff,#1b1b20);background:light-dark(#f8f8fa,#121215);color:var(--text);font:15px/1.6 Geist,system-ui,sans-serif}body{margin:0}.shell{max-width:1320px;margin:auto;padding:12px 32px 64px}${publicSiteHeaderStyles}a{color:inherit;text-underline-offset:4px}button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}button:focus-visible,a:focus-visible{outline:2px solid #8971ed;outline-offset:4px;border-radius:4px}.hero{padding:62px 0 40px;max-width:800px}.eyebrow{font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted)}h1{font-size:clamp(34px,5vw,58px);line-height:1.08;letter-spacing:-2px;font-weight:600;margin:18px 0 22px}.intro{font-size:18px;color:var(--muted);max-width:660px}.note{display:inline-flex;align-items:center;gap:9px;margin-top:16px;padding:7px 12px;border:1px solid var(--line);border-radius:999px;font-size:12px}.note::before{content:'';width:7px;height:7px;border-radius:50%;background:#8770d9}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;margin:0 0 26px}.filters{display:flex;gap:6px;flex-wrap:wrap}.filters button{border:1px solid transparent;padding:8px 15px;border-radius:999px;background:transparent;color:var(--muted);font-size:13px}.filters button[aria-pressed=true]{background:var(--surface);border-color:var(--line);color:var(--text)}.count{font-size:12px;color:var(--muted)}.grid{align-items:start;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.grid.focused{grid-template-columns:1fr;max-width:1000px;margin:auto}.demo{min-width:0;border:1px solid var(--line);border-radius:15px;overflow:hidden;background:var(--surface)}.demo[hidden]{display:none}.demo-header{padding:24px 26px 20px;border-bottom:1px solid var(--line)}.demo-kicker{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px}.demo h2{font-size:23px;letter-spacing:-.6px;font-weight:600;line-height:1.25;margin:10px 0}.demo-header p{color:var(--muted);font-size:13px;margin:0;max-width:520px}.frame-wrap{background:var(--surface)}iframe{display:block;width:100%;height:660px;border:0;background:var(--surface)}.demo-footer{border-top:1px solid var(--line);padding:18px 26px 22px;font-size:12px;color:var(--muted)}.demo-footer p{margin:0 0 12px}.demo-links{display:flex;gap:16px;flex-wrap:wrap;align-items:center}.reset{border:0;background:transparent;text-decoration:underline;text-underline-offset:4px;padding:0;font-size:12px}.prompt{margin:18px 0 0;border-top:1px solid var(--line);padding-top:12px}.prompt summary{cursor:pointer;color:var(--text)}.prompt p{margin-top:10px}.footer{margin-top:52px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}.footer p{max-width:740px}.load-status{color:var(--muted);font-size:13px}.skip{position:absolute;left:-9999px}.skip:focus{left:20px;top:10px;z-index:5;background:var(--surface);padding:10px}@media(max-width:800px){.grid{grid-template-columns:1fr}.shell{padding:10px 20px 40px}.hero{padding-top:38px}.demo-header{padding:20px}.demo-footer{padding:16px 20px}.intro{font-size:16px}}@media(prefers-reduced-motion:no-preference){button{transition:background 120ms ease,color 120ms ease}}button:active{opacity:.7}

.hero{padding:34px 0 24px}h1{font-size:clamp(30px,4vw,44px);margin:12px 0}.intro{font-size:15px;margin:12px 0}.note{margin-top:2px}.grid.compact{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch}.preview-link{display:block;text-decoration:none;height:100%;border-radius:14px}.preview-link:focus-visible{outline-offset:3px}.thumbnail{height:158px;display:flex;align-items:center;justify-content:center;background:light-dark(#f2f1f8,#201f29);border-bottom:1px solid var(--line)}.thumbnail svg{width:100%;height:100%;max-width:360px}.mini-mark{fill:#8a72df}.mini-secondary{fill:#4daba6}.mini-empty{fill:light-dark(#e2dfea,#34313e)}.mini-gap{fill:none;stroke:light-dark(#d4cedf,#494351);stroke-width:1.5}.mini-range{stroke:#8a72df;stroke-width:3}.mini-label{font:10px system-ui,sans-serif;fill:var(--muted)}.mini-quote{font:36px Georgia,serif;fill:#8a72df}.compact-caption{position:relative;padding:15px 38px 18px 18px}.card-category{font-size:10px;color:var(--muted);letter-spacing:.6px;text-transform:uppercase}.compact-card h2{font-size:17px;line-height:1.3;margin:5px 0 0;letter-spacing:-.3px}.open-view{position:absolute;right:18px;top:29px;color:var(--muted)}.toolbar{position:sticky;top:0;z-index:2;background:light-dark(#f8f8fa,#121215);padding:10px 0;margin-bottom:18px}.detail-hero{padding:18px 0 8px}.detail-hero .intro,.detail-hero .eyebrow{display:none}.detail-hero h1{font-size:26px}.detail-hero .note{font-size:11px;padding:3px 9px}.load-status:empty{display:none}@media(min-width:801px) and (max-width:1050px){.grid.compact{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:800px){.grid.compact{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.thumbnail{height:140px}.compact-caption{padding:12px 28px 14px 12px}.compact-card h2{font-size:15px}.open-view{right:10px;top:26px}.hero{padding-top:24px}}@media(max-width:540px){.grid.compact{grid-template-columns:1fr}.thumbnail{height:154px}.compact-card h2{font-size:17px}}@media(hover:hover){.preview-link:hover{background:light-dark(#faf9ff,#25232e)}.preview-link:hover .open-view{color:#8a72df}}
</style><script defer src="/apps/chatgpt/catalog.js"></script></head><body><a class="skip" href="#catalog">Skip to visualizations</a><div class="shell">${publicSiteHeader('/apps/chatgpt')}<main><section class="hero${selected ? ' detail-hero' : ''}"><div class="eyebrow">The myself.md app for ChatGPT</div><h1>Visualization catalog</h1><p class="intro">Small previews. Full interactive views. All fictional data.</p><div class="note">Fictional examples · no account needed</div></section><div class="toolbar">${
    selected
      ? `<a href="/apps/chatgpt#${selected}">← All visualizations</a>`
      : `<nav class="filters" aria-label="Filter visualizations">${[
          ['all', 'All views'],
          ['time', 'Screen time'],
          ['health', 'Health'],
          ['location', 'Location'],
          ['combined', 'Combined'],
        ]
          .map(
            ([id, label]) =>
              `<button type="button" data-filter="${id}" aria-pressed="${id === 'all'}">${label}</button>`,
          )
          .join('')}</nav>`
  }<span class="count" id="example-count">${examples.length} interactive ${examples.length === 1 ? 'example' : 'examples'}</span></div><p class="load-status" role="status" id="catalog-status">${selected ? 'Loading interactive view…' : 'Choose a preview to explore.'}</p><noscript><p>Enable JavaScript for interactive previews. Open any preview for its description, starter prompt and example data.</p></noscript><section id="catalog" class="grid${selected ? ' focused' : ' compact'}" aria-label="Visualization examples">${examples.map((e, index) => (selected ? `<article class="demo" id="${e.id}" data-category="${e.category}"><header class="demo-header"><div class="demo-kicker"><span>${String(index + 1).padStart(2, '0')} / ${e.category === 'time' ? 'Screen time' : e.category === 'combined' ? 'Combined' : e.category}</span><span>Interactive preview</span></div><h2>${e.title}</h2><p>${e.description}</p></header><div class="frame-wrap"><iframe title="${e.title} fictional preview" data-example="${e.id}" data-src="/apps/chatgpt/examples/${e.id}" sandbox="allow-scripts" loading="lazy" referrerpolicy="no-referrer"></iframe></div><footer class="demo-footer"><p>${e.hint}</p><div class="demo-links"><a href="/apps/chatgpt?example=${e.id}">Direct link ↗</a><button class="reset" type="button" data-reset="${e.id}">Reset preview</button><a href="/apps/chatgpt/catalog.json?example=${e.id}&includeData=1">Example data ↗</a></div><details class="prompt"><summary>Try it with your data in ChatGPT</summary><p>${escape(e.prompt)}</p><p>Requires available records and your existing data access. This preview does not connect your account.</p></details></footer></article>` : `<article class="demo compact-card" id="${e.id}" data-category="${e.category}"><a class="preview-link" href="/apps/chatgpt?example=${e.id}" aria-label="Open ${escape(e.title)}"><div class="thumbnail">${catalogPreview(e)}</div><div class="compact-caption"><span class="card-category">${e.category === 'time' ? 'Screen time' : e.category === 'combined' ? 'Combined' : e.category === 'health' ? 'Health' : 'Location'}</span><h2>${e.title}</h2><span class="open-view" aria-hidden="true">↗</span></div></a></article>`)).join('')}</section><footer class="footer"><p>All data on this page is made up. Dates are fixed to October 2026. Explore days, sources and individual observations; date changes and account actions are available in the connected app.</p><p>Missing records stay unknown. Heart-rate overlays describe nearby timestamps or shared hours and do not establish cause. Location previews show fictional points on OpenStreetMap. Only public map tiles load externally; points do not establish a complete route.</p><p><a href="/docs">Connect myself.md</a> · <a href="/apps/chatgpt.md">Read the catalog as Markdown</a> · <a href="/apps/chatgpt/catalog.json">Structured catalog</a></p></footer></main></div></body></html>`;
}
/** Shared public website response. @param {string} pathname @param {string} accept @param {URLSearchParams} params */
export function chatgptCatalogResponse(pathname, accept, params = new URLSearchParams()) {
  const path = pathname.replace(/\/$/, '');
  if (
    ![
      '/apps/chatgpt',
      '/apps/chatgpt.md',
      '/apps/chatgpt/catalog.js',
      '/apps/chatgpt/catalog.json',
      ...visualizationIds.map((id) => `/apps/chatgpt/examples/${id}`),
    ].includes(path)
  )
    return null;
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Accept',
  };
  const selected = params.get('example') ?? undefined;
  if (
    (selected && !visualizationIds.some((id) => id === selected)) ||
    [...params.keys()].some((k) => !['example', 'includeData'].includes(k)) ||
    (params.has('includeData') && !['0', '1'].includes(params.get('includeData') ?? ''))
  )
    return {
      status: 400,
      headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
      body: 'Choose a known example and includeData=0 or 1.',
    };
  if (path.endsWith('/catalog.js'))
    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' },
      body: chatgptCatalogClient,
    };
  if (path.endsWith('/catalog.json'))
    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(readVisualizationCatalog(selected, params.get('includeData') === '1')),
    };
  if (path.endsWith('.md') || accept.includes('text/markdown'))
    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' },
      body: visualizationMarkdown(catalog),
    };
  const preview = catalog.examples.find((e) => path === `/apps/chatgpt/examples/${e.id}`);
  if (preview) {
    const mapPreview = ['locations', 'heart-locations'].includes(preview.id);
    const nonce = crypto.randomUUID().replaceAll('-', '');
    const html =
      preview.renderer === 'screen' || preview.renderer === 'heatmap'
        ? screenTimeReviewHtml
        : preview.renderer === 'sleep'
          ? sleepScreenTimeHtml
          : preview.renderer === 'health'
            ? healthReviewHtml
            : preview.renderer === 'location'
              ? locationReviewHtml
              : heartRateContextHtml;
    const body = html
      .replace(
        'id="review"',
        `id="review" data-demo="true" data-initial-view="${preview.renderer === 'heatmap' ? 'heatmap' : 'weekly'}"`,
      )
      .replace('<main ', `<main data-preview="true" data-map="${mapPreview}" `)
      .replace('</body>', `<script>${chatgptCatalogPreviewClient}</script></body>`)
      .replaceAll('<script>', `<script nonce="${nonce}">`)
      .replace(
        '</style>',
        '[data-demo="true"] .insight-actions,[data-demo="true"] .period-presets,[data-demo="true"] .review-controls,[data-demo="true"] .goal-form{display:none!important}main[data-preview]{padding:18px}main[data-preview] form{display:none!important}main[data-preview]>h1,[data-demo="true"] .review-header,[data-demo="true"] .stats{display:none}main[data-preview]>.eyebrow{font-size:9px;margin:0 0 8px}main[data-preview] .overview{padding:5px 0 8px}main[data-preview] .overview p{font-size:11px;margin:3px 0}[data-demo="true"] .review-answer{margin:8px 0 12px}[data-demo="true"] .review-answer .comparison{font-size:17px}[data-demo="true"] .coverage-summary{font-size:10px;line-height:1.4}[data-demo="true"][data-initial-view="heatmap"] .review-answer .comparison,[data-demo="true"][data-initial-view="heatmap"] .coverage-summary{display:none}[data-demo="true"] .heatmap-readout{min-height:0;padding:6px 8px;margin:8px 0;font-size:11px}[data-demo="true"] .heatmap-scale{margin:8px 0}#health-review[data-preview] .metric{padding:12px 0}#health-review[data-preview] .day:not(:has(ul)){display:grid;grid-template-columns:135px minmax(0,1fr);align-items:center;gap:10px;padding:2px 0}#health-review[data-preview] .day>button{font-size:11px;padding:4px 0}.catalog-map{height:360px!important;overflow:hidden;background:#e8eced;isolation:isolate}.catalog-map .map-tiles{position:absolute;inset:0;z-index:-1;pointer-events:none}.map-tiles img{position:absolute;width:256px;height:256px;max-width:none}.catalog-map .dot{width:13px;height:13px;padding:0;border:2px solid white;box-shadow:0 1px 4px #0009;z-index:1}.map-controls{position:absolute;top:10px;left:10px;z-index:2;display:flex;gap:4px}.map-controls button,.map-attribution{background:#fff;color:#222;padding:5px 9px;border:1px solid #bbb;border-radius:4px;font-size:12px;text-decoration:none}.map-attribution{position:absolute;right:0;bottom:0;border-radius:0;z-index:2;font-size:10px}.catalog-map-section>p:not(.map-note){display:none}.map-note{font-size:11px;color:light-dark(#656570,#aaaab5)}</style>',
      );
    return {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'none'; ${mapPreview ? 'img-src https://myself.md;' : ''} base-uri 'none'; frame-ancestors 'self'; form-action 'none'`,
        ...(mapPreview ? { 'Referrer-Policy': 'origin' } : {}),
      },
      body,
    };
  }
  return {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; frame-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    },
    body: page(selected),
  };
}
/** @param {import('@modelcontextprotocol/server').McpServer} mcp */
export function registerVisualizationCatalog(mcp) {
  mcp.registerTool(
    'get_public_visualization_catalog',
    {
      title: 'Browse ChatGPT visualization examples',
      description:
        'Read the public myself.md visualization catalog and optional deterministic fictional example data. Includes comparisons, heatmaps, WHOOP sleep and pre-sleep performance, activity/sleep, locations, heart-rate overlays, monthly attention, experiments, coverage and reflections. Contains no personal records. The website previews and this tool share the same fixtures; real-data operations are identified in each example.',
      inputSchema: z
        .object({
          exampleId: z
            .enum(visualizationIds)
            .optional()
            .describe('Select one example, or omit to browse all examples.'),
          includeData: z
            .boolean()
            .default(false)
            .describe(
              'Include the full fictional structured result used by the renderer. Default false returns descriptions, starter prompts and links with data null.',
            ),
        })
        .strict(),
      outputSchema: z.object({
        version: z.string(),
        fictional: z.boolean(),
        timezone: z.string(),
        period: z.string(),
        examples: z.array(
          z.object({
            id: z.string(),
            category: z.string(),
            title: z.string(),
            description: z.string(),
            hint: z.string(),
            renderer: z.string(),
            tool: z.string(),
            prompt: z.string(),
            url: z.string(),
            data: z.unknown(),
          }),
        ),
      }),
      annotations: {
        title: 'Browse ChatGPT visualization examples',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ exampleId, includeData }) => {
      const data = readVisualizationCatalog(exampleId, includeData);
      return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
    },
  );
}
