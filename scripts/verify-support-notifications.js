import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createRemoteSupport } from '../server/support-remote.js';
import { createSupportClient } from '../packages/support-chat/support-client.js';

const summaries = [
  { id: 'a', title: 'First', updatedAt: 'first', unreadCount: 1 },
  { id: 'b', title: 'Second', updatedAt: 'second', unreadCount: 1 },
];
const sequences = new Map([
  ['a', 7],
  ['b', 4],
]);
const cursors = new Map();
let failB = true;
let blocked = false;
/** @type {string[]} */
const receivedAgents = [];
/** @param {string} action @param {Record<string,unknown>} [input] */
async function operation(action, input = {}) {
  if (action === 'list') return { conversations: summaries.map((item) => ({ ...item })) };
  const item = summaries.find((row) => row.id === input.conversationId);
  if (!item) throw new Error('Conversation not found');
  if (action === 'read') {
    const sequence = sequences.get(item.id);
    // Simulate an additional reply arriving after the read snapshot.
    if (item.id === 'a') sequences.set('a', 8);
    return { messages: [{ sequence }] };
  }
  if (action === 'readCursor') {
    if (item.id === 'b' && failB) throw new Error('Temporarily unavailable');
    cursors.set(item.id, input.readThrough);
    item.unreadCount = sequences.get(item.id) === input.readThrough ? 0 : 1;
    return {};
  }
  throw new Error('Unexpected operation');
}
const mobile = createSupportClient(async (_path, options) => {
  const { action, ...input } = JSON.parse(options.body ?? '{}');
  return operation(action, input);
});
const resultSchema = z.object({ status: z.string(), outcomes: z.array(z.unknown()) });
const partial = resultSchema.parse(await mobile('markAllRead'));
assert.equal(partial.status, 'failed');
assert.equal(cursors.get('a'), 7);
assert.equal(cursors.has('b'), false);
assert.equal(summaries[0]?.unreadCount, 1, 'A newer reply must remain unread');
failB = false;
const retry = resultSchema.parse(await mobile('clearNotifications'));
assert.equal(retry.status, 'completed');
assert.equal(cursors.get('a'), 8);
assert.equal(cursors.get('b'), 4);
assert.ok(summaries.every((item) => item.unreadCount === 0));
assert.deepEqual(resultSchema.parse(await mobile('clearNotifications')).outcomes, []);
assert.equal(summaries.length, 2, 'Clearing must preserve conversations');

const remote = createRemoteSupport(
  { SUPPORT_ISOBOT_ORIGIN: 'https://support.fixture', SUPPORT_ISOBOT_TOKEN: 'fixture-secret' },
  () => {
    if (blocked) throw new Error('Agent blocked');
  },
  async (_url, options) => {
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('X-Support-Owner'), 'alice');
    receivedAgents.push(headers.get('X-Support-Agent') ?? '');
    const { action, ...input } = JSON.parse(String(options?.body));
    return Response.json(await operation(action, input));
  },
);
const mcp = new McpServer({ name: 'notifications-fixture', version: '1' });
remote.registerSupportV1Tools(mcp, 'alice', 'approved-agent');
const client = new Client({ name: 'notifications-client', version: '1' });
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
await mcp.connect(serverTransport);
await client.connect(clientTransport);
try {
  assert.ok(summaries[1]);
  summaries[1].unreadCount = 1;
  const result = await client.callTool({
    name: 'support_conversations',
    arguments: { action: 'markAllRead' },
  });
  assert.notEqual(result.isError, true);
  assert.equal(resultSchema.parse(result.structuredContent).status, 'completed');
  assert.ok(receivedAgents.every((agent) => agent === 'approved-agent'));
  blocked = true;
  const previous = receivedAgents.length;
  const denied = await client.callTool({
    name: 'support_conversations',
    arguments: { action: 'clearNotifications' },
  });
  assert.equal(denied.isError, true);
  assert.equal(receivedAgents.length, previous);
} finally {
  await client.close();
  await mcp.close();
}
console.log(
  'PASS notification acknowledgement, partial failure, retry, new replies, preserved history and MCP authorization.',
);
