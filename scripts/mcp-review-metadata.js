/** Inspect metadata actually emitted over MCP, including dynamically registered tools.
 * @param {Awaited<ReturnType<import('@modelcontextprotocol/client').Client['listTools']>>['tools']} tools */
export function reviewToolMetadata(tools) {
  if (!tools.length) throw new Error('The authenticated server returned no tools.');
  return tools.map((tool) => {
    reviewParameterDescriptions(tool.inputSchema, tool.name);
    const hints = tool.annotations;
    if (
      !tool.title?.trim() ||
      hints?.title !== tool.title ||
      tool.name.length > 64 ||
      !tool.description?.trim() ||
      typeof hints?.readOnlyHint !== 'boolean' ||
      typeof hints.destructiveHint !== 'boolean' ||
      typeof hints.idempotentHint !== 'boolean' ||
      typeof hints.openWorldHint !== 'boolean' ||
      hints.readOnlyHint === hints.destructiveHint
    )
      throw new Error(`Incomplete or contradictory review metadata: ${tool.name}`);
    // Do not copy schemas: account-bound literals can include the owner's subject.
    return { name: tool.name, title: tool.title, ...hints };
  });
}

/** Check the schema actually emitted by the SDK without retaining account-bound literals.
 * @param {unknown} schema @param {string} path */
function reviewParameterDescriptions(schema, path) {
  if (!schema || typeof schema !== 'object') return;
  const value = /** @type {Record<string,unknown>} */ (schema);
  if (value.properties && typeof value.properties === 'object') {
    for (const [name, property] of Object.entries(value.properties)) {
      if (
        !property ||
        typeof property !== 'object' ||
        typeof property.description !== 'string' ||
        !property.description.trim()
      )
        throw new Error(`Missing parameter description: ${path}.${name}`);
      reviewParameterDescriptions(property, `${path}.${name}`);
    }
  }
  if (value.items) reviewParameterDescriptions(value.items, `${path}[]`);
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const alternatives = value[key];
    if (Array.isArray(alternatives))
      alternatives.forEach((alternative) => reviewParameterDescriptions(alternative, path));
  }
}
