import { PairingError } from './errors.js';
import { z } from 'zod';
/** The host authenticates owners; the bridge credential never reaches the app.
 * @param {Record<string,string|undefined>} config
 * @param {(subject:string,agent:string)=>void} authorize
 * @param {typeof fetch} [transport] */
export function createRemoteSupport(config, authorize, transport = fetch) {
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
    const response = await transport(
      `${origin}/api/support/v1${method === 'GET' ? `?${query}` : ''}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Support-Owner': subject,
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
        description:
          'List owner-approved support conversations or read/send/request data in one conversation. Data requests await owner review in the app; agents cannot approve uploads or grant themselves access. Archive and deletion are owner actions.',
        inputSchema: z
          .object({
            action: z.enum([
              'list',
              'create',
              'read',
              'send',
              'request',
              'decline',
              'readCursor',
              'resolve',
              'reopen',
              'ownerHandoff',
            ]),
            conversationId: z
              .string()
              .regex(/^[A-Za-z0-9_-]{1,100}$/)
              .optional(),
            title: z.string().max(120).optional(),
            ownerAction: z
              .enum(['archive', 'delete', 'agentAccess', 'autoReply', 'share', 'notifications'])
              .optional(),
            id: z.string().optional(),
            text: z.string().max(1800).optional(),
            reason: z.string().max(1000).optional(),
            selector: z
              .object({
                category: z.string(),
                from: z.number().int(),
                to: z.number().int(),
                operations: z.array(z.string()).optional(),
                issuesOnly: z.boolean().optional(),
              })
              .optional(),
            requestId: z.string().optional(),
            readThrough: z.number().int().optional(),
            before: z.number().int().optional(),
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
        const data = await supportV1Api(subject, 'POST', new URLSearchParams(), input, agent);
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
