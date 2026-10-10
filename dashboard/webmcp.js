/** @typedef {{name:string,description:string,inputSchema:Record<string,unknown>,annotations:{readOnlyHint:boolean},execute:(input:Record<string,unknown>)=>Promise<unknown>}} BrowserTool */
/** @typedef {{registerTool:(tool:BrowserTool)=>void|Promise<void>}} ModelContext */
/** Register public documentation tools when the browser supports WebMCP. @param {ModelContext|undefined} context @param {ReturnType<typeof import('./public-client.js').createMyselfClient>} client */
export async function registerPublicTools(context, client) {
  if (!context) return;
  await context.registerTool({
    name: 'myself_public_documentation',
    description:
      'Read myself.md public MCP, OAuth, privacy and API documentation. Contains no account records.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async (input) => {
      if (!input || Array.isArray(input) || Object.keys(input).length)
        throw new Error('This tool takes an empty object.');
      return { markdown: await client.docs() };
    },
  });
  await context.registerTool({
    name: 'myself_dataset_catalog',
    description:
      'List supported public datasets and adapter limits. Follow nextCursor for the next page. No personal records or permissions are exposed.',
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
