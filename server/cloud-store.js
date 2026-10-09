import { Buffer } from 'node:buffer';
import { database, transaction } from './database.js';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { z } from 'zod';
import { PairingError } from './errors.js';
import { parseProfile, profileAllows } from '../core/profiles.js';
const metadataSchema = z.object({
  profile: z.unknown(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['json', 'jsonl']),
  manifest: z.record(z.string(), z.unknown()),
});
/** @typedef {{id:string,subject:string,device:string,profile:string,day:string,format:'json'|'jsonl',created:number,content:Uint8Array|null,metadata:Uint8Array,size:number,object_key:string|null,content_hash:string|null}} Row */
export class CloudStore {
  /** @param {string|import("./database.js").SqlDatabase} path @param {Uint8Array} key @param {import("./r2-store.js").ObjectStore|null} [objects] */
  constructor(path, key, objects = null) {
    if (key.length !== 32) throw new Error('Cloud encryption needs a 32-byte key.');
    this.key = key;
    this.objects = objects;
    this.sweeping = false;
    this.db = database(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS exports(id TEXT PRIMARY KEY,subject TEXT,device TEXT,profile TEXT,day TEXT,format TEXT,created INTEGER,content BLOB,metadata BLOB,size INTEGER);
 CREATE INDEX IF NOT EXISTS exports_owner ON exports(subject,created);
 CREATE TABLE IF NOT EXISTS cloud_access(subject TEXT,device TEXT,profile TEXT,shared INTEGER,selection TEXT,PRIMARY KEY(subject,device,profile));
 CREATE TABLE IF NOT EXISTS agents(subject TEXT,client TEXT,blocked INTEGER,last_seen INTEGER,PRIMARY KEY(subject,client));
 CREATE TABLE IF NOT EXISTS upload_keys(hash TEXT PRIMARY KEY,subject TEXT,device TEXT,profile TEXT,expires INTEGER);`);
    const columns = new Set(
      this.db
        .prepare('PRAGMA table_info(exports)')
        .all()
        .map((column) => column.name),
    );
    if (!columns.has('object_key')) this.db.exec('ALTER TABLE exports ADD COLUMN object_key TEXT');
    if (!columns.has('content_hash'))
      this.db.exec('ALTER TABLE exports ADD COLUMN content_hash TEXT');
    this.db.exec(`CREATE TABLE IF NOT EXISTS object_garbage(key TEXT PRIMARY KEY,created INTEGER);
      CREATE TRIGGER IF NOT EXISTS exports_object_delete AFTER DELETE ON exports WHEN OLD.object_key IS NOT NULL
      BEGIN INSERT OR REPLACE INTO object_garbage VALUES(OLD.object_key,0); END;`);
    if (
      !objects &&
      this.db.prepare('SELECT id FROM exports WHERE object_key IS NOT NULL LIMIT 1').get()
    ) {
      this.db.close();
      throw new Error(
        'R2 credentials are required for this database. Restore objects before disabling R2.',
      );
    }
  }
  /** @param {Uint8Array} plain @param {string} aad */
  seal(plain, aad) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const content = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), content]);
  }
  /** @param {Uint8Array} value @param {string} aad */
  open(value, aad) {
    const bytes = Buffer.from(value),
      decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  }
  cleanup() {
    this.db.prepare('DELETE FROM exports WHERE created<?').run(Date.now() - 30 * 86400000);
    this.db
      .prepare('DELETE FROM exports WHERE content IS NULL AND object_key IS NULL AND created<?')
      .run(Date.now() - 3600000);
    this.db.prepare('DELETE FROM upload_keys WHERE expires<?').run(Date.now());
  }
  /** @param {string} subject @param {string} device @param {import('../core/profiles.js').ExportProfile} profile */
  authorize(subject, device, profile) {
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare('DELETE FROM upload_keys WHERE subject=? AND device=? AND profile=?')
      .run(subject, device, profile.id);
    this.db
      .prepare('INSERT INTO upload_keys VALUES (?,?,?,?,?)')
      .run(
        createHash('sha256').update(token).digest('hex'),
        subject,
        device,
        profile.id,
        Date.now() + 30 * 86400000,
      );
    this.access(subject, device, profile, false);
    return token;
  }
  /** @param {string} token */
  credential(token) {
    this.cleanup();
    const row = /** @type {{subject:string,device:string,profile:string}|undefined} */ (
      this.db
        .prepare('SELECT subject,device,profile FROM upload_keys WHERE hash=? AND expires>?')
        .get(createHash('sha256').update(token).digest('hex'), Date.now())
    );
    if (!row)
      throw new PairingError(401, 'Upload authorization expired. Reauthorize on the phone.');
    return row;
  }
  /** @param {string} subject @param {string} device @param {import('../core/profiles.js').ExportProfile} profile @param {boolean} shared */
  access(subject, device, profile, shared) {
    this.db
      .prepare('INSERT OR REPLACE INTO cloud_access VALUES (?,?,?,?,?)')
      .run(subject, device, profile.id, shared ? 1 : 0, JSON.stringify(profile.selection));
    return { shared };
  }
  /** @param {string} subject @param {string} device @param {string} profile */
  permission(subject, device, profile) {
    const row = /** @type {{shared:number,selection:string}|undefined} */ (
      this.db
        .prepare(
          'SELECT shared,selection FROM cloud_access WHERE subject=? AND device=? AND profile=?',
        )
        .get(subject, device, profile)
    );
    return {
      shared: row?.shared === 1,
      selection: row ? JSON.parse(row.selection) : { health: [], time: [], location: [] },
    };
  }
  /** Cloud permissions include profiles without completed exports and disconnected phones.
   * @param {string} subject */
  profiles(subject) {
    const exports = this.list(subject);
    return this.db
      .prepare('SELECT device,profile,shared,selection FROM cloud_access WHERE subject=?')
      .all(subject)
      .map((r) => ({
        deviceId: String(r.device),
        profileId: String(r.profile),
        shared: r.shared === 1,
        selection: JSON.parse(String(r.selection)),
        name:
          exports.find((e) => e.deviceId === r.device && e.profileId === r.profile)?.profileName ??
          String(r.profile),
      }));
  }
  /** Change only the switch, preserving the phone-approved type selection.
   * @param {string} subject @param {string} device @param {string} profile @param {boolean} shared */
  setSharing(subject, device, profile, shared) {
    const result = this.db
      .prepare('UPDATE cloud_access SET shared=? WHERE subject=? AND device=? AND profile=?')
      .run(shared ? 1 : 0, subject, device, profile);
    if (!result.changes) throw new PairingError(404, 'Cloud profile not found.');
    return this.permission(subject, device, profile);
  }
  /** @param {string} subject @param {string} client */
  observeAgent(subject, client) {
    this.db
      .prepare(
        'INSERT INTO agents VALUES (?,?,0,?) ON CONFLICT(subject,client) DO UPDATE SET last_seen=excluded.last_seen',
      )
      .run(subject, client, Date.now());
    const row = this.db
      .prepare('SELECT blocked FROM agents WHERE subject=? AND client=?')
      .get(subject, client);
    if (row?.blocked === 1)
      throw new PairingError(403, 'This agent has been blocked by the account owner.');
  }
  /** @param {string} subject */
  agents(subject) {
    return this.db
      .prepare(
        'SELECT client,blocked,last_seen FROM agents WHERE subject=? ORDER BY last_seen DESC',
      )
      .all(subject)
      .map((r) => ({
        client: String(r.client),
        blocked: r.blocked === 1,
        lastSeen: Number(r.last_seen),
      }));
  }
  /** @param {string} subject @param {string} client @param {boolean} blocked */
  setAgent(subject, client, blocked) {
    const result = this.db
      .prepare('UPDATE agents SET blocked=? WHERE subject=? AND client=?')
      .run(blocked ? 1 : 0, subject, client);
    if (!result.changes) throw new PairingError(404, 'Agent not found.');
    return { blocked };
  }
  /** @param {string} subject @param {string} device @param {string} profileId @param {unknown} value */
  begin(subject, device, profileId, value) {
    this.cleanup();
    const input = metadataSchema.parse(value),
      profile = Object.assign(parseProfile(input.profile), { id: profileId });
    if (input.manifest.profileId !== profileId)
      throw new PairingError(400, 'Manifest profile does not match upload.');
    this.db
      .prepare(
        'DELETE FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND format=? AND content IS NULL AND object_key IS NULL',
      )
      .run(subject, device, profileId, input.day, input.format);
    const previous = /** @type {{size:number}|undefined} */ (
      this.db
        .prepare(
          'SELECT size FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND format=? AND (content IS NOT NULL OR object_key IS NOT NULL)',
        )
        .get(subject, device, profileId, input.day, input.format)
    );
    const usage = /** @type {{bytes:number,count:number}} */ (
      this.db
        .prepare('SELECT COALESCE(SUM(size),0) bytes,COUNT(*) count FROM exports WHERE subject=?')
        .get(subject)
    );
    if (
      usage.bytes - (previous?.size ?? 0) >= 256 * 1024 * 1024 ||
      usage.count - (previous ? 1 : 0) >= 128
    )
      throw new PairingError(413, 'Cloud quota reached. Delete older exports.');
    const id = randomUUID();
    this.db
      .prepare(
        'INSERT INTO exports(id,subject,device,profile,day,format,created,content,metadata,size) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        subject,
        device,
        profileId,
        input.day,
        input.format,
        Math.max(
          Date.now(),
          Number(
            this.db.prepare('SELECT COALESCE(MAX(created),0) last FROM exports').get()?.last ?? 0,
          ) + 1,
        ),
        null,
        this.seal(Buffer.from(JSON.stringify({ ...input, profile })), `${subject}|${id}|metadata`),
        0,
      );
    return { id };
  }
  /** @param {string} subject @param {string} id @returns {Row} */
  row(subject, id) {
    const row = /** @type {Row|undefined} */ (
      this.db.prepare('SELECT * FROM exports WHERE subject=? AND id=?').get(subject, id)
    );
    if (!row) throw new PairingError(404, 'Cloud export not found.');
    return row;
  }
  /** @param {Row} row */
  metadata(row) {
    return /** @type {{profile:import('../core/profiles.js').ExportProfile,manifest:Record<string,unknown>}} */ (
      JSON.parse(this.open(row.metadata, `${row.subject}|${row.id}|metadata`).toString())
    );
  }
  /** @param {Row} row @param {Uint8Array} bytes */
  records(row, bytes) {
    const text = Buffer.from(bytes).toString('utf8');
    const records =
      row.format === 'json'
        ? JSON.parse(text).records
        : text.trim()
          ? text
              .trim()
              .split('\n')
              .map((/** @type {string} */ line) => JSON.parse(line))
          : [];
    if (!Array.isArray(records) || records.length > 50000)
      throw new PairingError(413, 'Use daily exports with at most 50,000 records per file.');
    const profile = this.metadata(row).profile;
    return records.map((r) => {
      const record = z
        .object({
          domain: z.enum(['health', 'time', 'location']),
          type: z.string(),
          source: z.string(),
          start: z.string().nullable(),
          end: z.string().nullable(),
          native: z.unknown(),
        })
        .parse(r);
      if (record.source.startsWith('imported') || record.type === 'archive')
        throw new PairingError(400, 'Imported data is no longer supported.');
      const source = /** @type {const} */ ('native');
      if (!profileAllows(profile, { domain: record.domain, type: record.type, source }))
        throw new PairingError(400, 'Record is outside the uploaded profile.');
      return record;
    });
  }
  /** @param {Row} row */
  async bytes(row) {
    const encrypted = row.object_key
      ? await this.requireObjects().get(row.object_key)
      : row.content;
    if (!encrypted) throw new PairingError(404, 'Cloud export not found.');
    const current = this.row(row.subject, row.id);
    if (current.created < Date.now() - 30 * 86400000)
      throw new PairingError(404, 'Cloud export not found.');
    return this.open(encrypted, `${row.subject}|${row.id}`);
  }
  requireObjects() {
    if (!this.objects) throw new Error('R2 storage is not configured.');
    return this.objects;
  }
  /** @param {Uint8Array} bytes */
  digest(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
  }
  /** Persist an orphan candidate before network I/O, so interrupted writes are recoverable.
   * @param {Uint8Array} bytes */
  async uploadObject(bytes) {
    const key = `exports/${randomUUID()}`;
    this.db.prepare('INSERT INTO object_garbage VALUES (?,?)').run(key, Date.now());
    // Keep uncertain PUT outcomes for an hour before garbage collection.
    await this.requireObjects().put(key, bytes);
    return key;
  }
  /** @param {string} subject @param {string} device @param {string} profile @param {string} id @param {Uint8Array} bytes @param {()=>void} [authorize] */
  async commit(subject, device, profile, id, bytes, authorize = () => {}) {
    const row = this.row(subject, id);
    if (row.device !== device || row.profile !== profile)
      throw new PairingError(404, 'Cloud export not found.');
    if (bytes.length > 16 * 1024 * 1024)
      throw new PairingError(413, 'Cloud files are limited to 16 MiB.');
    const records = this.records(row, bytes);
    if (records.length !== this.metadata(row).manifest.recordCount)
      throw new PairingError(400, 'Manifest record count does not match the file.');
    const hash = this.digest(bytes);
    if (row.content || row.object_key) {
      if ((row.content_hash ?? this.digest(await this.bytes(row))) !== hash)
        throw new PairingError(409, 'Upload already committed with different bytes.');
      authorize();
      return { id, recordCount: records.length };
    }
    const encrypted = this.seal(bytes, `${subject}|${id}`);
    const objectKey = this.objects ? await this.uploadObject(encrypted) : null;
    try {
      transaction(this.db, () => {
        authorize();
        const current = this.row(subject, id);
        if (current.content || current.object_key) {
          if (current.content_hash !== hash)
            throw new PairingError(409, 'Upload already committed with different bytes.');
        } else {
          if (current.created < Date.now() - 3600000)
            throw new PairingError(409, 'Upload expired. Start a new upload.');
          const newer = this.db
            .prepare(
              'SELECT id FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND format=? AND (content IS NOT NULL OR object_key IS NOT NULL) AND created>?',
            )
            .get(subject, device, profile, row.day, row.format, row.created);
          if (newer) throw new PairingError(409, 'A newer daily export was already committed.');
          const usage = Number(
            this.db
              .prepare('SELECT COALESCE(SUM(size),0) bytes FROM exports WHERE subject=?')
              .get(subject)?.bytes ?? 0,
          );
          const replaced = Number(
            this.db
              .prepare(
                'SELECT COALESCE(SUM(size),0) bytes FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND format=? AND (content IS NOT NULL OR object_key IS NOT NULL)',
              )
              .get(subject, device, profile, row.day, row.format)?.bytes ?? 0,
          );
          if (usage - replaced + bytes.length > 256 * 1024 * 1024)
            throw new PairingError(413, 'Cloud quota reached.');
          this.db
            .prepare(
              'DELETE FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND format=? AND (content IS NOT NULL OR object_key IS NOT NULL) AND id<>?',
            )
            .run(subject, device, profile, row.day, row.format, id);
          this.db
            .prepare('UPDATE exports SET content=?,object_key=?,content_hash=?,size=? WHERE id=?')
            .run(objectKey ? null : encrypted, objectKey, hash, bytes.length, id);
          if (objectKey) this.db.prepare('DELETE FROM object_garbage WHERE key=?').run(objectKey);
        }
      });
    } catch (error) {
      if (objectKey)
        this.db.prepare('UPDATE object_garbage SET created=0 WHERE key=?').run(objectKey);
      throw error;
    }
    // Concurrent identical retries may have uploaded an unused candidate.
    if (objectKey && this.row(subject, id).object_key !== objectKey)
      this.db.prepare('UPDATE object_garbage SET created=0 WHERE key=?').run(objectKey);
    return { id, recordCount: records.length };
  }
  /** Retry physical deletion without losing the durable queue on network errors. */
  async sweepObjects() {
    if (!this.objects || this.sweeping) return;
    this.sweeping = true;
    try {
      const pending = this.db
        .prepare(
          'SELECT key FROM object_garbage WHERE created<? AND key NOT IN (SELECT object_key FROM exports WHERE object_key IS NOT NULL) LIMIT 128',
        )
        .all(Date.now() - 3600000);
      await pending.reduce(async (previous, item) => {
        await previous;
        const key = String(item.key);
        await this.requireObjects().delete(key);
        this.db.prepare('DELETE FROM object_garbage WHERE key=?').run(key);
      }, Promise.resolve());
    } finally {
      this.sweeping = false;
    }
  }
  /** Online, resumable backfill. Drop SQLite bytes only after verifying the R2 copy.
   * @param {number} [limit] */
  async migrateObjects(limit = 128) {
    if (!this.objects) return { migrated: 0 };
    this.cleanup();
    let migrated = 0;
    const rows = this.db
      .prepare(
        'SELECT subject,id FROM exports WHERE content IS NOT NULL AND object_key IS NULL LIMIT ?',
      )
      .all(limit);
    await rows.reduce(async (previous, item) => {
      await previous;
      const row = /** @type {Row|undefined} */ (
        this.db
          .prepare('SELECT * FROM exports WHERE subject=? AND id=?')
          .get(String(item.subject), String(item.id))
      );
      if (!row?.content || row.object_key) return;
      const key = await this.uploadObject(row.content);
      const downloaded = await this.requireObjects().get(key);
      if (!Buffer.from(downloaded).equals(Buffer.from(row.content)))
        throw new Error('R2 migration verification failed; SQLite content was preserved.');
      const hash = this.digest(this.open(downloaded, `${row.subject}|${row.id}`));
      transaction(this.db, () => {
        const result = this.db
          .prepare(
            'UPDATE exports SET content=NULL,object_key=?,content_hash=? WHERE id=? AND content IS NOT NULL AND object_key IS NULL',
          )
          .run(key, hash, row.id);
        if (result.changes) {
          this.db.prepare('DELETE FROM object_garbage WHERE key=?').run(key);
          migrated++;
        } else this.db.prepare('UPDATE object_garbage SET created=0 WHERE key=?').run(key);
      });
    }, Promise.resolve());
    return { migrated };
  }
  /** Offline rollback: restore encrypted objects before disabling R2.
   * @param {number} [limit] */
  async restoreObjects(limit = 128) {
    let restored = 0;
    const rows = this.db
      .prepare('SELECT subject,id FROM exports WHERE object_key IS NOT NULL LIMIT ?')
      .all(limit);
    await rows.reduce(async (previous, item) => {
      await previous;
      const row = this.row(String(item.subject), String(item.id));
      if (!row.object_key) return;
      const encrypted = await this.requireObjects().get(row.object_key);
      const plain = this.open(encrypted, `${row.subject}|${row.id}`);
      if (row.content_hash && this.digest(plain) !== row.content_hash)
        throw new Error('R2 restore verification failed; object reference was preserved.');
      transaction(this.db, () => {
        const result = this.db
          .prepare('UPDATE exports SET content=?,object_key=NULL WHERE id=? AND object_key=?')
          .run(encrypted, row.id, row.object_key);
        if (result.changes) {
          this.db.prepare('INSERT OR REPLACE INTO object_garbage VALUES (?,0)').run(row.object_key);
          restored++;
        }
      });
    }, Promise.resolve());
    return { restored };
  }
  /** @param {string} subject @param {boolean} [forMcp] */
  list(subject, forMcp = false) {
    this.cleanup();
    return this.db
      .prepare(
        'SELECT id FROM exports WHERE subject=? AND (content IS NOT NULL OR object_key IS NOT NULL) ORDER BY created DESC LIMIT 128',
      )
      .all(subject)
      .map((v) => this.row(subject, String(v.id)))
      .filter((r) => !forMcp || this.permission(subject, r.device, r.profile).shared)
      .map((r) => ({
        id: r.id,
        profileId: r.profile,
        profileName: this.metadata(r).profile.name,
        deviceId: r.device,
        day: r.day,
        format: r.format,
        bytes: r.size,
        created: r.created,
        shared: this.permission(subject, r.device, r.profile).shared,
      }));
  }
  /** @param {string} subject @param {string} id @param {number} offset @param {number} limit @param {boolean} [forMcp] */
  async page(subject, id, offset, limit, forMcp = false) {
    this.cleanup();
    const row = this.row(subject, id),
      permission = this.permission(subject, row.device, row.profile);
    if ((!row.content && !row.object_key) || (forMcp && !permission.shared))
      throw new PairingError(404, 'Shared cloud export not found.');
    let records = this.records(row, await this.bytes(row));
    const currentPermission = this.permission(subject, row.device, row.profile);
    if (forMcp && !currentPermission.shared)
      throw new PairingError(404, 'Shared cloud export not found.');
    if (forMcp)
      records = records.filter((r) =>
        currentPermission.selection[r.domain].includes(`native:${r.type}`),
      );
    const page = [];
    let size = 0;
    for (const r of records.slice(offset, offset + limit)) {
      const bytes = Buffer.byteLength(JSON.stringify(r));
      if (size + bytes > 200000) {
        if (!page.length)
          throw new PairingError(413, 'Record exceeds MCP response size; use the local file.');
        break;
      }
      page.push(r);
      size += bytes;
    }
    return {
      records: page,
      nextCursor: offset + page.length < records.length ? String(offset + page.length) : null,
      manifest: forMcp
        ? { profileId: row.profile, recordCount: records.length }
        : this.metadata(row).manifest,
    };
  }
  /** @param {string} subject @param {string} id */
  async delete(subject, id) {
    const row = this.row(subject, id);
    if (row.object_key) await this.requireObjects().delete(row.object_key);
    this.db.prepare('DELETE FROM exports WHERE subject=? AND id=?').run(subject, id);
    if (row.object_key)
      this.db.prepare('DELETE FROM object_garbage WHERE key=?').run(row.object_key);
    return { deleted: true };
  }
}
