import { DurableObject } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { createBillingService } from '../server/billing-service.js';
import { verifyStorePurchase } from '../server/store-purchases.js';
import { PairingError } from '../server/errors.js';
import { parseProfile } from '../core/profiles.js';
import { objectDatabase } from './database.js';
import { objectStorage } from './storage.js';
import { readBytes } from './request.js';
/** @typedef {{QA_ENABLED:string,QA_ACCOUNT:string,QA_EXPIRES:string,QA_ACCESS_CODE:string,QA_STORE_PURCHASES?:string,CLOUD_ENCRYPTION_KEY:string,EXPORTS:R2Bucket,QA_STORAGE:DurableObjectNamespace<CloudQaStorage>}} QaEnv */
/** @param {unknown} value @param {number} [status] */
const json = (value, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
/** @param {string} actual @param {string} expected */
function equal(actual, expected) {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
}
export default {
  /** @param {Request} request @param {QaEnv} env */
  async fetch(request, env) {
    if (env.QA_ENABLED !== 'isolated-cloud-qa' || Date.now() >= Number(env.QA_EXPIRES))
      return json({ error: 'Cloud QA session expired.' }, 410);
    if (!env.QA_ACCOUNT.startsWith('cloud-qa-'))
      return json({ error: 'Invalid QA configuration.' }, 503);
    return env.QA_STORAGE.getByName(env.QA_ACCOUNT).fetch(request);
  },
};
/** Separate operator-created account and bucket. Never bound by production wrangler.jsonc.
 * @augments {DurableObject<QaEnv>} */
export class CloudQaStorage extends DurableObject {
  /** @param {DurableObjectState} ctx @param {QaEnv} env */
  constructor(ctx, env) {
    super(ctx, env);
    this.subject = env.QA_ACCOUNT;
    this.db = objectDatabase(ctx.storage);
    this.billing = new BillingStore(this.db);
    if (env.QA_STORE_PURCHASES !== '1')
      this.billing.grant(this.subject, 'operator:cloud-qa', this.subject);
    this.billingService = createBillingService({
      billing: this.billing,
      verifyStorePurchase,
      unlock: async (subject, purchase) => {
        this.billing.unlock(subject, purchase);
      },
    });
    this.cloud = new CloudStore(
      this.db,
      Buffer.from(env.CLOUD_ENCRYPTION_KEY, 'hex'),
      objectStorage(env.EXPORTS),
      (subject) => this.billing.snapshot(subject).unlocked,
    );
    this.profile = {
      ...parseProfile({
        schema: 'myself.md.profile.v1',
        name: 'Generated cloud QA files',
        selection: { health: ['native:sleep'], time: [], location: [] },
        export: { destination: 'cloud' },
      }),
      id: 'cloud-qa-profile',
    };
  }
  /** @param {Request} request */
  async fetch(request) {
    try {
      if (this.env.QA_ENABLED !== 'isolated-cloud-qa' || Date.now() >= Number(this.env.QA_EXPIRES))
        return json({ error: 'Cloud QA session expired.' }, 410);
      const path = new URL(request.url).pathname;
      const authorization = request.headers.get('authorization') ?? '';
      if (authorization.startsWith('Upload ') && path.startsWith('/api/cloud/uploads')) {
        const credential = this.cloud.credential(authorization.slice(7));
        if (credential.subject !== this.subject) return json({ error: 'Wrong account.' }, 403);
        if (path === '/api/cloud/uploads' && request.method === 'POST') {
          const body = JSON.parse(new TextDecoder().decode(await readBytes(request, 1024 * 1024)));
          return json(this.cloud.begin(this.subject, credential.device, credential.profile, body));
        }
        const id = path.slice('/api/cloud/uploads/'.length);
        if (request.method === 'PUT')
          return json(
            await this.cloud.commit(
              this.subject,
              credential.device,
              credential.profile,
              id,
              await readBytes(request, 16 * 1024 * 1024),
            ),
          );
        return json({ error: 'Not found.' }, 404);
      }
      if (!equal(authorization, `Bearer ${this.env.QA_ACCESS_CODE}`))
        return json({ error: 'Test account authentication required.' }, 401);
      if (path === '/qa/connect' && request.method === 'POST')
        return json({
          account: this.subject,
          expiresAt: Number(this.env.QA_EXPIRES),
          purchaseRequired: this.env.QA_STORE_PURCHASES === '1',
          profile: this.profile,
          uploadToken: this.cloud.authorize(this.subject, 'qa-phone', this.profile),
        });
      if (path === '/api/cloud/status' && request.method === 'GET')
        return json(this.cloud.storageStatus(this.subject));
      if (
        path === '/qa/purchase' &&
        request.method === 'POST' &&
        this.env.QA_STORE_PURCHASES === '1'
      ) {
        const body = JSON.parse(new TextDecoder().decode(await readBytes(request, 32000)));
        await this.billingService.billingApi(this.subject, body);
        const purchase = this.billing.purchase(this.subject);
        return json({
          unlocked: this.billing.snapshot(this.subject).unlocked,
          transactionId: purchase
            ? createHash('sha256').update(purchase.id).digest('hex')
            : undefined,
        });
      }
      if (path === '/api/cloud/exports' && request.method === 'GET')
        return json(this.cloud.list(this.subject));
      if (path.startsWith('/api/cloud/exports/') && request.method === 'DELETE')
        return json(
          await this.cloud.delete(this.subject, path.slice('/api/cloud/exports/'.length)),
        );
      if (path === '/qa/verify' && request.method === 'GET') {
        const files = this.cloud.list(this.subject);
        let bytes = 0;
        for (const file of files) {
          const row = this.cloud.row(this.subject, file.id);
          // Each object is verified independently; never return generated record bodies.
          // oxlint-disable-next-line no-await-in-loop
          const plain = await this.cloud.bytes(row);
          if (
            this.cloud.digest(plain) !== row.content_hash ||
            !row.object_key ||
            row.content !== null
          )
            throw new Error('R2 integrity verification failed.');
          bytes += plain.length;
        }
        return json({
          account: this.subject,
          files: files.length,
          bytes,
          storedObjects: (await this.env.EXPORTS.list()).objects.length,
          encryptedR2: true,
          integrity: true,
        });
      }
      if (path === '/qa/cleanup' && request.method === 'POST') {
        const ids = this.db.prepare('SELECT id FROM exports WHERE subject=?').all(this.subject);
        for (const row of ids) {
          // Delete only this isolated account's completed and staged files.
          // oxlint-disable-next-line no-await-in-loop
          await this.cloud.delete(this.subject, String(row.id));
        }
        await this.cloud.sweepObjects();
        return json(this.cloud.storageStatus(this.subject));
      }
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      return json(
        { error: error instanceof PairingError ? error.message : 'Cloud QA operation failed.' },
        error instanceof PairingError ? error.status : 400,
      );
    }
  }
}
