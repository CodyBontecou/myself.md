import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { readVisualizationCatalog } from '../server/chatgpt-catalog.js';
import { visualizationIds } from '../core/chatgpt-catalog.js';
/** Public catalog delivery through the actual Worker, including the restricted MCP surface.
 * @param {{origin:string,token:(subject:string,client:string,path?:string)=>Promise<string>}} fixture */
export async function verifyChatgptCatalogWorker({ origin, token }) {
  assert.equal((await fetch(origin + '/apps/chatgpt/tiles/12/0/0.png')).status, 404);
  const page = await fetch(origin + '/apps/chatgpt');
  assert.equal(page.status, 200);
  const gallery = await page.text();
  assert.match(gallery, /Visualization catalog/);
  assert.equal((gallery.match(/class="preview-link"/g) ?? []).length, visualizationIds.length);
  assert.equal(gallery.includes('<iframe'), false);
  const focused = await fetch(origin + '/apps/chatgpt?example=sleep-performance');
  assert.equal((await focused.text()).includes('data-example="sleep-performance"'), true);
  assert.match(page.headers.get('content-security-policy') ?? '', /frame-src 'self'/);
  const data = await fetch(
    origin + '/apps/chatgpt/catalog.json?example=heart-screen-time&includeData=1',
  );
  assert.equal(data.status, 200);
  assert.deepEqual(await data.json(), readVisualizationCatalog('heart-screen-time', true));
  await Promise.all(
    visualizationIds.map(async (id) => {
      const preview = await fetch(origin + '/apps/chatgpt/examples/' + id);
      assert.equal(preview.status, 200);
      const csp = preview.headers.get('content-security-policy') ?? '';
      assert.match(csp, /connect-src 'none'/);
      assert.match(csp, /frame-ancestors 'self'/);
      const nonce = csp.match(/script-src 'nonce-([^']+)'/)?.[1];
      assert.ok(nonce);
      assert.ok((await preview.text()).includes(`script nonce="${nonce}"`));
    }),
  );
  assert.equal((await fetch(origin + '/apps/chatgpt?example=unknown')).status, 400);
  assert.match(
    await (await fetch(origin + '/sitemap.xml')).text(),
    /https:\/\/myself.md\/apps\/chatgpt/,
  );
  assert.match(await (await fetch(origin + '/llms.txt')).text(), /apps\/chatgpt/);
  const client = new Client({ name: 'public-visualization-fixture', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(origin + '/mcp/chatgpt'), {
        requestInit: {
          headers: {
            Authorization: await token(
              'public-catalog-fictional-owner',
              'catalog-test',
              '/mcp/chatgpt',
            ),
          },
        },
      }),
    );
    const result = await client.callTool({
      name: 'get_public_visualization_catalog',
      arguments: { exampleId: 'heart-screen-time', includeData: true },
    });
    assert.ok(!result.isError, JSON.stringify(result));
    assert.deepEqual(result.structuredContent, readVisualizationCatalog('heart-screen-time', true));
  } finally {
    await client.close();
  }
  console.log(
    'ChatGPT catalog Worker: public HTML/JSON/previews, sandbox CSP, sitemap/discovery and restricted MCP parity without a phone or billing grant passed.',
  );
}
