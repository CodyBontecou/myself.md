import { waitMsInput } from './bounded-wait.js';
import { z } from 'zod';
import { PairingError } from './errors.js';

/** @typedef {'accepted'|'awaiting_user'|'running'|'completed'|'failed'|'cancelled'|'expired'} CaptureStatus */
/** @typedef {'permission_denied'|'capture_failed'|'session_changed'|'interrupted'} CaptureError */
/** @typedef {{requestId:string,subject:string,client:string|null,deviceId:string,status:CaptureStatus,createdAt:number,expiresAt:number,capturedAt?:string,error?:CaptureError}} LocationCapture */
const terminal = new Set(['completed', 'failed', 'cancelled', 'expired']);
const descriptions = {
  permission_denied:
    'Location permission was not granted. Review foreground Location access on the phone.',
  capture_failed:
    'The phone could not save a Location point. Review Location services and retry with a new request after checking the phone.',
  session_changed:
    'The phone account or connection changed. No new point was confirmed for this request.',
  interrupted:
    'Capture was interrupted. Check the phone before approving a new request; an already-started native operation may have finished locally.',
};
export const locationCaptureInput = z
  .object({
    waitMs: waitMsInput,
    action: z
      .enum(['request', 'status', 'cancel'])
      .default('request')
      .describe(
        'Request one owner-approved point, inspect its lifecycle, or cancel before capture starts.',
      ),
    deviceId: z
      .string()
      .uuid()
      .describe('Owned phone UUID from list_connected_phones; open its current app first.'),
    requestId: z
      .string()
      .uuid()
      .describe(
        'Caller-chosen UUID for this exact one-point request. Reuse it for status, cancellation and safe retries.',
      ),
  })
  .strict();
const phoneInput = z
  .object({
    requestId: z.string().uuid(),
    action: z.enum(['start', 'check', 'complete', 'fail', 'cancel']),
    capturedAt: z.iso.datetime().optional(),
    error: z
      .enum(['permission_denied', 'capture_failed', 'session_changed', 'interrupted'])
      .optional(),
  })
  .strict();

/** Metadata only: no coordinates, native records, profile grants or background controls.
 * @param {{captures:Map<string,LocationCapture>,own:(deviceId:string,subject:string)=>void,phone:(deviceId:string)=>{seen:number,catalog:{locationCapture?:{version:1}|undefined,domains:{domain:string,permission?:string|undefined}[]}}|undefined,authorize:(subject:string,client:string|null)=>void}} dependencies */
export function createLocationCaptures({ captures, own, phone, authorize }) {
  /** @param {LocationCapture} request */
  function expire(request) {
    if (!terminal.has(request.status) && request.expiresAt <= Date.now()) {
      request.status = 'expired';
      captures.set(request.requestId, request);
    }
    return request;
  }
  /** @param {LocationCapture} request */
  function result(request) {
    expire(request);
    const current = phone(request.deviceId);
    return {
      requestId: request.requestId,
      deviceId: request.deviceId,
      status: request.status,
      createdAt: new Date(request.createdAt).toISOString(),
      expiresAt: new Date(request.expiresAt).toISOString(),
      online: Boolean(current && current.seen > Date.now() - 15000),
      permission:
        current?.catalog.domains.find((domain) => domain.domain === 'location')?.permission ??
        'unknown',
      canCancel: ['accepted', 'awaiting_user'].includes(request.status),
      ownerHandoff: {
        deepLink: 'myselfmd://data/location',
        requiresUserApproval: true,
        instructions:
          'Open myself.md and approve Save one point. Any system Location permission must also be approved on the phone. This request does not enable agent data access or background recording.',
      },
      ...(request.capturedAt ? { capturedAt: request.capturedAt, recordCount: 1 } : {}),
      ...(request.error ? { error: request.error, message: descriptions[request.error] } : {}),
      ...(request.status === 'running'
        ? {
            message:
              'Native capture has started and cannot be cancelled. Completion requires a saved-point receipt from the phone.',
          }
        : {}),
    };
  }
  /** @param {string} subject @param {string|null} client @param {z.infer<typeof locationCaptureInput>} input */
  function tool(subject, client, input) {
    own(input.deviceId, subject);
    authorize(subject, client);
    const existing = captures.get(input.requestId);
    if (existing) {
      if (
        existing.subject !== subject ||
        existing.client !== client ||
        existing.deviceId !== input.deviceId
      )
        throw new PairingError(
          404,
          'Location capture request not found for this account, agent and phone.',
        );
      expire(existing);
      if (input.action === 'cancel' && ['accepted', 'awaiting_user'].includes(existing.status)) {
        existing.status = 'cancelled';
        captures.set(existing.requestId, existing);
      }
      return result(existing);
    }
    if (input.action !== 'request')
      throw new PairingError(404, 'Location capture request not found.');
    const current = phone(input.deviceId);
    if (!current || current.seen <= Date.now() - 15000)
      throw new PairingError(
        409,
        'Phone is offline. Open myself.md before requesting one-point capture.',
      );
    if (current.catalog.locationCapture?.version !== 1)
      throw new PairingError(
        409,
        'This phone does not support owner-reviewed Location capture. Update myself.md and reopen it.',
      );
    if (
      [...captures.values()].filter(
        (request) => request.subject === subject && !terminal.has(expire(request).status),
      ).length >= 10
    )
      throw new PairingError(
        429,
        'Too many pending Location capture requests. Cancel pending requests or wait for their outcomes.',
      );
    const request = {
      requestId: input.requestId,
      subject,
      client,
      deviceId: input.deviceId,
      status: /** @type {const} */ ('accepted'),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    };
    captures.set(request.requestId, request);
    return result(request);
  }
  /** @param {string} subject @param {string} deviceId */
  function dispatch(subject, deviceId) {
    for (const request of captures.values()) {
      if (
        request.subject !== subject ||
        request.deviceId !== deviceId ||
        !['accepted', 'awaiting_user'].includes(expire(request).status)
      )
        continue;
      try {
        authorize(subject, request.client);
      } catch {
        cancel(subject, deviceId, request.client);
        continue;
      }
      request.status = 'awaiting_user';
      captures.set(request.requestId, request);
      return { requestId: request.requestId, expiresAt: new Date(request.expiresAt).toISOString() };
    }
    return null;
  }
  /** @param {string} subject @param {string} deviceId @param {unknown} body */
  function report(subject, deviceId, body) {
    own(deviceId, subject);
    const input = phoneInput.parse(body);
    const request = captures.get(input.requestId);
    if (!request || request.subject !== subject || request.deviceId !== deviceId)
      throw new PairingError(404, 'Location capture request not found for this phone.');
    authorize(subject, request.client);
    expire(request);
    if (terminal.has(request.status) || input.action === 'check') return result(request);
    if (input.action === 'cancel' && request.status !== 'running') request.status = 'cancelled';
    else if (input.action === 'start') {
      if (request.status !== 'awaiting_user')
        throw new PairingError(409, 'Wait for phone review before starting Location capture.');
      request.status = 'running';
    } else if (input.action === 'complete') {
      if (request.status !== 'running' || !input.capturedAt)
        throw new PairingError(
          409,
          'Location capture requires owner approval and a saved-point receipt.',
        );
      const captured = Date.parse(input.capturedAt);
      if (captured < request.createdAt - 60000 || captured > Date.now() + 300000)
        throw new PairingError(409, 'Location capture receipt is outside this request window.');
      request.status = 'completed';
      request.capturedAt = input.capturedAt;
    } else if (input.action === 'fail') {
      request.status = 'failed';
      request.error = input.error ?? 'capture_failed';
    }
    captures.set(request.requestId, request);
    return result(request);
  }
  /** @param {string} subject @param {string} [deviceId] @param {string|null} [client] */
  function cancel(subject, deviceId, client) {
    for (const request of captures.values()) {
      if (
        request.subject !== subject ||
        (deviceId && request.deviceId !== deviceId) ||
        (client !== undefined && request.client !== client)
      )
        continue;
      expire(request);
      if (terminal.has(request.status)) continue;
      request.status = request.status === 'running' ? 'failed' : 'cancelled';
      if (request.status === 'failed') request.error = 'interrupted';
      captures.set(request.requestId, request);
    }
  }
  return { tool, dispatch, report, cancel };
}
