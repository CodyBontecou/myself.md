import { ScreenTimeReflectionStore } from './screen-time-reflection-store.js';
import { ScreenTimeExperimentStore } from './screen-time-experiment-store.js';
import { cloudAllowance, cloudUploadFits, lifetimeEntitlement } from '../core/cloud-allowance.js';
import { appendExportContent } from '../core/export-files.js';
import { parseExportSchema } from '../core/export-schemas.js';
import { Buffer } from 'node:buffer';
import { database, transaction } from './database.js';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { z } from 'zod';
import { PairingError } from './errors.js';
import {
  parseProfile,
  profileAllows,
  parseProfileState,
  parseAgentPermissions,
} from '../core/profiles.js';
import { domains } from '../core/data.js';
import { ProfileSyncStore } from './profile-sync.js';
const deniedPermissions = { health: false, time: false, location: false, logs: false };
/** @param {import('../core/profiles.js').AgentPermissions} permissions */
const hasAgentData = (permissions) => domains.some((domain) => permissions[domain]);
const metadataSchema = z.object({
  profile: z.unknown(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['json', 'jsonl']),
  manifest: z.record(z.string(), z.unknown()),
});
/** @typedef {{id:string,subject:string,device:string,profile:string,day:string,format:'json'|'jsonl',schema:string,created:number,content:Uint8Array|null,metadata:Uint8Array,size:number,object_key:string|null,content_hash:string|null,upload_hash:string|null}} Row */
export class CloudStore {
  /** @param {string|import("./database.js").SqlDatabase} path @param {Uint8Array} key @param {import("./r2-store.js").ObjectStore|null} [objects] @param {((subject:string)=>import('../core/cloud-allowance.js').CloudEntitlement)|null} [entitlement] Server-verified Lifetime, subscription and lapse state. Without it, tooling stores allow a fixed 256 MiB. */
  constructor(path, key, objects = null, entitlement = null) {
    if (key.length !== 32) throw new Error('Cloud encryption needs a 32-byte key.');
    this.key = key;
    this.objects = objects;
    this.entitlement = entitlement;
    this.sweeping = false;
    this.db = database(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS exports(id TEXT PRIMARY KEY,subject TEXT,device TEXT,profile TEXT,day TEXT,format TEXT,created INTEGER,content BLOB,metadata BLOB,size INTEGER);
 CREATE INDEX IF NOT EXISTS exports_owner ON exports(subject,created);
 CREATE TABLE IF NOT EXISTS cloud_access(subject TEXT,device TEXT,profile TEXT,shared INTEGER,selection TEXT,PRIMARY KEY(subject,device,profile));
 CREATE TABLE IF NOT EXISTS agents(subject TEXT,client TEXT,blocked INTEGER,last_seen INTEGER,PRIMARY KEY(subject,client));
 CREATE TABLE IF NOT EXISTS upload_keys(hash TEXT PRIMARY KEY,subject TEXT,device TEXT,profile TEXT,expires INTEGER);`);
    if (
      !this.db
        .prepare('PRAGMA table_info(cloud_access)')
        .all()
        .some((column) => column.name === 'agent_permissions')
    )
      this.db.exec('ALTER TABLE cloud_access ADD COLUMN agent_permissions TEXT');
    this.profileSync = new ProfileSyncStore(this);
    this.experiments = new ScreenTimeExperimentStore(this);
    this.reflections = new ScreenTimeReflectionStore(this);
    const columns = new Set(
      this.db
        .prepare('PRAGMA table_info(exports)')
        .all()
        .map((column) => column.name),
    );
    if (!columns.has('schema'))
      this.db.exec(
        "ALTER TABLE exports ADD COLUMN schema TEXT NOT NULL DEFAULT 'myself.md.export.v1'",
      );
    if (!columns.has('object_key')) this.db.exec('ALTER TABLE exports ADD COLUMN object_key TEXT');
    if (!columns.has('content_hash'))
      this.db.exec('ALTER TABLE exports ADD COLUMN content_hash TEXT');
    if (!columns.has('upload_hash'))
      this.db.exec('ALTER TABLE exports ADD COLUMN upload_hash TEXT');
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS cloud_writes(subject TEXT,device TEXT,profile TEXT,request TEXT,id TEXT,configuration TEXT,result TEXT,PRIMARY KEY(subject,device,profile,request));
      CREATE INDEX IF NOT EXISTS cloud_writes_upload ON cloud_writes(subject,id);
      CREATE TABLE IF NOT EXISTS object_garbage(key TEXT PRIMARY KEY,created INTEGER);
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
    this.db
      .prepare('DELETE FROM exports WHERE content IS NULL AND object_key IS NULL AND created<?')
      .run(Date.now() - 3600000);
    // Retain hashed approvals for authenticated renewal after inactivity.
    // Expired credentials still fail credential(); rotation removes the old approval.
  }
  /** Committed exports with the fields the retention executor needs.
   * @param {string} subject */
  usage(subject) {
    this.cleanup();
    return this.db
      .prepare(
        'SELECT id,device,size,created FROM exports WHERE subject=? AND (content IS NOT NULL OR object_key IS NOT NULL)',
      )
      .all(subject)
      .map((row) => ({
        id: String(row.id),
        device: String(row.device),
        size: Number(row.size),
        created: Number(row.created),
      }));
  }
  /** Account capacity is read again at commit, after asynchronous object storage.
   * @param {string} subject @returns {import('../core/cloud-allowance.js').CloudAllowance} */
  storageStatus(subject) {
    this.cleanup();
    const usedBytes = Number(
      this.db
        .prepare(
          'SELECT COALESCE(SUM(size),0) bytes FROM exports WHERE subject=? AND (content IS NOT NULL OR object_key IS NOT NULL)',
        )
        .get(subject)?.bytes ?? 0,
    );
    if (this.entitlement) return cloudAllowance(this.entitlement(subject), usedBytes);
    const limitBytes = 256 * 1024 * 1024;
    return {
      ...cloudAllowance(lifetimeEntitlement(true), usedBytes),
      limitBytes,
      availableBytes: Math.max(0, limitBytes - usedBytes),
      overLimit: usedBytes > limitBytes,
    };
  }
  /** @param {string} subject */
  requireStorage(subject) {
    const status = this.storageStatus(subject);
    if (!status.eligible)
      throw new PairingError(
        402,
        'A verified Cloud subscription or included Lifetime allowance is required for cloud storage. Sign in and subscribe or restore in the app.',
      );
    return status;
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
    this.access(subject, device, profile, this.permission(subject, device, profile.id).shared);
    return token;
  }
  /** Renew an existing approval without rotating its token or changing MCP sharing.
   * @param {string} subject @param {string} device @param {string} profile
   * @param {string} token @param {number} expiresAt */
  renewAuthorization(subject, device, profile, token, expiresAt) {
    const expires = Math.min(expiresAt, Date.now() + 30 * 86400000);
    if (!Number.isSafeInteger(expires) || expires <= Date.now())
      throw new PairingError(401, 'Sign in again to resume cloud uploads.');
    const result = this.db
      .prepare(
        'UPDATE upload_keys SET expires=MAX(expires,?) WHERE hash=? AND subject=? AND device=? AND profile=?',
      )
      .run(expires, createHash('sha256').update(token).digest('hex'), subject, device, profile);
    if (!result.changes)
      throw new PairingError(
        403,
        'Cloud upload approval was revoked or does not match this profile.',
      );
    const row = this.db
      .prepare('SELECT expires FROM upload_keys WHERE hash=?')
      .get(createHash('sha256').update(token).digest('hex'));
    return { expiresAt: Number(row?.expires) };
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
      .prepare(
        `INSERT INTO cloud_access(subject,device,profile,shared,selection) VALUES (?,?,?,?,?)
        ON CONFLICT(subject,device,profile) DO UPDATE SET shared=excluded.shared`,
      )
      .run(subject, device, profile.id, shared ? 1 : 0, JSON.stringify(profile.selection));
    return this.permission(subject, device, profile.id);
  }
  /** Persist only the authenticated phone's validated profile consent and type selections as the sole cloud read gate.
   * Missing/deleted profiles and pre-migration rows deny every source until the phone syncs.
   * @param {string} subject @param {string} device @param {import('../core/profiles.js').ExportProfile[]} profiles */
  syncAgentPermissions(subject, device, profiles) {
    const state = parseProfileState({ profiles });
    const current = new Set(state.profiles.map((profile) => profile.id));
    transaction(this.db, () => {
      for (const profile of state.profiles) {
        this.db
          .prepare(
            `INSERT INTO cloud_access(subject,device,profile,shared,selection,agent_permissions)
          VALUES (?,?,?,?,?,?) ON CONFLICT(subject,device,profile) DO UPDATE SET
          selection=excluded.selection,agent_permissions=excluded.agent_permissions`,
          )
          .run(
            subject,
            device,
            profile.id,
            0,
            JSON.stringify(profile.selection),
            JSON.stringify(profile.agentPermissions),
          );
      }
      for (const row of this.db
        .prepare('SELECT profile FROM cloud_access WHERE subject=? AND device=?')
        .all(subject, device)) {
        if (!current.has(String(row.profile)))
          this.db
            .prepare(
              'UPDATE cloud_access SET agent_permissions=? WHERE subject=? AND device=? AND profile=?',
            )
            .run(JSON.stringify(deniedPermissions), subject, device, String(row.profile));
      }
    });
  }

  /** @param {string} subject @param {string} device @param {string} profile */
  permission(subject, device, profile) {
    const row =
      /** @type {{shared:number,selection:string,agent_permissions:string|null}|undefined} */ (
        this.db
          .prepare(
            'SELECT shared,selection,agent_permissions FROM cloud_access WHERE subject=? AND device=? AND profile=?',
          )
          .get(subject, device, profile)
      );
    const agentPermissions = row?.agent_permissions
      ? parseAgentPermissions(JSON.parse(row.agent_permissions))
      : { ...deniedPermissions };
    return {
      shared: hasAgentData(agentPermissions),
      selection: row
        ? /** @type {import('../core/profiles.js').ProfileDraft['selection']} */ (
            JSON.parse(row.selection)
          )
        : { health: [], time: [], location: [] },
      agentPermissions,
      permissionsSynced: typeof row?.agent_permissions === 'string',
    };
  }

  /** Cloud permissions include profiles without completed exports and disconnected phones.
   * @param {string} subject */
  profiles(subject) {
    const exports = this.list(subject);
    const stored = this.db
      .prepare('SELECT device,profile,shared,selection FROM cloud_access WHERE subject=?')
      .all(subject)
      .map((r) => ({
        deviceId: String(r.device),
        profileId: String(r.profile),
        shared: this.permission(subject, String(r.device), String(r.profile)).shared,
        agentPermissions: this.permission(subject, String(r.device), String(r.profile))
          .agentPermissions,
        cloudConfigured: true,
        permissionsSynced: this.permission(subject, String(r.device), String(r.profile))
          .permissionsSynced,
        selection: JSON.parse(String(r.selection)),
        name:
          exports.find((e) => e.deviceId === r.device && e.profileId === r.profile)?.profileName ??
          String(r.profile),
      }));
    const devices = this.db.prepare('SELECT device FROM profile_sync WHERE subject=?').all(subject);
    const synced = devices.flatMap((row) => {
      const deviceId = String(row.device),
        snapshot = this.profileSync.get(subject, deviceId);
      return snapshot
        ? snapshot.state.profiles.map((profile) =>
            Object.assign({}, this.permission(subject, deviceId, profile.id), {
              deviceId,
              profileId: profile.id,
              name: profile.name,
              selection: profile.selection,
              agentPermissions: this.permission(subject, deviceId, profile.id).agentPermissions,
              permissionsSynced: this.permission(subject, deviceId, profile.id).permissionsSynced,
              cloudConfigured: stored.some(
                (p) => p.deviceId === deviceId && p.profileId === profile.id,
              ),
              profile,
              revision: snapshot.revision,
              confirmedRevision: snapshot.confirmedRevision,
              lastSeen: snapshot.lastSeen,
              syncSupported: snapshot.supported,
              domains: snapshot.domains,
              requests: snapshot.requests.filter((r) => r.profileId === profile.id),
            }),
          )
        : [];
    });
    return [
      ...synced,
      ...stored.filter(
        (p) => !synced.some((s) => s.deviceId === p.deviceId && s.profileId === p.profileId),
      ),
    ];
  }

  /** Legacy clients must use the confirmed profile Agent permissions instead of a second gate.
   * @param {string} subject @param {string} device @param {string} profile @param {boolean} _shared */
  setSharing(subject, device, profile, _shared) {
    if (
      !this.db
        .prepare('SELECT profile FROM cloud_access WHERE subject=? AND device=? AND profile=?')
        .get(subject, device, profile)
    )
      throw new PairingError(404, 'Cloud profile not found.');
    throw new PairingError(
      410,
      'Use Agent permissions on the profile to change agent access to cloud exports.',
    );
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
  /** @param {string} subject @param {string} device @param {string} profileId @param {unknown} value
   * @returns {{id:string,completed:boolean,recordCount?:number,bytes?:number,partial?:boolean}} */
  begin(subject, device, profileId, value) {
    this.cleanup();
    const input = metadataSchema.parse(value),
      profile = Object.assign(parseProfile(input.profile), { id: profileId });
    const schema = parseExportSchema(input.manifest.schema);
    if (schema !== profile.export.schema)
      throw new PairingError(400, 'Manifest schema does not match the profile.');
    input.manifest.schema = schema;
    if (input.manifest.profileId !== profileId)
      throw new PairingError(400, 'Manifest profile does not match upload.');
    // A billing operation identifies each day's delivery, including retries after a lost response.
    const operation = input.manifest.billingOperationId;
    if (operation !== undefined && (typeof operation !== 'string' || operation.length > 200))
      throw new PairingError(400, 'Invalid export operation.');
    const request = operation
      ? this.digest(Buffer.from(JSON.stringify([operation, input.day, input.format])))
      : null;
    const configuration = this.digest(
      Buffer.from(JSON.stringify({ profile, day: input.day, format: input.format })),
    );
    const prior = request
      ? this.db
          .prepare(
            'SELECT * FROM cloud_writes WHERE subject=? AND device=? AND profile=? AND request=?',
          )
          .get(subject, device, profileId, request)
      : null;
    if (prior && prior.configuration !== configuration)
      throw new PairingError(409, 'Export retry belongs to different profile settings.');
    if (prior?.result) return { ...JSON.parse(String(prior.result)), completed: true };
    const pending = prior
      ? this.db
          .prepare(
            'SELECT id FROM exports WHERE subject=? AND id=? AND content IS NULL AND object_key IS NULL',
          )
          .get(subject, String(prior.id))
      : null;
    if (pending) {
      this.db
        .prepare('UPDATE exports SET metadata=?,created=? WHERE subject=? AND id=?')
        .run(
          this.seal(
            Buffer.from(JSON.stringify({ ...input, profile })),
            `${subject}|${String(pending.id)}|metadata`,
          ),
          Math.max(
            Date.now(),
            Number(
              this.db.prepare('SELECT COALESCE(MAX(created),0) last FROM exports').get()?.last ?? 0,
            ) + 1,
          ),
          subject,
          String(pending.id),
        );
      return { id: String(pending.id), completed: false };
    }
    const mode = profile.export.writeMode ?? 'replace';
    const previous =
      mode === 'new_file' ? null : this.latest(subject, device, profileId, input.day, schema);
    const usage = /** @type {{bytes:number,count:number}} */ (
      this.db
        .prepare('SELECT COALESCE(SUM(size),0) bytes,COUNT(*) count FROM exports WHERE subject=?')
        .get(subject)
    );
    const { limitBytes } = this.requireStorage(subject);
    const maxFiles = Math.max(128, Math.ceil(limitBytes / 1_000_000_000) * 128);
    if (
      usage.bytes - (mode === 'replace' || mode === 'skip' ? (previous?.size ?? 0) : 0) >=
        limitBytes ||
      usage.count - (previous ? 1 : 0) >= maxFiles
    )
      throw new PairingError(413, 'Cloud quota reached. Delete older exports.');
    const id = randomUUID();
    this.db
      .prepare(
        'INSERT INTO exports(id,subject,device,profile,day,format,schema,created,content,metadata,size) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        subject,
        device,
        profileId,
        input.day,
        input.format,
        schema,
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
    if (request)
      this.db
        .prepare('INSERT OR REPLACE INTO cloud_writes VALUES (?,?,?,?,?,?,NULL)')
        .run(subject, device, profileId, request, id, configuration);
    return { id, completed: false };
  }
  /** Latest retained snapshot; older New file snapshots are independent artifacts.
   * @param {string} subject @param {string} device @param {string} profile @param {string} day @param {string} schema @returns {Row|null} */
  latest(subject, device, profile, day, schema) {
    return (
      /** @type {Row|undefined} */ (
        this.db
          .prepare(
            'SELECT * FROM exports WHERE subject=? AND device=? AND profile=? AND day=? AND schema=? AND (content IS NOT NULL OR object_key IS NOT NULL) ORDER BY created DESC LIMIT 1',
          )
          .get(subject, device, profile, day, schema)
      ) ?? null
    );
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
    const schema = parseExportSchema(row.schema);
    const text = Buffer.from(bytes).toString('utf8');
    if (row.format === 'json' && parseExportSchema(JSON.parse(text).schema) !== schema)
      throw new PairingError(400, 'File schema does not match the manifest.');
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
          timeSeries: z
            .record(
              z.string(),
              z.array(
                z
                  .object({
                    timestamp: z.string().nullable(),
                    value: z.unknown(),
                    unit: z.string().optional(),
                    metadata: z.unknown().optional(),
                    offsetSeconds: z.number().optional(),
                  })
                  .passthrough(),
              ),
            )
            .optional(),
        })
        .passthrough()
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
    this.row(row.subject, row.id);
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
    const inputMetadata = this.metadata(row);
    const incoming = this.records(row, bytes);
    const hash = this.digest(bytes);
    if (row.content || row.object_key) {
      if ((row.upload_hash ?? row.content_hash ?? this.digest(await this.bytes(row))) !== hash)
        throw new PairingError(409, 'Upload already committed with different bytes.');
      authorize();
      return {
        id,
        recordCount: Number(inputMetadata.manifest.recordCount),
        bytes: row.size,
        partial: inputMetadata.manifest.status === 'partial',
      };
    }
    if (incoming.length !== inputMetadata.manifest.recordCount)
      throw new PairingError(400, 'Manifest record count does not match the file.');
    this.requireStorage(subject);
    const mode = inputMetadata.profile.export.writeMode ?? 'replace';
    const previous =
      mode === 'new_file' ? null : this.latest(subject, device, profile, row.day, row.schema);
    let manifest = inputMetadata.manifest;
    let output = Buffer.from(bytes);
    if (mode === 'append' && previous) {
      const oldBytes = await this.bytes(previous);
      if (oldBytes.length + bytes.length > 16 * 1024 * 1024)
        throw new PairingError(
          413,
          'Appended cloud files are limited to 16 MiB. Choose New file or Replace.',
        );
      const oldRecords = this.records(previous, oldBytes);
      const oldManifest = this.metadata(previous).manifest;
      manifest = JSON.parse(
        appendExportContent(
          JSON.stringify({ ...oldManifest, schema: row.schema, recordCount: oldRecords.length }),
          JSON.stringify(manifest),
          'manifest',
        ),
      );
      const records = [...oldRecords, ...incoming];
      output = Buffer.from(
        row.format === 'jsonl'
          ? records.map((record) => JSON.stringify(record) + '\n').join('')
          : JSON.stringify({ ...manifest, records }),
      );
      // Revalidate merged data against this upload's exact source selection and schema.
      this.records(row, output);
    }
    if (output.length > 16 * 1024 * 1024)
      throw new PairingError(413, 'Cloud files are limited to 16 MiB. Choose New file or Replace.');
    const outputMetadata = Buffer.from(JSON.stringify({ ...inputMetadata, manifest }));
    if (outputMetadata.length > 1024 * 1024)
      throw new PairingError(
        413,
        'Cloud export metadata is limited to 1 MiB. Choose New file or Replace.',
      );
    const encrypted = this.seal(output, `${subject}|${id}`);
    const objectKey =
      this.objects && !(mode === 'skip' && previous) ? await this.uploadObject(encrypted) : null;
    let result = {
      id,
      recordCount: Number(manifest.recordCount),
      bytes: output.length,
      partial: manifest.status === 'partial',
    };
    try {
      transaction(this.db, () => {
        authorize();
        const current = this.row(subject, id);
        if (current.content || current.object_key) {
          if ((current.upload_hash ?? current.content_hash) !== hash)
            throw new PairingError(409, 'Upload already committed with different bytes.');
          result = {
            id,
            recordCount: Number(this.metadata(current).manifest.recordCount),
            bytes: current.size,
            partial: this.metadata(current).manifest.status === 'partial',
          };
        } else {
          if (current.created < Date.now() - 3600000)
            throw new PairingError(409, 'Upload expired. Start a new upload.');
          if (!Buffer.from(current.metadata).equals(Buffer.from(row.metadata)))
            throw new PairingError(409, 'Upload metadata changed. Retry the export.');
          const latest =
            mode === 'new_file' ? null : this.latest(subject, device, profile, row.day, row.schema);
          if (latest?.id !== previous?.id)
            throw new PairingError(
              409,
              'The daily cloud file changed during upload. Retry the export.',
            );
          if (mode === 'replace' && latest && latest.created > row.created)
            throw new PairingError(409, 'A newer daily export was already committed.');
          const usage = Number(
            this.db
              .prepare('SELECT COALESCE(SUM(size),0) bytes FROM exports WHERE subject=?')
              .get(subject)?.bytes ?? 0,
          );
          const replaced = previous?.size ?? 0;
          const allowance = this.requireStorage(subject);
          const maxFiles = Math.max(128, Math.ceil(allowance.limitBytes / 1_000_000_000) * 128);
          const count = Number(
            this.db
              .prepare(
                'SELECT COUNT(*) count FROM exports WHERE subject=? AND (content IS NOT NULL OR object_key IS NOT NULL)',
              )
              .get(subject)?.count ?? 0,
          );
          if (count - (previous ? 1 : 0) >= maxFiles)
            throw new PairingError(413, 'Cloud file limit reached. Delete older exports.');
          if (
            !cloudUploadFits(
              { ...this.requireStorage(subject), usedBytes: usage },
              mode === 'skip' && previous ? previous.size : output.length,
              replaced,
            )
          )
            throw new PairingError(
              413,
              'Cloud quota reached. Delete older exports before uploading more.',
            );
          if (mode === 'skip' && previous) {
            result = {
              id: previous.id,
              recordCount: Number(this.metadata(previous).manifest.recordCount),
              bytes: previous.size,
              partial: this.metadata(previous).manifest.status === 'partial',
            };
            this.db.prepare('DELETE FROM exports WHERE subject=? AND id=?').run(subject, id);
          } else {
            if (previous)
              this.db
                .prepare('DELETE FROM exports WHERE subject=? AND id=?')
                .run(subject, previous.id);
            this.db
              .prepare(
                'UPDATE exports SET content=?,object_key=?,content_hash=?,upload_hash=?,size=?,metadata=?,created=? WHERE id=?',
              )
              .run(
                objectKey ? null : encrypted,
                objectKey,
                this.digest(output),
                hash,
                output.length,
                this.seal(outputMetadata, `${subject}|${id}|metadata`),
                Math.max(
                  Date.now(),
                  Number(
                    this.db.prepare('SELECT COALESCE(MAX(created),0) last FROM exports').get()
                      ?.last ?? 0,
                  ) + 1,
                ),
                id,
              );
            if (objectKey) this.db.prepare('DELETE FROM object_garbage WHERE key=?').run(objectKey);
          }
          this.db
            .prepare('UPDATE cloud_writes SET result=? WHERE subject=? AND id=?')
            .run(JSON.stringify(result), subject, id);
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
    return result;
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
        'SELECT id FROM exports WHERE subject=? AND (content IS NOT NULL OR object_key IS NOT NULL) ORDER BY created DESC',
      )
      .all(subject)
      .map((v) => this.row(subject, String(v.id)))
      .filter((r) => {
        if (!forMcp) return true;
        const permission = this.permission(subject, r.device, r.profile);
        return permission.shared && hasAgentData(permission.agentPermissions);
      })
      .map((r) =>
        Object.assign(
          {
            id: r.id,
            profileId: r.profile,
            profileName: this.metadata(r).profile.name,
            deviceId: r.device,
            day: r.day,
            format: r.format,
            schema: r.schema,
            bytes: r.size,
            writeMode: this.metadata(r).profile.export.writeMode ?? 'replace',
            created: r.created,
            shared: this.permission(subject, r.device, r.profile).shared,
            agentPermissions: this.permission(subject, r.device, r.profile).agentPermissions,
          },
          forMcp ? {} : { recordCount: this.metadata(r).manifest.recordCount },
        ),
      );
  }
  /** @param {string} subject @param {string} id @param {number} offset @param {number} limit @param {boolean} [forMcp] @param {import('../core/data.js').Domain} [domain] @param {string} [recordType] */
  async page(subject, id, offset, limit, forMcp = false, domain, recordType) {
    this.cleanup();
    const row = this.row(subject, id),
      permission = this.permission(subject, row.device, row.profile);
    if (
      (!row.content && !row.object_key) ||
      (forMcp && (!permission.shared || !hasAgentData(permission.agentPermissions)))
    )
      throw new PairingError(404, 'Shared cloud export not found.');
    let records = this.records(row, await this.bytes(row));
    const currentPermission = this.permission(subject, row.device, row.profile);
    if (forMcp && (!currentPermission.shared || !hasAgentData(currentPermission.agentPermissions)))
      throw new PairingError(404, 'Shared cloud export not found.');
    if (forMcp)
      records = records.filter(
        (r) =>
          currentPermission.agentPermissions[r.domain] &&
          currentPermission.selection[r.domain].includes(`native:${r.type}`),
      );
    if (domain) records = records.filter((record) => record.domain === domain);
    if (recordType) records = records.filter((record) => record.type === recordType);
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
      schema: row.schema,
      records: page,
      nextCursor: offset + page.length < records.length ? String(offset + page.length) : null,
      manifest: forMcp
        ? { schema: row.schema, profileId: row.profile, recordCount: records.length }
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
