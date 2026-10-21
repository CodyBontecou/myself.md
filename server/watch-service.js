import { Buffer } from 'node:buffer';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { database } from './database.js';
import { PairingError } from './errors.js';
import { watchProfile, validateWatchInterval, watchJobStates } from '../core/watch.js';
import { exportEvent } from '../core/history.js';

const digest = (/** @type {string} */ value) => createHash('sha256').update(value).digest('hex');
const idSchema = z.string().uuid();
const intervalSchema = z
  .object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.string().min(1).max(100),
  })
  .strict();
const summarySchema = z
  .object({
    steps: z.number().finite().nonnegative().nullable(),
    observedAt: z.string().datetime().nullable(),
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    timezone: z.string().min(1).max(100),
    earliestAvailable: z.string().datetime().nullable(),
    permissionRequested: z.boolean(),
  })
  .strict();
const terminal = new Set(watchJobStates.slice(3));

/** @param {import('../core/watch.js').WatchInterval} interval */
function verifyInterval(interval) {
  try {
    validateWatchInterval(interval, Date.now());
    new Intl.DateTimeFormat('en', { timeZone: interval.timezone }).format(0);
  } catch {
    throw new PairingError(400, 'Use a valid recent local-day interval and timezone.');
  }
}
/** @param {import('../core/watch.js').WatchDevice} device @param {import('../core/watch.js').WatchInterval} interval */
function reservationScope(device, interval) {
  return JSON.stringify({
    profileId: device.profile.id,
    days: [interval.day],
    formats: ['json'],
    watchDeviceId: device.id,
    watchRevision: device.revision,
  });
}
/** One scoped session per watch. Metadata is encrypted; only credential hashes are indexed.
 * @param {{source:string|import('./database.js').SqlDatabase,cloud:import('./cloud-store.js').CloudStore,billing:import('./billing-store.js').BillingStore,history:import('./history-store.js').HistoryStore,devices:import('./pairing-store.js').PairingStore['devices'],refreshEntitlement:(subject:string)=>Promise<void>,registerTicket:(token:string,subject:string,expires:number)=>Promise<void>}} dependencies */
export function createWatchService({
  source,
  cloud,
  billing,
  history,
  devices,
  refreshEntitlement,
  registerTicket,
}) {
  const db = database(source);
  db.exec(
    'CREATE TABLE IF NOT EXISTS watches(id TEXT PRIMARY KEY,subject TEXT,parent TEXT,hash TEXT UNIQUE,expires INTEGER,value BLOB)',
  );
  /** @param {string} subject @param {string} id @returns {import('../core/watch.js').WatchDevice} */
  function read(subject, id) {
    const row = db.prepare('SELECT value FROM watches WHERE subject=? AND id=?').get(subject, id);
    if (!row) throw new PairingError(404, 'Watch not found.');
    return JSON.parse(
      cloud.open(/** @type {Uint8Array} */ (row.value), `${subject}|${id}|watch`).toString(),
    );
  }
  /** @param {string} subject @param {import('../core/watch.js').WatchDevice} device */
  function save(subject, device) {
    db.prepare('UPDATE watches SET value=? WHERE subject=? AND id=?').run(
      cloud.seal(Buffer.from(JSON.stringify(device)), `${subject}|${device.id}|watch`),
      subject,
      device.id,
    );
  }
  /** @param {string} subject @param {import('../core/watch.js').WatchDevice} device */
  function connected(subject, device) {
    if (device.revoked || !devices(subject).some((phone) => phone.id === device.parentDeviceId))
      throw new PairingError(403, 'Watch access was revoked. Set up the watch again in Settings.');
  }
  /** @param {string} subject @param {string|null} client */
  function agent(subject, client) {
    if (client) cloud.observeAgent(subject, client);
  }
  /** @param {string} subject @param {import('../core/watch.js').WatchDevice} device @param {string|null} client */
  function view(subject, device, client) {
    connected(subject, device);
    agent(subject, client);
    const granted = device.profile.agentAccess === true;
    return {
      id: device.id,
      name: device.name,
      parentDeviceId: device.parentDeviceId,
      ready: device.lastSeenAt !== null && device.expiresAt > Date.now(),
      lastSeenAt: device.lastSeenAt,
      expiresAt: device.expiresAt,
      metric: 'HKQuantityTypeIdentifierStepCount',
      scope: 'watch-local-today',
      destination: new URL(device.profile.export.httpUrl ?? '').hostname,
      agentAccess: granted,
      ...(client && !granted ? {} : { summary: device.summary }),
      jobs: client && !granted ? [] : device.jobs.map((job) => ({ ...job })),
      setup: {
        status: granted || !client ? 'configured' : 'awaiting_user',
        url: 'myselfmd://watch',
        requiresUser: !granted && Boolean(client),
      },
    };
  }
  /** @param {string} subject @param {string|null} client */
  function list(subject, client) {
    agent(subject, client);
    return db
      .prepare('SELECT id FROM watches WHERE subject=?')
      .all(subject)
      .map((row) => read(subject, String(row.id)))
      .filter(
        (device) =>
          !device.revoked && devices(subject).some((phone) => phone.id === device.parentDeviceId),
      )
      .map((device) => view(subject, device, client));
  }
  /** @param {string} subject @param {import('../core/watch.js').WatchDevice} device @param {import('../core/watch.js').WatchJob} job */
  function requireAgentGrant(subject, device, job) {
    if (job.actor !== 'agent') return;
    agent(subject, job.client);
    if (!device.profile.agentAccess || !device.profile.agentPermissions?.health)
      throw new PairingError(
        403,
        'Approve watch agent access in Settings before requesting exports.',
      );
  }
  /** @param {string} subject @param {import('../core/watch.js').WatchDevice} device @param {import('../core/watch.js').WatchJob} job */
  function ownsReservation(subject, device, job) {
    if (!job.interval) return false;
    const reserved = billing.db
      .prepare('SELECT scope FROM billing_uses WHERE subject=? AND id=?')
      .get(subject, job.id);
    return reserved?.scope === reservationScope(device, job.interval);
  }
  /** Request IDs are caller supplied and may also exist on another watch or phone.
   * @param {string} subject @param {import('../core/watch.js').WatchDevice} device @param {import('../core/watch.js').WatchJob} job */
  function releaseReservation(subject, device, job) {
    if (ownsReservation(subject, device, job)) billing.release(subject, job.id);
  }
  /** @param {string} subject @param {import('../core/watch.js').WatchDevice} device */
  function expire(subject, device) {
    for (const job of device.jobs) {
      if (!terminal.has(job.status) && job.expiresAt <= Date.now() && job.status !== 'running') {
        job.status = 'expired';
        job.updatedAt = Date.now();
        releaseReservation(subject, device, job);
      }
    }
    save(subject, device);
  }
  /** @param {string} subject @param {import('../core/watch.js').WatchDevice} device @param {string} requestId @param {string|null} client @param {import('../core/watch.js').WatchInterval|null} interval */
  function request(subject, device, requestId, client, interval) {
    connected(subject, device);
    expire(subject, device);
    const existing = device.jobs.find((job) => job.id === requestId);
    if (existing) {
      if (existing.client !== client)
        throw new PairingError(409, 'Request ID is already used by another caller.');
      return existing;
    }
    if (device.expiresAt <= Date.now())
      throw new PairingError(401, 'Watch session expired. Set up the watch again.');
    if (device.jobs.filter((job) => !terminal.has(job.status)).length >= 5)
      throw new PairingError(429, 'Five watch exports are already pending.');
    const now = Date.now();
    const job = /** @type {import('../core/watch.js').WatchJob} */ ({
      id: requestId,
      revision: device.revision,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 86400000,
      status: 'accepted',
      actor: client ? 'agent' : 'manual',
      client,
      interval,
      recordCount: null,
      bytes: null,
      httpStatus: null,
      partial: false,
      error: null,
    });
    requireAgentGrant(subject, device, job);
    const pending = device.jobs.filter((item) => !terminal.has(item.status));
    const finished = device.jobs
      .filter((item) => terminal.has(item.status) && item.updatedAt > now - 90 * 86400000)
      .slice(-(39 - pending.length));
    const retained = new Set([...finished, ...pending].map((item) => item.id));
    device.jobs = device.jobs.filter((item) => retained.has(item.id));
    device.jobs.push(job);
    save(subject, device);
    return job;
  }
  /** @param {string} subject @param {import('../core/watch.js').WatchDevice} device @param {string} requestId */
  function findJob(subject, device, requestId) {
    connected(subject, device);
    expire(subject, device);
    const job = device.jobs.find((item) => item.id === requestId);
    if (!job) throw new PairingError(404, 'Watch export not found.');
    return job;
  }
  /** @param {string} subject @param {import('../core/watch.js').WatchDevice} device @param {import('../core/watch.js').WatchJob} job */
  function recordHistory(subject, device, job) {
    if (!job.interval) return;
    history.record(subject, device.id, {
      ...exportEvent({
        id: job.id,
        profile: device.profile,
        actor: 'manual',
        interval: job.interval,
        stamp: new Date(job.createdAt).toISOString(),
        timezone: job.interval.timezone,
      }),
      actor: job.actor,
      client: job.client,
      updatedAt: new Date(job.updatedAt).toISOString(),
      status:
        job.status === 'completed'
          ? job.partial
            ? 'partial'
            : 'complete'
          : job.status === 'failed'
            ? 'failed'
            : job.status === 'cancelled'
              ? 'cancelled'
              : 'running',
      recordCount: job.recordCount,
      error: job.error,
      warnings: [
        'Contains only step samples available on this watch. Empty reads do not establish HealthKit authorization.',
      ],
      artifacts:
        job.status === 'completed'
          ? [
              {
                schema: device.profile.export.schema,
                day: job.interval.day,
                name: `${job.interval.day}.v1.json`,
                format: 'json',
                recordCount: job.recordCount ?? 0,
                bytes: job.bytes ?? 0,
                uri: null,
                cloudId: null,
                checksum: null,
                partial: job.partial,
              },
            ]
          : [],
    });
  }
  /** @param {string} subject @param {import('../core/watch.js').WatchDevice} device */
  function revoke(subject, device) {
    device.revoked = true;
    for (const job of device.jobs)
      if (!terminal.has(job.status)) {
        job.status = 'cancelled';
        job.updatedAt = Date.now();
        releaseReservation(subject, device, job);
        recordHistory(subject, device, job);
      }
    save(subject, device);
    return { status: 'completed', deviceId: device.id };
  }
  /** @param {string} subject @param {string|null} client @param {unknown} body */
  async function watchOwnerApi(subject, client, body) {
    const input = z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('list') }).strict(),
        z.object({ action: z.literal('get'), deviceId: idSchema }).strict(),
        z
          .object({
            action: z.literal('configure'),
            deviceId: idSchema,
            parentDeviceId: idSchema,
            name: z.string().min(1).max(80),
            endpoint: z.string().url().max(2048),
            agentAccess: z.boolean(),
          })
          .strict(),
        z
          .object({ action: z.literal('request'), deviceId: idSchema, requestId: idSchema })
          .strict(),
        z.object({ action: z.literal('cancel'), deviceId: idSchema, requestId: idSchema }).strict(),
        z.object({ action: z.literal('revoke'), deviceId: idSchema }).strict(),
      ])
      .parse(body);
    agent(subject, client);
    if (input.action === 'list') return { devices: list(subject, client) };
    if (input.action === 'configure') {
      if (client)
        throw new PairingError(403, 'Watch setup and consent require the owner in the phone app.');
      if (!devices(subject).some((phone) => phone.id === input.parentDeviceId))
        throw new PairingError(404, 'Connected phone not found.');
      const previous = db.prepare('SELECT subject FROM watches WHERE id=?').get(input.deviceId);
      if (previous && previous.subject !== subject)
        throw new PairingError(409, 'Reset the watch before connecting another account.');
      const url = new URL(input.endpoint);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new PairingError(400, 'Use an HTTPS endpoint without credentials or fragments.');
      let profile;
      try {
        profile = watchProfile(input.name, url.href);
      } catch (error) {
        throw new PairingError(
          400,
          error instanceof Error ? error.message : 'Invalid watch profile.',
        );
      }
      profile.agentAccess = input.agentAccess;
      profile.agentPermissions = {
        health: input.agentAccess,
        time: false,
        location: false,
        logs: input.agentAccess,
      };
      const token = randomBytes(32).toString('base64url'),
        expiresAt = Date.now() + 30 * 86400000;
      const device = /** @type {import('../core/watch.js').WatchDevice} */ ({
        id: input.deviceId,
        name: profile.name,
        parentDeviceId: input.parentDeviceId,
        expiresAt,
        revision: randomUUID(),
        profile,
        summary: {
          steps: null,
          observedAt: null,
          day: null,
          timezone: 'UTC',
          earliestAvailable: null,
          permissionRequested: false,
        },
        jobs: [],
        lastSeenAt: null,
        revoked: false,
      });
      if (previous) {
        const oldDevice = read(subject, input.deviceId);
        for (const job of oldDevice.jobs)
          if (!terminal.has(job.status)) releaseReservation(subject, oldDevice, job);
      }
      db.prepare('INSERT OR REPLACE INTO watches VALUES(?,?,?,?,?,?)').run(
        device.id,
        subject,
        device.parentDeviceId,
        digest(token),
        expiresAt,
        cloud.seal(Buffer.from(JSON.stringify(device)), `${subject}|${device.id}|watch`),
      );
      await registerTicket(token, subject, expiresAt + 90 * 86400000);
      return { deviceId: device.id, revision: device.revision, expiresAt, profile, token };
    }
    const device = read(subject, input.deviceId);
    if (input.action === 'revoke') return revoke(subject, device);
    connected(subject, device);
    if (input.action === 'get') return view(subject, device, client);
    if (input.action === 'request') return request(subject, device, input.requestId, client, null);
    const job = findJob(subject, device, input.requestId);
    if (client && job.client !== client)
      throw new PairingError(403, 'An agent may cancel only its own watch requests.');
    if (!terminal.has(job.status)) {
      job.status = 'cancelled';
      job.updatedAt = Date.now();
      job.error = 'Cancelled. A transfer already in flight may have reached the destination.';
      releaseReservation(subject, device, job);
      save(subject, device);
      recordHistory(subject, device, job);
    }
    return job;
  }
  /** Scoped watch bearer; cannot manage grants, access other devices, or invoke MCP.
   * @param {string} token @param {unknown} body */
  async function watchRuntimeApi(token, body) {
    const row = db
      .prepare('SELECT subject,id,expires FROM watches WHERE hash=?')
      .get(digest(token));
    if (!row)
      throw new PairingError(401, 'Watch session expired or revoked. Set up the watch again.');
    const subject = String(row.subject),
      device = read(subject, String(row.id));
    const input = z
      .discriminatedUnion('action', [
        z
          .object({
            action: z.literal('poll'),
            summary: summarySchema.optional(),
            foreground: z.boolean().default(false),
          })
          .strict(),
        z
          .object({ action: z.literal('enqueue'), requestId: idSchema, interval: intervalSchema })
          .strict(),
        z
          .object({ action: z.literal('start'), requestId: idSchema, interval: intervalSchema })
          .strict(),
        z.object({ action: z.literal('awaiting_user'), requestId: idSchema }).strict(),
        z
          .object({
            action: z.literal('settle'),
            requestId: idSchema,
            status: z.enum(['completed', 'failed']),
            recordCount: z.number().int().min(0).max(50000),
            bytes: z
              .number()
              .int()
              .min(0)
              .max(16 * 1024 * 1024),
            httpStatus: z.number().int().min(100).max(599).nullable(),
            partial: z.boolean(),
            error: z.string().max(300).nullable(),
          })
          .strict(),
        z.object({ action: z.literal('cancel'), requestId: idSchema }).strict(),
        z.object({ action: z.literal('revoke') }).strict(),
      ])
      .parse(body);
    if (input.action === 'revoke') return revoke(subject, device);
    if (Number(row.expires) <= Date.now()) throw new PairingError(401, 'Watch session expired.');
    connected(subject, device);
    if (input.action === 'poll') {
      if (input.summary) {
        new Intl.DateTimeFormat('en', { timeZone: input.summary.timezone }).format(0);
        device.summary = device.profile.agentAccess
          ? input.summary
          : { ...input.summary, steps: null, observedAt: null, day: null, earliestAvailable: null };
      }
      device.lastSeenAt = Date.now();
      expire(subject, device);
      if (input.foreground && device.expiresAt < Date.now() + 29 * 86400000) {
        device.expiresAt = Date.now() + 30 * 86400000;
        db.prepare('UPDATE watches SET expires=? WHERE subject=? AND id=?').run(
          device.expiresAt,
          subject,
          device.id,
        );
        save(subject, device);
        await registerTicket(token, subject, device.expiresAt + 90 * 86400000);
      }
      return {
        revision: device.revision,
        expiresAt: device.expiresAt,
        profile: device.profile,
        jobs: device.jobs,
      };
    }
    if (input.action === 'enqueue') {
      const existing = device.jobs.find((job) => job.id === input.requestId);
      if (existing) return existing;
      verifyInterval(input.interval);
      return request(subject, device, input.requestId, null, input.interval);
    }
    if (input.action === 'cancel')
      return watchOwnerApi(subject, null, {
        action: 'cancel',
        deviceId: device.id,
        requestId: input.requestId,
      });
    const job = findJob(subject, device, input.requestId);
    if (job.revision !== device.revision)
      throw new PairingError(409, 'Watch profile changed. Start a new export.');
    if (terminal.has(job.status)) return job;
    if (input.action === 'awaiting_user') {
      job.status = 'awaiting_user';
      job.updatedAt = Date.now();
      save(subject, device);
      return job;
    }
    if (input.action === 'start') {
      requireAgentGrant(subject, device, job);
      if (job.interval && JSON.stringify(job.interval) !== JSON.stringify(input.interval))
        throw new PairingError(409, 'Export interval is already frozen.');
      // A reserved export already passed the recent-day check. Retry only its exact frozen bounds,
      // including after an extended interruption; active session/ownership/grant checks still apply.
      if (!ownsReservation(subject, device, job)) verifyInterval(input.interval);
      const local = new Intl.DateTimeFormat('en-CA', {
        timeZone: input.interval.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(input.interval.start));
      if (local !== input.interval.day)
        throw new PairingError(400, 'Watch day does not match its timezone.');
      await refreshEntitlement(subject);
      // Recheck after entitlement verification; revocation may occur during I/O.
      const current = read(subject, device.id),
        currentJob = findJob(subject, current, job.id);
      requireAgentGrant(subject, current, currentJob);
      if (current.revoked || terminal.has(currentJob.status))
        throw new PairingError(409, 'Watch export is no longer active.');
      if (
        currentJob.interval &&
        JSON.stringify(currentJob.interval) !== JSON.stringify(input.interval)
      )
        throw new PairingError(409, 'Export interval is already frozen.');
      if (current.expiresAt <= Date.now()) throw new PairingError(401, 'Watch session expired.');
      const scope = reservationScope(current, input.interval);
      const reserved = billing.db
        .prepare('SELECT scope FROM billing_uses WHERE subject=? AND id=?')
        .get(subject, job.id);
      if (reserved && reserved.scope !== scope)
        throw new PairingError(409, 'Request ID belongs to another export.');
      billing.reserve(subject, job.id, scope);
      currentJob.interval = input.interval;
      currentJob.status = 'running';
      currentJob.updatedAt = Date.now();
      save(subject, current);
      recordHistory(subject, current, currentJob);
      return { job: currentJob, profile: current.profile };
    }
    if (job.status !== 'running')
      throw new PairingError(409, 'Start the watch export before reporting its result.');
    if (
      input.status === 'completed' &&
      (!input.httpStatus || input.httpStatus < 200 || input.httpStatus >= 300)
    )
      throw new PairingError(400, 'Delivery requires an HTTP success acknowledgment.');
    job.status = input.status;
    job.updatedAt = Date.now();
    job.recordCount = input.recordCount;
    job.bytes = input.bytes;
    job.httpStatus = input.httpStatus;
    job.partial = input.partial;
    job.error = input.error;
    if (job.status === 'completed') billing.complete(subject, job.id);
    else releaseReservation(subject, device, job);
    save(subject, device);
    recordHistory(subject, device, job);
    return job;
  }
  /** Revoke dependent sessions and release queued reservations when a phone disconnects.
   * @param {string} parentDeviceId @param {string} subject */
  function cancelWatchParent(parentDeviceId, subject) {
    for (const row of db
      .prepare('SELECT id FROM watches WHERE subject=? AND parent=?')
      .all(subject, parentDeviceId)) {
      revoke(subject, read(subject, String(row.id)));
    }
  }
  /** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject @param {string|null} client */
  function registerWatchTools(mcp, subject, client) {
    for (const [name, action] of /** @type {const} */ ([
      ['list_connected_watches', 'list'],
      ['get_watch_state', 'get'],
      ['request_watch_export', 'request'],
      ['cancel_watch_export', 'cancel'],
      ['disconnect_watch', 'revoke'],
    ])) {
      mcp.registerTool(
        name,
        {
          description:
            action === 'request'
              ? 'Request today’s available watch step samples at its approved HTTPS destination. Explicit watch agent consent is required. Reuse requestId on retries; inspect get_watch_state for actual delivery.'
              : action === 'get'
                ? 'Read watch readiness, granted step summary, export queue and delivery outcomes. Destination paths and credentials are excluded.'
                : action === 'cancel'
                  ? 'Cancel your own watch export request. Already transmitted data cannot be recalled.'
                  : action === 'revoke'
                    ? 'Revoke watch access and stop accepting exports. Already transmitted data cannot be recalled.'
                    : 'List owned watches and their capability/consent state. Set up or authorize a watch through the owner handoff.',
          inputSchema:
            action === 'list'
              ? z.object({}).strict()
              : action === 'request' || action === 'cancel'
                ? z.object({ deviceId: idSchema, requestId: idSchema }).strict()
                : z.object({ deviceId: idSchema }).strict(),
          annotations: {
            readOnlyHint: action === 'list' || action === 'get',
            destructiveHint: action === 'revoke',
            idempotentHint: true,
          },
        },
        async (input) => {
          const result = await watchOwnerApi(subject, client, { action, ...input });
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: { result },
          };
        },
      );
    }
    mcp.registerTool(
      'setup_watch',
      {
        description:
          'Initiate owner setup, HTTPS credential entry and watch agent consent. Agents cannot approve permissions or receive credentials. Verify with list_connected_watches.',
        inputSchema: z.object({}).strict(),
      },
      async () => ({
        content: [
          {
            type: 'text',
            text: 'Open myself.md → Settings → Apple Watch to configure or authorize the watch.',
          },
        ],
        structuredContent: {
          status: 'awaiting_user',
          url: 'myselfmd://watch',
          verificationTool: 'list_connected_watches',
        },
      }),
    );
  }
  return { watchOwnerApi, watchRuntimeApi, registerWatchTools, cancelWatchParent };
}
