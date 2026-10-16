import { exportSchemas, defaultExportSchema } from '../core/export-schemas.js';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { PairingError } from './errors.js';
import {
  parseProfile,
  profileLink,
  profileShareLink,
  agentProfileAllows,
  parseAgentPermissions,
} from '../core/profiles.js';
import { domains, exportPage } from '../core/data.js';
import { compatibleProfile } from '../core/profile-compatibility.js';
import { exportDiagnostics } from '../core/diagnostics.js';
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
  requestKey: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Caller-chosen retry key. Reuse with identical query arguments to retrieve the original live job without another allowance reservation; use a new key for new work.',
    ),
  deviceId: z
    .string()
    .uuid()
    .describe(
      'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
    ),
  profileId: z
    .string()
    .min(1)
    .max(100)
    .describe(
      'Stable profile ID returned by get_phone_data_catalog. Resolve user-provided names from catalog.profiles first; ask when names are ambiguous. Query access requires the relevant individual data permission.',
    ),
  domain: domainSchema.describe(
    'Data domain from get_phone_data_catalog. The chosen profile and phone-wide grant must both permit it.',
  ),
  type: z
    .string()
    .min(1)
    .max(160)
    .describe(
      'Exact native type identifier from the selected catalog domain, without the native: prefix. Do not invent type names.',
    ),
  source: z
    .literal('native')
    .default('native')
    .describe(
      "Capture adapter; native reads data through the phone's operating-system APIs under existing OS permissions.",
    ),
  start: z.iso
    .datetime()
    .describe(
      'Inclusive start of the query interval as a UTC ISO 8601 timestamp. The positive interval must be at most 31 days.',
    ),
  end: z.iso
    .datetime()
    .describe(
      'End of the query interval as a UTC ISO 8601 timestamp, later than start and no more than 31 days after it.',
    ),
  cursor: z
    .string()
    .max(16000)
    .default('')
    .describe(
      'Pagination cursor returned by the preceding response. Omit for the first page; preserve the other query arguments when continuing.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(50)
    .describe(
      'Maximum records in this page, up to 50. Follow the returned nextCursor to continue.',
    ),
  format: z
    .enum(['json', 'jsonl'])
    .default('json')
    .describe(
      'Response serialization format; JSON returns structured records and JSONL returns one serialized record per line.',
    ),
  schema: exportSchema
    .default(defaultExportSchema)
    .describe(
      'Export schema version from list_export_schemas; omit to use the released default version.',
    ),
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
  schema: z
    .literal('myself.md.profile.v1')
    .describe('Profile document version. Use the literal myself.md.profile.v1.'),
  name: z
    .string()
    .min(1)
    .max(80)
    .describe(
      'Human-readable profile name shown to the phone owner when reviewing the proposed configuration.',
    ),
  export: z
    .object({
      schema: exportSchema
        .optional()
        .describe(
          'Export schema version from list_export_schemas; omit to use the released default version.',
        ),
      formats: z
        .array(z.enum(['json', 'jsonl']))
        .min(1)
        .max(2)
        .describe(
          'Requested file formats for local and HTTPS destinations; choose JSON, JSONL or both. Cloud destinations always store one JSONL file per day.',
        ),
      lookbackDays: z
        .number()
        .int()
        .min(1)
        .max(30)
        .describe('Number of completed days to include in scheduled exports, from 1 to 30.'),
      includeToday: z
        .boolean()
        .describe('Whether the proposed export includes the current incomplete day.'),
      localFolderId: z
        .string()
        .regex(/^[a-zA-Z0-9-]{1,100}$/)
        .optional()
        .describe(
          'Device-local folder handle selected by the owner. Cannot grant file access; imported or foreign handles require the native folder picker.',
        ),
      folderName: z
        .string()
        .max(64)
        .describe(
          'Proposed export folder name; the phone validates and applies it only after owner save.',
        ),
      filenameTemplate: z
        .string()
        .max(100)
        .describe("Filename template for exported files; use the app's supported template syntax."),
      writeMode: z
        .enum(['replace', 'append', 'new_file', 'skip'])
        .optional()
        .describe(
          'Local file conflict behavior: replace (default), append records, create a numbered new file, or skip existing files. Remote destinations ignore this setting. Appending may duplicate records. Requires owner review and save.',
        ),
      formatFolders: z
        .boolean()
        .describe('Whether to separate JSON and JSONL files into format-specific folders.'),
      destination: z
        .enum(['local', 'http', 'cloud'])
        .optional()
        .describe(
          'Proposed export destination: local files, HTTP upload or myself.md cloud. Existing eligibility and owner approval still apply.',
        ),
      httpUrl: z
        .string()
        .nullable()
        .optional()
        .describe(
          'Owner-reviewed HTTP export destination, or null when no URL is configured. Never include credentials in this value.',
        ),
    })
    .partial()
    .optional()
    .describe(
      'Optional export settings proposed for owner review. These settings do not grant uploads, sharing or purchase access.',
    ),
  schedule: z
    .object({
      frequency: z
        .enum(['daily', 'weekly', 'custom'])
        .describe(
          'Daily, weekly or custom cadence; custom supports minutes, hours, days, weeks and months.',
        ),
      interval: z
        .number()
        .int()
        .min(1)
        .max(365)
        .describe(
          'Positive number of selected units between custom exports, 1–365; minimum one minute.',
        ),
      unit: z
        .enum(['minute', 'hour', 'day', 'week', 'month'])
        .describe(
          'Minute/hour intervals refresh today while open (background is best effort); day/week/month intervals export completed days.',
        ),
      anchorDate: z
        .string()
        .nullable()
        .describe(
          'Calendar schedule anchor in YYYY-MM-DD form. Minute/hour schedules start at opt-in and ignore this date.',
        ),
      hour: z
        .number()
        .int()
        .min(0)
        .max(23)
        .describe('Phone-local hour of day, from 0 to 23, for scheduled export execution.'),
      minute: z
        .number()
        .int()
        .min(0)
        .max(59)
        .describe('Phone-local minute within the scheduled hour, from 0 to 59.'),
      weekday: z
        .number()
        .int()
        .min(1)
        .max(7)
        .describe("Weekly schedule day using the app's 1-to-7 weekday convention."),
      todayRefresh: z
        .boolean()
        .describe('Whether to request periodic refresh of the incomplete current day.'),
      refreshHours: z
        .union([z.literal(3), z.literal(6), z.literal(12)])
        .describe('Hours between current-day refresh attempts: 3, 6 or 12.'),
    })
    .optional()
    .describe(
      'Proposed phone-local export schedule; it takes effect only after the owner reviews and saves it.',
    ),
  selection: z
    .object({
      health: z
        .array(z.string())
        .max(300)
        .describe(
          'Health data type keys selected from the phone catalog; an empty array selects none.',
        ),
      time: z
        .array(z.string())
        .max(300)
        .describe(
          'Screen-time data type keys selected from the phone catalog; an empty array selects none.',
        ),
      location: z
        .array(z.string())
        .max(300)
        .describe(
          'Recorded-location data type keys selected from the phone catalog; an empty array selects none.',
        ),
    })
    .describe(
      'Exact native:TYPE keys from the phone catalog, grouped by domain. Empty arrays select no data; selections do not grant agent or OS access.',
    ),
});
const catalogSchema = z.object({
  locationTracking: z.boolean().optional(),
  diagnostics: debugReportSchema.optional(),
  dispatch: z.boolean().default(true),
  profiles: z
    .array(
      profileSchema.extend({
        id: z.string().min(1).max(100),
        localExportFolder: z
          .object({
            status: z.enum(['default', 'selected', 'needs_selection']),
            name: z.string().max(255),
            requiresUser: z.literal(true),
            deepLink: z.string().max(500),
            instructions: z.string().max(1000),
          })
          .optional(),
        agentAccess: z.boolean().default(false),
        agentPermissions: z
          .object({
            health: z.boolean(),
            time: z.boolean(),
            location: z.boolean(),
            logs: z.boolean(),
          })
          .strict()
          .default({ health: true, time: true, location: true, logs: true }),
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
          .regex(/^myselfmd:\/\/(?:data\/(?:health|time|location)|profiles(?:\/[^/?#]+)?)$/)
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
    profile && {
      ...parseProfile(profile),
      id: profile.id,
      agentAccess: profile.agentAccess,
      agentPermissions: profile.agentPermissions,
    },
    query,
  );
}
/** @param {{billing:import('./billing-store.js').BillingStore,refreshEntitlement:(subject:string)=>Promise<void>,devices:(subject:string)=>ReturnType<import('./pairing-store.js').PairingStore['devices']>,history:import('./history-store.js').HistoryStore,phones?:Map<string,Phone>,jobs?:Map<string,Job>,proposals?:Map<string,Proposal>}} dependencies */
export function createDataService({
  billing,
  refreshEntitlement,
  devices,
  history,
  phones = new Map(),
  jobs = new Map(),
  proposals = new Map(),
}) {
  /** Completed capture outcomes survive payload expiry and grant revocation.
   * @param {string} subject @param {string} id */
  function captured(subject, id) {
    return ['complete', 'partial'].includes(history.get(subject, id)?.event.status ?? '');
  }
  // Query payloads are never persisted. A restarted server requires a fresh phone heartbeat.
  function cleanup() {
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
    for (const [id, job] of jobs) {
      if (job.subject === subject && job.client === client) {
        if (!captured(subject, id) && job.state !== 'failed')
          history.update(subject, id, { status: 'cancelled', error: 'Agent access was revoked.' });
        billing.release(job.subject, id);
        jobs.delete(id);
      }
    }
  }
  /** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject @param {string|null} [client] @param {{chatgpt?:boolean}} [options] */
  function registerDataTools(mcp, subject, client = null, { chatgpt = false } = {}) {
    registerDebugTools(mcp, subject, own, phones);
    mcp.registerTool(
      'list_phone_logs',
      {
        title: 'Browse phone logs',
        description:
          'Browse owned-phone app, export and agent logs. Merges a page of 50 export/agent history entries with up to 300 retained internal app events. App events require owner-approved Logs access in an enabled profile, a consented phone report, and a heartbeat within 15 seconds; history retains its existing ownership rules. historyOffset paginates the history source before category/profile filtering; follow nextHistoryOffset even for empty filtered pages. App entries repeat across pages; deduplicate by id. Use query for a case-insensitive literal search of authorized JSON metadata. Use selectedIds to select up to 350 unique IDs from the current page; unavailableIds identifies missing or inaccessible selections without widening grants. JSONL returns the same authorized projection. Repeated reads poll the latest heartbeat/history snapshot; deduplicate by id and replace updated history entries. This is polling, not a push subscription. Offline history may be stale. Raw error messages may contain sensitive information. Does not consume export allowance.',
        inputSchema: z
          .object({
            deviceId: z
              .string()
              .uuid()
              .describe(
                'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
              ),
            historyOffset: z
              .number()
              .int()
              .min(0)
              .max(Number.MAX_SAFE_INTEGER)
              .default(0)
              .describe(
                "Zero-based offset for saved history pagination. Use the response's continuation metadata; omit for the first page.",
              ),
            category: z
              .enum(['all', 'app', 'exports', 'agents'])
              .default('all')
              .describe(
                'Log category to include: all events, app events, exports or agent activity.',
              ),
            issues: z
              .boolean()
              .default(false)
              .describe('If true, return only log entries classified as issues.'),
            query: z
              .string()
              .max(200)
              .optional()
              .describe(
                'Optional text to search within the permitted log entries, up to 200 characters.',
              ),
            format: z
              .enum(['structured', 'jsonl'])
              .default('structured')
              .describe('Return structured log entries or their permitted JSONL serialization.'),
            profileId: z
              .string()
              .min(1)
              .max(100)
              .optional()
              .describe(
                'Stable profile ID returned by get_phone_data_catalog. Resolve user-provided names from catalog.profiles first; ask when names are ambiguous. Query access requires the relevant individual data permission.',
              ),
            selectedIds: z
              .array(z.string().min(1).max(1000))
              .max(350)
              .refine((ids) => new Set(ids).size === ids.length)
              .optional()
              .describe(
                'Optional unique log IDs returned by a prior logs read, restricting the result to those entries.',
              ),
          })
          .strict(),
        annotations: {
          title: 'Browse phone logs',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({
        deviceId,
        historyOffset,
        category,
        issues,
        query,
        profileId,
        format,
        selectedIds,
      }) => {
        own(deviceId, subject);
        const page = history.list(subject, deviceId, historyOffset);
        const diagnostics = phoneDebugState(deviceId, phones.get(deviceId), 'all', profileId);
        const entries = logs(page.events, diagnostics.report?.entries ?? [], Date.now(), {
          category,
          issues,
          query,
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
        title: 'List export schemas',
        description:
          'Discover released export contracts, the recommended version, JSON Schema definitions, JSONL record definitions, examples and changes. Profiles pin an explicit version; new releases never upgrade saved profiles. Does not read personal data.',
        inputSchema: z.object({}),
        annotations: {
          title: 'List export schemas',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => content(exportSchemas()),
    );
    mcp.registerTool(
      'list_phone_export_history',
      {
        title: 'List phone export history',
        description:
          'List saved phone export and agent access metadata for an owned phone, newest first, in pages of 50. Includes failed, partial and interrupted exports. Open myself.md to sync recent phone history; offline results may be stale. No data records or local file paths are returned.',
        inputSchema: z.object({
          deviceId: z
            .string()
            .uuid()
            .describe(
              'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
            ),
          offset: z
            .number()
            .int()
            .min(0)
            .default(0)
            .describe(
              'Zero-based offset into export history; omit for the newest page and continue using the returned pagination state.',
            ),
        }),
        annotations: {
          title: 'List phone export history',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ deviceId, offset }) => {
        own(deviceId, subject);
        return content(history.list(subject, deviceId, offset));
      },
    );
    mcp.registerTool(
      'diagnose_phone_export',
      {
        title: 'Diagnose phone export',
        description:
          'Inspect one saved export failure, partial result or interruption, compare its snapshot with the latest phone configuration, and return deep links to review the existing profile and source permissions on the phone. Start with list_phone_export_history. Current configuration is evidence, not a confirmed cause. Links navigate only; the user reviews and saves fixes in myself.md. Use create_phone_export_profile to propose replacement configuration for review.',
        inputSchema: z.object({
          deviceId: z
            .string()
            .uuid()
            .describe(
              'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
            ),
          eventId: z
            .string()
            .min(1)
            .max(2000)
            .describe(
              'Export event ID returned by list_phone_export_history for the same owned phone.',
            ),
        }),
        annotations: {
          title: 'Diagnose phone export',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
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
      'preview_phone_profile_import',
      {
        title: 'Preview profile import',
        description:
          'Preview a profile import on an owned online phone. Automatically match explicit equivalent data types against its current selectable catalog and report unsupported selections excluded from the proposed profile. No save, permission grant or schedule opt-in occurs. Use create_phone_export_profile to send the original profile for the same review on the phone.',
        inputSchema: z.object({
          profile: profileSchema.describe(
            'Proposed versioned profile configuration. Preview compatibility first; delivery and deep links still require the phone owner to save it.',
          ),
          deviceId: z
            .string()
            .uuid()
            .describe(
              'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
            ),
        }),
        annotations: {
          title: 'Preview profile import',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ profile, deviceId }) => {
        own(deviceId, subject);
        const phone = phones.get(deviceId);
        if (!phone || phone.subject !== subject || phone.seen < Date.now() - 15000)
          throw new PairingError(409, 'Phone is offline. Open myself.md first.');
        if (phone.catalog.domains.some((d) => !d.selectableTypes))
          throw new PairingError(409, 'Update the phone catalog before reviewing this import.');
        const types = /** @type {Record<import('../core/data.js').Domain,string[]>} */ (
          Object.fromEntries(phone.catalog.domains.map((d) => [d.domain, d.selectableTypes]))
        );
        return content({ deviceId, ...compatibleProfile(profile, types), requiresUserSave: true });
      },
    );
    mcp.registerTool(
      'create_phone_export_profile',
      {
        title: 'Propose phone export profile',
        annotations: {
          title: 'Propose phone export profile',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
        description:
          'Generate an explicit per-type export profile, a native deepLink and an email-compatible HTTPS shareLink. Optionally send it to an owned connected phone for review (open myself.md within five minutes). Use selectableTypes (or availableTypes on older phones) from get_phone_data_catalog. Selectable types can require a user/OS permission handoff; only selected types in an approved profile are readable under profile permissions. Empty domain lists disable that domain. Optional export settings pin a released schema (discover with list_export_schemas), JSON/JSONL, 1–30 days, safe date-based filename and Documents subfolder. Optional schedule describes daily/weekly/custom cadence and Today Refresh; it never enables scheduling on the phone. Does not grant access. The user reviews and saves on the phone, then separately approves agent access.',
        inputSchema: z.object({
          profile: profileSchema.describe(
            'Proposed versioned profile configuration. Preview compatibility first; delivery and deep links still require the phone owner to save it.',
          ),
          deviceId: z
            .string()
            .uuid()
            .optional()
            .describe(
              'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
            ),
        }),
      },
      async ({ profile, deviceId }) => {
        const draft = parseProfile({
          ...profile,
          export: { ...profile.export, schema: profile.export?.schema ?? defaultExportSchema },
        });
        const deepLink = profileLink(draft);
        const shareLink = profileShareLink(draft);
        if (!deviceId) return content({ profile: draft, deepLink, shareLink, delivery: null });
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
          shareLink,
          delivery: { id, status: 'queued', expiresAt: expires },
        });
      },
    );
    mcp.registerTool(
      'get_phone_profile_delivery',
      {
        title: 'Check profile delivery',
        description:
          'Check whether a generated profile was received for review on the phone. Delivered does not mean saved or granted. Pending deliveries expire after five minutes.',
        inputSchema: z.object({
          deliveryId: z
            .string()
            .uuid()
            .describe(
              'Delivery UUID returned by create_phone_export_profile. Poll this ID to distinguish queued and owner-reviewed outcomes before expiry.',
            ),
        }),
        annotations: {
          title: 'Check profile delivery',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
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
        title: 'Discover approved phone data',
        description:
          'Discover phone data types, profiles with independent agentPermissions (agentAccess is a compatibility summary), profile-derived source availability and collection limits before querying. Select an approved profile and intersect its selections with domain types. When the user refers to a profile by name, match that name against catalog.profiles[].name and use the corresponding stable id for subsequent tools. Names can change and are not unique: refresh the catalog for each new name reference; if multiple profiles match, ask the user to disambiguate, and if none match, report that instead of guessing an ID. Online means a heartbeat within 15 seconds; offline catalogs may be stale. Keep myself.md open. No tool can grant permissions.',
        inputSchema: z.object({
          deviceId: z
            .string()
            .uuid()
            .describe(
              'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
            ),
        }),
        annotations: {
          title: 'Discover approved phone data',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ deviceId }) => {
        own(deviceId, subject);
        const p = phones.get(deviceId);
        return content({
          deviceId,
          online: Boolean(p && p.seen > Date.now() - 15000),
          lastSeen: p?.seen ?? null,
          catalog: p
            ? chatgpt
              ? {
                  domains: p.catalog.domains,
                  locationTracking: p.catalog.locationTracking,
                  profiles: p.catalog.profiles.map(
                    ({
                      id,
                      name,
                      selection,
                      agentAccess,
                      agentPermissions,
                      localExportFolder,
                      export: settings,
                    }) => ({
                      id,
                      name,
                      selection,
                      agentAccess,
                      agentPermissions,
                      localExportFolder,
                      export: { writeMode: settings?.writeMode ?? 'replace' },
                    }),
                  ),
                }
              : { ...p.catalog, diagnostics: phoneDebugState(deviceId, p).report ?? undefined }
            : null,
        });
      },
    );
    mcp.registerTool(
      'request_phone_profile_agent_access',
      {
        title: 'Review profile agent access',
        annotations: {
          title: 'Review profile agent access',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        description:
          'Initiate a user approval handoff for an existing owned phone profile. Open the returned profile link on the phone and have the user review individual Agent permissions. There is no master switch; enabled requests at least one permission, disabled requests all permissions off. This tool never changes consent. Verify the saved outcome with get_phone_data_catalog; an offline catalog may be stale.',
        inputSchema: z.object({
          deviceId: z
            .string()
            .uuid()
            .describe(
              'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
            ),
          profileId: z
            .string()
            .min(1)
            .max(100)
            .describe(
              'Stable profile ID returned by get_phone_data_catalog. Resolve user-provided names from catalog.profiles first; ask when names are ambiguous. Query access requires the relevant individual data permission.',
            ),
          enabled: z
            .boolean()
            .describe(
              "Requested enabled state. This initiates the tool's owner approval flow; it cannot grant consent by itself.",
            ),
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
                  deepLink: `myselfmd://profiles/${encodeURIComponent(profileId)}?section=agent-permissions`,
                  instruction: `On the phone, ${enabled ? 'enable the needed individual permissions and confirm each Allow' : 'turn off every individual permission'} in Agent permissions for ${profile.name}.`,
                },
        });
      },
    );
    mcp.registerTool(
      'request_phone_profile_permissions',
      {
        title: 'Review profile data permissions',
        annotations: {
          title: 'Review profile data permissions',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        description:
          'Request owner review of independent Health, Screen time, Location and Logs permissions for an existing phone profile. Never changes consent. The owner uses Profile → Agent permissions; verify via a fresh get_phone_data_catalog. Export selections and OS access remain separate; Logs approval includes diagnostics consent.',
        inputSchema: z
          .object({
            deviceId: z
              .string()
              .uuid()
              .describe(
                'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
              ),
            profileId: z
              .string()
              .min(1)
              .max(100)
              .describe(
                'Stable profile ID returned by get_phone_data_catalog. Resolve user-provided names from catalog.profiles first; ask when names are ambiguous. Query access requires the relevant individual data permission.',
              ),
            permissions: z
              .object({
                health: z
                  .boolean()
                  .describe(
                    'Requested health agent permission. Owner confirmation, profile selections and OS permissions remain required.',
                  ),
                time: z
                  .boolean()
                  .describe(
                    'Requested time agent permission. Owner confirmation, profile selections and OS permissions remain required.',
                  ),
                location: z
                  .boolean()
                  .describe(
                    'Requested location agent permission. Owner confirmation, profile selections and OS permissions remain required.',
                  ),
                logs: z
                  .boolean()
                  .describe(
                    'Requested permission for agent access to app logs; the owner must approve it on the phone.',
                  ),
              })
              .strict()
              .describe(
                'Requested independent per-domain agent permissions. The phone owner must confirm changes; existing selections and OS permissions remain separate.',
              ),
          })
          .strict(),
      },
      async ({ deviceId, profileId, permissions }) => {
        own(deviceId, subject);
        const phone = phones.get(deviceId);
        if (!phone || phone.subject !== subject || phone.seen < Date.now() - 15000)
          throw new PairingError(409, 'Phone is offline. Open myself.md first.');
        const profile = phone.catalog.profiles.find((p) => p.id === profileId);
        if (!profile) throw new PairingError(404, 'Phone profile not found.');
        const current = parseAgentPermissions(profile.agentPermissions);
        const completed = Object.keys(current).every(
          (key) =>
            current[/** @type {keyof typeof current} */ (key)] ===
            permissions[/** @type {keyof typeof current} */ (key)],
        );
        return content({
          deviceId,
          profileId,
          permissions: current,
          requestedPermissions: permissions,
          agentAccess: profile.agentAccess,
          lastSeen: phone.seen,
          status: completed ? 'completed' : 'awaiting_user',
          handoff: completed
            ? null
            : {
                deepLink: `myselfmd://profiles/${encodeURIComponent(profileId)}?section=agent-permissions`,
                instruction:
                  'Review Agent permissions on this profile and confirm each new access. Re-read the catalog to verify the saved state.',
              },
        });
      },
    );
    mcp.registerTool(
      'query_phone_data',
      {
        title: 'Queue approved phone query',
        description:
          'Queue a read of one discovered data type on an owned phone in a UTC interval under a profileId with the relevant individual permission enabled. Creates a job and activity entry and reserves an export/query allowance; successful capture consumes that allowance. Does not modify native source records. Phone-side consent is required. Returns requestId for get_phone_request. Records keep native units and metadata; sources differ. nextCursor paginates each page; ranges are limited to 31 days. Empty HealthKit results do not prove read authorization. Optional requestKey provides safe retries: identical arguments retrieve the original live job without another charge. Without a requestKey, repeated calls create separate jobs. Changed inputs, revoked grants and unavailable originals fail instead of re-dispatching. Activity fingerprints are retained for 90 days.',
        inputSchema: querySchema,
        annotations: {
          title: 'Queue approved phone query',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
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
            throw new PairingError(
              403,
              'Enable this source in an approved profile and review its system permission on the phone.',
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
        title: 'Read phone query result',
        description:
          'Retrieve a live phone query/export page. Poll while queued/running; stop on failed or expired. Complete results include source fields, capture warnings, and a nextCursor. Never interpret a partial/permission-limited page as all phone data.',
        inputSchema: z.object({
          requestId: z
            .string()
            .uuid()
            .describe(
              'Existing request ID returned by the corresponding initiating operation; do not create a new ID when polling or retrying it.',
            ),
        }),
        annotations: {
          title: 'Read phone query result',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
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
          error:
            chatgpt && job.error
              ? 'Phone capture failed. Review the failure on your device.'
              : (job.error ?? null),
        });
      },
    );
    mcp.registerTool(
      'forget_phone_request',
      {
        title: 'Discard phone query',
        annotations: {
          title: 'Discard phone query',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
        description:
          'Discard an owned live query and its response from server memory. Pending work is cancelled and its allowance reservation released; completed capture remains in activity history. Does not delete native phone records or stored cloud exports. Repeating the same requestId does not create work.',
        inputSchema: z.object({
          requestId: z
            .string()
            .uuid()
            .describe(
              'Existing request ID returned by the corresponding initiating operation; do not create a new ID when polling or retrying it.',
            ),
        }),
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
    const match = path.match(/^\/api\/phones\/([a-f0-9-]{36})\/(poll|result|diagnostics)$/);
    if (!match) return undefined;
    if (method !== 'POST') throw new PairingError(405, 'POST required.');
    const deviceId = z.string().uuid().parse(match[1]);
    own(deviceId, subject);
    if (match[2] === 'diagnostics') return publishDebugReport(phones.get(deviceId), body);
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
