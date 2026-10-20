import assert from 'node:assert/strict';
import { z } from 'zod';
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

console.log(
  'PASS portable notification acknowledgement, partial failure, retry, new replies and preserved history.',
);
