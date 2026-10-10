import { sorted } from '../core/collections.js';
import { z } from 'zod';
import { supportText, supportNotice } from '../core/support.js';
import { PairingError } from './errors.js';
const sendSchema = z
  .object({ id: z.string().regex(/^[A-Za-z0-9-]{16,64}$/), text: z.string().min(1).max(1800) })
  .strict();
const pageSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional();
/** @param {unknown} value */
const result = (value) => {
  const structuredContent = z.record(z.string(), z.unknown()).parse(value);
  return {
    content: [{ type: /** @type {const} */ ('text'), text: JSON.stringify(value) }],
    structuredContent,
  };
};
/** Shared UI/MCP support logic. Discord history supplies durable reply recovery.
 * @param {{store:import('./support-store.js').SupportStore,discord:import('./support-discord.js').SupportDiscord,cloud:Pick<import('./cloud-store.js').CloudStore,'observeAgent'>}} dependencies */
export function createSupportService({ store, discord, cloud }) {
  /** @type {Map<string,Promise<void>>} */
  const syncing = new Map();
  /** @param {string} subject @param {string|null} agent */
  function authorize(subject, agent) {
    if (!agent) return;
    cloud.observeAgent(subject, agent);
    if (store.conversation(subject)?.agent_access !== 1)
      throw new PairingError(
        403,
        'Enable agent access to support in the mobile or dashboard Support screen first.',
      );
  }
  /** @param {string} subject */
  async function synchronize(subject) {
    const previous = syncing.get(subject);
    if (previous) return previous;
    const work = (async () => {
      let conversation = store.conversation(subject);
      if (!conversation || (!conversation.thread && !store.pending(subject).length)) return;
      const { channel, bot } = await discord.verifyChannel();
      if (!conversation.thread) {
        const thread =
          (await discord.findThread(String(conversation.id), channel.guild_id)) ??
          (await discord.createThread(String(conversation.id)));
        store.thread(subject, thread);
        conversation = store.conversation(subject);
      }
      const thread = String(conversation?.thread);
      await discord.verifyThread(thread);
      const pending = store.pending(subject);
      if (pending.length) await discord.addStaff(thread);
      await pending.reduce(async (priorDelivery, message) => {
        await priorDelivery;
        const alreadySent = await discord.previouslySent(thread, message.id, bot.id);
        if (!alreadySent) {
          try {
            authorize(subject, message.agent);
          } catch (error) {
            if (error instanceof PairingError && error.status === 403) {
              store.cancel(subject, message.id);
              return undefined;
            }
            throw error;
          }
          await discord.send(thread, message);
        }
        store.delivered(subject, message.id);
        return undefined;
      }, Promise.resolve());
      const cursor = String(conversation?.cursor ?? '0');
      /** @type {Awaited<ReturnType<import('./support-discord.js').SupportDiscord['messages']>>} */
      const incoming = [];
      /** @type {string|undefined} */
      let before;
      let complete = false;
      /** @param {number} page */
      async function readPage(page) {
        if (page >= 100) return;
        const messages = await discord.messages(thread, undefined, before);
        incoming.push(...messages.filter((message) => BigInt(message.id) > BigInt(cursor)));
        if (
          messages.length < 100 ||
          messages.some((message) => BigInt(message.id) <= BigInt(cursor))
        ) {
          complete = true;
          return;
        }
        before = messages.at(-1)?.id;
        await readPage(page + 1);
      }
      await readPage(0);
      if (!complete)
        throw new PairingError(503, 'Support reply recovery needs operator attention.');
      for (const message of sorted(incoming, (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))) {
        if (!message.author.bot && discord.staff.has(message.author.id) && message.content.trim()) {
          store.append(subject, {
            id: `discord-${message.id}`,
            role: 'support',
            text: message.content,
            agent: null,
            createdAt: message.timestamp,
          });
        }
        store.cursor(subject, message.id);
      }
    })().finally(() => syncing.delete(subject));
    syncing.set(subject, work);
    return work;
  }
  /** @param {string} subject @param {number} [before] @param {string|null} [agent] @returns {Promise<import('../core/support.js').SupportState>} */
  async function state(subject, before, agent = null) {
    const parsedBefore = pageSchema.parse(before);
    authorize(subject, agent);
    let warning = null;
    if (discord.available()) {
      try {
        await synchronize(subject);
      } catch (error) {
        warning =
          error instanceof PairingError
            ? error.message
            : 'Support could not refresh. Saved messages remain available; try again.';
      }
    }
    authorize(subject, agent);
    const conversation = store.conversation(subject);
    return {
      conversationId: conversation ? String(conversation.id) : null,
      ...store.page(subject, parsedBefore),
      available: discord.available(),
      agentAccess: conversation?.agent_access === 1,
      warning,
    };
  }
  /** @param {string} subject @param {unknown} input @param {string|null} [agent] */
  async function send(subject, input, agent = null) {
    authorize(subject, agent);
    if (!discord.available())
      throw new PairingError(
        503,
        'Support chat is not configured yet. Please use the support email.',
      );
    const parsed = sendSchema.parse(input);
    store.append(subject, { ...parsed, text: supportText(parsed.text), role: 'user', agent });
    return state(subject, undefined, agent);
  }
  /** @param {string} subject @param {string} method @param {URLSearchParams} query @param {unknown} body */
  async function supportApi(subject, method, query, body) {
    if (method === 'GET')
      return state(
        subject,
        query.has('before') ? z.coerce.number().parse(query.get('before')) : undefined,
      );
    if (method === 'POST') return send(subject, body);
    if (method === 'PUT') {
      const input = z.object({ agentAccess: z.boolean() }).strict().parse(body);
      store.setAgentAccess(subject, input.agentAccess);
      if (!input.agentAccess)
        for (const message of store.pending(subject))
          if (message.agent) store.cancel(subject, message.id);
      return state(subject);
    }
    throw new PairingError(405, 'Support action not supported.');
  }
  /** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject @param {string|null} agent */
  function registerSupportTools(mcp, subject, agent) {
    mcp.registerTool(
      'get_support_conversation',
      {
        description:
          'Read your support conversation and delivery status. Requires owner-enabled support access. Without access, returns availability and the owner handoff without private messages.',
        inputSchema: z.object({ before: pageSchema }),
      },
      async ({ before }) => {
        if (!agent) throw new PairingError(403, 'Agent identity required.');
        cloud.observeAgent(subject, agent);
        if (store.conversation(subject)?.agent_access !== 1)
          return result({
            available: discord.available(),
            agentAccess: false,
            notice: supportNotice,
            handoff: {
              dashboard: '/dashboard?view=support',
              action:
                'The account owner must enable agent access to support. Agents cannot grant themselves access.',
            },
          });
        return result(await state(subject, before, agent));
      },
    );
    mcp.registerTool(
      'revoke_support_agent_access',
      {
        description:
          'Revoke all connected agents’ access to your support conversation. Enabling access requires the account owner in the app or dashboard.',
        inputSchema: z.object({}).strict(),
      },
      async () => {
        if (!agent) throw new PairingError(403, 'Agent identity required.');
        cloud.observeAgent(subject, agent);
        store.setAgentAccess(subject, false);
        for (const message of store.pending(subject))
          if (message.agent) store.cancel(subject, message.id);
        return result({ agentAccess: false });
      },
    );
    mcp.registerTool(
      'send_support_message',
      {
        description:
          'Send an explicitly requested support message. Use a fresh message ID for each message and retain it for safe retries. Requires owner-enabled support access; queued means saved, delivered means accepted by Discord, not read by staff.',
        inputSchema: sendSchema,
      },
      async (input) => {
        if (!agent) throw new PairingError(403, 'Agent identity required.');
        return result(await send(subject, input, agent));
      },
    );
  }
  return { supportApi, registerSupportTools };
}
