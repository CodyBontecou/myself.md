import { waitMsInput } from './bounded-wait.js';
import { domains } from '../core/data.js';
import { parseProfile } from '../core/profiles.js';
import { z } from 'zod';
import { PairingError } from './errors.js';

export const phoneExportInput = z
  .object({
    waitMs: waitMsInput,
    action: z
      .enum(['request', 'status', 'cancel'])
      .default('request')
      .describe(
        'Request an export, inspect delivery, or stop remaining work. Existing files are retained on cancellation.',
      ),
    deviceId: z.string().uuid().describe('Owned online phone from list_connected_phones.'),
    profileId: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'Saved profile from get_phone_data_catalog. Only its selected data types will be exported, using its saved destination and output settings.',
      ),
    domains: z
      .array(z.enum(domains))
      .min(1)
      .max(3)
      .refine((values) => new Set(values).size === values.length, 'Choose each domain once.')
      .optional()
      .describe('Selected profile domains to export; omit to use all selected domains.'),
    range: z
      .object({
        start: z.iso
          .datetime()
          .nullable()
          .default(null)
          .describe('Inclusive UTC timestamp; null discovers earliest readable history.'),
        end: z.iso
          .datetime()
          .nullable()
          .default(null)
          .describe('Exclusive UTC timestamp; null freezes the current time.'),
      })
      .strict()
      .default({ start: null, end: null })
      .describe(
        'Inclusive start and exclusive end. Null start discovers earliest readable history; null end freezes the current time. Screen Time requires an explicit start because its OS adapter cannot discover retained history.',
      ),
    requestId: z
      .string()
      .uuid()
      .describe(
        'Caller-chosen UUID. Reuse for retries/status/cancellation; a new UUID requests a new export using the saved profile settings.',
      ),
  })
  .strict()
  .refine(
    (input) =>
      !input.range.start ||
      !input.range.end ||
      Date.parse(input.range.end) > Date.parse(input.range.start),
    'Choose an end later than the start.',
  );
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
/** @typedef {'accepted'|'queued'|'awaiting_user'|'running'|'completed'|'failed'|'cancelled'|'expired'} Status */
/** @typedef {{requestId:string,subject:string,client:string|null,deviceId:string,profileId:string,configuration:string,domains:import('../core/data.js').Domain[],range:{start:string|null,end:string},parameters:string,status:Status,createdAt:number,expiresAt:number,receipt?:z.infer<typeof receiptSchema>,error?:'export_failed'|'interrupted'|'profile_changed'|'history_permission_required'}} PhoneExport */
const terminal = new Set(['completed', 'failed', 'cancelled', 'expired']);
/** Exports use the owner-saved profile destination and selections with no per-request confirmation.
 * @param {{requests:Map<string,PhoneExport>,own:(deviceId:string,subject:string)=>void,phone:(deviceId:string)=>{seen:number,catalog:{dataExport?:{version:1}|undefined,profiles:{id:string,selection:Record<import('../core/data.js').Domain,string[]>}[]}}|undefined,authorize:(subject:string,client:string|null)=>void}} dependencies */
export function createPhoneExports({ requests, own, phone, authorize }) {
  /** @param {PhoneExport} request */
  function expire(request) {
    if (!terminal.has(request.status) && request.expiresAt <= Date.now()) {
      request.status = 'expired';
      requests.set(request.requestId, request);
    }
    return request;
  }
  /** @param {PhoneExport} request */
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
  /** @param {PhoneExport} request */
  function result(request) {
    validate(request);
    return {
      requestId: request.requestId,
      deviceId: request.deviceId,
      profileId: request.profileId,
      range: request.range,
      domains: request.domains,
      status: request.status,
      createdAt: new Date(request.createdAt).toISOString(),
      expiresAt: new Date(request.expiresAt).toISOString(),
      online: (phone(request.deviceId)?.seen ?? 0) > Date.now() - 15000,
      canCancel: !terminal.has(request.status),
      ownerHandoff: {
        deepLink: 'myselfmd://profiles',
        requiresUserApproval: false,
        instructions:
          'Keep myself.md open to export automatically using the saved profile selections and destination. No per-request approval is required. OS permissions, past-data access and secure destination setup may still require the owner.',
      },
      ...(request.receipt
        ? { receipt: request.receipt, partial: request.receipt.failedSources > 0 }
        : {}),
      ...(request.error
        ? {
            error: request.error,
            message:
              request.error === 'history_permission_required'
                ? 'Historical Health export requires Health Connect past-data access. Approve it in Health Connect app permissions on an updated phone build, then retry with a new request ID.'
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
  /** @param {string} subject @param {string|null} client @param {z.infer<typeof phoneExportInput>} input */
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
      if (
        input.action === 'request' &&
        existing.parameters !==
          JSON.stringify({ domains: input.domains ?? null, range: input.range })
      )
        throw new PairingError(409, 'Request ID already used with different export parameters.');
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
    if (current.catalog.dataExport?.version !== 1)
      throw new PairingError(409, 'Update the phone app to support data exports.');
    const profile = current.catalog.profiles.find((p) => p.id === input.profileId);
    const selected = input.domains ?? domains.filter((domain) => profile?.selection[domain].length);
    if (
      !profile ||
      !selected.length ||
      selected.some((domain) => !profile.selection[domain].length)
    )
      throw new PairingError(400, 'Choose saved profile domains with selected data types.');
    if (input.range.start === null && selected.includes('time'))
      throw new PairingError(
        400,
        'Screen Time requires an explicit start; retained history cannot be discovered by its OS adapter.',
      );
    const range = { start: input.range.start, end: input.range.end ?? new Date().toISOString() };
    if (
      Date.parse(range.end) > Date.now() ||
      (range.start &&
        (Date.parse(range.end) <= Date.parse(range.start) ||
          Date.parse(range.end) - Date.parse(range.start) > 100000 * 86400000))
    )
      throw new PairingError(400, 'Choose a past interval of at most 100000 days.');
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
      domains: selected,
      range,
      parameters: JSON.stringify({ domains: input.domains ?? null, range: input.range }),
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
        !['accepted', 'queued', 'awaiting_user'].includes(expire(request).status)
      )
        continue;
      try {
        validate(request);
      } catch {
        cancel(subject, deviceId, request.client);
        continue;
      }
      if (terminal.has(request.status)) continue;
      request.status = 'queued';
      requests.set(request.requestId, request);
      return {
        requestId: request.requestId,
        profileId: request.profileId,
        configuration: request.configuration,
        domains: request.domains,
        range: request.range,
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
      // Accept persisted requests dispatched before per-request approval was retired.
      if (!['queued', 'awaiting_user'].includes(request.status))
        throw new PairingError(409, 'Wait for phone dispatch before starting export.');
      request.status = 'running';
      request.expiresAt = Date.now() + 86400000;
    } else if (input.action === 'complete') {
      if (
        request.status !== 'running' ||
        !input.receipt ||
        input.receipt.historyId !== `export-${request.requestId}` ||
        Date.parse(input.receipt.end) <= Date.parse(input.receipt.start) ||
        Date.parse(input.receipt.end) !== Date.parse(request.range.end) ||
        (request.range.start !== null &&
          Date.parse(input.receipt.start) !== Date.parse(request.range.start))
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
