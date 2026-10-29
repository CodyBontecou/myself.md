/** Preserve saved cards when a redesigned renderer gets a new resource address.
 * @param {import('@modelcontextprotocol/server').McpServer} mcp
 * @param {string} uri @param {string} html @param {string[]} [resourceDomains] */
export function registerReviewResourceAlias(mcp, uri, html, resourceDomains = []) {
  mcp.registerResource(uri, uri, {}, async () => ({
    contents: [
      {
        uri,
        mimeType: 'text/html;profile=mcp-app',
        text: html,
        _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains } } },
      },
    ],
  }));
}
