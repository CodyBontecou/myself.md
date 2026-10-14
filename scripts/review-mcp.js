import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { reviewToolMetadata } from './mcp-review-metadata.js';

const origin = new URL(process.env.MYSELF_URL ?? 'https://myself.md');
if (
  origin.origin !== origin.href.replace(/\/$/, '') ||
  origin.username ||
  origin.password ||
  (origin.protocol !== 'https:' &&
    !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))
)
  throw new Error('MYSELF_URL must be an HTTPS origin or an HTTP loopback origin.');
const token = process.env.MYSELF_TOKEN;
if (!token)
  throw new Error('Set MYSELF_TOKEN to a dedicated reviewer account’s agent OAuth token.');
const client = new Client({ name: 'myself-md-review', version: '1.0.0' });
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', origin), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  const tools = [];
  /** @type {string|undefined} */
  let cursor;
  const seen = new Set();
  do {
    // Sequential pages are required to inspect the complete authenticated tool surface.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('Tool discovery repeated a pagination cursor.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  console.log(
    JSON.stringify(
      { endpoint: new URL('/mcp', origin).href, tools: reviewToolMetadata(tools) },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
