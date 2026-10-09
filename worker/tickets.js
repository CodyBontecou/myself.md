import { createHash } from 'node:crypto';
/** @param {string} value */
export const digest = (value) => createHash('sha256').update(value).digest('hex');
/** @param {Env} env @param {string} ticket @param {string|null} subject @param {string|null} purchase @param {number} expires */
export async function registerTicket(env, ticket, subject, purchase, expires) {
  await env.DIRECTORY.prepare('INSERT OR REPLACE INTO tickets VALUES(?,?,?,?)')
    .bind(digest(ticket), subject, purchase, expires)
    .run();
}
/** @param {Env} env @param {string} ticket */
export async function findTicket(env, ticket) {
  return env.DIRECTORY.withSession('first-primary')
    .prepare('SELECT subject,purchase FROM tickets WHERE hash=? AND expires>?')
    .bind(digest(ticket), Date.now())
    .first();
}
