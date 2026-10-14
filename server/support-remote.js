import { PairingError } from './errors.js';
import { z } from 'zod';
import { acknowledgeSupportNotifications } from '../packages/support-chat/notifications.js';
/** The host authenticates owners; the bridge credential never reaches the app.
 * @param {Record<string,string|undefined>} config
 * @param {(subject:string,agent:string)=>void} authorize
 * @param {typeof fetch} [transport]
 * @param {(subject:string)=>Promise<'owner'|'lifetime'|'guest'>} [resolveRole] */
export function createRemoteSupport(
  config,
  authorize,
  transport = fetch,
  resolveRole = async () => 'guest',
) {
  const origin = config.SUPPORT_ISOBOT_ORIGIN;
  const token = config.SUPPORT_ISOBOT_TOKEN;
  if (origin) {
    const url = new URL(origin);
    if (url.origin !== origin || url.protocol !== 'https:')
      throw new Error('Support origin must be an exact HTTPS origin.');
  }
  /** @param {string} subject @param {string} method @param {URLSearchParams} query
   * @param {unknown} body @param {string|null} [agent] */
  async function supportV1Api(subject, method, query, body, agent = null) {
    if (!origin || !token) throw new PairingError(503, 'Isobot support is not configured yet.');
    if (!['GET', 'POST'].includes(method)) throw new PairingError(405, 'Use GET or POST.');
    const role = subject.startsWith('support-guest:') ? 'guest' : await resolveRole(subject);
    const response = await transport(
      `${origin}/api/support/v1${method === 'GET' ? `?${query}` : ''}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Support-Owner': subject,
          'X-Support-Role': role,
          'Content-Type': 'application/json',
          ...(agent ? { 'X-Support-Agent': agent } : {}),
        },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
      },
    );
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new PairingError(502, 'Support redirected unexpectedly.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new PairingError(503, 'Support returned an empty response.');
    let bytes = 0,
      value = '';
    const decoder = new TextDecoder();
    try {
      while (true) {
        // Sequential reads enforce the response size limit before accepting more bytes.
        // oxlint-disable-next-line eslint/no-await-in-loop
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 2000000) throw new PairingError(502, 'Support response exceeds its limit.');
        value += decoder.decode(next.value, { stream: true });
      }
    } finally {
      await reader.cancel();
    }
    const data = JSON.parse(value + decoder.decode());
    if (!response.ok)
      throw new PairingError(
        response.status,
        typeof data.error === 'string' ? data.error : 'Support is temporarily unavailable.',
      );
    return data;
  }
  /** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject @param {string|null} agent */
  function registerSupportV1Tools(mcp, subject, agent) {
    mcp.registerTool(
      'support_conversations',
      {
        title: 'Manage support conversations',
        annotations: {
          title: 'Manage support conversations',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
        description:
          'Manage owner-approved support conversations through the first-party myself.md support API. Creates conversations, sends messages, requests or declines owner-reviewed data, updates read cursors and resolution state, or returns list/read snapshots and owner handoffs. This action tool can change data or trigger support delivery and processing; it is not an automatic read-only tool. Data requests await owner review; agents cannot approve uploads or grant themselves access. markAllRead and clearNotifications acknowledge observed unread replies without deleting conversations and return per-conversation outcomes. Archive and deletion remain owner actions.',
        inputSchema: z
          .object({
            action: z
              .enum([
                'list',
                'create',
                'read',
                'send',
                'request',
                'decline',
                'readCursor',
                'markAllRead',
                'clearNotifications',
                'resolve',
                'reopen',
                'ownerHandoff',
              ])
              .describe(
                'Support operation to perform. Read/list operations return snapshots; sending, requests, acknowledgements and resolution changes have side effects. Owner-only actions require ownerHandoff.',
              ),
            conversationId: z
              .string()
              .regex(/^[A-Za-z0-9_-]{1,100}$/)
              .optional()
              .describe(
                'Conversation ID returned by list or create, belonging to the signed-in account. Required for conversation-specific operations.',
              ),
            title: z
              .string()
              .max(120)
              .optional()
              .describe(
                'Optional conversation title when creating a support conversation, up to 120 characters.',
              ),
            ownerAction: z
              .enum(['archive', 'delete', 'agentAccess', 'autoReply', 'share', 'notifications'])
              .optional()
              .describe(
                'Owner-only action to open on the phone when action is ownerHandoff. Agents cannot perform this action themselves.',
              ),
            id: z
              .string()
              .optional()
              .describe(
                'Caller-generated unique message ID retained across retries of the same message; use a new ID for a different message.',
              ),
            text: z
              .string()
              .max(1800)
              .optional()
              .describe(
                'Support message text explicitly requested by the user. Do not include secrets or unapproved personal records.',
              ),
            reason: z
              .string()
              .max(1000)
              .optional()
              .describe(
                'Explanation for an owner-reviewed data request or decline, up to 1000 characters.',
              ),
            selector: z
              .object({
                category: z
                  .string()
                  .describe(
                    'Data category for the owner-reviewed support selection; use a category reported by support discovery.',
                  ),
                from: z
                  .number()
                  .int()
                  .describe(
                    'Beginning of the proposed support data range as a Unix timestamp in milliseconds.',
                  ),
                to: z
                  .number()
                  .int()
                  .describe(
                    'End of the proposed support data range as a Unix timestamp in milliseconds.',
                  ),
                operations: z
                  .array(z.string())
                  .optional()
                  .describe(
                    'Optional operation names restricting the proposed support data selection.',
                  ),
                issuesOnly: z
                  .boolean()
                  .optional()
                  .describe('If true, restrict the proposed support data selection to issues.'),
              })
              .optional()
              .describe(
                'Metadata identifying the proposed support data range. This requests owner review and does not upload or approve data.',
              ),
            requestId: z
              .string()
              .optional()
              .describe(
                'Existing request ID returned by the corresponding initiating operation; do not create a new ID when polling or retrying it.',
              ),
            readThrough: z
              .number()
              .int()
              .optional()
              .describe(
                'Sequence of the latest observed support message to acknowledge as read. Do not acknowledge messages that have not been inspected.',
              ),
            before: z
              .number()
              .int()
              .optional()
              .describe(
                'Pagination sequence returned by the previous support response. Omit for the newest page; pass the returned before value for older messages.',
              ),
          })
          .strict(),
      },
      async (input) => {
        if (!agent) throw new PairingError(403, 'A connected agent credential is required.');
        authorize(subject, agent);
        if (input.action === 'ownerHandoff') {
          const data = {
            status: 'awaiting_user',
            action: input.ownerAction ?? 'agentAccess',
            url: `myselfmd://support${input.conversationId ? `?conversationId=${encodeURIComponent(input.conversationId)}` : ''}`,
            verificationTool: 'support_conversations',
            conversationId: input.conversationId ?? null,
            requiresUser: true,
          };
          return {
            content: [{ type: /** @type {const} */ ('text'), text: JSON.stringify(data) }],
            structuredContent: data,
          };
        }
        const data =
          input.action === 'markAllRead' || input.action === 'clearNotifications'
            ? await acknowledgeSupportNotifications((action, fields = {}) => {
                authorize(subject, agent);
                return supportV1Api(
                  subject,
                  'POST',
                  new URLSearchParams(),
                  { ...fields, action },
                  agent,
                );
              }, input.action)
            : await supportV1Api(subject, 'POST', new URLSearchParams(), input, agent);
        return {
          content: [{ type: /** @type {const} */ ('text'), text: JSON.stringify(data) }],
          structuredContent: data,
        };
      },
    );
  }
  /** @param {string} subject */
  async function deleteRemoteSupport(subject) {
    if (!origin || !token) return;
    await supportV1Api(subject, 'POST', new URLSearchParams(), { action: 'deleteAccount' });
  }
  return { supportV1Api, registerSupportV1Tools, deleteRemoteSupport };
}
