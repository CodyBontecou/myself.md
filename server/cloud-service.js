import { randomUUID } from 'node:crypto';
import { z } from 'zod';
const content = (/** @type {unknown} */ value) => ({
  content: [{ type: /** @type {const} */ ('text'), text: JSON.stringify(value) }],
});
/** @param {{cloud:import('./cloud-store.js').CloudStore,billing:import('./billing-store.js').BillingStore,history:import('./history-store.js').HistoryStore,refreshEntitlement:(subject:string)=>Promise<void>}} dependencies */
export function createCloudService({ cloud, billing, history, refreshEntitlement }) {
  /** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject @param {string|null} [client] */
  function registerCloudTools(mcp, subject, client = null) {
    mcp.registerTool(
      'get_cloud_storage',
      {
        title: 'Check cloud storage',
        description:
          'Read your verified cloud storage eligibility, used and available bytes, capacity and file retention. Does not enable uploads or sharing.',
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
        await refreshEntitlement(subject);
        const status = cloud.storageStatus(subject);
        return { ...content(status), structuredContent: status };
      },
    );
    mcp.registerTool(
      'list_cloud_exports',
      {
        title: 'List shared cloud exports',
        description:
          'List your stored exports explicitly shared with MCP. Works while your phone is offline.',
        inputSchema: z.object({}),
        annotations: {
          title: 'List shared cloud exports',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => content(cloud.list(subject, true)),
    );
    mcp.registerTool(
      'read_cloud_export',
      {
        title: 'Read shared cloud export',
        description:
          'Read a bounded page of your explicitly shared stored JSON/JSONL records. Records remain unchanged, but each successful call consumes an export/query allowance and records agent access in activity history. Repeated calls can consume additional allowance. Cloud profile data selections and grants still apply; exportId and cursor come from cloud tools.',
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
          const page = await cloud.page(subject, exportId, Number(cursor || 0), limit, true);
          if (client) cloud.observeAgent(subject, client);
          billing.complete(subject, id);
          history.update(subject, id, {
            status: 'complete',
            recordCount: page.records.length,
            warnings: page.nextCursor ? ['This returned page has more records available.'] : [],
          });
          return content(page);
        } catch (error) {
          billing.release(subject, id);
          history.update(subject, id, {
            status: 'failed',
            error: 'Cloud access was denied or the export could not be read.',
          });
          throw error;
        }
      },
    );
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
