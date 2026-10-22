import assert from 'node:assert/strict';
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
} from '../server/chatgpt-catalog.js';
import { visualizationCatalog, visualizationIds } from '../core/chatgpt-catalog.js';
import { restrictChatgptTools } from '../server/chatgpt-tools.js';

assert.deepEqual(
  visualizationCatalog(),
  visualizationCatalog(),
  'Fictional examples are deterministic.',
);
assert.equal(readVisualizationCatalog(undefined, false).examples.length, 6);
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
        const errors = /** @type {string[]} */ ([]);
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(origin + '/apps/chatgpt');
        await page.getByRole('heading', { name: 'Visualization catalog', exact: true }).waitFor();
        /** @param {string} id */
        const checkFits = async (id) => {
          const frame = page.frames().find((f) => f.url().endsWith(`/examples/${id}`));
          assert.ok(frame);
          await frame.waitForFunction(
            'Math.abs(innerHeight - Math.ceil(document.querySelector("main").getBoundingClientRect().height)) <= 1 && document.documentElement.scrollHeight <= innerHeight + 1',
          );
        };
        /** @param {string} id */
        const checkPreview = async (id) => {
          const host = page.locator(`iframe[data-example="${id}"]`);
          await host.scrollIntoViewIfNeeded();
          const frame = page.frameLocator(`iframe[data-example="${id}"]`);
          await frame.getByText('MYSELF.MD · FICTIONAL EXAMPLE', { exact: true }).waitFor();
          assert.equal(await host.getAttribute('sandbox'), 'allow-scripts');
          await checkFits(id);
          await host.screenshot({
            path: `.local/chatgpt-catalog-release/${id}-${width}-${colorScheme}.png`,
          });
        };
        for (const id of visualizationIds) {
          // Lazy frames share one viewport and must enter it in order.
          // oxlint-disable-next-line eslint/no-await-in-loop
          await checkPreview(id);
        }
        assert.equal(
          (await page
            .frameLocator('iframe[data-example="heatmap"]')
            .locator('.heat-cell')
            .count()) > 0,
          true,
        );
        const heart = page.frameLocator('iframe[data-example="heart-screen-time"]');
        await heart.getByRole('button', { name: '2026-10-12 · 4 hours', exact: true }).click();
        assert.equal(await heart.getByText('Selected day: 2026-10-12', { exact: true }).count(), 1);
        await checkFits('heart-screen-time');
        await page.getByRole('button', { name: 'Reset preview', exact: true }).last().click();
        await heart
          .getByRole('button', { name: 'Back to all days', exact: true })
          .waitFor({ state: 'detached' });
        await checkFits('heart-screen-time');
        await page
          .getByRole('heading', { name: 'Visualization catalog', exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `.local/chatgpt-catalog-release/catalog-all-${width}-${colorScheme}.png`,
          fullPage: false,
        });
        await page.getByRole('button', { name: 'Health', exact: true }).click();
        assert.equal(await page.locator('article.demo:visible').count(), 1);
        assert.equal(await page.locator('#example-count').innerText(), '1 interactive example');
        const health = page.frameLocator('iframe[data-example="activity-sleep"]');
        await health.getByRole('button', { name: /2026-10-12 · .* h/ }).click();
        assert.equal(await health.locator('.stage-breakdown').count(), 1);
        await checkFits('activity-sleep');
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
        await page.screenshot({
          path: `.local/chatgpt-catalog-release/catalog-${width}-${colorScheme}.png`,
          fullPage: true,
        });
        await page.goto(origin + '/apps/chatgpt?example=heatmap');
        await page
          .frameLocator('iframe[data-example="heatmap"]')
          .getByText('MYSELF.MD · FICTIONAL EXAMPLE', { exact: true })
          .waitFor();
        assert.equal(await page.locator('article.demo').count(), 1);
        await checkFits('heatmap');
        await page.setViewportSize({ width: width === 375 ? 1280 : 375, height: 1000 });
        await checkFits('heatmap');
        assert.deepEqual(errors, []);
        await page.close();
      }),
    ),
  );
  assert.deepEqual(denied, [], 'Preview requests never touch account or private API routes.');
  console.log(
    'ChatGPT catalog: public HTTP/MCP parity, six sandboxed real renderers, heatmap default, filters/reset/drilldown, focused view and responsive light/dark checks passed.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
