import { billing, refreshEntitlement } from './billing.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { devices, PairingError } from './store.js';
import { parseProfile, profileLink } from '../core/profiles.js';
import { history } from './cloud.js';
import { domains, exportPage } from '../core/data.js';
const ttl = 300000;
const domainSchema = z.enum(domains);
const querySchema = z
  .object({
    deviceId: z.string().uuid(),
    profileId: z.string().min(1).max(100),
    domain: domainSchema,
    type: z.string().min(1).max(160),
    source: z.enum(['native', 'imported']).default('native'),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    cursor: z.string().max(16000).default(''),
    limit: z.number().int().min(1).max(50).default(50),
    format: z.enum(['json', 'jsonl']).default('json'),
  })
  .refine(
    (q) =>
      Date.parse(q.end) > Date.parse(q.start) &&
      Date.parse(q.end) - Date.parse(q.start) <= 31 * 86400000,
    { message: 'Use a positive range of at most 31 days; paginate longer exports.' },
  );
const profileSchema = z.object({
  schema: z.enum(['myself.md.profile.v1', 'qr-connect.profile.v1']),
  name: z.string().min(1).max(80),
  export: z
    .object({
      formats: z
        .array(z.enum(['json', 'jsonl']))
        .min(1)
        .max(2),
      lookbackDays: z.number().int().min(1).max(30),
      includeToday: z.boolean(),
      folderName: z.string().max(64),
      filenameTemplate: z.string().max(100),
      formatFolders: z.boolean(),
      destination: z.enum(['local', 'http', 'cloud']).optional(),
      httpUrl: z.string().nullable().optional(),
    })
    .optional(),
  schedule: z
    .object({
      frequency: z.enum(['daily', 'weekly', 'custom']),
      interval: z.number().int().min(1).max(365),
      unit: z.enum(['day', 'week', 'month']),
      anchorDate: z.string().nullable(),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      weekday: z.number().int().min(1).max(7),
      todayRefresh: z.boolean(),
      refreshHours: z.union([z.literal(3), z.literal(6), z.literal(12)]),
    })
    .optional(),
  selection: z.object({
    health: z.array(z.string()).max(300),
    time: z.array(z.string()).max(300),
    location: z.array(z.string()).max(300),
  }),
});
const catalogSchema = z.object({
  dispatch: z.boolean().default(true),
  activeProfileId: z.string().min(1).max(100),
  profiles: z
    .array(profileSchema.extend({ id: z.string().min(1).max(100) }))
    .min(1)
    .max(50),
  acceptProfiles: z.boolean().default(false),
  receivedProfileId: z.string().uuid().or(z.literal('')).default(''),
  domains: z
    .array(
      z.object({
        domain: domainSchema,
        enabled: z.boolean(),
        availableTypes: z.array(z.string().max(160)).max(300),
        types: z.array(z.string().max(160)).max(300),
        notes: z.array(z.string().max(1000)).max(10),
      }),
    )
    .length(3),
});
/** @typedef {z.infer<typeof querySchema>} Query */
/** @typedef {{subject:string,deviceId:string,seen:number,catalog:z.infer<typeof catalogSchema>}} Phone */
/** @typedef {{id:string,subject:string,deviceId:string,expires:number,client:string|null,state:'queued'|'running'|'complete'|'failed',query:Query,result?:unknown,error?:string}} Job */
/** @type {Map<string,Phone>} */ const phones = new Map();
/** @type {Map<string,Job>} */ const jobs = new Map();
/** @typedef {{id:string,subject:string,deviceId:string,profile:import('../core/profiles.js').ProfileDraft,expires:number,state:'queued'|'delivered'}} Proposal */
/** @type {Map<string,Proposal>} */ const proposals = new Map();
// Query payloads are never persisted. A restarted server requires a fresh phone heartbeat.
const cleanup = setInterval(() => {
  for (const [id, p] of proposals) if (p.expires <= Date.now()) proposals.delete(id);
  for (const [id, job] of jobs)
    if (job.expires <= Date.now()) {
      if (job.state !== 'failed' && history.get(job.subject, id)?.event.status !== 'complete')
        history.update(job.subject, id, {
          status: 'expired',
          error: 'The request expired before the agent retrieved its response.',
        });
      billing.release(job.subject, id);
      jobs.delete(id);
    }
  for (const [id, phone] of phones) if (phone.seen + ttl <= Date.now()) phones.delete(id);
}, 10000);
cleanup.unref();
/** @param {string} deviceId @param {string} subject */
function own(deviceId, subject) {
  if (!devices(subject).some((d) => d.id === deviceId))
    throw new PairingError(404, 'Connected phone not found.');
}
/** @param {string} deviceId @param {string} subject */
export function cancelPhone(deviceId, subject) {
  phones.delete(deviceId);
  for (const [id, p] of proposals)
    if (p.deviceId === deviceId && p.subject === subject) proposals.delete(id);
  for (const [id, job] of jobs)
    if (job.deviceId === deviceId && job.subject === subject) {
      if (history.get(subject, id)?.event.status !== 'complete' && job.state !== 'failed')
        history.update(subject, id, { status: 'cancelled', error: 'Phone disconnected.' });
      billing.release(job.subject, id);
      jobs.delete(id);
    }
}
/** Blocking an agent also discards its queued and retained live requests.
 * @param {string} subject @param {string} client */
export function cancelAgent(subject, client) {
  for (const [id, job] of jobs) {
    if (job.subject === subject && job.client === client) {
      if (history.get(subject, id)?.event.status !== 'complete' && job.state !== 'failed')
        history.update(subject, id, { status: 'cancelled', error: 'Agent access was revoked.' });
      billing.release(job.subject, id);
      jobs.delete(id);
    }
  }
}
/** @param {unknown} value */
const content = (value) => ({
  content: [{ type: /** @type {const} */ ('text'), text: JSON.stringify(value) }],
  structuredContent: /** @type {Record<string,unknown>} */ (value),
});
/** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject @param {string|null} [client] */
export function registerDataTools(mcp, subject, client = null) {
  mcp.registerTool(
    'create_phone_export_profile',
    {
      description:
        'Generate an explicit per-type export profile and a qrconnect deep link. Optionally send it to an owned connected phone for review (open myself.md within five minutes). Use availableTypes from get_phone_data_catalog. Empty domain lists disable that domain. Optional export settings choose JSON/JSONL, 1–30 days, safe date-based filename and Documents subfolder. Optional schedule describes daily/weekly/custom cadence and Today Refresh; it never enables scheduling on the phone. Does not activate a profile or grant access. The user reviews, saves and activates on the phone. Original imported:archive includes ALL imported data regardless of indexed selections.',
      inputSchema: z.object({ profile: profileSchema, deviceId: z.string().uuid().optional() }),
    },
    async ({ profile, deviceId }) => {
      const draft = parseProfile(profile);
      const deepLink = profileLink(draft);
      if (!deviceId) return content({ profile: draft, deepLink, delivery: null });
      own(deviceId, subject);
      if (
        [...proposals.values()].filter((p) => p.subject === subject && p.expires > Date.now())
          .length >= 20
      )
        throw new PairingError(429, 'Wait for pending profiles to expire or be reviewed.');
      const id = randomUUID(),
        expires = Date.now() + ttl;
      proposals.set(id, { id, subject, deviceId, profile: draft, expires, state: 'queued' });
      return content({
        profile: draft,
        deepLink,
        delivery: { id, status: 'queued', expiresAt: expires },
      });
    },
  );
  mcp.registerTool(
    'get_phone_profile_delivery',
    {
      description:
        'Check whether a generated profile was received for review on the phone. Delivered does not mean saved, activated or granted. Pending deliveries expire after five minutes.',
      inputSchema: z.object({ deliveryId: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    async ({ deliveryId }) => {
      const p = proposals.get(deliveryId);
      if (!p || p.subject !== subject || p.expires <= Date.now())
        throw new PairingError(404, 'Profile delivery expired or not found.');
      own(p.deviceId, subject);
      return content({ deliveryId, status: p.state, expiresAt: p.expires });
    },
  );
  mcp.registerTool(
    'get_phone_data_catalog',
    {
      description:
        'Discover phone data types, explicit phone-side grants and collection limits before querying. Online means a heartbeat within 15 seconds. Keep myself.md open. No tool can grant permissions.',
      inputSchema: z.object({ deviceId: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    async ({ deviceId }) => {
      own(deviceId, subject);
      const p = phones.get(deviceId);
      return content({
        deviceId,
        online: Boolean(p && p.seen > Date.now() - 15000),
        lastSeen: p?.seen ?? null,
        catalog: p?.catalog ?? null,
      });
    },
  );
  mcp.registerTool(
    'query_phone_data',
    {
      description:
        'Ask the connected phone to read one discovered data type in a UTC interval under the active profileId from the catalog. Read-only; phone-side consent required. Returns requestId, then poll get_phone_request. Records keep native units and metadata; sources differ. Use nextCursor for every page, and separate date windows for ranges over 31 days. Imported archive type includes undated originals for lossless export. Empty HealthKit results do not prove read authorization.',
      inputSchema: querySchema,
      annotations: { readOnlyHint: true },
    },
    async (query) => {
      own(query.deviceId, subject);
      const phone = phones.get(query.deviceId);
      const domain = phone?.catalog.domains.find((d) => d.domain === query.domain);
      const id = randomUUID(),
        stamp = new Date().toISOString();
      const profile = phone?.catalog.profiles.find((p) => p.id === query.profileId);
      history.record(subject, query.deviceId, {
        id,
        kind: 'access',
        startedAt: stamp,
        updatedAt: stamp,
        status: 'running',
        actor: 'agent',
        client,
        target: 'phone',
        request: { domain: query.domain, source: query.source, type: query.type },
        destination: 'Live phone data',
        profile: {
          id: query.profileId,
          name: profile?.name ?? 'Phone data',
          selection: profile?.selection ?? { health: [], time: [], location: [] },
        },
        interval: { start: query.start, end: query.end },
        timezone: 'UTC',
        formats: [query.format],
        recordCount: null,
        artifacts: [],
        warnings: [],
        relatedId: null,
        error: null,
      });
      try {
        if (!phone || phone.subject !== subject || phone.seen < Date.now() - 15000)
          throw new PairingError(409, 'Phone is offline. Open myself.md first.');
        if (phone.catalog.activeProfileId !== query.profileId)
          throw new PairingError(403, 'Choose the active profile ID from the phone catalog.');
        if (!domain?.enabled || !domain.types.includes(`${query.source}:${query.type}`))
          throw new PairingError(
            403,
            'Enable this domain and data type in the active phone profile.',
          );
        if ([...jobs.values()].filter((j) => j.subject === subject).length >= 100)
          throw new PairingError(429, 'Read or forget existing requests first.');
        await refreshEntitlement(subject);
        billing.reserve(subject, id, 'agent');
        const expires = Date.now() + ttl;
        jobs.set(id, {
          id,
          subject,
          client,
          deviceId: query.deviceId,
          query,
          expires,
          state: 'queued',
        });
        return content({ requestId: id, status: 'queued', expiresAt: expires });
      } catch (error) {
        history.update(subject, id, {
          status: 'failed',
          error: 'The request could not proceed. Check phone connectivity and access permissions.',
        });
        throw error;
      }
    },
  );
  mcp.registerTool(
    'get_phone_request',
    {
      description:
        'Retrieve a live phone query/export page. Poll while queued/running; stop on failed or expired. Complete results include source fields, capture warnings, and a nextCursor. Never interpret a partial/permission-limited page as all phone data.',
      inputSchema: z.object({ requestId: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    async ({ requestId }) => {
      const job = jobs.get(requestId);
      if (!job || job.subject !== subject || job.expires <= Date.now())
        throw new PairingError(404, 'Request expired or not found.');
      own(job.deviceId, subject);
      if (job.state === 'complete') history.update(subject, requestId, { status: 'complete' });
      return content({
        requestId,
        status: job.state,
        expiresAt: job.expires,
        result: job.result ?? null,
        error: job.error ?? null,
      });
    },
  );
  mcp.registerTool(
    'forget_phone_request',
    {
      description: 'Immediately delete a query response from server memory.',
      inputSchema: z.object({ requestId: z.string().uuid() }),
    },
    async ({ requestId }) => {
      const job = jobs.get(requestId);
      if (job?.subject === subject) {
        if (history.get(subject, requestId)?.event.status !== 'complete' && job.state !== 'failed')
          history.update(subject, requestId, {
            status: 'cancelled',
            error: 'The agent discarded this request.',
          });
        billing.release(subject, requestId);
        jobs.delete(requestId);
      }
      return content({ forgotten: true });
    },
  );
}
const resultSchema = z.object({
  records: z
    .array(
      z.object({
        domain: domainSchema,
        type: z.string(),
        source: z.string(),
        start: z.string().nullable(),
        end: z.string().nullable(),
        native: z.unknown(),
      }),
    )
    .max(50),
  nextCursor: z.string().max(16000).nullable(),
  warnings: z.array(z.string().max(1000)).max(20),
  capture: z.string().max(200),
});
/** @param {string} path @param {string} method @param {string} subject @param {unknown} body */
export function phoneApi(path, method, subject, body) {
  const match = path.match(/^\/api\/phones\/([a-f0-9-]{36})\/(poll|result)$/);
  if (!match) return undefined;
  if (method !== 'POST') throw new PairingError(405, 'POST required.');
  const deviceId = z.string().uuid().parse(match[1]);
  own(deviceId, subject);
  if (match[2] === 'poll') {
    const catalog = catalogSchema.parse(body);
    phones.set(deviceId, { deviceId, subject, seen: Date.now(), catalog });
    // Recheck consent every heartbeat, deleting retained data on revocation.
    for (const [id, j] of jobs)
      if (
        j.deviceId === deviceId &&
        (catalog.activeProfileId !== j.query.profileId ||
          !catalog.domains.some(
            (d) =>
              d.domain === j.query.domain &&
              d.enabled &&
              d.types.includes(`${j.query.source}:${j.query.type}`),
          ))
      ) {
        if (history.get(subject, id)?.event.status !== 'complete' && j.state !== 'failed')
          history.update(subject, id, { status: 'cancelled', error: 'Phone access was revoked.' });
        billing.release(j.subject, id);
        jobs.delete(id);
      }
    const job = catalog.dispatch
      ? [...jobs.values()].find(
          (j) =>
            j.deviceId === deviceId &&
            j.subject === subject &&
            j.expires > Date.now() &&
            j.state === 'queued',
        )
      : undefined;
    if (job) job.state = 'running';
    const acknowledged = proposals.get(catalog.receivedProfileId);
    if (acknowledged?.subject === subject && acknowledged.deviceId === deviceId)
      acknowledged.state = 'delivered';
    const proposal =
      catalog.dispatch && catalog.acceptProfiles
        ? [...proposals.values()].find(
            (p) =>
              p.deviceId === deviceId &&
              p.subject === subject &&
              p.state === 'queued' &&
              p.expires > Date.now(),
          )
        : undefined;
    return {
      request: job ? { id: job.id, query: job.query } : null,
      profile: proposal ? { id: proposal.id, profile: proposal.profile } : null,
      allowance: billing.snapshot(subject),
    };
  }
  const input = z
    .object({
      id: z.string().uuid(),
      page: resultSchema.optional(),
      error: z.string().max(1000).optional(),
    })
    .parse(body);
  const job = jobs.get(input.id);
  if (
    !job ||
    job.subject !== subject ||
    job.deviceId !== deviceId ||
    job.expires <= Date.now() ||
    job.state !== 'running'
  )
    throw new PairingError(404, 'Pending request not found.');
  const allowed = phones
    .get(deviceId)
    ?.catalog.domains.some(
      (d) =>
        d.domain === job.query.domain &&
        d.enabled &&
        d.types.includes(`${job.query.source}:${job.query.type}`),
    );
  if (!allowed || phones.get(deviceId)?.catalog.activeProfileId !== job.query.profileId)
    throw new PairingError(403, 'Permission revoked.');
  if (input.error) {
    billing.release(subject, input.id);
    job.error = input.error;
    job.state = 'failed';
    history.update(subject, input.id, {
      status: 'failed',
      error: 'The phone could not read the requested data.',
    });
  } else if (input.page) {
    if (input.page.records.some((r) => r.domain !== job.query.domain || r.type !== job.query.type))
      throw new PairingError(400, 'Response does not match the query.');
    billing.complete(subject, input.id);
    job.result = {
      format: job.query.format,
      page: input.page,
      export: job.query.format === 'json' ? null : exportPage(input.page, job.query.format),
    };
    job.state = 'complete';
    history.update(subject, input.id, {
      status: 'ready',
      recordCount: input.page.records.length,
      warnings: [
        ...input.page.warnings,
        ...(input.page.nextCursor ? ['This returned page has more records available.'] : []),
      ],
    });
  } else throw new PairingError(400, 'Page or error required.');
  return { ok: true };
}
