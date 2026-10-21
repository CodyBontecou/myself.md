import { documentationGuideSlugs } from '../core/documentation.js';

/** @typedef {{name:string,description:string,inputSchema:Record<string,unknown>,annotations:{readOnlyHint:boolean},execute:(input:Record<string,unknown>)=>Promise<unknown>}} BrowserTool */
/** @typedef {{registerTool:(tool:BrowserTool)=>void|Promise<void>}} ModelContext */
/** Register public documentation tools when the browser supports WebMCP. @param {ModelContext|undefined} context @param {ReturnType<typeof import('./public-client.js').createMyselfClient>} client */
export async function registerPublicTools(context, client) {
  if (!context) return;
  await context.registerTool({
    name: 'myself_public_documentation',
    description:
      'Read public setup documentation. Select mcp-workflows for filtered catalogs, aggregation, bounded waiting, retries and exports; other guides cover source setup. Contains no account records.',
    inputSchema: {
      type: 'object',
      properties: {
        guide: {
          type: 'string',
          enum: [...documentationGuideSlugs],
          description:
            'Use mcp-workflows for filtered discovery, aggregation, waiting, retries and file exports; other values are source-specific guides. Omit for getting started.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async (input) => {
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => key !== 'guide') ||
        (input.guide !== undefined && typeof input.guide !== 'string')
      )
        throw new Error('Choose a supported public documentation guide.');
      return {
        markdown: await client.docs(typeof input.guide === 'string' ? { guide: input.guide } : {}),
      };
    },
  });
  await context.registerTool({
    name: 'myself_dataset_catalog',
    description:
      'Discover supported questions and dataset adapters. Workflows include starter prompts, required types, prerequisites, query tools, limits and fictional answers. Follow nextCursor for the next page. No personal records or permissions are exposed.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 3, description: 'Datasets per page.' },
        cursor: {
          type: 'string',
          pattern: '^catalog-v1:[0-3]$',
          description: 'A cursor returned by a previous page.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async (input) => {
      if (
        !input ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !['limit', 'cursor'].includes(key)) ||
        (input.limit !== undefined && typeof input.limit !== 'number') ||
        (input.cursor !== undefined && typeof input.cursor !== 'string')
      )
        throw new Error('Invalid catalog arguments.');
      return client.datasets({
        ...(typeof input.limit === 'number' ? { limit: input.limit } : {}),
        ...(typeof input.cursor === 'string' ? { cursor: input.cursor } : {}),
      });
    },
  });
}
