import { z } from 'zod';
import { PairingError } from './errors.js';

const feedbackSettingsSchema = z
  .object({
    companionEnabled: z.boolean(),
    cropEnabled: z.boolean(),
    drawingEnabled: z.boolean(),
    titleEnabled: z.boolean(),
    descriptionEnabled: z.boolean(),
    tagsEnabled: z.boolean(),
  })
  .strict();

export const feedbackSchema = z.object({
  notificationsAvailable: z.boolean().optional(),
  availability: z.enum(['ready', 'missing_key', 'release_disabled', 'unavailable']),
  updates: z
    .object({
      enabled: z.boolean(),
      checkedAt: z.number().nullable(),
      error: z.string().max(1000).nullable(),
      cursor: z.string().nullable(),
      reports: z
        .array(
          z.object({
            id: z.string().regex(/^[a-f0-9]{64}$/),
            created: z.number().int(),
            status: z.enum(['submitted', 'pr', 'merged', 'released']),
            events: z
              .array(
                z.object({
                  id: z.string().max(100),
                  kind: z.enum(['pr', 'merged', 'released']),
                  url: z
                    .string()
                    .url()
                    .regex(
                      /^https:\/\/(github\.com\/CodyBontecou\/myself\.md\/pull\/\d+|apps\.apple\.com\/app\/id\d+)$/,
                    ),
                  version: z.string().max(30).optional(),
                  at: z.number().int(),
                }),
              )
              .max(3),
          }),
        )
        .max(50),
    })
    .optional(),
  settings: feedbackSettingsSchema.optional(),
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
/** @typedef {{id:string,subject:string,client:string|null,deviceId:string,expiresAt:number,status:string,issueUrl?:string,notificationsEnabled?:boolean,settings?:Partial<Record<keyof z.infer<typeof feedbackSettingsSchema>, boolean|undefined>>}} FeedbackOperation */
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
      settings: operation.settings ?? null,
      action: operation.settings
        ? 'settings'
        : typeof operation.notificationsEnabled === 'boolean'
          ? 'notifications'
          : 'report',
      notificationsEnabled: operation.notificationsEnabled ?? null,
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
          notificationsAvailable: phone?.catalog.feedback?.notificationsAvailable ?? false,
          settings: phone?.catalog.feedback?.settings ?? null,
          updates: phone?.catalog.feedback?.updates ?? null,
          notificationsHandoff:
            'Use request_phone_feedback_notifications to request owner approval and OS permission on the phone. Agents cannot enable notifications themselves.',
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
      async ({ deviceId, operationId }) => content(createOperation(deviceId, operationId)),
    );
    mcp.registerTool(
      'request_phone_feedback_settings',
      {
        description:
          'Change local Gripe Debug preferences on an owned foreground phone with explicit phone approval. Read get_phone_feedback for current settings. Configure companion, crop, drawing, title, description/prompt, and tags. Applies to next capture. A fresh operation UUID is required; repeat identical input for safe retry. Poll get_phone_feedback_operation; completed means native saved values confirmed, not a submitted report.',
        inputSchema: z.object({
          deviceId: z.string().uuid(),
          operationId: z.string().uuid(),
          settings: feedbackSettingsSchema
            .partial()
            .refine(
              (settings) => Object.keys(settings).length > 0,
              'Specify at least one setting.',
            ),
        }),
      },
      async ({ deviceId, operationId, settings }) =>
        content(createOperation(deviceId, operationId, settings)),
    );
    mcp.registerTool(
      'request_phone_feedback_notifications',
      {
        description:
          'Request owner approval to enable or disable report milestone notifications on an owned iOS phone. Enabling may require OS permission. Poll get_phone_feedback_operation; completed means the preference was saved, not that a push arrived.',
        inputSchema: z.object({
          deviceId: z.string().uuid(),
          operationId: z.string().uuid(),
          enabled: z.boolean(),
        }),
      },
      async ({ deviceId, operationId, enabled }) =>
        content(createOperation(deviceId, operationId, undefined, enabled)),
    );
    /** @param {string} deviceId @param {string} operationId @param {Partial<Record<keyof z.infer<typeof feedbackSettingsSchema>, boolean|undefined>>} [settings] @param {boolean} [notificationsEnabled] */
    function createOperation(deviceId, operationId, settings, notificationsEnabled) {
      own(deviceId, subject);
      const previous = operations.get(operationId);
      if (previous) {
        if (
          previous.subject !== subject ||
          previous.client !== client ||
          previous.deviceId !== deviceId ||
          previous.notificationsEnabled !== notificationsEnabled ||
          Object.keys(feedbackSettingsSchema.shape).some(
            (key) =>
              previous.settings?.[
                /** @type {keyof z.infer<typeof feedbackSettingsSchema>} */ (key)
              ] !== settings?.[/** @type {keyof z.infer<typeof feedbackSettingsSchema>} */ (key)],
          )
        )
          throw new PairingError(404, 'Feedback operation not found.');
        return snapshot(previous);
      }
      const phone = phones.get(deviceId);
      if (!phone || phone.seen <= Date.now() - 15000)
        throw new PairingError(409, 'Open the paired phone app first.');
      if (
        typeof notificationsEnabled === 'boolean'
          ? phone.catalog.feedback?.notificationsAvailable !== true
          : phone.catalog.feedback?.availability !== 'ready'
      )
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
        ...(settings ? { settings } : {}),
        ...(typeof notificationsEnabled === 'boolean' ? { notificationsEnabled } : {}),
      };
      operations.set(operationId, operation);
      return snapshot(operation);
    }
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
          result.status === 'completed' &&
          (operation.settings
            ? !feedback?.settings ||
              !Object.entries(operation.settings).every(
                ([key, value]) =>
                  feedback.settings?.[
                    /** @type {keyof z.infer<typeof feedbackSettingsSchema>} */ (key)
                  ] === value,
              )
            : typeof operation.notificationsEnabled === 'boolean'
              ? feedback?.updates?.enabled !== operation.notificationsEnabled
              : !result.issueUrl)
            ? 'failed'
            : result.status;
        if (result.issueUrl && operation.status === 'completed')
          operation.issueUrl = result.issueUrl;
        operations.set(operation.id, operation);
      }
      if (
        dispatch &&
        (typeof operation.notificationsEnabled === 'boolean'
          ? feedback?.notificationsAvailable === true
          : feedback?.availability === 'ready') &&
        ['accepted', 'awaiting_user', 'running'].includes(operation.status)
      )
        return {
          id: operation.id,
          expiresAt: operation.expiresAt,
          ...(operation.settings ? { settings: operation.settings } : {}),
          ...(typeof operation.notificationsEnabled === 'boolean'
            ? { notificationsEnabled: operation.notificationsEnabled }
            : {}),
        };
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
