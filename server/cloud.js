import { billing, refreshEntitlement, configureBillingCloud } from './billing.js';
import { Buffer } from 'node:buffer';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createCloudService } from './cloud-service.js';
import { HistoryStore } from './history-store.js';
import { CloudStore } from './cloud-store.js';
import { r2Store } from './r2-store.js';
import { devices } from './store.js';
import { PairingError } from './errors.js';
import { createCloudSubscriptions } from './cloud-subscriptions.js';
import { createEmailSender } from './email.js';
import { createExportSchedules } from './export-schedules.js';
import { handleStoreNotification, storeSubscriptions } from './store-subscriptions.js';
const directory = process.env.DATA_DIR ?? '.local';
mkdirSync(directory, { recursive: true });
const path = join(directory, 'cloud.key');
if (!process.env.CLOUD_ENCRYPTION_KEY && process.env.ALLOW_HTTP_DEV !== '1')
  throw new Error(
    'Set CLOUD_ENCRYPTION_KEY to 64 hex characters before enabling the cloud service.',
  );
if (!process.env.CLOUD_ENCRYPTION_KEY && !existsSync(path))
  writeFileSync(path, randomBytes(32), { mode: 0o600 });
const key = process.env.CLOUD_ENCRYPTION_KEY
  ? Buffer.from(process.env.CLOUD_ENCRYPTION_KEY, 'hex')
  : readFileSync(path);
export const cloud = new CloudStore(
  join(directory, 'cloud.sqlite'),
  key,
  r2Store(process.env),
  (subject) => billing.cloudEntitlement(subject),
);
export const history = new HistoryStore(join(directory, 'history.sqlite'), cloud);
/** @param {string} subject @param {string} id */
export function ownCloudDevice(subject, id) {
  if (!devices(subject).some((d) => d.id === id))
    throw new PairingError(404, 'Connected phone not found.');
}
export const exportSchedules = createExportSchedules(billing.db, ownCloudDevice, async () => {});
export const cloudSubscriptions = createCloudSubscriptions({
  billing,
  cloud,
  history,
  refreshEntitlement,
  pushTokens: exportSchedules.pushTokens,
  // Self-hosted operators may supply a subject-to-email map; hosted accounts use identity D1.
  accountEmail: async (subject) => {
    const emails = JSON.parse(process.env.CLOUD_ACCOUNT_EMAILS ?? '{}');
    return typeof emails[subject] === 'string' ? emails[subject] : null;
  },
  mailer: createEmailSender({}),
});
configureBillingCloud({
  run: cloudSubscriptions.run,
  revoked: cloudSubscriptions.lifetimeRevoked,
  changed: cloudSubscriptions.reconcile,
});
/** @param {'apple'|'google'} source @param {Uint8Array} bytes @param {string|undefined} authorization @param {string} audience */
export function storeNotification(source, bytes, authorization, audience) {
  return handleStoreNotification(source, bytes, authorization, audience, {
    ownerOf: async (ownerKey) => billing.owner(ownerKey),
    purchaseOwner: async (store, id) => billing.purchaseOwner(store, id),
    read: storeSubscriptions.read,
    deliver: async (subject, event) => {
      await cloudSubscriptions.notification(subject, event);
    },
  });
}
setInterval(async () => {
  for (const subject of billing.cloudSubjects()) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Serialize account store checks and cleanup.
      await cloudSubscriptions.maintain(subject);
    } catch {
      console.error('Cloud subscription maintenance failed; will retry in one minute.');
    }
  }
  await exportSchedules.dispatch().catch(() => console.error('Export schedule dispatch failed.'));
}, 60000).unref();
export const { registerCloudTools } = createCloudService({
  cloud,
  billing,
  history,
  refreshEntitlement,
  cloudSubscriptions,
});
// Retry interrupted backfills and physical deletions without blocking service startup.
let maintaining = false;
if (cloud.objects) {
  const maintain = async () => {
    if (maintaining) return;
    maintaining = true;
    try {
      cloud.cleanup();
      const result = await cloud.migrateObjects();
      await cloud.sweepObjects();
      if (result.migrated) console.log(`Migrated ${result.migrated} encrypted exports to R2.`);
    } catch {
      console.error('R2 maintenance failed; will retry in one minute.');
    } finally {
      maintaining = false;
    }
  };
  setTimeout(maintain, 1000).unref();
  setInterval(maintain, 60000).unref();
}
