import assert from 'node:assert/strict';
import { z } from 'zod';
import { datasetPage } from '../server/dataset-pages.js';
import { healthGuides } from '../core/health-guides.js';
import { createMyselfClient } from '../dashboard/public-client.js';
import { registerPublicTools } from '../dashboard/webmcp.js';

/** Verify that agents receive the same setup prerequisites and metric examples.
 * @param {import('@modelcontextprotocol/client').Client} client
 */
export async function verifyDatasetMCP(client) {
  await Promise.all(
    healthGuides.map(async (guide) => {
      const read = await client.callTool({
        name: 'get_public_documentation',
        arguments: { guide: guide.slug },
      });
      assert.notEqual(read.isError, true);
      assert.ok(
        JSON.stringify(read).includes(JSON.stringify(guide.markdown)),
        'MCP must return the exact public guide.',
      );
    }),
  );
  let invalidGuideRejected = false;
  try {
    const read = await client.callTool({
      name: 'get_public_documentation',
      arguments: { guide: 'https://example.com/private' },
    });
    invalidGuideRejected = read.isError === true;
  } catch {
    invalidGuideRejected = true;
  }
  assert.ok(invalidGuideRejected, 'A public guide selector cannot become an arbitrary URL read.');
  const documentation = await client.callTool({ name: 'get_public_documentation', arguments: {} });
  assert.match(JSON.stringify(documentation), /Choose your starting point/);
  assert.match(
    JSON.stringify(documentation),
    /Public App Store and Google Play downloads are coming soon/,
  );
  const catalog = await client.callTool({ name: 'get_public_dataset_catalog', arguments: {} });
  assert.match(JSON.stringify(catalog), /metricExamples/);
  assert.match(
    JSON.stringify(catalog),
    /Session duration and stage duration are different measures/,
  );
  assert.match(JSON.stringify(catalog), /HKQuantityTypeIdentifierStepCount/);
}

/** Check actual unauthenticated Node/workerd responses, including content negotiation.
 * @param {string} origin
 */
export async function verifyDatasetHTTP(origin) {
  const sitemap = await (await fetch(origin + '/sitemap.xml')).text();
  const openapi = z
    .object({ paths: z.record(z.string(), z.unknown()) })
    .parse(await (await fetch(origin + '/openapi.json')).json());
  const sdk = createMyselfClient({ origin });
  /** @type {import('../dashboard/webmcp.js').BrowserTool[]} */
  const browserTools = [];
  await registerPublicTools(
    {
      registerTool: (tool) => {
        browserTools.push(tool);
      },
    },
    sdk,
  );
  const documentationTool = browserTools.find(
    (tool) => tool.name === 'myself_public_documentation',
  );
  assert.ok(documentationTool);
  await Promise.all(
    healthGuides.map(async (guide) => {
      const path = `/docs/${guide.slug}`;
      const response = await fetch(origin + path);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes(`<link rel="canonical" href="https://myself.md${path}"`));
      assert.ok(
        html.includes(
          `<h1 id="${guide.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')}">${guide.title}</h1>`,
        ),
      );
      assert.ok(html.includes('https://github.com/CodyBontecou/myself.md'));
      assert.ok(html.includes('/dashboard/docs.css'));
      assert.ok(html.includes(`href="${path}" aria-current="page"`));
      assert.doesNotMatch(html, /content="undefined"/);
      assert.equal(
        await (await fetch(origin + path, { headers: { Accept: 'text/markdown' } })).text(),
        guide.markdown,
      );
      assert.equal(await (await fetch(origin + path + '.md')).text(), guide.markdown);
      assert.equal(
        await (await fetch(origin + '/v1' + path, { headers: { Accept: 'text/markdown' } })).text(),
        guide.markdown,
      );
      assert.ok(sitemap.includes(`<loc>https://myself.md${path}</loc>`));
      assert.ok(openapi.paths['/v1' + path]);
      assert.equal(await sdk.docs({ guide: guide.slug }), guide.markdown);
      assert.deepEqual(await documentationTool.execute({ guide: guide.slug }), {
        markdown: guide.markdown,
      });
    }),
  );
  assert.throws(() => sdk.docs({ guide: '../private' }));
  await assert.rejects(() => documentationTool.execute({ guide: 'https://example.com/private' }));
  assert.equal((await fetch(origin + '/docs/not-a-guide')).status, 404);
  await Promise.all(
    [
      '/datasets',
      '/datasets/health',
      '/datasets/screen-time',
      '/datasets/location',
      '/datasets/all',
    ].map(async (path) => {
      const expected = datasetPage(path);
      assert.ok(expected);
      const response = await fetch(origin + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /text\/html/);
      assert.equal(response.headers.get('vary'), 'Accept');
      const html = await response.text();
      assert.ok(
        html.includes(`<link rel="canonical" href="https://myself.md${expected.canonical}"`),
      );
      assert.ok(
        html.includes(`<meta property="og:url" content="https://myself.md${expected.canonical}"`),
      );
      assert.ok(html.includes(`${expected.title} · myself.md</title>`));
      assert.ok(html.includes('fictional native record example'));
      assert.ok(html.includes('platform limitations'));
      assert.ok(html.includes('Public App Store and Google Play downloads are coming soon.'));
      assert.ok(html.includes('href="/docs"'));
      assert.match(
        html,
        /src="\/dashboard\/(?:app|dataset-aeo)\.js"/,
        'Keep the interactive dataset builder.',
      );
      if (path === '/datasets/health') {
        assert.match(html, /<table><thead><tr><th scope="col">Metric and platform<\/th>/);
        assert.ok(html.includes('HKCategoryTypeIdentifierSleepAnalysis'));
        assert.ok(html.includes('Session duration and stage duration are different measures.'));
        assert.ok(html.includes('Reproduce a fictional step question'));
      }
      assert.doesNotMatch(html, /__PUBLIC_CONTENT__|__PUBLIC_FAQ_SCHEMA__|"@type":"FAQPage"/);
      const schemas = [
        ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
      ].map((match) => JSON.parse(match[1] ?? ''));
      assert.equal(schemas.length, 1);
      assert.equal(schemas[0].url, `https://myself.md${expected.canonical}`);
      assert.equal(schemas[0].description, expected.description);

      const markdown = await fetch(origin + path, { headers: { Accept: 'text/markdown' } });
      assert.equal(markdown.status, 200);
      assert.match(markdown.headers.get('content-type') ?? '', /text\/markdown/);
      assert.equal(markdown.headers.get('vary'), 'Accept');
      assert.equal(await markdown.text(), expected.markdown);
      assert.equal(await (await fetch(`${origin}${path}.md`)).text(), expected.markdown);
      const slash = await fetch(`${origin}${path}/`);
      assert.equal(slash.status, 200);
      assert.ok((await slash.text()).includes(`href="https://myself.md${expected.canonical}"`));
      const head = await fetch(origin + path, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
    }),
  );
  assert.equal((await fetch(`${origin}/datasets/unknown`)).status, 404);
}
