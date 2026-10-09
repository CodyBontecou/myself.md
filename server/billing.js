import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createBillingService } from './billing-service.js';
import { BillingStore } from './billing-store.js';
import { verifyStorePurchase } from './store-purchases.js';
const directory = process.env.DATA_DIR ?? '.local';
mkdirSync(directory, { recursive: true });
export const billing = new BillingStore(join(directory, 'billing.sqlite'));
// In-memory agent jobs cannot resume after a server restart. Completed uses survive.
billing.db.exec("DELETE FROM billing_uses WHERE state='reserved' AND scope='agent'");
const service = createBillingService({
  billing,
  verifyStorePurchase,
  unlock: async (subject, purchase) => {
    billing.unlock(subject, purchase);
  },
});
export const { billingApi, refreshEntitlement } = service;
