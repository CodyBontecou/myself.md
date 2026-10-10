import { exportSchemas, defaultExportSchema } from '../core/export-schemas.js';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { PairingError } from './errors.js';
import { parseProfile, profileLink, agentProfileAllows } from '../core/profiles.js';
import { domains, exportPage } from '../core/data.js';
import { exportDiagnostics } from '../core/diagnostics.js';
import { createFeedbackService, feedbackSchema } from './feedback-service.js';
import {
  debugReportSchema,
  latestDebugReport,
  registerDebugTools,
  phoneDebugState,
  publishDebugReport,
} from './debug-service.js';
import { logs, logsJson, selectLogs } from '../core/logs.js';
const ttl = 300000;
const domainSchema = z.enum(domains);
const exportSchema = z.enum(exportSchemas().versions.map((version) => version.id));
const queryFields = {
  requestKey: z.string().min(1).max(200).optional(),
  deviceId: z.string().uuid(),
  profileId: z.string().min(1).max(100),
  domain: domainSchema,
  type: z.string().min(1).max(160),
  source: z.literal('native').default('native'),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  cursor: z.string().max(16000).default(''),
  limit: z.number().int().min(1).max(50).default(50),
  format: z.enum(['json', 'jsonl']).default('json'),
  schema: exportSchema.default(defaultExportSchema),
};
export const phoneQueryBodySchema = z.toJSONSchema(
  z.object(queryFields).omit({ requestKey: true }),
  { io: 'input' },
);
const querySchema = z
  .object(queryFields)
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
      schema: exportSchema.optional(),
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
    .partial()
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
  diagnostics: debugReportSchema.optional(),
  feedback: feedbackSchema.optional(),
  dispatch: z.boolean().default(true),
  profiles: z
    .array(
      profileSchema.extend({
        id: z.string().min(1).max(100),
        agentAccess: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(50),
  acceptProfiles: z.boolean().default(false),
  receivedProfileId: z.string().uuid().or(z.literal('')).default(''),
  domains: z
    .array(
      z.object({
        domain: domainSchema,
        enabled: z.boolean(),
        selectableTypes: z.array(z.string().max(160)).max(300).optional(),
        permission: z.string().max(100).optional(),
        permissionHandoff: z
          .string()
          .regex(/^qrconnect:\/\/data\/(health|time|location)$/)
          .optional(),
        availableTypes: z.array(z.string().max(160)).max(300),
        types: z.array(z.string().max(160)).max(300),
        notes: z.array(z.string().max(1000)).max(10),
      }),
    )
    .length(3),
});
/** @param {unknown} value */
const content = (value) => ({
  content: [{ type: /** @type {const} */ ('text'), text: JSON.stringify(value) }],
  structuredContent: /** @type {Record<string,unknown>} */ (value),
});
/** @typedef {z.infer<typeof querySchema>} Query */
/** @typedef {{subject:string,deviceId:string,seen:number,catalog:z.infer<typeof catalogSchema>}} Phone */
/** @typedef {{id:string,subject:string,deviceId:string,expires:number,client:string|null,state:'queued'|'running'|'complete'|'failed',query:Query,result?:{schema:import('../core/export-schemas.js').ExportSchema,format:Query['format'],page:import('../core/data.js').DataPage,export:string|null},error?:string}} Job */
/** @typedef {{id:string,subject:string,deviceId:string,profile:import('../core/profiles.js').ProfileDraft,expires:number,state:'queued'|'delivered'}} Proposal */
/** @param {z.infer<typeof catalogSchema>|undefined} catalog @param {Query} query */
function catalogAllows(catalog, query) {
  const profile = catalog?.profiles.find((p) => p.id === query.profileId);
  return agentProfileAllows(
    profile && { ...parseProfile(profile), id: profile.id, agentAccess: profile.agentAccess },
    query,
  );
}
/** @param {{billing:import('./billing-store.js').BillingStore,refreshEntitlement:(subject:string)=>Promise<void>,devices:(subject:string)=>ReturnType<import('./pairing-store.js').PairingStore['devices']>,history:import('./history-store.js').HistoryStore,phones?:Map<string,Phone>,jobs?:Map<string,Job>,proposals?:Map<string,Proposal>,feedbackOperations?:Map<string,import('./feedback-service.js').FeedbackOperation>}} dependencies */
export function createDataService({
  billing,
  refreshEntitlement,
  devices,
  history,
  phones = new Map(),
  jobs = new Map(),
  proposals = new Map(),
  feedbackOperations = new Map(),
}) {
  const feedback = createFeedbackService({ own, phones, operations: feedbackOperations });
  /** Completed capture outcomes survive payload expiry and grant revocation.
   * @param {string} subject @param {string} id */
  function captured(subject, id) {
    return ['complete', 'partial'].includes(history.get(subject, id)?.event.status ?? '');
  }
  // Query payloads are never persisted. A restarted server requires a fresh phone heartbeat.
  function cleanup() {
    feedback.cleanup();
    for (const [id, p] of proposals) if (p.expires <= Date.now()) proposals.delete(id);
    for (const [id, job] of jobs)
      if (job.expires <= Date.now()) {
        if (job.state !== 'failed' && !captured(job.subject, id))
          history.update(job.subject, id, {
            status: 'expired',
            error: 'The request expired before the agent retrieved its response.',
          });
        billing.release(job.subject, id);
        jobs.delete(id);
      }
    for (const [id, phone] of phones) if (phone.seen + ttl <= Date.now()) phones.delete(id);
  }
  /** @param {string} deviceId @param {string} subject */
  function own(deviceId, subject) {
    if (!devices(subject).some((d) => d.id === deviceId))
      throw new PairingError(404, 'Connected phone not found.');
  }
  /** @param {string} deviceId @param {string} subject */
  function cancelPhone(deviceId, subject) {
    feedback.cancel((op) => op.deviceId === deviceId && op.subject === subject);
    phones.delete(deviceId);
    for (const [id, p] of proposals)
      if (p.deviceId === deviceId && p.subject === subject) proposals.delete(id);
    for (const [id, job] of jobs)
      if (job.deviceId === deviceId && job.subject === subject) {
        if (!captured(subject, id) && job.state !== 'failed')
          history.update(subject, id, { status: 'cancelled', error: 'Phone disconnected.' });
        billing.release(job.subject, id);
        jobs.delete(id);
      }
  }
  /** Remove all retained account work, including requests for already disconnected phones.
   * @param {string} subject */
  function cancelAccount(subject) {
    feedback.cancel((op) => op.subject === subject);
    for (const [id, phone] of phones) if (phone.subject === subject) phones.delete(id);
    for (const [id, proposal] of proposals) if (proposal.subject === subject) proposals.delete(id);
    for (const [id, job] of jobs)
      if (job.subject === subject) {
        billing.release(subject, id);
        jobs.delete(id);
      }
  }
  /** Blocking an agent also discards its queued and retained live requests.
   * @param {string} subject @param {string} client */
  function cancelAgent(subject, client) {
    feedback.cancel((op) => op.subject === subject && op.client === client);
    for (const [id, job] of jobs) {
      if (job.subject === subject && job.client === client) {
        if (!captured(subject, id) && job.state !== 'failed')
          history.update(subject, id, { status: 'cancelled', error: 'Agent access was revoked.' });
        billing.release(job.subject, id);
        jobs.delete(id);
      }
    }
  }
  /** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject @param {string|null} [client] */
  function registerDataTools(mcp, subject, client = null) {
    registerDebugTools(mcp, subject, own, phones);
    feedback.register(mcp, subject, client);
    mcp.registerTool(
      'list_phone_logs',
      {
        description:
          'Browse owned-phone logs using the same All/App/Exports/Agents categories as the mobile Logs tab. Merges a page of 50 export/agent history entries with up to 300 retained internal app events. App events require phone diagnostics consent and a heartbeat within 15 seconds; history retains its existing ownership rules. historyOffset paginates the history source before category/profile filtering; follow nextHistoryOffset even for empty filtered pages. App entries repeat across pages; deduplicate by id. Use selectedIds to select up to 350 unique IDs from this page; unavailableIds reports missing or inaccessible entries without fetching beyond current grants. Use format=jsonl for copyable raw JSON lines equivalent to the phone’s Raw view. Repeated reads poll the latest heartbeat/history snapshot; deduplicate by id and replace updated history entries. This is polling, not a push subscription. Offline history may be stale. Structured entries include details; no personal records or local artifact paths.',
        inputSchema: z
          .object({
            deviceId: z.string().uuid(),
            historyOffset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
            category: z.enum(['all', 'app', 'exports', 'agents']).default('all'),
            issues: z.boolean().default(false),
            format: z.enum(['structured', 'jsonl']).default('structured'),
            profileId: z.string().min(1).max(100).optional(),
            selectedIds: z
              .array(z.string().min(1).max(1000))
              .max(350)
              .refine((ids) => new Set(ids).size === ids.length)
              .optional(),
          })
          .strict(),
        annotations: { readOnlyHint: true },
      },
      async ({ deviceId, historyOffset, category, issues, profileId, format, selectedIds }) => {
        own(deviceId, subject);
        const page = history.list(subject, deviceId, historyOffset);
        const diagnostics = phoneDebugState(deviceId, phones.get(deviceId));
        const entries = logs(page.events, diagnostics.report?.entries ?? [], Date.now(), {
          category,
          issues,
          profileId,
        });
        const selection =
          selectedIds === undefined
            ? { logs: entries, unavailableIds: [] }
            : selectLogs(entries, selectedIds);
        return content({
          deviceId,
          logs: selection.logs,
          unavailableIds: selection.unavailableIds,
          ...(format === 'jsonl' ? { jsonl: logsJson(selection.logs) } : {}),
          observedAt: Date.now(),
          recommendedPollMs: 2000,
          nextHistoryOffset: page.hasMore ? historyOffset + page.events.length : null,
          diagnostics: { ...diagnostics, report: undefined },
        });
      },
    );
    mcp.registerTool(
      'list_export_schemas',
      {
        description:
          'Discover released export contracts, the recommended version, JSON Schema definitions, JSONL record definitions, examples and changes. Profiles pin an explicit version; new releases never upgrade saved profiles. Does not read personal data.',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      async () => content(exportSchemas()),
    );
    mcp.registerTool(
      'list_phone_export_history',
      {
        description:
          'List saved phone export and agent access metadata for an owned phone, newest first, in pages of 50. Includes failed, partial and interrupted exports. Open myself.md to sync recent phone history; offline results may be stale. No data records or local file paths are returned.',
        inputSchema: z.object({
          deviceId: z.string().uuid(),
          offset: z.number().int().min(0).default(0),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ deviceId, offset }) => {
        own(deviceId, subject);
        return content(history.list(subject, deviceId, offset));
      },
    );
    mcp.registerTool(
      'diagnose_phone_export',
      {
        description:
          'Inspect one saved export failure, partial result or interruption, compare its snapshot with the latest phone configuration, and return deep links to review the existing profile and source permissions on the phone. Start with list_phone_export_history. Current configuration is evidence, not a confirmed cause. Links navigate only; the user reviews and saves fixes in myself.md. Use create_phone_export_profile to propose replacement configuration for review.',
        inputSchema: z.object({
          deviceId: z.string().uuid(),
          eventId: z.string().min(1).max(2000),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ deviceId, eventId }) => {
        own(deviceId, subject);
        const stored = history.get(subject, eventId);
        if (!stored || stored.device !== deviceId || stored.event.kind !== 'export')
          throw new PairingError(404, 'Phone export history not found.');
        const phone = phones.get(deviceId);
        const profile = phone?.catalog.profiles.find((p) => p.id === stored.event.profile.id);
        return content({
          deviceId,
          online: Boolean(phone && phone.seen > Date.now() - 15000),
          configurationLastSeen: phone?.seen ?? null,
          event: stored.event,
          currentProfile: profile
            ? { ...profile, export: { ...profile.export, httpUrl: undefined } }
            : null,
          diagnostics: exportDiagnostics(
            stored.event,
            phone ? (profile ?? null) : undefined,
            phone?.catalog.domains ?? [],
          ),
        });
      },
    );
    mcp.registerTool(
      'create_phone_export_profile',
      {
        description:
          'Generate an explicit per-type export profile and a qrconnect deep link. Optionally send it to an owned connected phone for review (open myself.md within five minutes). Use selectableTypes (or availableTypes on older phones) from get_phone_data_catalog. Selectable types can require a user/OS permission handoff; only selected types in an approved profile are readable under domain grants. Empty domain lists disable that domain. Optional export settings pin a released schema (discover with list_export_schemas), JSON/JSONL, 1–30 days, safe date-based filename and Documents subfolder. Optional schedule describes daily/weekly/custom cadence and Today Refresh; it never enables scheduling on the phone. Does not grant access. The user reviews and saves on the phone, then separately approves agent access.',
        inputSchema: z.object({ profile: profileSchema, deviceId: z.string().uuid().optional() }),
      },
      async ({ profile, deviceId }) => {
        const draft = parseProfile({
          ...profile,
          export: { ...profile.export, schema: profile.export?.schema ?? defaultExportSchema },
        });
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
          'Check whether a generated profile was received for review on the phone. Delivered does not mean saved or granted. Pending deliveries expire after five minutes.',
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
          'Discover phone data types, profiles with agentAccess approval, explicit domain grants and collection limits before querying. Select an approved profile and intersect its selections with domain types. Online means a heartbeat within 15 seconds. Keep myself.md open. No tool can grant permissions.',
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
          catalog: p
            ? { ...p.catalog, diagnostics: phoneDebugState(deviceId, p).report ?? undefined }
            : null,
        });
      },
    );
    mcp.registerTool(
      'request_phone_profile_agent_access',
      {
        description:
          'Initiate a user approval handoff for an existing owned phone profile. Open the returned profile link on the phone and have the user set Allow agent access. This tool never changes consent. Verify the saved outcome with get_phone_data_catalog; an offline catalog may be stale.',
        inputSchema: z.object({
          deviceId: z.string().uuid(),
          profileId: z.string().min(1).max(100),
          enabled: z.boolean(),
        }),
      },
      async ({ deviceId, profileId, enabled }) => {
        own(deviceId, subject);
        const phone = phones.get(deviceId);
        if (!phone || phone.subject !== subject || phone.seen < Date.now() - 15000)
          throw new PairingError(409, 'Phone is offline. Open myself.md first.');
        const profile = phone.catalog.profiles.find((p) => p.id === profileId);
        if (!profile) throw new PairingError(404, 'Phone profile not found.');
        return content({
          deviceId,
          profileId,
          enabled,
          agentAccess: profile.agentAccess,
          status: profile.agentAccess === enabled ? 'completed' : 'awaiting_user',
          lastSeen: phone.seen,
          handoff:
            profile.agentAccess === enabled
              ? null
              : {
                  deepLink: `qrconnect://profiles/${encodeURIComponent(profileId)}`,
                  instruction: `On the phone, ${enabled ? 'enable' : 'disable'} Allow agent access for ${profile.name}${enabled ? ' and confirm Allow' : ''}.`,
                },
        });
      },
    );
    mcp.registerTool(
      'query_phone_data',
      {
        description:
          'Ask the connected phone to read one discovered data type in a UTC interval under any catalog profileId with agentAccess true. Read-only; phone-side consent required. Returns requestId, then poll get_phone_request. Records keep native units and metadata; sources differ. Use nextCursor for every page, and separate date windows for ranges over 31 days. Empty HealthKit results do not prove read authorization. Optional requestKey provides safe retries: reuse identical arguments to retrieve the original live job without another charge. Changed inputs, revoked grants and unavailable originals fail instead of re-dispatching. Keep keys unique; activity fingerprints are retained for 90 days.',
        inputSchema: querySchema,
        annotations: { readOnlyHint: true },
      },
      async (query) => {
        own(query.deviceId, subject);
        const phone = phones.get(query.deviceId);
        const domain = phone?.catalog.domains.find((d) => d.domain === query.domain);
        const requestHash = createHash('sha256')
          .update(JSON.stringify({ ...query, requestKey: undefined }))
          .digest('hex');
        const keyHash = query.requestKey
          ? createHash('sha256')
              .update(JSON.stringify([subject, client, query.requestKey]))
              .digest('hex')
          : null;
        const id = keyHash
          ? `${keyHash.slice(0, 8)}-${keyHash.slice(8, 12)}-4${keyHash.slice(13, 16)}-a${keyHash.slice(17, 20)}-${keyHash.slice(20, 32)}`
          : randomUUID();
        const stamp = new Date().toISOString();
        if (query.requestKey) {
          const previous = history.get(subject, id)?.event;
          if (previous) {
            if (previous.requestHash !== requestHash)
              throw new PairingError(
                409,
                'Idempotency key already used with different query arguments.',
              );
            if (
              !phone ||
              !catalogAllows(phone.catalog, query) ||
              !domain?.enabled ||
              !domain.types.includes(`${query.source}:${query.type}`)
            )
              throw new PairingError(403, 'Current phone data grants do not permit this retry.');
            const existing = jobs.get(id);
            if (!existing || existing.expires <= Date.now())
              throw new PairingError(
                410,
                'The original request is no longer available; it will not be dispatched again.',
              );
            return content({ requestId: id, status: existing.state, expiresAt: existing.expires });
          }
        }
        const profile = phone?.catalog.profiles.find((p) => p.id === query.profileId);
        history.record(subject, query.deviceId, {
          id,
          kind: 'access',
          ...(query.requestKey ? { requestHash } : {}),
          schema: query.schema,
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
          if (!catalogAllows(phone.catalog, query))
            throw new PairingError(
              403,
              'Choose an approved profile and a data type selected in that profile.',
            );
          if (!domain?.enabled || !domain.types.includes(`${query.source}:${query.type}`))
            throw new PairingError(403, 'Enable this domain and source permission on the phone.');
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
            error:
              'The request could not proceed. Check phone connectivity and access permissions.',
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
        if (job.state === 'complete')
          history.update(subject, requestId, {
            status: job.result?.page.complete === false ? 'partial' : 'complete',
          });
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
          if (!captured(subject, requestId) && job.state !== 'failed')
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
        }),
      )
      .max(50),
    nextCursor: z.string().max(16000).nullable(),
    warnings: z.array(z.string().max(1000)).max(20),
    capture: z.string().max(200),
    complete: z.boolean().optional(),
  });
  /** @param {string} path @param {string} method @param {string} subject @param {unknown} body */
  function phoneApi(path, method, subject, body) {
    const match = path.match(
      /^\/api\/phones\/([a-f0-9-]{36})\/(poll|result|feedback|diagnostics)$/,
    );
    if (!match) return undefined;
    if (method !== 'POST') throw new PairingError(405, 'POST required.');
    const deviceId = z.string().uuid().parse(match[1]);
    own(deviceId, subject);
    if (match[2] === 'diagnostics') return publishDebugReport(phones.get(deviceId), body);
    if (match[2] === 'feedback') {
      const input = z.object({ id: z.string().uuid() }).parse(body);
      return feedback.authorize(deviceId, subject, input.id);
    }
    if (match[2] === 'poll') {
      const catalog = catalogSchema.parse(body);
      catalog.diagnostics = latestDebugReport(
        phones.get(deviceId)?.catalog.diagnostics,
        catalog.diagnostics,
      );
      phones.set(deviceId, { deviceId, subject, seen: Date.now(), catalog });
      // Recheck consent every heartbeat, deleting retained data on revocation.
      for (const [id, j] of jobs)
        if (
          j.deviceId === deviceId &&
          (!catalogAllows(catalog, j.query) ||
            !catalog.domains.some(
              (d) =>
                d.domain === j.query.domain &&
                d.enabled &&
                d.types.includes(`${j.query.source}:${j.query.type}`),
            ))
        ) {
          if (!captured(subject, id) && j.state !== 'failed')
            history.update(subject, id, {
              status: 'cancelled',
              error: 'Phone access was revoked.',
            });
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
      if (job) {
        job.state = 'running';
        jobs.set(job.id, job);
      }
      const acknowledged = proposals.get(catalog.receivedProfileId);
      if (acknowledged?.subject === subject && acknowledged.deviceId === deviceId) {
        acknowledged.state = 'delivered';
        proposals.set(acknowledged.id, acknowledged);
      }
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
        feedback: feedback.poll(deviceId, subject, catalog.feedback, catalog.dispatch),
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
    if (!allowed || !catalogAllows(phones.get(deviceId)?.catalog, job.query))
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
      if (
        input.page.records.some((r) => r.domain !== job.query.domain || r.type !== job.query.type)
      )
        throw new PairingError(400, 'Response does not match the query.');
      billing.complete(subject, input.id);
      job.result = {
        schema: job.query.schema,
        format: job.query.format,
        page: input.page,
        export:
          job.query.format === 'json'
            ? null
            : exportPage(input.page, job.query.format, job.query.schema),
      };
      job.state = 'complete';
      history.update(subject, input.id, {
        status: input.page.complete === false ? 'partial' : 'ready',
        recordCount: input.page.records.length,
        warnings: [
          ...input.page.warnings,
          ...(input.page.nextCursor ? ['This returned page has more records available.'] : []),
        ],
      });
    } else throw new PairingError(400, 'Page or error required.');
    jobs.set(job.id, job);
    return { ok: true };
  }

  return { registerDataTools, phoneApi, cancelPhone, cancelAgent, cancelAccount, cleanup };
}
