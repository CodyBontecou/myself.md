import { waitMsInput } from './bounded-wait.js';
import { z } from 'zod';
import { PairingError } from './errors.js';
/** @typedef {{requestId:string,subject:string,client:string|null,deviceId:string,operation:'connect'|'disconnect',status:'accepted'|'awaiting_user'|'running'|'completed'|'failed'|'cancelled'|'expired',createdAt:number,expiresAt:number}} WhoopRequest */
export const whoopRequestInput = z
  .object({
    waitMs: waitMsInput,
    action: z
      .enum(['request', 'status', 'cancel'])
      .default('request')
      .describe(
        'Request an owner-reviewed operation, inspect the existing request, or cancel before it starts.',
      ),
    deviceId: z
      .string()
      .uuid()
      .describe('Owned phone UUID from list_connected_phones. Open the current app first.'),
    requestId: z
      .string()
      .uuid()
      .describe(
        'Caller-chosen UUID for this exact operation. Reuse with identical device and operation for retries, status and cancellation.',
      ),
    operation: z
      .enum(['connect', 'disconnect'])
      .describe(
        'Connect or reconnect through WHOOP sign-in and consent, or revoke WHOOP access and erase phone credentials. Both require owner review.',
      ),
  })
  .strict();
const terminal = new Set(['completed', 'failed', 'cancelled', 'expired']);
/** @param {{requests:Map<string,WhoopRequest>,own:(device:string,subject:string)=>void,authorize:(subject:string,client:string|null)=>void,phone:(device:string)=>{seen:number,catalog:{whoop?:{connected:boolean}|undefined}}|undefined}} dependencies */
export function createWhoopRequests({ requests, own, authorize, phone }) {
  /** @param {WhoopRequest} item */
  function update(item) {
    if (!terminal.has(item.status) && item.expiresAt <= Date.now()) item.status = 'expired';
    requests.set(item.requestId, item);
    return item;
  }
  /** @param {WhoopRequest} item */
  function result(item) {
    update(item);
    return {
      requestId: item.requestId,
      deviceId: item.deviceId,
      operation: item.operation,
      status: item.status,
      expiresAt: new Date(item.expiresAt).toISOString(),
      connected: phone(item.deviceId)?.catalog.whoop?.connected ?? null,
      requiresUserApproval: true,
      deepLink: 'myselfmd://whoop',
      message:
        item.status === 'failed'
          ? 'WHOOP operation failed or was interrupted. Check Settings → WHOOP on the phone before creating a new request.'
          : 'The owner reviews this operation on the phone. WHOOP authentication and consent require the owner. Connection does not select data or grant agent access.',
    };
  }
  /** @param {string} subject @param {string|null} client @param {z.infer<typeof whoopRequestInput>} input */
  function tool(subject, client, input) {
    own(input.deviceId, subject);
    authorize(subject, client);
    const existing = requests.get(input.requestId);
    if (existing) {
      if (
        existing.subject !== subject ||
        existing.client !== client ||
        existing.deviceId !== input.deviceId ||
        existing.operation !== input.operation
      )
        throw new PairingError(
          404,
          'WHOOP request not found for this account, agent, phone and operation.',
        );
      update(existing);
      if (input.action === 'cancel' && ['accepted', 'awaiting_user'].includes(existing.status))
        existing.status = 'cancelled';
      return result(existing);
    }
    if (input.action !== 'request') throw new PairingError(404, 'WHOOP request not found.');
    const current = phone(input.deviceId);
    if (!current || current.seen <= Date.now() - 15000 || !current.catalog.whoop)
      throw new PairingError(409, 'Open a WHOOP-capable version of myself.md on this phone first.');
    if (
      [...requests.values()].some(
        (r) => r.deviceId === input.deviceId && !terminal.has(update(r).status),
      )
    )
      throw new PairingError(
        409,
        'This phone already has a pending WHOOP request. Inspect or cancel it first.',
      );
    const item = {
      requestId: input.requestId,
      subject,
      client,
      deviceId: input.deviceId,
      operation: input.operation,
      status: /** @type {const} */ ('accepted'),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    };
    return result(item);
  }
  /** @param {string} subject @param {string} deviceId */
  function dispatch(subject, deviceId) {
    for (const item of requests.values()) {
      if (
        item.subject !== subject ||
        item.deviceId !== deviceId ||
        !['accepted', 'awaiting_user'].includes(update(item).status)
      )
        continue;
      try {
        authorize(subject, item.client);
      } catch {
        item.status = 'cancelled';
        update(item);
        continue;
      }
      item.status = 'awaiting_user';
      update(item);
      return {
        requestId: item.requestId,
        operation: item.operation,
        expiresAt: new Date(item.expiresAt).toISOString(),
      };
    }
    return null;
  }
  /** @param {string} subject @param {string} deviceId @param {unknown} body */
  function report(subject, deviceId, body) {
    own(deviceId, subject);
    const input = z
      .object({
        requestId: z.string().uuid(),
        action: z.enum(['start', 'complete', 'fail', 'cancel']),
      })
      .strict()
      .parse(body);
    const item = requests.get(input.requestId);
    if (!item || item.subject !== subject || item.deviceId !== deviceId)
      throw new PairingError(404, 'WHOOP request not found.');
    authorize(subject, item.client);
    update(item);
    if (terminal.has(item.status)) return result(item);
    if (input.action === 'start' && item.status === 'awaiting_user') item.status = 'running';
    else if (input.action === 'complete' && item.status === 'running') item.status = 'completed';
    else if (input.action === 'fail') item.status = 'failed';
    else if (input.action === 'cancel') item.status = 'cancelled';
    else
      throw new PairingError(409, 'WHOOP completion requires an owner-approved running operation.');
    return result(item);
  }
  /** @param {string} subject @param {string} [deviceId] @param {string|null} [client] */
  function cancel(subject, deviceId, client) {
    for (const item of requests.values()) {
      if (
        item.subject !== subject ||
        (deviceId && item.deviceId !== deviceId) ||
        (client !== undefined && item.client !== client) ||
        terminal.has(update(item).status)
      )
        continue;
      item.status = item.status === 'running' ? 'failed' : 'cancelled';
      update(item);
    }
  }
  return { tool, dispatch, report, cancel };
}
