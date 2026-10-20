import { z } from 'zod';
import { setTimeout } from 'node:timers/promises';
export const waitMsInput = z
  .number()
  .int()
  .min(0)
  .max(25000)
  .default(0)
  .describe(
    'Wait up to 25000 milliseconds for a pending status to change. Owner-action states return immediately. Omit for an immediate response; follow retryAfterMs.',
  );
const pending = new Set(['queued', 'running', 'accepted', 'pending', 'awaiting_phone']);
/** Reads must recheck ownership, client access and current grants on every invocation.
 * @template {{status:string}} T @param {()=>T|Promise<T>} read @param {number} waitMs */
export async function boundedWait(read, waitMs) {
  const deadline = Date.now() + waitMs;
  let result = await read();
  const initial = result.status;
  while (pending.has(result.status) && result.status === initial && Date.now() < deadline) {
    // oxlint-disable-next-line eslint/no-await-in-loop
    await setTimeout(Math.min(200, Math.max(0, deadline - Date.now())));
    // oxlint-disable-next-line eslint/no-await-in-loop
    result = await read();
  }
  return { ...result, retryAfterMs: pending.has(result.status) ? 1000 : null };
}
