import { boundedWait, waitMsInput } from './bounded-wait.js';
import { createPhoneExports, phoneExportInput } from './phone-export.js';
import { createWhoopRequests, whoopRequestInput } from './whoop-requests.js';
import { exportSchemas, defaultExportSchema } from '../core/export-schemas.js';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { PairingError } from './errors.js';
import {
  parseProfile,
  parseProfileState,
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
import { createLocationCaptures, locationCaptureInput } from './location-capture.js';
const ttl = 300000;
const domainSchema = z.enum(domains);
const exportSchema = z.enum(exportSchemas().versions.map((version) => version.id));
const queryFields = {
  waitMs: waitMsInput,
  aggregation: z
    .object({
      operation: z
        .enum(['count', 'sum', 'avg', 'min', 'max'])
        .describe(
          'Aggregate native records; count counts records, avg is an unweighted arithmetic mean.',
        ),
      field: z
        .string()
        .regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/)
        .max(160)
        .optional()
        .describe(
          'Explicit scalar numeric path inside native, such as quantity or energy.inKilocalories; required except for count. Nested series are not flattened.',
        ),
      unitField: z
        .string()
        .regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/)
        .max(160)
        .optional()
        .describe(
          'Native unit path; defaults to unit. Different units and record sources form separate buckets; missing units remain null.',
        ),
      groupBy: z
        .enum(['day', 'interval'])
        .default('day')
        .describe(
          'UTC day buckets, or one interval of at most 31 days. Buckets use record start, without proration or deduplication.',
        ),
    })
    .strict()
    .optional()
    .describe(
      'Optional bounded scalar aggregation instead of raw records. A page covers at most 31 days and 50 source/unit buckets, scanning at most 10000 records/200 source pages. Limits or partial capture fail without partial totals. Follow nextCursor for remaining days.',
    ),
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
      'Phone capture adapter; native includes OS APIs and explicitly selected WHOOP types under separate provider consent. Returned records identify the actual source.',
    ),
  start: z.iso
    .datetime()
    .describe(
      'Inclusive start of the query interval as a UTC ISO 8601 timestamp. Long intervals are paginated in bounded provider windows.',
    ),
  end: z.iso
    .datetime()
    .describe('End of the query interval as a UTC ISO 8601 timestamp, later than start.'),
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
      'Raw record limit up to 50; for daily aggregation, maximum UTC days scanned (capped at 31), with up to 50 source/unit buckets. Follow nextCursor.',
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
      Date.parse(q.end) - Date.parse(q.start) <= 100000 * 86400000,
    { message: 'Use a positive interval within the supported calendar range.' },
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
          'Requested file formats for local and HTTPS destinations; choose JSON, JSONL or both. Cloud destinations store JSONL grouped by day, using the selected writeMode.',
        ),
      lookbackDays: z
        .number()
        .int()
        .min(1)
        .max(30)
        .describe('Number of completed days to include in scheduled exports, from 1 to 30.'),
      includeToday: z
        .boolean()
        .describe(
          'Whether manual and calendar-scheduled exports include the current incomplete day. Minute/hour intervals always export today.',
        ),
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
          'Local and Cloud file behavior: replace (default), append records, create a new file, or skip. Cloud append/replace targets the latest snapshot for the same profile, day and schema; older snapshots remain. HTTPS endpoints control their own storage behavior. Appending may duplicate records. Requires owner review and save.',
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
        .number()
        .int()
        .min(1)
        .max(24)
        .describe('Hours between current-day refresh attempts, from 1 to 24.'),
      dailyTimes: z
        .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
        .max(1440)
        .optional()
        .describe(
          'Daily local times as HH:mm. When nonempty, replaces hour/minute for daily schedules. Duplicate times run once; missed times coalesce to the latest. Include today in export settings to capture current-day data at each run.',
        ),
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
  whoop: z
    .object({
      provider: z.literal('whoop'),
      error: z.literal('secure_storage_unavailable').optional(),
      connected: z.boolean(),
      scopes: z.array(z.string().max(100)).max(10),
      handoff: z.literal('myselfmd://whoop'),
      instructions: z.string().max(1000),
    })
    .strict()
    .optional(),
  profileSync: z.object({ base: z.unknown().nullable() }).optional(),
  locationTracking: z.boolean().optional(),
  dataQuery: z
    .object({ version: z.literal(1), aggregation: z.literal(1).optional() })
    .strict()
    .optional(),
  dataExport: z
    .object({ version: z.literal(1) })
    .strict()
    .optional(),
  locationCapture: z
    .object({ version: z.literal(1) })
    .strict()
    .optional(),
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
/** @typedef {Omit<z.infer<typeof querySchema>,'waitMs'>} Query */
/** @typedef {{subject:string,deviceId:string,seen:number,catalog:z.infer<typeof catalogSchema>}} Phone */
/** @typedef {{id:string,subject:string,deviceId:string,expires:number,client:string|null,state:'queued'|'running'|'complete'|'failed',query:Query,result?:{schema:import('../core/export-schemas.js').ExportSchema,format:Query['format'],page:import('../core/data.js').DataPage,export:string|null},error?:string}} Job */
/** @typedef {{id:string,subject:string,deviceId:string,profile:import('../core/profiles.js').ProfileDraft,expires:number,state:'queued'|'delivered'}} Proposal */
/** @param {z.infer<typeof catalogSchema>|undefined} catalog @param {Query} query */
function phoneCatalogAllows(catalog, query) {
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
/** @param {{cloud:Pick<import('./cloud-store.js').CloudStore,'syncAgentPermissions'> & Partial<Pick<import('./cloud-store.js').CloudStore,'profileSync'|'observeAgent'>>,billing:import('./billing-store.js').BillingStore,refreshEntitlement:(subject:string)=>Promise<void>,devices:(subject:string)=>ReturnType<import('./pairing-store.js').PairingStore['devices']>,history:import('./history-store.js').HistoryStore,phones?:Map<string,Phone>,jobs?:Map<string,Job>,proposals?:Map<string,Proposal>,whoopRequests?:Map<string,import('./whoop-requests.js').WhoopRequest>,captures?:Map<string,import('./location-capture.js').LocationCapture>,phoneExports?:Map<string,import('./phone-export.js').PhoneExport>}} dependencies */
export function createDataService({
  cloud,
  billing,
  refreshEntitlement,
  devices,
  history,
  phones = new Map(),
  jobs = new Map(),
  proposals = new Map(),
  captures = new Map(),
  whoopRequests = new Map(),
  phoneExports = new Map(),
}) {
  const whoopOperations = createWhoopRequests({
    requests: whoopRequests,
    own,
    phone: (deviceId) => phones.get(deviceId),
    authorize: (subject, client) => {
      if (client) cloud.observeAgent?.(subject, client);
    },
  });
  const locationCaptures = createLocationCaptures({
    captures,
    own,
    phone: (deviceId) => phones.get(deviceId),
    authorize: (subject, client) => {
      if (client) cloud.observeAgent?.(subject, client);
    },
  });
  const phoneExportOperations = createPhoneExports({
    requests: phoneExports,
    own,
    phone: (deviceId) => phones.get(deviceId),
    authorize: (subject, client) => {
      if (client) cloud.observeAgent?.(subject, client);
    },
  });

  /** @param {string} subject @param {string|null} client @param {string} requestId @param {boolean} chatgpt */
  function queryResult(subject, client, requestId, chatgpt) {
    const job = jobs.get(requestId);
    if (!job || job.subject !== subject || job.expires <= Date.now())
      throw new PairingError(404, 'Request expired or not found.');
    own(job.deviceId, subject);
    if (client) cloud.observeAgent?.(subject, client);
    if (job.client !== client) throw new PairingError(404, 'Request expired or not found.');
    if (!queryAllowed(job.query)) {
      revokeQueries(subject, job.deviceId);
      throw new PairingError(404, 'Request expired or not found.');
    }
    if (job.state === 'complete')
      history.update(subject, requestId, {
        status: job.result?.page.complete === false ? 'partial' : 'complete',
      });
    return {
      requestId,
      status: job.state,
      expiresAt: job.expires,
      result: job.result ?? null,
      error:
        chatgpt && job.error
          ? 'Phone capture failed. Review the failure on your device.'
          : (job.error ?? null),
    };
  }
  /** Completed capture outcomes survive payload expiry and grant revocation.
   * @param {string} subject @param {string} id */
  function captured(subject, id) {
    return ['complete', 'partial'].includes(history.get(subject, id)?.event.status ?? '');
  }
  /** @param {z.infer<typeof catalogSchema>|undefined} catalog @param {Query} query */
  function catalogAllows(catalog, query) {
    const snapshot = cloud.profileSync?.get(subjectForPhone(query.deviceId), query.deviceId);
    const profile = snapshot?.state.profiles.find((p) => p.id === query.profileId);
    return phoneCatalogAllows(catalog, query) && (!snapshot || agentProfileAllows(profile, query));
  }
  /** @param {Query} query */
  function queryAllowed(query) {
    const catalog = phones.get(query.deviceId)?.catalog;
    return (
      catalogAllows(catalog, query) &&
      catalog?.domains.some(
        (domain) =>
          domain.domain === query.domain &&
          domain.enabled &&
          domain.types.includes(`${query.source}:${query.type}`),
      ) === true
    );
  }
  /** Erase denied queued work and retained payloads before a phone acknowledges an owner edit.
   * @param {string} subject @param {string} deviceId */
  function revokeQueries(subject, deviceId) {
    for (const [id, job] of jobs)
      if (job.subject === subject && job.deviceId === deviceId && !queryAllowed(job.query)) {
        if (!captured(subject, id) && job.state !== 'failed')
          history.update(subject, id, { status: 'cancelled', error: 'Phone access was revoked.' });
        billing.release(subject, id);
        jobs.delete(id);
      }
  }
  /** @param {string} deviceId */
  function subjectForPhone(deviceId) {
    return phones.get(deviceId)?.subject ?? '';
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
    whoopOperations.cancel(subject, deviceId);
    locationCaptures.cancel(subject, deviceId);
    phoneExportOperations.cancel(subject, deviceId);
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
    whoopOperations.cancel(subject);
    locationCaptures.cancel(subject);
    phoneExportOperations.cancel(subject);
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
    whoopOperations.cancel(subject, undefined, client);
    locationCaptures.cancel(subject, undefined, client);
    phoneExportOperations.cancel(subject, undefined, client);
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
      'manage_phone_whoop',
      {
        title: 'Manage phone WHOOP connection',
        description:
          'Request owner-reviewed WHOOP connect/disconnect, inspect status or cancel before execution. Use an owned online phone, operation and caller-chosen UUID; reuse identical arguments for safe retries. WHOOP authentication/consent occur on the phone. Completion requires the phone effect; no selections or agent grants change. get_phone_data_catalog exposes current connection/scopes. Failed/interrupted requests require checking phone status before new work.',
        inputSchema: whoopRequestInput,
        annotations: {
          title: 'Manage phone WHOOP connection',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (input) => {
        whoopOperations.tool(subject, client, input);
        return content(
          await boundedWait(
            () => {
              own(input.deviceId, subject);
              if (client) cloud.observeAgent?.(subject, client);
              return whoopOperations.tool(subject, client, { ...input, action: 'status' });
            },
            input.action === 'cancel' ? 0 : input.waitMs,
          ),
        );
      },
    );
    mcp.registerTool(
      'export_phone_data',
      {
        title: 'Export phone data',
        description:
          'Request, inspect or cancel a file export from a saved profile without per-request phone approval. Choose domains and date bounds; null bounds use earliest readable history and the current time. Uses saved formats, destination and file behavior with shared billing/history. Requires a compatible online phone and native permissions. Keep myself.md open. Exports run automatically using the saved profile settings; existing files may be replaced according to its conflict policy. Returns lifecycle status and delivery receipts, never grants record access. Reuse requestId with identical parameters for safe retries. Poll status until terminal; cancellation retains existing files.',
        inputSchema: phoneExportInput,
        annotations: {
          title: 'Export phone data',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (input) => {
        phoneExportOperations.tool(subject, client, input);
        return content(
          await boundedWait(
            () => {
              own(input.deviceId, subject);
              if (client) cloud.observeAgent?.(subject, client);
              return phoneExportOperations.tool(subject, client, { ...input, action: 'status' });
            },
            input.action === 'cancel' ? 0 : input.waitMs,
          ),
        );
      },
    );
    mcp.registerTool(
      'request_phone_location_capture',
      {
        title: 'Request one owner-approved Location point',
        description:
          'Request, inspect or cancel one foreground Location capture on an owned online phone supporting locationCapture version 1. The owner must approve Save one point in the real app and any OS Location prompt. Never grants agent read access, starts background recording or exports data. Reuse the caller-chosen requestId for safe retries/status; it never captures a second point. States are accepted, awaiting_user, running, completed, failed, cancelled and expired. Pending requests expire after five minutes; cancellation is available before running. Completion requires a saved-point receipt and returns only timestamp/count, never coordinates. Query recorded points separately under the existing profile grants.',
        inputSchema: locationCaptureInput,
        annotations: {
          title: 'Request one owner-approved Location point',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input) => {
        locationCaptures.tool(subject, client, input);
        return content(
          await boundedWait(
            () => {
              own(input.deviceId, subject);
              if (client) cloud.observeAgent?.(subject, client);
              return locationCaptures.tool(subject, client, { ...input, action: 'status' });
            },
            input.action === 'cancel' ? 0 : input.waitMs,
          ),
        );
      },
    );
    mcp.registerTool(
      'manage_phone_profiles',
      {
        title: 'Read or propose synced profile settings',
        description:
          'Read the full synchronized profile configuration and last phone confirmation for an owned device, propose an existing-profile update for explicit owner review, or inspect its outcome. Proposals never change configuration, grant agent access or start exports. The owner reviews and saves the suggestion under Profiles & permissions in the web dashboard; the paired phone must then sync before completion. Saving Cloud as the destination allows uploads, with upload credentials managed automatically on the signed-in phone. OS permissions, local folders, automatic-export opt-in and secure HTTP credentials remain phone handoffs. Reuse requestId when checking status. Stored configuration contains no source records.',
        inputSchema: z.object({
          waitMs: waitMsInput,
          action: z
            .enum(['list', 'propose', 'status'])
            .describe(
              'Read synchronized settings, submit a suggestion for owner review, or check a previous suggestion.',
            ),
          deviceId: z.string().uuid().describe('Owned phone ID from list_connected_phones.'),
          profileId: z
            .string()
            .min(1)
            .max(100)
            .optional()
            .describe('Existing profile ID from the list result; required for propose.'),
          profile: z
            .unknown()
            .optional()
            .describe(
              'Full versioned profile configuration from list, with explicit agentAccess and agentPermissions; required for propose. This creates only a suggestion.',
            ),
          requestId: z
            .string()
            .uuid()
            .optional()
            .describe('Suggestion request ID returned by propose; required for status.'),
        }),
        annotations: {
          title: 'Read or propose synced profile settings',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ action, deviceId, profileId, profile, requestId, waitMs }) => {
        own(deviceId, subject);
        const store = cloud.profileSync;
        if (!store) throw new PairingError(409, 'Profile synchronization is unavailable.');
        const value = store.get(subject, deviceId);
        if (action === 'list')
          return content(
            value
              ? { ...value, deviceId }
              : {
                  deviceId,
                  status: 'awaiting_phone',
                  instructions: 'Update and open myself.md on this phone to synchronize profiles.',
                },
          );
        if (action === 'status') {
          return content(
            await boundedWait(() => {
              own(deviceId, subject);
              if (client) cloud.observeAgent?.(subject, client);
              const request = store
                .get(subject, deviceId)
                ?.requests.find((r) => r.id === requestId);
              if (!request) throw new PairingError(404, 'Profile suggestion not found.');
              return request;
            }, waitMs),
          );
        }
        if (!profileId || !profile)
          throw new PairingError(
            400,
            'Supply an existing profileId and full profile configuration.',
          );
        const request = store.propose(subject, deviceId, profileId, profile);
        return content({
          ...request,
          requiresUser: true,
          reviewUrl: 'https://myself.md/dashboard?view=profiles',
          instructions:
            'The account owner must review this suggestion and save changes in Profiles & permissions. Then open myself.md on the paired phone. A suggestion alone does not change access.',
        });
      },
    );

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
          'Generate an explicit per-type export profile, a native deepLink and an email-compatible HTTPS shareLink. Optionally send it to an owned connected phone for review (open myself.md within five minutes). Use selectableTypes (or availableTypes on older phones) from get_phone_data_catalog. Selectable types can require a user/OS permission handoff; only selected types in an approved profile are readable under profile permissions. Empty domain lists disable that domain. Optional export settings pin a released schema (discover with list_export_schemas), JSON/JSONL, 1–30 days, safe date-based filename and Documents subfolder. Optional schedule describes daily/weekly/custom cadence and Today Refresh; it never enables scheduling on the phone. Saving Cloud as the destination allows uploads, with upload credentials managed automatically on the signed-in phone. Does not grant agent access. The user reviews and saves on the phone, then separately approves agent access.',
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
          waitMs: waitMsInput,
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
      async ({ deliveryId, waitMs }) =>
        content(
          await boundedWait(() => {
            if (client) cloud.observeAgent?.(subject, client);
            const p = proposals.get(deliveryId);
            if (!p || p.subject !== subject || p.expires <= Date.now())
              throw new PairingError(404, 'Profile delivery expired or not found.');
            own(p.deviceId, subject);
            return { deliveryId, status: p.state, expiresAt: p.expires };
          }, waitMs),
        ),
    );
    mcp.registerTool(
      'get_phone_data_catalog',
      {
        title: 'Discover approved phone data',
        description:
          'Discover phone data types, profiles with independent agentPermissions (agentAccess is a compatibility summary), profile-derived source availability and collection limits before querying. Select an approved profile and intersect its selections with domain types. When the user refers to a profile by name, match that name against catalog.profiles[].name and use the corresponding stable id for subsequent tools. Names can change and are not unique: refresh the catalog for each new name reference; if multiple profiles match, ask the user to disambiguate, and if none match, report that instead of guessing an ID. Online means a heartbeat within 15 seconds; offline catalogs may be stale. Keep myself.md open. No tool can grant permissions.',
        inputSchema: z.object({
          domains: z
            .array(domainSchema)
            .min(1)
            .max(3)
            .optional()
            .describe('Return only these domains and their profile selections.'),
          profileId: z
            .string()
            .min(1)
            .max(100)
            .optional()
            .describe(
              'Return this exact profile ID; unknown IDs fail instead of widening the catalog.',
            ),
          detail: z
            .enum(['summary', 'full'])
            .default('full')
            .describe(
              'Summary returns type counts and grants without type lists, notes or diagnostics. Full returns the selected details.',
            ),
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
      async ({ deviceId, domains: selectedDomains, profileId, detail }) => {
        own(deviceId, subject);
        const p = phones.get(deviceId);
        const output = {
          deviceId,
          online: Boolean(p && p.seen > Date.now() - 15000),
          lastSeen: p?.seen ?? null,
          catalog: p
            ? chatgpt
              ? {
                  domains: p.catalog.domains,
                  locationTracking: p.catalog.locationTracking,
                  dataExport: p.catalog.dataExport,
                  dataQuery: p.catalog.dataQuery,
                  whoop: p.catalog.whoop,
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
        };
        if (profileId && !p?.catalog.profiles.some((profile) => profile.id === profileId))
          throw new PairingError(404, 'Profile not found.');
        if (!output.catalog) return content(output);
        const selected = selectedDomains ?? [...domains];
        const catalog = output.catalog;
        return content({
          ...output,
          catalog: {
            ...catalog,
            diagnostics:
              detail === 'summary' || selectedDomains || profileId
                ? undefined
                : 'diagnostics' in catalog
                  ? catalog.diagnostics
                  : undefined,
            whoop: selected.includes('health') ? catalog.whoop : undefined,
            locationTracking: selected.includes('location') ? catalog.locationTracking : undefined,
            domains: catalog.domains
              .filter((domain) => selected.includes(domain.domain))
              .map((domain) =>
                detail === 'summary'
                  ? {
                      domain: domain.domain,
                      enabled: domain.enabled,
                      permission: domain.permission,
                      permissionHandoff: domain.permissionHandoff,
                      typeCount: domain.types.length,
                    }
                  : domain,
              ),
            profiles: catalog.profiles
              .filter((profile) => !profileId || profile.id === profileId)
              .map((profile) =>
                Object.assign({}, profile, {
                  selection: Object.fromEntries(
                    selected.map((domain) => [
                      domain,
                      detail === 'summary'
                        ? { typeCount: profile.selection[domain].length }
                        : profile.selection[domain],
                    ]),
                  ),
                }),
              ),
          },
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
          'Queue a read of one discovered data type on an owned phone in a UTC interval under a profileId with the relevant individual permission enabled. Creates a job and activity entry and reserves an export/query allowance; successful capture consumes that allowance. Does not modify native source records. Phone-side consent is required. Returns requestId for get_phone_request. Records keep native units and metadata; sources differ. nextCursor paginates each page; long intervals continue through opaque cursors. Empty HealthKit results do not prove read authorization. Optional requestKey provides safe retries: identical arguments retrieve the original live job without another charge. Without a requestKey, repeated calls create separate jobs. Changed inputs, revoked grants and unavailable originals fail instead of re-dispatching. Activity fingerprints are retained for 90 days.',
        inputSchema: querySchema,
        annotations: {
          title: 'Queue approved phone query',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ waitMs, ...query }) => {
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
            if (!queryAllowed(query))
              throw new PairingError(403, 'Current phone data grants do not permit this retry.');
            const existing = jobs.get(id);
            if (!existing || existing.expires <= Date.now())
              throw new PairingError(
                410,
                'The original request is no longer available; it will not be dispatched again.',
              );
            return content(
              await boundedWait(() => queryResult(subject, client, id, chatgpt), waitMs),
            );
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
          if (
            Date.parse(query.end) - Date.parse(query.start) > 31 * 86400000 &&
            phone.catalog.dataQuery?.version !== 1
          )
            throw new PairingError(409, 'Update the phone app to query longer intervals.');
          if (query.aggregation && phone.catalog.dataQuery?.aggregation !== 1)
            throw new PairingError(409, 'Update the phone app to support query aggregation.');
          if (
            query.aggregation?.operation !== undefined &&
            query.aggregation.operation !== 'count' &&
            !query.aggregation.field
          )
            throw new PairingError(400, 'Numeric aggregation requires a native field.');
          if (
            query.aggregation?.groupBy === 'interval' &&
            Date.parse(query.end) - Date.parse(query.start) > 31 * 86400000
          )
            throw new PairingError(400, 'Use daily grouping for intervals longer than 31 days.');
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
          // Owner edits, disconnects and agent blocking can occur during entitlement I/O.
          own(query.deviceId, subject);
          if (client) cloud.observeAgent?.(subject, client);
          if ((phones.get(query.deviceId)?.seen ?? 0) < Date.now() - 15000)
            throw new PairingError(409, 'Phone is offline. Open myself.md first.');
          if (!queryAllowed(query))
            throw new PairingError(403, 'Current phone data grants do not permit this query.');
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
          return content(
            await boundedWait(() => queryResult(subject, client, id, chatgpt), waitMs),
          );
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
          'Retrieve a live phone query/export page under the current profile permissions. Owner revocation discards queued work and retained results, including a dashboard denial before phone acknowledgment; reapproval cannot restore the discarded response. Poll while queued/running; stop on failed or expired. Complete results include source fields, capture warnings, and a nextCursor. Never interpret a partial/permission-limited page as all phone data.',
        inputSchema: z.object({
          waitMs: waitMsInput,
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
      async ({ requestId, waitMs }) =>
        content(await boundedWait(() => queryResult(subject, client, requestId, chatgpt), waitMs)),
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
    aggregation: z
      .object({
        operation: z.enum(['count', 'sum', 'avg', 'min', 'max']),
        groupBy: z.enum(['day', 'interval']),
        field: z.string().nullable(),
        unitField: z.string().nullable(),
        start: z.iso.datetime(),
        end: z.iso.datetime(),
        scannedRecords: z.number().int().min(0).max(10000),
        skippedRecords: z.number().int().min(0).max(10000),
      })
      .strict()
      .optional(),
  });
  /** @param {string} path @param {string} method @param {string} subject @param {unknown} body */
  function phoneApi(path, method, subject, body) {
    const match = path.match(
      /^\/api\/phones\/([a-f0-9-]{36})\/(poll|result|diagnostics|location-capture|export|whoop)$/,
    );
    if (!match) return undefined;
    if (method !== 'POST') throw new PairingError(405, 'POST required.');
    const deviceId = z.string().uuid().parse(match[1]);
    own(deviceId, subject);
    if (match[2] === 'whoop') return whoopOperations.report(subject, deviceId, body);
    if (match[2] === 'export') return phoneExportOperations.report(subject, deviceId, body);
    if (match[2] === 'location-capture') return locationCaptures.report(subject, deviceId, body);
    if (match[2] === 'diagnostics') return publishDebugReport(phones.get(deviceId), body);
    if (match[2] === 'poll') {
      const catalog = catalogSchema.parse(body);
      const phoneState = parseProfileState({
        profiles: catalog.profiles.map((profile) => ({
          ...parseProfile(profile),
          id: profile.id,
          agentAccess: profile.agentAccess,
          agentPermissions: profile.agentPermissions,
        })),
      });
      const sync = cloud.profileSync?.poll(
        subject,
        deviceId,
        phoneState,
        catalog.domains,
        catalog.profileSync
          ? {
              base:
                catalog.profileSync.base === null
                  ? null
                  : parseProfileState(
                      /** @type {import('../core/profiles.js').ProfileState} */ (
                        catalog.profileSync.base
                      ),
                    ),
            }
          : undefined,
      );
      const approved = sync?.state ?? phoneState;
      cloud.syncAgentPermissions(
        subject,
        deviceId,
        phoneState.profiles.map((profile) => {
          const approvedProfile = approved.profiles.find((p) => p.id === profile.id);
          const remote = approvedProfile?.agentPermissions;
          const local = parseAgentPermissions(profile.agentPermissions);
          return Object.assign({}, profile, {
            selection: Object.fromEntries(
              domains.map((domain) => [
                domain,
                profile.selection[domain].filter((type) =>
                  approvedProfile?.selection[domain].includes(type),
                ),
              ]),
            ),
            agentAccess: true,
            agentPermissions: {
              health: local.health && remote?.health === true,
              time: local.time && remote?.time === true,
              location: local.location && remote?.location === true,
              logs: local.logs && remote?.logs === true,
            },
          });
        }),
      );
      catalog.diagnostics = latestDebugReport(
        phones.get(deviceId)?.catalog.diagnostics,
        catalog.diagnostics,
      );
      phones.set(deviceId, { deviceId, subject, seen: Date.now(), catalog });
      // Recheck consent every heartbeat, deleting retained data on revocation.
      revokeQueries(subject, deviceId);
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
        profileSync: sync,
        whoopRequest:
          catalog.dispatch && catalog.whoop ? whoopOperations.dispatch(subject, deviceId) : null,
        phoneExport:
          catalog.dispatch && catalog.dataExport?.version === 1
            ? phoneExportOperations.dispatch(subject, deviceId)
            : null,
        locationCapture:
          catalog.dispatch && catalog.locationCapture?.version === 1
            ? locationCaptures.dispatch(subject, deviceId)
            : null,
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
    if (!queryAllowed(job.query)) throw new PairingError(403, 'Permission revoked.');
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
        Boolean(job.query.aggregation) !== Boolean(input.page.aggregation) ||
        (job.query.aggregation &&
          (input.page.aggregation?.operation !== job.query.aggregation.operation ||
            input.page.aggregation?.groupBy !== job.query.aggregation.groupBy))
      )
        throw new PairingError(400, 'Response aggregation does not match the query.');
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

  return {
    registerDataTools,
    phoneApi,
    cancelPhone,
    cancelAgent,
    cancelAccount,
    revokeQueries,
    cleanup,
  };
}
