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
      'list_cloud_exports',
      {
        description:
          'List your stored exports explicitly shared with MCP. Works while your phone is offline.',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      async () => content(cloud.list(subject, true)),
    );
    mcp.registerTool(
      'read_cloud_export',
      {
        description:
          'Read a bounded page of your shared stored JSON/JSONL records. Cloud profile data selections still apply; exportId and cursor come from cloud tools.',
        inputSchema: z.object({
          exportId: z.string().uuid(),
          cursor: z.string().regex(/^\d*$/).max(8).default(''),
          limit: z.number().int().min(1).max(50).default(50),
        }),
        annotations: { readOnlyHint: true },
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
        description: 'Permanently delete one of your stored cloud exports.',
        inputSchema: z.object({ exportId: z.string().uuid() }),
        annotations: { destructiveHint: true },
      },
      async ({ exportId }) => content(await cloud.delete(subject, exportId)),
    );
  }

  return { registerCloudTools };
}
