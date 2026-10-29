import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { publicResponse } from '../server/public-site.js';
import {
  readVisualizationCatalog,
  registerVisualizationCatalog,
  catalogMapTileResponse,
} from '../server/chatgpt-catalog.js';
import { visualizationCatalog, visualizationIds } from '../core/chatgpt-catalog.js';
import { restrictChatgptTools } from '../server/chatgpt-tools.js';

assert.deepEqual(
  visualizationCatalog(),
  visualizationCatalog(),
  'Fictional examples are deterministic.',
);
assert.equal(readVisualizationCatalog(undefined, false).examples.length, visualizationIds.length);
assert.deepEqual(
  visualizationCatalog().examples.map((e) => e.id),
  [...visualizationIds],
);
for (const e of readVisualizationCatalog(undefined, true).examples)
  assert.equal(e.data?.fictional, true);
const mcp = new McpServer({ name: 'catalog-test', version: '1' }),
  client = new Client({ name: 'catalog-test', version: '1' });
restrictChatgptTools(mcp);
registerVisualizationCatalog(mcp);
const [a, b] = InMemoryTransport.createLinkedPair();
await mcp.connect(a);
await client.connect(b);
try {
  const result = await client.callTool({
    name: 'get_public_visualization_catalog',
    arguments: { exampleId: 'heart-locations', includeData: true },
  });
  assert.ok(!result.isError, JSON.stringify(result));
  assert.deepEqual(result.structuredContent, readVisualizationCatalog('heart-locations', true));
  for (const exampleId of visualizationIds) {
    // oxlint-disable-next-line eslint/no-await-in-loop
    const example = await client.callTool({
      name: 'get_public_visualization_catalog',
      arguments: { exampleId, includeData: true },
    });
    assert.ok(!example.isError, exampleId);
    assert.deepEqual(example.structuredContent, readVisualizationCatalog(exampleId, true));
  }
  assert.equal(
    (
      await client.callTool({
        name: 'get_public_visualization_catalog',
        arguments: { exampleId: 'unknown' },
      })
    ).isError,
    true,
  );
} finally {
  await client.close();
  await mcp.close();
}
// Tile delivery identifies the application, bounds the fictional area and caches successful reads.
const tileUrl = 'https://myself.md/apps/chatgpt/tiles/12/1296/1834.png';
/** @type {Map<string,Response>} */
const cachedTiles = new Map();
const tileCache = {
  match: async (/** @type {Request} */ key) => cachedTiles.get(key.url)?.clone(),
  put: async (/** @type {Request} */ key, /** @type {Response} */ response) => {
    cachedTiles.set(key.url, response.clone());
  },
};
let tileReads = 0;
/** @type {typeof fetch} */
const tileFetch = async (url, options) => {
  tileReads++;
  assert.equal(String(url), 'https://tile.openstreetmap.org/12/1296/1834.png');
  const headers = new Headers(options?.headers);
  assert.match(headers.get('User-Agent') ?? '', /myself.md Maps/);
  assert.equal(headers.get('Referer'), 'https://myself.md/apps/chatgpt');
  return new Response('fictional tile bytes', { headers: { 'Content-Type': 'image/png' } });
};
assert.equal(
  (await catalogMapTileResponse(new Request(tileUrl), tileCache, tileFetch))?.status,
  200,
);
assert.match(
  (await catalogMapTileResponse(new Request(tileUrl), tileCache, tileFetch))?.headers.get(
    'cache-control',
  ) ?? '',
  /604800/,
);
assert.equal(tileReads, 1);
assert.equal(
  (await catalogMapTileResponse(new Request(tileUrl.replace('1296', '0')), tileCache, tileFetch))
    ?.status,
  404,
);
assert.equal(tileReads, 1);
assert.equal(
  (
    await catalogMapTileResponse(
      new Request(tileUrl),
      undefined,
      async () => new Response('blocked', { status: 403 }),
    )
  )?.status,
  503,
);
const denied = /** @type {string[]} */ ([]);
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const result = publicResponse(
    url.pathname,
    req.headers.accept ?? '',
    'https://example.invalid',
    'https://example.invalid/mcp',
    url.searchParams,
  );
  if (result) {
    res.writeHead(result.status, result.headers);
    res.end(result.body);
    return;
  }
  if (/^\/dashboard\/geist-(regular|semibold)\.ttf$/.test(url.pathname)) {
    res.setHeader('Content-Type', 'font/ttf');
    res.end(readFileSync('dashboard/' + url.pathname.split('/').at(-1)));
    return;
  }
  if (url.pathname === '/dashboard/favicon.png') {
    res.setHeader('Content-Type', 'image/png');
    res.end(readFileSync('dashboard/favicon.png'));
    return;
  }
  denied.push(url.pathname);
  res.writeHead(404);
  res.end();
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
mkdirSync('.local/chatgpt-catalog-release', { recursive: true });
try {
  const response = await fetch(
    origin + '/apps/chatgpt/catalog.json?example=heart-screen-time&includeData=1',
  );
  assert.deepEqual(await response.json(), readVisualizationCatalog('heart-screen-time', true));
  assert.equal((await fetch(origin + '/apps/chatgpt?example=unknown')).status, 400);
  const markdown = await fetch(origin + '/apps/chatgpt.md');
  assert.match(await markdown.text(), /get_public_visualization_catalog/);
  await Promise.all(
    [375, 1280].flatMap((width) =>
      /** @type {const} */ (['light', 'dark']).map(async (colorScheme) => {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme });
        await page.route('https://myself.md/apps/chatgpt/tiles/**', (route) =>
          route.fulfill({
            contentType: 'image/png',
            body: Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
              'base64',
            ),
          }),
        );
        const errors = /** @type {string[]} */ ([]);
        page.on('pageerror', (e) => errors.push(e.message));
        const catalogReads = [];
        page.on('request', (request) => {
          if (request.url().includes('/catalog.json')) catalogReads.push(request.url());
        });
        await page.goto(origin + '/apps/chatgpt');
        await page.getByRole('heading', { name: 'Visualization catalog', exact: true }).waitFor();
        assert.equal(await page.locator('.compact-card').count(), visualizationIds.length);
        assert.equal(await page.locator('.thumbnail svg').count(), visualizationIds.length);
        assert.equal(await page.locator('iframe').count(), 0, 'Gallery loads no embedded apps.');
        assert.equal(catalogReads.length, 0, 'Gallery needs no full fixture payload.');
        assert.equal(
          await page
            .locator('.compact-card')
            .first()
            .evaluate(
              (n) =>
                'getBoundingClientRect' in n &&
                typeof n.getBoundingClientRect === 'function' &&
                n.getBoundingClientRect().height < 300,
            ),
          true,
        );
        await page.getByRole('button', { name: 'Combined', exact: true }).click();
        assert.equal(await page.locator('article.demo:visible').count(), 5);
        await page.getByRole('button', { name: 'Health', exact: true }).click();
        assert.equal(await page.locator('article.demo:visible').count(), 2);
        await page.getByRole('button', { name: 'All views', exact: true }).click();
        assert.equal(await page.locator('article.demo:visible').count(), visualizationIds.length);
        await page.screenshot({
          path: `.local/chatgpt-catalog-release/gallery-${width}-${colorScheme}.png`,
          fullPage: false,
        });
        await page.setViewportSize({ width, height: 700 });
        // Both return paths restore the filtered layout before restoring its pixel position.
        let earlierView = '',
          earlierY = 0;
        for (const navigation of ['link', 'back']) {
          const category = navigation === 'link' ? 'Combined' : 'Screen time';
          // oxlint-disable-next-line eslint/no-await-in-loop
          await page.getByRole('button', { name: category, exact: true }).click();
          const open = page.getByRole('link', {
            name:
              navigation === 'link'
                ? 'Open Screen time & sleep performance'
                : 'Open Personal reflections',
            exact: true,
          });
          // oxlint-disable-next-line eslint/no-await-in-loop
          await open.scrollIntoViewIfNeeded();
          // oxlint-disable-next-line eslint/no-await-in-loop
          const beforeY = await page.evaluate(() => Reflect.get(globalThis, 'scrollY'));
          assert.ok(beforeY > 0);
          // oxlint-disable-next-line eslint/no-await-in-loop
          await open.click();
          // oxlint-disable-next-line eslint/no-await-in-loop
          await page.locator('iframe').waitFor();
          if (navigation === 'link') {
            earlierView = page.url();
            earlierY = beforeY;
          }
          if (navigation === 'link')
            // oxlint-disable-next-line eslint/no-await-in-loop
            await page.getByRole('link', { name: '← All visualizations', exact: true }).click();
          else
            // oxlint-disable-next-line eslint/no-await-in-loop
            await page.goBack();
          // oxlint-disable-next-line eslint/no-await-in-loop
          await page.waitForFunction(
            ({ category: expectedCategory, beforeY: expectedY }) => {
              const document = Reflect.get(globalThis, 'document');
              const selected = document.querySelector('button[aria-pressed="true"]');
              return (
                selected?.textContent === expectedCategory &&
                Math.abs(Reflect.get(globalThis, 'scrollY') - expectedY) <= 2
              );
            },
            { category, beforeY },
          );
          assert.equal(
            // oxlint-disable-next-line eslint/no-await-in-loop
            await page.locator('article.demo:visible').count(),
            navigation === 'link' ? 5 : 9,
          );
          // oxlint-disable-next-line eslint/no-await-in-loop
          await page.reload();
          // oxlint-disable-next-line eslint/no-await-in-loop
          await page.waitForFunction(
            ({ category: expectedCategory, beforeY: expectedY }) => {
              const document = Reflect.get(globalThis, 'document');
              return (
                document.querySelector('button[aria-pressed="true"]')?.textContent ===
                  expectedCategory && Math.abs(Reflect.get(globalThis, 'scrollY') - expectedY) <= 2
              );
            },
            { category, beforeY },
          );
        }
        // An earlier full view retains its original context after a different filtered visit.
        await page.goto(earlierView);
        await page.getByRole('link', { name: '← All visualizations', exact: true }).click();
        await page.waitForFunction((scrollY) => {
          const document = Reflect.get(globalThis, 'document');
          return (
            document.querySelector('button[aria-pressed="true"]')?.textContent === 'Combined' &&
            Math.abs(Reflect.get(globalThis, 'scrollY') - scrollY) <= 2
          );
        }, earlierY);
        await page.setViewportSize({ width, height: 1000 });
        await page.getByRole('button', { name: 'All views', exact: true }).click();
        // Native links work with keyboard and without any account transport.
        await page
          .getByRole('link', { name: 'Open Compare two weeks', exact: true })
          .press('Enter');
        await page.waitForURL('**/apps/chatgpt?example=comparison#catalog-return=*');
        /** @param {string} id */
        const checkFits = async (id) => {
          const frame = page.frames().find((f) => f.url().endsWith(`/examples/${id}`));
          assert.ok(frame);
          await frame.waitForFunction(() => {
            const document = Reflect.get(globalThis, 'document');
            const height = Reflect.get(globalThis, 'innerHeight');
            return (
              Math.abs(
                height - Math.ceil(document.querySelector('main').getBoundingClientRect().height),
              ) <= 1 && document.documentElement.scrollHeight <= height + 1
            );
          });
        };
        for (const id of visualizationIds) {
          // oxlint-disable-next-line eslint/no-await-in-loop
          await page.goto(origin + '/apps/chatgpt?example=' + id);
          const host = page.locator(`iframe[data-example="${id}"]`);
          const frame = page.frameLocator(`iframe[data-example="${id}"]`);
          // oxlint-disable-next-line eslint/no-await-in-loop
          await host.scrollIntoViewIfNeeded();
          // oxlint-disable-next-line eslint/no-await-in-loop
          await frame.getByText('Demo data', { exact: true }).waitFor();
          // oxlint-disable-next-line eslint/no-await-in-loop
          assert.equal(await page.locator('iframe').count(), 1);
          // oxlint-disable-next-line eslint/no-await-in-loop
          assert.equal(await host.getAttribute('sandbox'), 'allow-scripts');
          if (id === 'experiment-hours') {
            // oxlint-disable-next-line eslint/no-await-in-loop
            await frame.getByRole('button', { name: /^baseline 2026-10-05 21:00/ }).click();
            assert.match(
              // oxlint-disable-next-line eslint/no-await-in-loop -- Browser interactions remain sequential within each recorded example.
              await frame.locator('.hour-map-readout').innerText(),
              /baseline 2026-10-05 21:00/,
            );
          } else if (id === 'monthly-attention') {
            // oxlint-disable-next-line eslint/no-await-in-loop
            await frame.getByText('Apps & patterns', { exact: true }).click();
            assert.match(
              // oxlint-disable-next-line eslint/no-await-in-loop -- Read the example after its tab transition.
              await frame.locator('main').innerText(),
              /21:00 · .* across 14 observed days/,
            );
          } else if (id === 'before-sleep' || id === 'sleep-performance') {
            if (id === 'sleep-performance')
              // oxlint-disable-next-line eslint/no-await-in-loop
              await frame.getByText('Sessions · 7', { exact: true }).click();
            // oxlint-disable-next-line eslint/no-await-in-loop
            await frame.getByRole('button', { name: /^Nap starting/ }).click();
            // oxlint-disable-next-line eslint/no-await-in-loop
            await frame.locator('.session-metrics').waitFor();
            // oxlint-disable-next-line eslint/no-await-in-loop
            await page.getByRole('button', { name: 'Reset preview', exact: true }).click();
            // oxlint-disable-next-line eslint/no-await-in-loop
            await frame
              .getByRole('button', { name: 'Back to all sessions', exact: true })
              .waitFor({ state: 'detached' });
          } else if (id === 'locations' || id === 'heart-locations') {
            const map = frame.locator('.catalog-map');
            // oxlint-disable-next-line eslint/no-await-in-loop
            assert.equal(await map.locator('.dot').count(), 28);
            // oxlint-disable-next-line eslint/no-await-in-loop
            await map.locator('.dot').first().click();
            // oxlint-disable-next-line eslint/no-await-in-loop
            await frame.locator(id === 'locations' ? '.point-detail' : '.match-detail').waitFor();
          } else if (id === 'activity-sleep') {
            // oxlint-disable-next-line eslint/no-await-in-loop
            await frame.getByRole('button', { name: /2026-10-12 · .* h/ }).click();
            // oxlint-disable-next-line eslint/no-await-in-loop
            await frame.locator('.stage-breakdown').waitFor();
          } else if (id === 'heatmap') {
            // oxlint-disable-next-line eslint/no-await-in-loop
            assert.ok(await frame.locator('.heat-cell').count());
          }
          // oxlint-disable-next-line eslint/no-await-in-loop
          await checkFits(id);
          // oxlint-disable-next-line eslint/no-await-in-loop
          await host.screenshot({
            path: `.local/chatgpt-catalog-release/focused-${id}-${width}-${colorScheme}.png`,
          });
          assert.equal(
            // oxlint-disable-next-line eslint/no-await-in-loop -- Verify the current example before navigating away.
            await page
              .locator('body')
              .evaluate(
                (n) =>
                  'scrollWidth' in n &&
                  'clientWidth' in n &&
                  Number(n.scrollWidth) <= Number(n.clientWidth),
              ),
            true,
          );
        }
        await page.getByRole('link', { name: '← All visualizations', exact: true }).click();
        assert.ok(page.url().endsWith('/apps/chatgpt#reflections'));
        assert.equal(await page.locator('iframe').count(), 0);
        assert.equal(await page.locator('.compact-card').count(), 17);
        await page.setViewportSize({ width: width === 375 ? 1280 : 375, height: 1000 });
        assert.equal(
          await page
            .locator('body')
            .evaluate(
              (n) =>
                'scrollWidth' in n &&
                'clientWidth' in n &&
                Number(n.scrollWidth) <= Number(n.clientWidth),
            ),
          true,
        );
        assert.deepEqual(errors, []);
        await page.close();
      }),
    ),
  );
  assert.deepEqual(denied, [], 'Preview requests never touch account or private API routes.');
  console.log(
    'ChatGPT catalog: public HTTP/MCP parity, all sandboxed real renderers, compact SVG gallery without embedded loads, keyboard opening, category filters, full focused views/reset/drilldown, independent category/scroll restoration via return links, browser Back and reload, and responsive light/dark checks passed.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
