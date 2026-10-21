import { z } from 'zod';
import {
  debugOperations,
  debugOutcomes,
  debugEntries,
  debugLimit,
  parseDebugReport,
} from '../core/debug-log.js';
import { agentLogsAllowed } from '../core/profiles.js';
import { PairingError } from './errors.js';
export const debugReportSchema = z
  .object({
    schema: z.literal('myself.md.debug.v1'),
    generatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    shared: z.boolean(),
    platform: z.enum(['ios', 'android', 'web']),
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
          })
          .strip(),
      )
      .max(debugLimit),
  })
  .strip()
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
  for (const name of ['get_phone_debug_logs', 'request_phone_debug_access']) {
    mcp.registerTool(
      name,
      {
        title:
          name === 'get_phone_debug_logs' ? 'Read phone debug logs' : 'Review debug log sharing',

        description:
          name === 'get_phone_debug_logs'
            ? 'Read the phone’s consented debug report: event times, operations, outcomes, request duration, HTTP status and raw error messages. Requires owner-approved Logs access in a profile (profileId selects one; otherwise any approved profile), a published consented report, and a heartbeat within 15 seconds. Up to 300 events from seven days, newest first. Record, credential and URL attachments are never included. Raw errors may contain sensitive information or secrets. Does not consume export allowance. Copies sent to another service cannot be recalled.'
            : 'Ask the user to open Agent permissions in a profile on the paired phone and enable Logs. Cannot enable consent remotely. Inspect get_phone_debug_logs after phone approval to verify access.',
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
              .describe('Choose all permitted diagnostic events or only issues.'),
            profileId: z
              .string()
              .min(1)
              .max(100)
              .optional()
              .describe(
                'Existing profile ID returned by get_phone_data_catalog; query access requires the relevant individual permission.',
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
  const report = phone?.catalog.diagnostics
    ? parseDebugReport(phone.catalog.diagnostics)
    : undefined;
  const profiles = phone?.catalog.profiles.filter((p) => !profileId || p.id === profileId) ?? [];
  const profileAllowed = profiles.some(agentLogsAllowed);
  const allowed = online && report?.shared === true && profileAllowed;
  const handoffProfile = profiles.find(agentLogsAllowed) ?? profiles[0];
  return {
    deviceId,
    online,
    lastSeen: phone?.seen ?? null,
    status: allowed ? 'available' : online ? 'awaiting_user' : 'offline',
    shared: report?.shared === true,
    profileAllowed,
    profileId: profileId ?? null,
    report:
      allowed && report
        ? {
            ...report,
            entries: debugEntries(report.entries, Date.now(), filter),
          }
        : null,
    handoff: {
      deepLink: handoffProfile
        ? `myselfmd://profiles/${encodeURIComponent(handoffProfile.id)}?section=agent-permissions`
        : 'myselfmd://profiles',
      requiresUser: !allowed,
      instructions:
        'Enable Logs in the requested profile’s Agent permissions section. Logs describe the whole app; permission applies only to this profile. Re-read get_phone_debug_logs to verify.',
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
