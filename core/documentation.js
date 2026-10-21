import { healthGuides, healthGuideSlugs } from './health-guides.js';
import { mcpGuide, mcpGuideSlug } from './mcp-guide.js';
export const documentationGuideSlugs = /** @type {const} */ ([mcpGuideSlug, ...healthGuideSlugs]);
export const documentationGuides = [mcpGuide, ...healthGuides];
