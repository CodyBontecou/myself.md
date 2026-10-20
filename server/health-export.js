import { parseProfile } from '../core/profiles.js';
import { z } from 'zod';
import { PairingError } from './errors.js';

export const healthExportInput = z
  .object({
    action: z
      .enum(['request', 'status', 'cancel'])
      .default('request')
      .describe(
        'Request owner review, inspect delivery, or stop remaining work. Existing files are retained on cancellation.',
      ),
    deviceId: z.string().uuid().describe('Owned online phone from list_connected_phones.'),
    profileId: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'Saved profile from get_phone_data_catalog. Only its selected Health types will be exported, using its saved destination and output settings.',
      ),
    requestId: z
      .string()
      .uuid()
      .describe(
        'Caller-chosen UUID. Reuse for retries/status/cancellation; a new UUID requests a new export and requires new owner approval.',
      ),
  })
  .strict();
const receiptSchema = z
  .object({
    historyId: z.string().min(1).max(200),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    days: z.number().int().min(1).max(100000),
    batches: z.number().int().min(1).max(4000),
    recordCount: z.number().int().nonnegative(),
    failedSources: z.number().int().nonnegative(),
  })
  .strict();
const phoneInput = z
  .object({
    requestId: z.string().uuid(),
    action: z.enum(['start', 'check', 'complete', 'fail', 'cancel']),
    receipt: receiptSchema.optional(),
    error: z
      .enum(['export_failed', 'interrupted', 'profile_changed', 'history_permission_required'])
      .optional(),
  })
  .strict();
/** @typedef {'accepted'|'awaiting_user'|'running'|'completed'|'failed'|'cancelled'|'expired'} Status */
/** @typedef {{requestId:string,subject:string,client:string|null,deviceId:string,profileId:string,configuration:string,status:Status,createdAt:number,expiresAt:number,receipt?:z.infer<typeof receiptSchema>,error?:'export_failed'|'interrupted'|'profile_changed'|'history_permission_required'}} HealthExport */
const terminal = new Set(['completed', 'failed', 'cancelled', 'expired']);
/** Owner confirmation authorizes export delivery, never access to the records by the requesting agent.
 * @param {{requests:Map<string,HealthExport>,own:(deviceId:string,subject:string)=>void,phone:(deviceId:string)=>{seen:number,catalog:{allTimeHealthExport?:{version:1}|undefined,profiles:{id:string,selection:{health:string[]}}[]}}|undefined,authorize:(subject:string,client:string|null)=>void}} dependencies */
export function createHealthExports({ requests, own, phone, authorize }) {
  /** @param {HealthExport} request */
  function expire(request) {
    if (!terminal.has(request.status) && request.expiresAt <= Date.now()) {
      request.status = 'expired';
      requests.set(request.requestId, request);
    }
    return request;
  }
  /** @param {HealthExport} request */
  function validate(request) {
    own(request.deviceId, request.subject);
    authorize(request.subject, request.client);
    expire(request);
    if (!terminal.has(request.status)) {
      const profile = phone(request.deviceId)?.catalog.profiles.find(
        (p) => p.id === request.profileId,
      );
      if (!profile || JSON.stringify(parseProfile(profile)) !== request.configuration) {
        request.status = 'failed';
        request.error = 'profile_changed';
        requests.set(request.requestId, request);
      }
    }
  }
  /** @param {HealthExport} request */
  function result(request) {
    validate(request);
    return {
      requestId: request.requestId,
      deviceId: request.deviceId,
      profileId: request.profileId,
      range: 'all_time',
      domain: 'health',
      status: request.status,
      createdAt: new Date(request.createdAt).toISOString(),
      expiresAt: new Date(request.expiresAt).toISOString(),
      online: (phone(request.deviceId)?.seen ?? 0) > Date.now() - 15000,
      canCancel: !terminal.has(request.status),
      ownerHandoff: {
        deepLink: 'myselfmd://profiles',
        requiresUserApproval: true,
        instructions:
          'Open myself.md and approve All Time Health export. It uses the saved profile destination and selected Health types. Keep the phone open. OS permissions, past-data access and secure destination setup require the owner. This does not enable agent read access.',
      },
      ...(request.receipt
        ? { receipt: request.receipt, partial: request.receipt.failedSources > 0 }
        : {}),
      ...(request.error
        ? {
            error: request.error,
            message:
              request.error === 'history_permission_required'
                ? 'All Time requires Health Connect past-data access. Approve it in Health Connect app permissions on an updated phone build, then retry with a new request ID.'
                : request.error === 'profile_changed'
                  ? 'The profile changed. Review the current profile and use a new request ID.'
                  : 'Export was not confirmed. Inspect phone export history for already-written files before requesting new work; a new request may repeat those files.',
          }
        : {}),
      ...(request.status === 'expired' || request.status === 'cancelled'
        ? {
            message:
              'Remaining work stopped. Already-written files are retained; inspect phone history before retrying.',
          }
        : {}),
    };
  }
  /** @param {string} subject @param {string|null} client @param {z.infer<typeof healthExportInput>} input */
  function tool(subject, client, input) {
    own(input.deviceId, subject);
    authorize(subject, client);
    const existing = requests.get(input.requestId);
    if (existing) {
      if (
        existing.subject !== subject ||
        existing.client !== client ||
        existing.deviceId !== input.deviceId ||
        existing.profileId !== input.profileId
      )
        throw new PairingError(
          404,
          'Export request not found for this account, agent, phone and profile.',
        );
      validate(existing);
      if (input.action === 'cancel' && !terminal.has(existing.status)) {
        existing.status = 'cancelled';
        requests.set(existing.requestId, existing);
      }
      return result(existing);
    }
    if (input.action !== 'request') throw new PairingError(404, 'Export request not found.');
    const current = phone(input.deviceId);
    if (!current || current.seen <= Date.now() - 15000)
      throw new PairingError(409, 'Open myself.md on the phone first.');
    if (current.catalog.allTimeHealthExport?.version !== 1)
      throw new PairingError(409, 'Update the phone app to support All Time Health exports.');
    const profile = current.catalog.profiles.find((p) => p.id === input.profileId);
    if (!profile?.selection.health.length)
      throw new PairingError(400, 'Choose a saved profile with selected Health types.');
    if (
      [...requests.values()].filter((r) => r.subject === subject && !terminal.has(expire(r).status))
        .length >= 10
    )
      throw new PairingError(429, 'Cancel pending exports or wait for their outcomes.');
    const request = {
      requestId: input.requestId,
      subject,
      client,
      deviceId: input.deviceId,
      profileId: input.profileId,
      configuration: JSON.stringify(parseProfile(profile)),
      status: /** @type {const} */ ('accepted'),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    };
    requests.set(request.requestId, request);
    return result(request);
  }
  /** @param {string} subject @param {string} deviceId */
  function dispatch(subject, deviceId) {
    for (const request of requests.values()) {
      if (
        request.subject !== subject ||
        request.deviceId !== deviceId ||
        !['accepted', 'awaiting_user'].includes(expire(request).status)
      )
        continue;
      try {
        validate(request);
      } catch {
        cancel(subject, deviceId, request.client);
        continue;
      }
      if (terminal.has(request.status)) continue;
      request.status = 'awaiting_user';
      requests.set(request.requestId, request);
      return {
        requestId: request.requestId,
        profileId: request.profileId,
        configuration: request.configuration,
        expiresAt: new Date(request.expiresAt).toISOString(),
      };
    }
    return null;
  }
  /** @param {string} subject @param {string} deviceId @param {unknown} body */
  function report(subject, deviceId, body) {
    own(deviceId, subject);
    const input = phoneInput.parse(body);
    const request = requests.get(input.requestId);
    if (!request || request.subject !== subject || request.deviceId !== deviceId)
      throw new PairingError(404, 'Export request not found for this phone.');
    validate(request);
    if (terminal.has(request.status) || input.action === 'check') return result(request);
    if (input.action === 'cancel') request.status = 'cancelled';
    else if (input.action === 'start') {
      if (request.status !== 'awaiting_user')
        throw new PairingError(409, 'Wait for owner review before starting export.');
      request.status = 'running';
      request.expiresAt = Date.now() + 86400000;
    } else if (input.action === 'complete') {
      if (
        request.status !== 'running' ||
        !input.receipt ||
        input.receipt.historyId !== `health-${request.requestId}` ||
        Date.parse(input.receipt.end) <= Date.parse(input.receipt.start)
      )
        throw new PairingError(409, 'A completed export requires a matching delivery receipt.');
      request.status = 'completed';
      request.receipt = input.receipt;
    } else if (input.action === 'fail') {
      request.status = 'failed';
      request.error = input.error ?? 'export_failed';
    }
    requests.set(request.requestId, request);
    return result(request);
  }
  /** @param {string} subject @param {string} [deviceId] @param {string|null} [client] */
  function cancel(subject, deviceId, client) {
    for (const request of requests.values()) {
      if (
        request.subject !== subject ||
        (deviceId && request.deviceId !== deviceId) ||
        (client !== undefined && request.client !== client) ||
        terminal.has(expire(request).status)
      )
        continue;
      request.status = 'cancelled';
      requests.set(request.requestId, request);
    }
  }
  return { tool, dispatch, report, cancel };
}
