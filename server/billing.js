import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { z } from 'zod';
import { BillingStore } from './billing-store.js';
import { verifyStorePurchase } from './store-purchases.js';
const directory = process.env.DATA_DIR ?? '.local';
mkdirSync(directory, { recursive: true });
export const billing = new BillingStore(join(directory, 'billing.sqlite'));
/** @param {string} subject @param {unknown} body */
export async function billingApi(subject, body) {
  const input = z
    .object({
      action: z.enum(['sync', 'reserve', 'complete', 'release', 'purchase']),
      id: z.string().min(1).max(200).optional(),
      scope: z
        .object({
          profileId: z.string().min(1).max(100),
          days: z
            .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
            .min(1)
            .max(31),
          formats: z
            .array(z.enum(['json', 'jsonl']))
            .min(1)
            .max(2),
        })
        .optional(),
      offlineUses: z.array(z.string().min(1).max(200)).max(5).default([]),
      purchase: z
        .object({ store: z.enum(['ios', 'android']), proof: z.string().min(1).max(30000) })
        .optional(),
    })
    .parse(body);
  await refreshEntitlement(subject);
  billing.importUses(subject, input.offlineUses);
  if (input.action === 'purchase') {
    if (!input.purchase) throw new Error('Purchase proof required.');
    billing.unlock(subject, await verifyStorePurchase(input.purchase));
  } else if (input.action !== 'sync') {
    if (!input.id) throw new Error('Export ID required.');
    if (input.action === 'reserve')
      billing.reserve(subject, input.id, JSON.stringify(input.scope ?? {}));
    else billing[input.action](subject, input.id);
  }
  return billing.snapshot(subject);
}

/** Refresh directly with the original store; a phone heartbeat is not required.
 * @param {string} subject */
export async function refreshEntitlement(subject) {
  const purchase = billing.purchase(subject);
  if (!purchase || purchase.verified > Date.now() - 3600000) return;
  try {
    billing.unlock(subject, await verifyStorePurchase(purchase));
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 403)
      billing.revoke(subject);
    else throw error;
  }
}
