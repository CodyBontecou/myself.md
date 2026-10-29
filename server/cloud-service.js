import { registerSleepScreenTime } from './sleep-screen-time.js';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { registerHeartRateContext } from './heart-rate-context.js';
import { registerLocationReview } from './location-review.js';
import { registerHealthReview } from './health-review.js';
import { registerScreenTimeReview } from './screen-time-review.js';
const content = (/** @type {unknown} */ value) => ({
  content: [{ type: /** @type {const} */ ('text'), text: JSON.stringify(value) }],
});
/** @param {{cloud:import('./cloud-store.js').CloudStore,billing:import('./billing-store.js').BillingStore,history:import('./history-store.js').HistoryStore,refreshEntitlement:(subject:string)=>Promise<void>,cloudSubscriptions?:ReturnType<typeof import('./cloud-subscriptions.js').createCloudSubscriptions>}} dependencies */
export function createCloudService({
  cloud,
  billing,
  history,
  refreshEntitlement,
  cloudSubscriptions,
}) {
  /** Shared authorized and metered read path for raw records and weekly reviews.
   * @param {string} subject @param {string|null} client @param {string} exportId
   * @param {string} cursor @param {number} limit @param {import('../core/data.js').Domain} [domain] @param {string} [recordType] */
  async function readCloudExportPage(subject, client, exportId, cursor, limit, domain, recordType) {
    const row = cloud.row(subject, exportId),
      metadata = cloud.metadata(row);
    const stamp = new Date().toISOString(),
      id = randomUUID();
    const interval = /** @type {{start:string,end:string}} */ (
      metadata.manifest.interval ?? {
        start: new Date(row.day).toISOString(),
        end: new Date(Date.parse(row.day) + 86400000).toISOString(),
      }
    );
    /** @type {import('../core/history.js').HistoryEvent} */
    const event = {
      id,
      kind: 'access',
      schema: metadata.profile.export.schema,
      startedAt: stamp,
      updatedAt: stamp,
      status: 'running',
      actor: 'agent',
      client,
      target: 'cloud',
      destination: 'myself.md Cloud',
      profile: {
        id: row.profile,
        name: metadata.profile.name,
        selection: metadata.profile.selection,
      },
      interval,
      timezone: 'UTC',
      formats: [row.format],
      recordCount: null,
      artifacts: [],
      warnings: [],
      relatedId: exportId,
      error: null,
    };
    history.record(subject, row.device, event);
    try {
      await refreshEntitlement(subject);
      billing.reserve(subject, id, 'agent');
      const permission = JSON.stringify(cloud.permission(subject, row.device, row.profile));
      const page = await cloud.page(
        subject,
        exportId,
        Number(cursor || 0),
        limit,
        true,
        domain,
        recordType,
      );
      if (JSON.stringify(cloud.permission(subject, row.device, row.profile)) !== permission)
        throw new Error('Profile selection changed during the cloud read.');
      if (domain && !cloud.permission(subject, row.device, row.profile).agentPermissions[domain])
        throw new Error('Source permission was revoked during the cloud read.');
      if (client) cloud.observeAgent(subject, client);
      billing.complete(subject, id);
      history.update(subject, id, {
        status: 'complete',
        recordCount: page.records.length,
        warnings: page.nextCursor ? ['This returned page has more records available.'] : [],
      });
      return page;
    } catch (error) {
      billing.release(subject, id);
      history.update(subject, id, {
        status: 'failed',
        error: 'Cloud access was denied or the export could not be read.',
      });
      throw error;
    }
  }
  /** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject @param {string|null} [client] */
  function registerCloudTools(mcp, subject, client = null) {
    mcp.registerTool(
      'get_cloud_storage',
      {
        title: 'Check cloud storage',
        description:
          'Read verified Cloud subscription, app access (including expiry), and store grace/retry state, used/available bytes, lapse deletion deadline and bytes at risk. Includes user handoff to subscribe, restore or manage/cancel in the phone/store; agents cannot purchase or cancel. Does not enable uploads or sharing.',
        inputSchema: z.object({}).strict(),
        annotations: {
          title: 'Check cloud storage',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => {
        if (!cloudSubscriptions) await refreshEntitlement(subject);
        const status = cloudSubscriptions
          ? await cloudSubscriptions.status(subject)
          : cloud.storageStatus(subject);
        return { ...content(status), structuredContent: status };
      },
    );
    mcp.registerTool(
      'list_cloud_exports',
      {
        title: 'List shared cloud exports',
        description:
          'List a filtered, paginated metadata page of stored exports shared with MCP under the phone profile’s last confirmed Health, Screen time and Location Agent permissions. Includes those permissions; all-off or unsynced profiles are hidden. Agent permissions are the sole profile access gate; no separate cloud-sharing switch is required. Works while your phone is offline after permission synchronization.',
        inputSchema: z
          .object({
            deviceId: z.string().uuid().optional().describe('Filter by an owned phone ID.'),
            profileId: z
              .string()
              .min(1)
              .max(100)
              .optional()
              .describe('Filter by an exact saved profile ID.'),
            start: z.iso.date().optional().describe('Inclusive export day, YYYY-MM-DD.'),
            end: z.iso.date().optional().describe('Exclusive export day, YYYY-MM-DD.'),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .default(50)
              .describe('Maximum export metadata entries per page.'),
            cursor: z
              .string()
              .max(500)
              .default('')
              .describe('Opaque nextCursor from this same filtered list; omit on the first page.'),
          })
          .strict()
          .refine(
            (input) => !input.start || !input.end || input.end > input.start,
            'End must be later than start.',
          ),
        annotations: {
          title: 'List shared cloud exports',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ deviceId, profileId, start, end, limit, cursor }) => {
        if (client) cloud.observeAgent(subject, client);
        const identity = createHash('sha256')
          .update(JSON.stringify([deviceId, profileId, start, end]))
          .digest('hex');
        const rows = cloud
          .list(subject, true)
          .filter(
            (row) =>
              (!deviceId || row.deviceId === deviceId) &&
              (!profileId || row.profileId === profileId) &&
              (!start || row.day >= start) &&
              (!end || row.day < end),
          );
        let offset = 0;
        if (cursor) {
          const previous = JSON.parse(cursor);
          if (previous.identity !== identity || typeof previous.id !== 'string')
            throw new Error('Cursor belongs to a different export list.');
          const index = rows.findIndex((row) => row.id === previous.id);
          if (index < 0)
            throw new Error('Export list changed or access was revoked; restart discovery.');
          offset = index + 1;
        }
        const exports = rows.slice(offset, offset + limit);
        return content({
          exports,
          nextCursor:
            offset + limit < rows.length
              ? JSON.stringify({ identity, id: exports.at(-1)?.id })
              : null,
        });
      },
    );
    mcp.registerTool(
      'read_cloud_export',
      {
        title: 'Read shared cloud export',
        description:
          'Read a bounded page of shared stored JSON/JSONL records, filtered by current cloud type selections and the phone profile’s last confirmed per-source Agent permissions. Turning a source off blocks its records in existing files and subsequent pages; the same permission gate controls both phone reads and stored exports. Unsynced and all-off profiles deny reads. Records remain unchanged, but each successful call consumes an export/query allowance and records agent access in activity history. Repeated calls can consume additional allowance. exportId and cursor come from cloud tools.',
        inputSchema: z.object({
          exportId: z
            .string()
            .uuid()
            .describe(
              'Shared export UUID from list_cloud_exports; deletion additionally requires ownership and explicit user confirmation.',
            ),
          cursor: z
            .string()
            .regex(/^\d*$/)
            .max(8)
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
        }),
        annotations: {
          title: 'Read shared cloud export',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ exportId, cursor, limit }) => {
        return content(await readCloudExportPage(subject, client, exportId, cursor, limit));
      },
    );
    registerSleepScreenTime(mcp, {
      cloud,
      subject,
      readPage: (id, cursor, domain) =>
        readCloudExportPage(
          subject,
          client,
          id,
          cursor,
          50,
          domain,
          domain === 'health' ? 'whoop.sleep' : undefined,
        ),
    });
    registerHeartRateContext(mcp, {
      cloud,
      subject,
      readPage: (id, cursor, domain) =>
        readCloudExportPage(subject, client, id, cursor, 50, domain),
    });
    registerLocationReview(mcp, {
      cloud,
      subject,
      readPage: (id, cursor) => readCloudExportPage(subject, client, id, cursor, 50, 'location'),
    });
    registerHealthReview(mcp, {
      cloud,
      subject,
      readPage: (id, cursor) => readCloudExportPage(subject, client, id, cursor, 50, 'health'),
    });
    registerScreenTimeReview(mcp, {
      cloud,
      subject,
      readPage: (id, cursor) => readCloudExportPage(subject, client, id, cursor, 50, 'time'),
    });
    mcp.registerTool(
      'delete_cloud_export',
      {
        title: 'Delete cloud export',
        description: 'Permanently delete one of your stored cloud exports.',
        inputSchema: z.object({
          exportId: z
            .string()
            .uuid()
            .describe(
              'Shared export UUID from list_cloud_exports; deletion additionally requires ownership and explicit user confirmation.',
            ),
        }),
        annotations: {
          title: 'Delete cloud export',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ exportId }) => content(await cloud.delete(subject, exportId)),
    );
  }

  return { registerCloudTools };
}
