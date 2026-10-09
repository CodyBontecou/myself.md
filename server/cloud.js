import { Buffer } from 'node:buffer';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HistoryStore } from './history-store.js';
import { CloudStore } from './cloud-store.js';
import { devices, PairingError } from './store.js';
const directory = process.env.DATA_DIR ?? '.local';
mkdirSync(directory, { recursive: true });
const path = join(directory, 'cloud.key');
if (!process.env.CLOUD_ENCRYPTION_KEY && process.env.ALLOW_HTTP_DEV !== '1')
  throw new Error(
    'Set CLOUD_ENCRYPTION_KEY to 64 hex characters before enabling the cloud service.',
  );
if (!process.env.CLOUD_ENCRYPTION_KEY && !existsSync(path))
  writeFileSync(path, randomBytes(32), { mode: 0o600 });
const key = process.env.CLOUD_ENCRYPTION_KEY
  ? Buffer.from(process.env.CLOUD_ENCRYPTION_KEY, 'hex')
  : readFileSync(path);
export const cloud = new CloudStore(join(directory, 'cloud.sqlite'), key);
export const history = new HistoryStore(join(directory, 'history.sqlite'), cloud);
/** @param {string} subject @param {string} id */
export function ownCloudDevice(subject, id) {
  if (!devices(subject).some((d) => d.id === id))
    throw new PairingError(404, 'Connected phone not found.');
}
const content = (/** @type {unknown} */ value) => ({
  content: [{ type: /** @type {const} */ ('text'), text: JSON.stringify(value) }],
});
/** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject @param {string|null} [client] */
export function registerCloudTools(mcp, subject, client = null) {
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
        const page = cloud.page(subject, exportId, Number(cursor || 0), limit, true);
        history.update(subject, id, {
          status: 'complete',
          recordCount: page.records.length,
          warnings: page.nextCursor ? ['This returned page has more records available.'] : [],
        });
        return content(page);
      } catch (error) {
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
    async ({ exportId }) => content(cloud.delete(subject, exportId)),
  );
}
