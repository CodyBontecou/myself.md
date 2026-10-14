import { z } from 'zod';
import {
  debugOperations,
  debugOutcomes,
  debugEntries,
  debugLimit,
  parseDebugReport,
  parseDebugContent,
} from '../core/debug-log.js';
import { agentProfileAllows, parseProfile, agentLogsAllowed } from '../core/profiles.js';
import { PairingError } from './errors.js';
const contentSchema = z
  .object({
    records: z
      .boolean()
      .describe(
        'Whether future debug captures may include record attachments; owner approval and current data grants remain required.',
      ),
    credentials: z
      .boolean()
      .describe(
        'Whether future debug captures may include credential attachments. Only the phone owner can enable this sensitive setting.',
      ),
    urls: z
      .boolean()
      .describe(
        'Whether future debug captures may include URL attachments; only the owner can change this capture setting.',
      ),
  })
  .strict();
export const debugReportSchema = z
  .object({
    schema: z.literal('myself.md.debug.v1'),
    generatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    shared: z.boolean(),
    platform: z.enum(['ios', 'android', 'web']),
    content: contentSchema.optional(),
    entries: z
      .array(
        z
          .object({
            time: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            operation: z.enum(debugOperations),
            outcome: z.enum(debugOutcomes),
            durationMs: z.number().int().min(0).max(86400000).nullable(),
            httpStatus: z.number().int().min(100).max(599).nullable(),
            error: z.string().max(16000).optional(),
            errorTruncated: z.boolean().optional(),
            url: z.string().max(4000).optional(),
            credentials: z.record(z.string().max(100), z.string().max(4000)).optional(),
            records: z
              .object({
                domain: z.enum(['health', 'time', 'location']),
                type: z.string().min(1).max(160),
                profileId: z.string().min(1).max(100),
                values: z.array(z.unknown()).max(50),
                truncated: z.boolean(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(debugLimit),
  })
  .strict()
  .refine((report) => report.shared || report.entries.length === 0, {
    message: 'Private diagnostics must omit events.',
  })
  .transform(parseDebugReport);
/** Revocations win over earlier heartbeats and older report snapshots.
 * @param {import('../core/debug-log.js').DebugReport|undefined} previous
 * @param {import('../core/debug-log.js').DebugReport|undefined} incoming */
export function latestDebugReport(previous, incoming) {
  if (!previous) return incoming;
  if (!incoming) return { ...previous, shared: false, entries: [] };
  if (
    previous.revision > incoming.revision ||
    (previous.revision === incoming.revision && previous.generatedAt > incoming.generatedAt)
  )
    return previous;
  return incoming;
}
/** @param {import('@modelcontextprotocol/server').McpServer} mcp
 * @param {string} subject
 * @param {(deviceId:string,subject:string)=>void} own
 * @param {Map<string,import('./data-service.js').Phone>} phones */
export function registerDebugTools(mcp, subject, own, phones) {
  mcp.registerTool(
    'request_phone_debug_content',
    {
      title: 'Review debug content settings',
      description:
        'Request a trusted phone-owner handoff to set log content inclusion (records, credentials, URLs). Cannot enable capture or expand grants remotely. These switches capture future attachments; turning them off removes retained structured fields. Raw errors always remain and may contain sensitive text. Inspect the returned content state after the user changes the phone controls; records in agent reads still require current data grants and profile approval.',
      inputSchema: z
        .object({
          deviceId: z
            .string()
            .uuid()
            .describe(
              'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
            ),
          content: contentSchema.describe(
            'Requested debug attachment settings for owner review. This does not itself enable capture or widen sharing grants.',
          ),
        })
        .strict(),
      annotations: {
        title: 'Review debug content settings',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ deviceId, content }) => {
      own(deviceId, subject);
      const state = phoneDebugState(deviceId, phones.get(deviceId));
      const applied = state.online && JSON.stringify(state.content) === JSON.stringify(content);
      const result = {
        ...state,
        report: undefined,
        requestedContent: content,
        status: applied ? 'completed' : state.online ? 'awaiting_user' : 'offline',
        handoff: {
          ...state.handoff,
          requiresUser: !applied,
          instructions:
            'Open Logs → Share & agent access and set Include records, Include credentials and Include URLs to the requested values. Only the phone owner can change these controls.',
          verificationTool: 'request_phone_debug_content',
        },
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
  for (const name of ['get_phone_debug_logs', 'request_phone_debug_access']) {
    mcp.registerTool(
      name,
      {
        title:
          name === 'get_phone_debug_logs' ? 'Read phone debug logs' : 'Review debug log sharing',

        description:
          name === 'get_phone_debug_logs'
            ? 'Read the phone’s consented debug report: event times, operations, outcomes, request duration and HTTP status. Requires an enabled profile with App logs permission (profileId selects one; otherwise any approved profile) and user-enabled Share logs with agents on the owned phone and a heartbeat within 15 seconds. Up to 300 events from seven days, newest first. Includes raw error messages. Records, request credentials and URLs are included only when the phone owner enables those fields; records also require current domain/type grants and an approved profile. Raw errors and enabled attachments may contain sensitive information or secrets. Does not consume export allowance. Copies sent to another service cannot be recalled.'
            : 'Ask the user to open Logs → Share & agent access on the paired phone and enable Share logs with agents. Cannot enable consent remotely. Inspect get_phone_debug_logs after phone approval to verify access. Native sharing is a user-completed system share sheet; this tool does not send a report.',
        inputSchema: z
          .object({
            deviceId: z
              .string()
              .uuid()
              .describe(
                'Owned phone UUID returned by list_connected_phones. Use get_phone_data_catalog to check its current connectivity and grants.',
              ),
            filter: z
              .enum(['all', 'issues'])
              .default('all')
              .describe(
                'Choose all permitted diagnostic events or only issues; private and unapproved attachments remain excluded.',
              ),
            profileId: z
              .string()
              .min(1)
              .max(100)
              .optional()
              .describe(
                'Existing profile ID returned by get_phone_data_catalog; query access requires agentAccess and the relevant data permission.',
              ),
          })
          .strict(),
        annotations: {
          title:
            name === 'get_phone_debug_logs' ? 'Read phone debug logs' : 'Review debug log sharing',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ deviceId, filter, profileId }) => {
        own(deviceId, subject);
        const result = phoneDebugState(deviceId, phones.get(deviceId), filter, profileId);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );
  }
}
/** Shared authorization/freshness projection for diagnostics and the unified log query.
 * @param {string} deviceId
 * @param {import('./data-service.js').Phone|undefined} phone
 * @param {'all'|'issues'} [filter]
 * @param {string} [profileId] */
export function phoneDebugState(deviceId, phone, filter = 'all', profileId) {
  const online = Boolean(phone && phone.seen > Date.now() - 15000);
  const report = phone?.catalog.diagnostics;
  const profiles = phone?.catalog.profiles.filter((p) => !profileId || p.id === profileId) ?? [];
  const profileAllowed = profiles.some(agentLogsAllowed);
  const allowed = online && report?.shared === true && profileAllowed;
  return {
    deviceId,
    online,
    lastSeen: phone?.seen ?? null,
    status: allowed ? 'available' : online ? 'awaiting_user' : 'offline',
    shared: report?.shared === true,
    profileAllowed,
    profileId: profileId ?? null,
    content: parseDebugContent(report?.content),
    report:
      allowed && report
        ? {
            ...report,
            entries: debugEntries(report.entries, Date.now(), filter).map((entry) => {
              const { records, ...metadata } = entry;
              if (!records) return entry;
              const domain = phone?.catalog.domains.find(
                (value) => value.domain === records.domain,
              );
              const profile = phone?.catalog.profiles.find(
                (value) => value.id === records.profileId,
              );
              return (!profileId || records.profileId === profileId) &&
                domain?.enabled &&
                domain.types.includes(`native:${records.type}`) &&
                agentProfileAllows(
                  profile && {
                    ...parseProfile(profile),
                    id: profile.id,
                    agentAccess: profile.agentAccess,
                    agentPermissions: profile.agentPermissions,
                  },
                  {
                    domain: records.domain,
                    source: 'native',
                    type: records.type,
                  },
                )
                ? entry
                : metadata;
            }),
          }
        : null,
    handoff: {
      deepLink: 'myselfmd://diagnostics',
      requiresUser: !allowed,
      instructions:
        'Enable App logs and Allow agent access in the requested profile’s Agent permissions section, and enable phone-wide Log sharing consent. Re-read get_phone_debug_logs to verify.',
      verificationTool: 'get_phone_debug_logs',
    },
  };
}
/** @param {import('./data-service.js').Phone|undefined} phone @param {unknown} body */
export function publishDebugReport(phone, body) {
  const incoming = debugReportSchema.parse(body);
  if (!phone) {
    if (incoming.shared) throw new PairingError(409, 'Open the paired phone app first.');
    return { shared: false };
  }
  phone.catalog.diagnostics = latestDebugReport(phone.catalog.diagnostics, incoming);
  return { shared: phone.catalog.diagnostics?.shared === true };
}
