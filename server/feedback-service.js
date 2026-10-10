import { z } from 'zod';
import { PairingError } from './errors.js';

export const feedbackSchema = z.object({
  availability: z.enum(['ready', 'missing_key', 'release_disabled', 'unavailable']),
  operation: z
    .object({
      id: z.string().uuid(),
      expiresAt: z.number().int(),
      status: z.enum(['awaiting_user', 'running', 'completed', 'failed', 'cancelled']),
      issueUrl: z
        .string()
        .url()
        .regex(
          /^https:\/\/(?:github\.com\/[^/]+\/[^/]+\/issues\/\d+|gripe\.isolated\.tech\/reports\/[a-f0-9]{64})$/,
        )
        .optional(),
    })
    .nullable(),
});
/** @typedef {{id:string,subject:string,client:string|null,deviceId:string,expiresAt:number,status:string,issueUrl?:string}} FeedbackOperation */
/** @param {unknown} value */
const content = (value) => ({
  content: [{ type: /** @type {const} */ ('text'), text: JSON.stringify(value) }],
  structuredContent: /** @type {Record<string,unknown>} */ (value),
});
/** @param {{own:(deviceId:string,subject:string)=>void,phones:Map<string,import('./data-service.js').Phone>,operations:Map<string,FeedbackOperation>}} dependencies */
export function createFeedbackService({ own, phones, operations }) {
  /** @param {FeedbackOperation} operation */
  function snapshot(operation) {
    if (
      Date.now() >= operation.expiresAt &&
      ['accepted', 'awaiting_user', 'running'].includes(operation.status)
    ) {
      operation.status = 'expired';
      operations.set(operation.id, operation);
    }
    return {
      operationId: operation.id,
      deviceId: operation.deviceId,
      status: operation.status,
      expiresAt: operation.expiresAt,
      issueUrl: operation.issueUrl ?? null,
    };
  }
  /** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject @param {string|null} client */
  function register(mcp, subject, client) {
    mcp.registerTool(
      'get_phone_feedback',
      {
        description:
          'Discover development-only iOS screenshot feedback on an owned phone. Reports require user approval and manual screenshot review/submission. No key, screenshot or report text is returned. Availability is from the latest heartbeat; open the phone app first.',
        inputSchema: z.object({ deviceId: z.string().uuid() }),
        annotations: { readOnlyHint: true },
      },
      async ({ deviceId }) => {
        own(deviceId, subject);
        const phone = phones.get(deviceId);
        return content({
          deviceId,
          online: Boolean(phone && phone.seen > Date.now() - 15000),
          lastSeen: phone?.seen ?? null,
          availability: phone?.catalog.feedback?.availability ?? 'unavailable',
          requiresUser: true,
        });
      },
    );
    mcp.registerTool(
      'request_phone_feedback',
      {
        description:
          'Request the same native bug-report flow as Report a bug on an owned iOS dev phone. Use a fresh UUID operationId; repeat it to safely inspect/retry dispatch. Phone asks the user before capture; user crops/annotates/submits. Accepted or opened does not confirm submission. Expires in five minutes. Poll get_phone_feedback_operation for submission completion and its issue or Gripe receipt URL. Completion never means a coding fix finished. Does not read or grant personal data.',
        inputSchema: z.object({ deviceId: z.string().uuid(), operationId: z.string().uuid() }),
      },
      async ({ deviceId, operationId }) => {
        own(deviceId, subject);
        const previous = operations.get(operationId);
        if (previous) {
          if (
            previous.subject !== subject ||
            previous.client !== client ||
            previous.deviceId !== deviceId
          )
            throw new PairingError(404, 'Feedback operation not found.');
          return content(snapshot(previous));
        }
        const phone = phones.get(deviceId);
        if (!phone || phone.seen <= Date.now() - 15000)
          throw new PairingError(409, 'Open the paired phone app first.');
        if (phone.catalog.feedback?.availability !== 'ready')
          throw new PairingError(409, 'Feedback requires a configured iOS Debug build.');
        if (
          [...operations.values()].some(
            (op) =>
              op.deviceId === deviceId &&
              ['accepted', 'awaiting_user', 'running'].includes(snapshot(op).status),
          )
        )
          throw new PairingError(409, 'Finish or cancel the current feedback request first.');
        const operation = {
          id: operationId,
          subject,
          client,
          deviceId,
          expiresAt: Date.now() + 300000,
          status: 'accepted',
        };
        operations.set(operationId, operation);
        return content(snapshot(operation));
      },
    );
    mcp.registerTool(
      'get_phone_feedback_operation',
      {
        description:
          'Inspect a feedback request initiated by this agent. Completed means report submission confirmed on the phone by a GitHub issue or Gripe receipt URL; it does not mean a coding fix completed. Failed submissions may remain in the SDK retry queue; do not create another report after uncertain delivery. Expired requests cannot initiate a capture; an already approved manual flow may still be open on the phone.',
        inputSchema: z.object({ operationId: z.string().uuid() }),
        annotations: { readOnlyHint: true },
      },
      async ({ operationId }) => {
        const operation = operations.get(operationId);
        if (!operation || operation.subject !== subject || operation.client !== client)
          throw new PairingError(404, 'Feedback operation not found.');
        own(operation.deviceId, subject);
        return content(snapshot(operation));
      },
    );
  }
  /** @param {string} deviceId @param {string} subject @param {z.infer<typeof feedbackSchema>|undefined} feedback @param {boolean} dispatch */
  function poll(deviceId, subject, feedback, dispatch) {
    for (const operation of operations.values()) {
      if (operation.deviceId !== deviceId || operation.subject !== subject) continue;
      const state = snapshot(operation);
      if (!['accepted', 'awaiting_user', 'running'].includes(state.status)) continue;
      const result = feedback?.operation;
      if (result?.id === operation.id) {
        operation.status =
          result.status === 'completed' && !result.issueUrl ? 'failed' : result.status;
        if (result.issueUrl && operation.status === 'completed')
          operation.issueUrl = result.issueUrl;
        operations.set(operation.id, operation);
      }
      if (
        dispatch &&
        feedback?.availability === 'ready' &&
        ['accepted', 'awaiting_user', 'running'].includes(operation.status)
      )
        return { id: operation.id, expiresAt: operation.expiresAt };
    }
    return null;
  }
  /** @param {(op:FeedbackOperation)=>boolean} predicate */
  function cancel(predicate) {
    for (const operation of operations.values())
      if (
        predicate(operation) &&
        ['accepted', 'awaiting_user', 'running'].includes(operation.status)
      ) {
        operation.status = 'cancelled';
        operations.set(operation.id, operation);
      }
  }
  function cleanup() {
    for (const operation of operations.values()) {
      snapshot(operation);
      if (Date.now() > operation.expiresAt + 300000) operations.delete(operation.id);
    }
  }
  /** @param {string} deviceId @param {string} subject @param {string} id */
  function authorize(deviceId, subject, id) {
    const operation = operations.get(id);
    if (
      !operation ||
      operation.subject !== subject ||
      operation.deviceId !== deviceId ||
      !['accepted', 'awaiting_user'].includes(snapshot(operation).status)
    )
      throw new PairingError(409, 'Feedback request expired or was cancelled.');
    return { authorized: true };
  }
  return { register, poll, cancel, cleanup, authorize };
}
