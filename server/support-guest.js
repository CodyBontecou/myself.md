import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PairingError } from './errors.js';
import { createPublicReadLimiter } from './public-site.js';

const inputSchema = z
  .object({
    action: z.enum([
      'list',
      'create',
      'read',
      'send',
      'readCursor',
      'update',
      'archive',
      'delete',
      'decline',
    ]),
    conversationId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,100}$/)
      .optional(),
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,100}$/)
      .optional(),
    title: z.string().trim().min(1).max(120).optional(),
    text: z.string().trim().min(1).max(1800).optional(),
    readThrough: z.number().int().nonnegative().optional(),
    before: z.number().int().nonnegative().optional(),
    autoReply: z.boolean().optional(),
    status: z.enum(['open', 'resolved']).optional(),
    requestId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,100}$/)
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    /** @type {('id'|'title'|'conversationId'|'text')[]} */
    const required =
      data.action === 'create' ? ['id', 'title'] : data.action === 'list' ? [] : ['conversationId'];
    if (data.action === 'send') required.push('id', 'text');
    for (const field of required) {
      if (data[field] === undefined)
        ctx.addIssue({ code: 'custom', path: [field], message: 'Required' });
    }
  });

/** Guest credentials authorize only their isolated support partition.
 * @param {NonNullable<import('./application.js').ApplicationServices['supportV1Api']>} remote */
export function createGuestSupport(remote) {
  const limit = createPublicReadLimiter();
  /** @type {Map<string,{count:number,until:number}>} */
  const sends = new Map();
  /** @param {string|undefined} authorization @param {unknown} input @param {string} address */
  return async (authorization, input, address) => {
    const token = authorization?.match(/^Guest ([a-f0-9]{64})$/)?.[1];
    if (!token) throw new PairingError(401, 'A guest support credential is required.');
    const data = inputSchema.parse(input);
    if (!limit(address).allowed)
      throw new PairingError(429, 'Please wait before refreshing support.');
    if (data.action === 'create' || data.action === 'send') {
      const now = Date.now();
      let window = sends.get(address);
      if (!window || now >= window.until) {
        if (sends.size >= 10000) {
          const oldest = sends.keys().next().value;
          if (oldest !== undefined) sends.delete(oldest);
        }
        window = { count: 0, until: now + 60000 };
        sends.set(address, window);
      }
      if (++window.count > 10)
        throw new PairingError(429, 'Please wait a minute before sending more messages.');
    }
    const owner = `support-guest:${createHash('sha256').update(token).digest('hex')}`;
    return remote(owner, 'POST', new URLSearchParams(), data);
  };
}
