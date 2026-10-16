import { transaction } from './database.js';
import { PairingError } from './errors.js';
import { z } from 'zod';
const snowflake = z.string().regex(/^\d{17,22}$/);
const threadSchema = z.object({ id: snowflake, parent_id: snowflake });
/** Delete only retained pre-Isobot support data. Failures leave the thread checkpoint for account-deletion retry.
 * @param {import('./database.js').SqlDatabase} db
 * @param {string} subject
 * @param {Record<string,string|undefined>} config
 * @param {typeof fetch} [request] */
export async function deleteLegacySupport(db, subject, config, request = fetch) {
  const tables = new Set(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('support_conversations','support_messages')",
      )
      .all()
      .map((row) => String(row.name)),
  );
  const conversation = tables.has('support_conversations')
    ? db.prepare('SELECT thread FROM support_conversations WHERE subject=?').get(subject)
    : undefined;
  if (typeof conversation?.thread === 'string') {
    const token = config.SUPPORT_DISCORD_BOT_TOKEN;
    const channel = config.SUPPORT_DISCORD_CHANNEL_ID;
    if (!token || !channel)
      throw new PairingError(
        503,
        'Legacy support cleanup requires Discord configuration. Cleanup will retry automatically.',
      );
    const thread = snowflake.parse(conversation.thread);
    const parent = snowflake.parse(channel);
    /** @param {'GET'|'DELETE'} method */
    const call = async (method) => {
      const response = await request(`https://discord.com/api/v10/channels/${thread}`, {
        method,
        headers: { Authorization: `Bot ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404 || (method === 'DELETE' && response.status === 204)) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new PairingError(
          503,
          'Legacy Discord support cleanup is temporarily unavailable. Cleanup will retry automatically.',
        );
      }
      return response;
    };
    const response = await call('GET');
    if (response) {
      const target = threadSchema.parse(await response.json());
      if (target.id !== thread || target.parent_id !== parent)
        throw new PairingError(
          503,
          'Legacy support cleanup needs operator attention: the Discord thread does not match its configured parent channel.',
        );
      const deleted = await call('DELETE');
      await deleted?.body?.cancel();
    }
  }
  transaction(db, () => {
    for (const table of ['support_messages', 'support_conversations'])
      if (tables.has(table)) db.prepare(`DELETE FROM ${table} WHERE subject=?`).run(subject);
  });
}
