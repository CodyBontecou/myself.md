#!/usr/bin/env node
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { readFileSync } from 'node:fs';

const [command = 'help', name] = process.argv.slice(2);
const origin = new URL(process.env.MYSELF_URL ?? 'https://myself.md');
if (
  origin.protocol !== 'https:' &&
  !(['localhost', '127.0.0.1'].includes(origin.hostname) && origin.protocol === 'http:')
)
  throw new Error('MYSELF_URL must use HTTPS (HTTP is allowed only for localhost).');
if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/')
  throw new Error('MYSELF_URL must be an origin without credentials or a path.');

try {
  if (command === 'help') {
    console.log(
      'myself.md CLI\n\nnode scripts/myself.js health|config|docs|openapi\nnode scripts/myself.js tools\nnode scripts/myself.js call TOOL < arguments.json\n\nMYSELF_URL selects the service origin. MYSELF_TOKEN supplies an existing OAuth access token for tools/call; obtain it through owner-approved OAuth in your MCP client. Tokens are never stored. Call arguments are read as a JSON object from stdin. Tool errors exit nonzero.',
    );
  } else if (['health', 'config', 'docs', 'openapi'].includes(command)) {
    const path = command === 'openapi' ? '/openapi.json' : `/v1/${command}`;
    const response = await fetch(new URL(path, origin), {
      headers: { Accept: command === 'docs' ? 'text/markdown' : 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Public read failed (HTTP ${response.status}); Retry-After: ${response.headers.get('retry-after') ?? 'unspecified'}.`,
      );
    console.log(await response.text());
  } else if (command === 'tools' || command === 'call') {
    const token = process.env.MYSELF_TOKEN;
    if (!token)
      throw new Error(
        'Set MYSELF_TOKEN to an owner-authorized OAuth access token. See https://myself.md/docs.',
      );
    /** @type {Record<string, unknown>} */
    /** @type {Record<string, unknown>} */
    let args = {};
    if (command === 'call') {
      if (!name)
        throw new Error('Provide a tool name; use tools to discover available operations.');
      args = JSON.parse(readFileSync(0, 'utf8'));
      if (!args || typeof args !== 'object' || Array.isArray(args))
        throw new Error('Tool arguments must be a JSON object.');
    }
    const client = new Client({ name: 'myself-md-cli', version: '1.0.0' });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL('/mcp', origin), {
          requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
        }),
      );
      const result =
        command === 'tools'
          ? await client.listTools()
          : await client.callTool({ name: name ?? '', arguments: args });
      console.log(JSON.stringify(result, null, 2));
      if ('isError' in result && result.isError) process.exitCode = 1;
    } finally {
      await client.close();
    }
  } else throw new Error('Unknown command. Run node scripts/myself.js help.');
} catch (error) {
  // Avoid printing transport errors, which may contain request credentials.
  console.error(
    JSON.stringify({
      error:
        error instanceof Error && !process.env.MYSELF_TOKEN
          ? error.message
          : 'Command failed. Verify authorization, tool inputs and service availability.',
    }),
  );
  process.exitCode = 1;
}
