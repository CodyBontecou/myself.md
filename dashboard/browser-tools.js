import { createMyselfClient } from './public-client.js';
import { registerPublicTools } from './webmcp.js';
const context =
  /** @type {Document & {modelContext?:import('./webmcp.js').ModelContext}} */ (document)
    .modelContext ??
  /** @type {Navigator & {modelContext?:import('./webmcp.js').ModelContext}} */ (navigator)
    .modelContext;
void registerPublicTools(context, createMyselfClient({ origin: location.origin })).catch(() => {
  console.warn('Public browser tools could not be registered. Use /mcp or /docs.');
});
