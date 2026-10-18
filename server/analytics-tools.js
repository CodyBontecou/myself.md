import { z } from 'zod';
import { analyticsAudiences, analyticsSurfaces } from '../core/analytics.js';
const result = (/** @type {unknown} */ value) => ({
  content: [{ type: /** @type {const} */ ('text'), text: JSON.stringify(value) }],
  structuredContent: /** @type {Record<string,unknown>} */ (value),
});
/** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {import('../core/analytics.js').AnalyticsService} analytics @param {string} subject @param {()=>Promise<void>} guard */
export async function registerAnalyticsTools(mcp, analytics, subject, guard) {
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  mcp.registerTool(
    'get_usage_analytics_preference',
    {
      title: 'Read usage analytics preference',
      description:
        'Read whether your account opted in to content-free product analytics. Local signed-out installation/browser choices are separate.',
      inputSchema: z.object({}).strict(),
      annotations: { ...annotations, title: 'Read usage analytics preference' },
    },
    async () => {
      await guard();
      return result(await analytics.preferences(subject));
    },
  );
  mcp.registerTool(
    'set_usage_analytics_preference',
    {
      title: 'Change usage analytics preference',
      description:
        'Apply the owner’s explicit analytics choice for this account. Enabling requires their consent and ALLOW_USAGE_ANALYTICS confirmation. Disabling erases linked events and stops authenticated collection. Cannot change another account or signed-out device choices.',
      inputSchema: z
        .object({
          enabled: z.boolean().describe('Owner-selected analytics participation.'),
          confirmation: z
            .literal('ALLOW_USAGE_ANALYTICS')
            .optional()
            .describe('Required only when the owner explicitly enables usage analytics.'),
        })
        .strict(),
      annotations: {
        ...annotations,
        title: 'Change usage analytics preference',
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async (input) => {
      await guard();
      return result(await analytics.preferences(subject, input));
    },
  );
  if (!(await analytics.canRead(subject))) return;
  mcp.registerTool(
    'get_product_analytics_report',
    {
      title: 'Read product analytics report',
      description:
        'Operator-only aggregate event counts, ordered activation funnel, daily activity and exact UTC day 1/7/30 retention. Defaults to customers, excluding known operators, reviewer and configured QA identities and their aliases. Unknown anonymous traffic may remain. Consented events only. No raw identities or payloads. Access is checked again on every read; ordinary users, blocked agents and reviewer accounts cannot read reports.',
      inputSchema: z
        .object({
          start: z.string().describe('Inclusive UTC date YYYY-MM-DD.'),
          end: z.string().describe('Exclusive UTC date YYYY-MM-DD; range at most 90 days.'),
          surface: z
            .enum(analyticsSurfaces)
            .optional()
            .describe('Optional event surface filter. Omit for journeys across surfaces.'),
          audience: z
            .enum(analyticsAudiences)
            .optional()
            .describe(
              'Defaults to customers. Select internal for known owner/QA activity or all for the unfiltered comparison. Changes reporting only; no events are erased.',
            ),
        })
        .strict(),
      annotations: { ...annotations, title: 'Read product analytics report' },
    },
    async (input) => {
      await guard();
      return result(await analytics.report(subject, input));
    },
  );
}
