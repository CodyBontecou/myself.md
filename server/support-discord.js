import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PairingError } from './errors.js';
const snowflake = z.string().regex(/^\d{17,22}$/);
const channelSchema = z.object({
  id: snowflake,
  type: z.number(),
  guild_id: snowflake,
  permission_overwrites: z.array(
    z.object({ id: snowflake, type: z.number(), allow: z.string(), deny: z.string() }),
  ),
});
const messageSchema = z.object({
  id: snowflake,
  content: z.string(),
  timestamp: z.string(),
  author: z.object({ id: snowflake, bot: z.boolean().optional() }),
});
const threadSchema = z.object({ id: snowflake, parent_id: snowflake, name: z.string() });
/** Discord REST under isobot's identity; no separate Gateway process or user account automation. */
export class SupportDiscord {
  /** @param {Record<string,string|undefined>} config @param {typeof fetch} [request] */
  constructor(config, request = fetch) {
    this.token = config.SUPPORT_DISCORD_BOT_TOKEN;
    this.channel = config.SUPPORT_DISCORD_CHANNEL_ID;
    this.staff = new Set(
      (config.SUPPORT_DISCORD_STAFF_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    this.request = request;
  }
  available() {
    return Boolean(this.token && this.channel && this.staff.size);
  }
  /** @param {string} path @param {unknown} [body] @param {'GET'|'POST'|'DELETE'|'PUT'} [method] */
  async call(path, body, method) {
    const response = await this.request(`https://discord.com/api/v10${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { Authorization: `Bot ${this.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 204 || (method === 'DELETE' && response.status === 404)) return null;
    if (response.status === 404)
      throw new PairingError(404, 'Support thread is no longer available.');
    if (!response.ok)
      throw new PairingError(
        503,
        response.status === 429
          ? 'Support delivery is busy. Your saved message will retry when you refresh.'
          : 'Discord support is temporarily unavailable. Your saved message will retry when you refresh.',
      );
    return /** @type {unknown} */ (await response.json());
  }
  async verifyChannel() {
    if (!this.available()) throw new PairingError(503, 'Support chat is not configured yet.');
    const channel = channelSchema.parse(
      await this.call(`/channels/${snowflake.parse(this.channel)}`),
    );
    const bot = z.object({ id: snowflake }).parse(await this.call('/users/@me'));
    const view = 1024n;
    const everyone = channel.permission_overwrites.find(
      (overwrite) => overwrite.id === channel.guild_id && overwrite.type === 0,
    );
    if (
      channel.type !== 0 ||
      !everyone ||
      !(BigInt(everyone.deny) & view) ||
      channel.permission_overwrites.some(
        (overwrite) =>
          (BigInt(overwrite.allow) & view) !== 0n &&
          !(overwrite.type === 1 && (overwrite.id === bot.id || this.staff.has(overwrite.id))),
      )
    )
      throw new PairingError(
        503,
        'Support channel privacy needs operator attention. Your message remains saved.',
      );
    return { channel, bot };
  }
  /** Reconcile thread creation after uncertain HTTP outcomes. @param {string} conversationId @param {string} guildId */
  async findThread(conversationId, guildId) {
    const name = `myself-${conversationId}`;
    const active = z
      .object({ threads: z.array(threadSchema) })
      .parse(await this.call(`/guilds/${guildId}/threads/active`));
    const found = active.threads.find(
      (thread) => thread.parent_id === this.channel && thread.name === name,
    );
    if (found) return found.id;
    /** @param {number} page @param {string} [before] @returns {Promise<string|null>} */
    const readArchived = async (page, before) => {
      if (page >= 100)
        throw new PairingError(503, 'Support thread recovery needs operator attention.');
      const archived = z
        .object({
          threads: z.array(
            threadSchema.extend({ thread_metadata: z.object({ archive_timestamp: z.string() }) }),
          ),
          has_more: z.boolean(),
        })
        .parse(
          await this.call(
            `/channels/${this.channel}/threads/archived/public?limit=100${before ? `&before=${encodeURIComponent(before)}` : ''}`,
          ),
        );
      const match = archived.threads.find((thread) => thread.name === name);
      if (match) return match.id;
      if (!archived.has_more) return null;
      const next = archived.threads.at(-1)?.thread_metadata.archive_timestamp;
      if (!next) throw new PairingError(503, 'Could not reconcile support threads.');
      return readArchived(page + 1, next);
    };
    return readArchived(0);
  }
  /** @param {string} conversationId */
  async createThread(conversationId) {
    return threadSchema.parse(
      await this.call(`/channels/${this.channel}/threads`, {
        name: `myself-${conversationId}`,
        type: 11,
        auto_archive_duration: 1440,
      }),
    ).id;
  }
  /** @param {string} thread @param {string} [after] @param {string} [before] */
  async messages(thread, after, before) {
    return z
      .array(messageSchema)
      .parse(
        await this.call(
          `/channels/${snowflake.parse(thread)}/messages?limit=100${after ? `&after=${snowflake.parse(after)}` : ''}${before ? `&before=${snowflake.parse(before)}` : ''}`,
        ),
      );
  }
  /** Check the complete thread for a previously accepted message, including after the nonce window. @param {string} thread @param {string} id @param {string} botId */
  async previouslySent(thread, id, botId) {
    /** @param {number} page @param {string} [before] @returns {Promise<boolean>} */
    const readPage = async (page, before) => {
      if (page >= 100)
        throw new PairingError(503, 'Support delivery recovery needs operator attention.');
      const messages = await this.messages(thread, undefined, before);
      if (
        messages.some(
          (message) => message.author.id === botId && message.content.startsWith(`[${id}]\n`),
        )
      )
        return true;
      if (messages.length < 100) return false;
      return readPage(page + 1, messages.at(-1)?.id);
    };
    return readPage(0);
  }
  /** Join staff to active conversations so threads appear in their Discord inbox. @param {string} thread */
  async addStaff(thread) {
    await [...this.staff].reduce(async (previous, id) => {
      await previous;
      await this.call(
        `/channels/${snowflake.parse(thread)}/thread-members/${snowflake.parse(id)}`,
        undefined,
        'PUT',
      );
    }, Promise.resolve());
  }
  /** @param {string} thread */
  async verifyThread(thread) {
    const target = threadSchema.parse(await this.call(`/channels/${snowflake.parse(thread)}`));
    if (target.parent_id !== this.channel)
      throw new PairingError(
        503,
        'Support channel changed. Thread migration needs operator attention.',
      );
    return target;
  }
  /** @param {string} thread */
  async deleteThread(thread) {
    try {
      const target = z
        .object({ id: snowflake, parent_id: snowflake })
        .parse(await this.call(`/channels/${snowflake.parse(thread)}`));
      if (target.parent_id !== this.channel)
        throw new PairingError(503, 'Support cleanup needs operator attention.');
      await this.call(`/channels/${thread}`, undefined, 'DELETE');
    } catch (error) {
      if (!(error instanceof PairingError && error.status === 404)) throw error;
    }
  }
  /** @param {string} thread @param {import('../core/support.js').SupportMessage} message */
  async send(thread, message) {
    return messageSchema.parse(
      await this.call(`/channels/${thread}/messages`, {
        content: `[${message.id}]\n${message.text}`,
        allowed_mentions: { parse: [] },
        nonce: createHash('sha256').update(`${thread}|${message.id}`).digest('hex').slice(0, 24),
        enforce_nonce: true,
      }),
    );
  }
}
