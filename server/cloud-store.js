import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { z } from 'zod';
import { PairingError } from './store.js';
import { parseProfile, profileAllows } from '../core/profiles.js';
const metadataSchema = z.object({
  profile: z.unknown(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['json', 'jsonl']),
  manifest: z.record(z.string(), z.unknown()),
});
/** @typedef {{id:string,subject:string,device:string,profile:string,day:string,format:'json'|'jsonl',created:number,content:Uint8Array|null,metadata:Uint8Array,size:number}} Row */
export class CloudStore {
  /** @param {string} path @param {Uint8Array} key */
  constructor(path, key) {
    if (key.length !== 32) throw new Error('Cloud encryption needs a 32-byte key.');
    this.key = key;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS exports(id TEXT PRIMARY KEY,subject TEXT,device TEXT,profile TEXT,day TEXT,format TEXT,created INTEGER,content BLOB,metadata BLOB,size INTEGER);
 CREATE INDEX IF NOT EXISTS exports_owner ON exports(subject,created);
 CREATE TABLE IF NOT EXISTS cloud_access(subject TEXT,device TEXT,profile TEXT,shared INTEGER,selection TEXT,PRIMARY KEY(subject,device,profile));
 CREATE TABLE IF NOT EXISTS upload_keys(hash TEXT PRIMARY KEY,subject TEXT,device TEXT,profile TEXT,expires INTEGER);`);
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
      .prepare('DELETE FROM exports WHERE content IS NULL AND created<?')
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
  /** @param {string} subject @param {string} device @param {string} profileId @param {unknown} value */
  begin(subject, device, profileId, value) {
    this.cleanup();
    const input = metadataSchema.parse(value),
      profile = Object.assign(parseProfile(input.profile), { id: profileId });
    if (input.manifest.profileId !== profileId)
      throw new PairingError(400, 'Manifest profile does not match upload.');
    this.db
      .prepare(
        'DELETE FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND format=? AND content IS NULL',
      )
      .run(subject, device, profileId, input.day, input.format);
    const previous = /** @type {{size:number}|undefined} */ (
      this.db
        .prepare(
          'SELECT size FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND format=? AND content IS NOT NULL',
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
      .prepare('INSERT INTO exports VALUES (?,?,?,?,?,?,?,?,?,?)')
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
              .map((line) => JSON.parse(line))
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
      const source = record.source.startsWith('imported') ? 'imported' : 'native';
      if (!profileAllows(profile, { domain: record.domain, type: record.type, source }))
        throw new PairingError(400, 'Record is outside the uploaded profile.');
      return record;
    });
  }
  /** @param {string} subject @param {string} device @param {string} profile @param {string} id @param {Uint8Array} bytes */
  commit(subject, device, profile, id, bytes) {
    const row = this.row(subject, id);
    if (row.device !== device || row.profile !== profile)
      throw new PairingError(404, 'Cloud export not found.');
    if (bytes.length > 16 * 1024 * 1024)
      throw new PairingError(413, 'Cloud files are limited to 16 MiB.');
    const records = this.records(row, bytes);
    if (records.length !== this.metadata(row).manifest.recordCount)
      throw new PairingError(400, 'Manifest record count does not match the file.');
    if (row.content) {
      if (!this.open(row.content, `${subject}|${id}`).equals(Buffer.from(bytes)))
        throw new PairingError(409, 'Upload already committed with different bytes.');
      return { id, recordCount: records.length };
    }
    const usage = /** @type {{bytes:number}} */ (
      this.db
        .prepare('SELECT COALESCE(SUM(size),0) bytes FROM exports WHERE subject=?')
        .get(subject)
    );
    const replaced = /** @type {{size:number}|undefined} */ (
      this.db
        .prepare(
          'SELECT size FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND format=? AND content IS NOT NULL',
        )
        .get(subject, device, profile, row.day, row.format)
    );
    if (usage.bytes - (replaced?.size ?? 0) + bytes.length > 256 * 1024 * 1024)
      throw new PairingError(413, 'Cloud quota reached.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const newer = this.db
        .prepare(
          'SELECT id FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND format=? AND content IS NOT NULL AND created>?',
        )
        .get(subject, device, profile, row.day, row.format, row.created);
      if (newer) throw new PairingError(409, 'A newer daily export was already committed.');
      this.db
        .prepare(
          'DELETE FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND format=? AND content IS NOT NULL AND id<>?',
        )
        .run(subject, device, profile, row.day, row.format, id);
      this.db
        .prepare('UPDATE exports SET content=?,size=? WHERE id=?')
        .run(this.seal(bytes, `${subject}|${id}`), bytes.length, id);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return { id, recordCount: records.length };
  }
  /** @param {string} subject @param {boolean} [forMcp] */
  list(subject, forMcp = false) {
    this.cleanup();
    return this.db
      .prepare(
        'SELECT id FROM exports WHERE subject=? AND content IS NOT NULL ORDER BY created DESC LIMIT 128',
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
  page(subject, id, offset, limit, forMcp = false) {
    const row = this.row(subject, id),
      permission = this.permission(subject, row.device, row.profile);
    if (!row.content || (forMcp && !permission.shared))
      throw new PairingError(404, 'Shared cloud export not found.');
    let records = this.records(row, this.open(row.content, `${subject}|${id}`));
    if (forMcp)
      records = records.filter((r) =>
        permission.selection[r.domain].includes(
          `${r.source.startsWith('imported') ? 'imported' : 'native'}:${r.type}`,
        ),
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
  delete(subject, id) {
    this.row(subject, id);
    this.db.prepare('DELETE FROM exports WHERE subject=? AND id=?').run(subject, id);
    return { deleted: true };
  }
}
