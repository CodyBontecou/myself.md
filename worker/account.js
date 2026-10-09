import { DurableObject } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { createApplication } from '../server/application.js';
import { BillingStore } from '../server/billing-store.js';
import { CloudStore } from '../server/cloud-store.js';
import { HistoryStore } from '../server/history-store.js';
import { PairingStore } from '../server/pairing-store.js';
import { createBillingService } from '../server/billing-service.js';
import { createDataService } from '../server/data-service.js';
import { createCloudService } from '../server/cloud-service.js';
import { createDashboardService } from '../server/dashboard-service.js';
import { verifyStorePurchase } from '../server/store-purchases.js';
import { verifyMigrationPurchase } from '../server/migration-purchases.js';
import { PairingError } from '../server/errors.js';
import { proxyAuth } from '../server/auth-proxy.js';
import { objectDatabase } from './database.js';
import { objectStorage } from './storage.js';
import { readBytes } from './request.js';
import { qrPng } from './qrcode.js';
import { DurableMap } from './queues.js';
import { importRows, exportRows, batchSchema } from './import.js';
import { registerTicket, findTicket, digest } from './tickets.js';
/** @augments {DurableObject<Env>} */
export class Account extends DurableObject {
  /** @param {DurableObjectState} ctx @param {Env} env */
  constructor(ctx, env) {
    super(ctx, env);
    this.db = objectDatabase(this.ctx.storage);
    this.billing = new BillingStore(this.db);
    this.pairing = new PairingStore(this.db);
    this.cloud = new CloudStore(
      this.db,
      Buffer.from(this.env.CLOUD_ENCRYPTION_KEY, 'hex'),
      objectStorage(this.env.EXPORTS),
    );
    this.history = new HistoryStore(this.db, this.cloud);
    // Native responses remain memory-only. Restarted requests release their allowance and report interruption.
    this.db.prepare("DELETE FROM billing_uses WHERE state='reserved' AND scope='agent'").run();
    const billingService = createBillingService({
      billing: this.billing,
      verifyStorePurchase,
      unlock: async (subject, purchase) => {
        const result = await this.env.PURCHASES.getByName(
          digest(`${purchase.store}|${purchase.id}`),
        ).unlock(subject, purchase);
        if (!result.ok) throw new PairingError(result.status, result.error);
        this.billing.unlock(subject, purchase);
      },
    });
    const jobs = new DurableMap(
      this.db,
      this.cloud,
      'jobs',
      (/** @type {import('../server/data-service.js').Job} */ job) => ({
        ...job,
        state: /** @type {const} */ ('failed'),
        error:
          'The service restarted. Native response records are no longer available. Submit a new request.',
      }),
      (/** @type {import('../server/data-service.js').Job} */ job) => {
        const metadata = { ...job };
        delete metadata.result;
        return metadata;
      },
    );
    const proposals = new DurableMap(
      this.db,
      this.cloud,
      'proposals',
      (/** @type {import('../server/data-service.js').Proposal} */ proposal) => proposal,
      (/** @type {import('../server/data-service.js').Proposal} */ proposal) => proposal,
    );
    this.data = createDataService({
      jobs,
      proposals,
      billing: this.billing,
      history: this.history,
      refreshEntitlement: billingService.refreshEntitlement,
      devices: this.pairing.devices.bind(this.pairing),
    });
    const cloudService = createCloudService({
      cloud: this.cloud,
      billing: this.billing,
      history: this.history,
      refreshEntitlement: billingService.refreshEntitlement,
    });
    const dashboard = createDashboardService({
      cloud: this.cloud,
      history: this.history,
      devices: this.pairing.devices.bind(this.pairing),
      cancelAgent: this.data.cancelAgent,
    });
    this.listener = createApplication(
      {
        PUBLIC_URL: this.env.PUBLIC_URL,
        PUBLIC_URL_ALIASES: this.env.PUBLIC_URL_ALIASES,
        OAUTH_ISSUER: this.env.OAUTH_ISSUER,
        ACCOUNT_NAMESPACE: this.env.ACCOUNT_NAMESPACE,
        IOS_APP_ID: this.env.IOS_APP_ID,
        ALLOW_HTTP_DEV: this.env.ALLOW_HTTP_DEV,
      },
      {
        qrPng,
        ...billingService,
        ...this.data,
        ...cloudService,
        ...dashboard,
        billing: this.billing,
        cloud: this.cloud,
        history: this.history,
        createPairing: this.pairing.createPairing.bind(this.pairing),
        claim: this.pairing.claim.bind(this.pairing),
        devices: this.pairing.devices.bind(this.pairing),
        disconnect: this.pairing.disconnect.bind(this.pairing),
        pending: this.pairing.pending.bind(this.pairing),
        status: this.pairing.status.bind(this.pairing),
        ownCloudDevice: (subject, id) => {
          if (!this.pairing.devices(subject).some((d) => d.id === id))
            throw new PairingError(404, 'Connected phone not found.');
        },
        registerTicket: (ticket, subject, expires) =>
          registerTicket(this.env, ticket, subject, null, expires),
        claimMigration: async (subject, ticket) => {
          const route = await findTicket(this.env, ticket);
          if (typeof route?.purchase !== 'string')
            throw new PairingError(410, 'This claim expired. Start again in your original app.');
          const grant = await this.env.PURCHASES.getByName(route.purchase).claim(subject, ticket);
          if (!grant.ok) throw new PairingError(grant.status, grant.error);
          this.billing.grant(subject, grant.source, grant.reference);
          return this.billing.snapshot(subject);
        },
        createMigrationClaim: async () => {
          throw new PairingError(404, 'Not found.');
        },
        verifyMigrationPurchase,
        proxyAuth,
        dashboardAsset: () => false,
      },
    );
  }
  /** @param {string} subject */
  async ensureAccount(subject) {
    const previous = this.ctx.storage.kv.get('subject');
    if (previous && previous !== subject) throw new Error('Account partition mismatch.');
    if (!previous) {
      await this.env.DIRECTORY.prepare('INSERT OR IGNORE INTO accounts VALUES(?,?)')
        .bind(subject, Date.now())
        .run();
      this.ctx.storage.kv.put('subject', subject);
    }
  }
  /** @param {Request} request */
  async fetch(request) {
    this.data.cleanup();
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 300000);
    const bytes = await readBytes(request, 16 * 1024 * 1024);
    const buffered = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      ...(bytes.length ? { body: bytes } : {}),
    });
    const server = createServer(this.listener);
    try {
      server.listen(0);
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Worker HTTP adapter unavailable.');
      return await handleAsNodeRequest(address.port, buffered);
    } finally {
      server.close();
    }
  }
  /** @param {import('./import.js').ImportBatch} value */
  importBatch(value) {
    const batch = batchSchema.parse(value);
    importRows(this.db, batch, [
      'pairings',
      'devices',
      'exports',
      'cloud_access',
      'agents',
      'upload_keys',
      'activity',
      'billing_uses',
      'billing_purchases',
      'billing_grants',
    ]);
    this.billing.db
      .prepare("DELETE FROM billing_uses WHERE state='reserved' AND scope='agent'")
      .run();
    for (const row of this.db
      .prepare('SELECT id FROM activity WHERE subject=?')
      .all(batch.subject)) {
      const event = this.history.get(batch.subject, String(row.id))?.event;
      if (event?.kind === 'access' && ['running', 'ready'].includes(event.status))
        this.history.update(batch.subject, String(row.id), {
          status: 'interrupted',
          error: 'The service migrated before this access finished.',
        });
    }
    for (const row of this.cloud.list(batch.subject))
      this.cloud.metadata(this.cloud.row(batch.subject, row.id));
  }
  /** Operator-only legacy grant; the edge requires a private secret in migration mode.
   * @param {string} subject @param {string} source @param {string} reference */
  grantLifetime(subject, source, reference) {
    this.billing.grant(subject, source, reference);
  }
  /** Verify live R2 bindings and encryption without returning record contents.
   * @param {string} subject */
  async verifyStorage(subject) {
    const files = this.cloud.list(subject);
    let bytes = 0;
    await files.reduce(async (previous, file) => {
      await previous;
      const row = this.cloud.row(subject, file.id);
      const plain = await this.cloud.bytes(row);
      if (row.content_hash && this.cloud.digest(plain) !== row.content_hash)
        throw new Error('Encrypted export integrity check failed.');
      this.cloud.metadata(row);
      bytes += plain.length;
    }, Promise.resolve());
    return { exports: files.length, bytes };
  }
  /** @param {string} table @param {number} offset */
  exportBatch(table, offset) {
    return exportRows(
      this.db,
      [
        'pairings',
        'devices',
        'exports',
        'cloud_access',
        'agents',
        'upload_keys',
        'activity',
        'billing_uses',
        'billing_purchases',
        'billing_grants',
      ],
      table,
      offset,
    );
  }
  async alarm() {
    this.data.cleanup();
    this.cloud.cleanup();
    try {
      await this.cloud.sweepObjects();
    } finally {
      if (
        this.db.prepare('SELECT 1 FROM exports LIMIT 1').get() ||
        this.db.prepare('SELECT 1 FROM object_garbage LIMIT 1').get()
      )
        await this.ctx.storage.setAlarm(Date.now() + 3600000);
    }
  }
}
