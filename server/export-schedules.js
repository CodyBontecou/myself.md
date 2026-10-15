import { z } from 'zod';
import { parseSchedule, dueOccurrences } from '../core/schedules.js';
import { scheduleCalendar } from './schedule-calendar.js';
import { PairingError } from './errors.js';
import { transaction } from './database.js';
const id = z.string().min(1).max(100);
const instant = z.iso.datetime();
const registration = z.object({
  deviceId: id,
  token: z
    .string()
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/)
    .nullable(),
  timeZone: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        return (
          new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone.length > 0
        );
      } catch {
        return false;
      }
    }, 'Invalid timezone.'),
  profiles: z
    .array(
      z.object({
        profileId: id,
        enabledAt: instant,
        schedule: z.unknown(),
        lastCompleted: instant.nullable(),
        lastRefresh: instant.nullable(),
      }),
    )
    .max(100),
});
/** Send one Expo push and report whether Expo accepted the ticket.
 * @param {typeof fetch} send @param {{to:string,title:string,body:string,channelId:string,data:Record<string,unknown>}} message */
export async function sendExpoPush(send, message) {
  const response = await send('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...message, sound: 'default' }),
    signal: AbortSignal.timeout(15000),
  });
  const result = /** @type {{data?:{status?:string,details?:{error?:string}}}} */ (
    await response.json()
  );
  return {
    accepted: response.ok && result.data?.status === 'ok',
    unregistered: result.data?.details?.error === 'DeviceNotRegistered',
  };
}
/** @typedef {{profileId:string,enabledAt:string,schedule:import('../core/schedules.js').ScheduleConfig,lastCompleted:string|null,lastRefresh:string|null,lastNotifiedCompleted?:string|null,lastNotifiedRefresh?:string|null}} RegisteredProfile */
/** Cloud metadata contains no data selections, export destinations, credentials or records.
 * @param {import('./database.js').SqlDatabase} db
 * @param {(subject:string,device:string)=>void} ownDevice
 * @param {()=>Promise<void>} arm
 * @param {typeof fetch} [send] */
export function createExportSchedules(db, ownDevice, arm, send = fetch) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS export_schedules (subject TEXT, device TEXT, value TEXT, PRIMARY KEY(subject,device))',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS export_schedule_requests (subject TEXT, id TEXT, device TEXT, value TEXT, PRIMARY KEY(subject,id))',
  );
  /** @param {string} subject */
  function requests(subject) {
    return db
      .prepare('SELECT value FROM export_schedule_requests WHERE subject=?')
      .all(subject)
      .map((row) => {
        const value = JSON.parse(String(row.value));
        if (['awaiting-user', 'running'].includes(value.state) && value.expiresAt < Date.now())
          value.state = 'expired';
        return value;
      });
  }
  /** @param {string} subject */
  function list(subject) {
    return db
      .prepare('SELECT device,value FROM export_schedules WHERE subject=?')
      .all(subject)
      .map((row) => {
        const value = JSON.parse(String(row.value));
        return {
          deviceId: String(row.device),
          timeZone: value.timeZone,
          profiles: value.profiles,
          notificationStatus: value.status,
          lastError: value.lastError ?? null,
          updatedAt: value.updatedAt,
        };
      });
  }
  return {
    list,
    requests,
    /** @param {string} subject @param {unknown} input */
    completeRequest(subject, input) {
      const value = z
        .object({
          requestId: id,
          deviceId: id,
          state: z.enum(['running', 'completed', 'failed', 'cancelled']),
          message: z.string().max(200).default(''),
        })
        .parse(input);
      ownDevice(subject, value.deviceId);
      const request = requests(subject).find(
        (r) => r.requestId === value.requestId && r.deviceId === value.deviceId,
      );
      if (!request) throw new PairingError(404, 'Schedule request not found.');
      if (!['awaiting-user', 'running'].includes(request.state)) return request;
      Object.assign(request, { state: value.state, message: value.message });
      db.prepare('UPDATE export_schedule_requests SET value=? WHERE subject=? AND id=?').run(
        JSON.stringify(request),
        subject,
        value.requestId,
      );
      return request;
    },
    /** @param {string} subject @param {unknown} input */
    async register(subject, input) {
      const value = registration.parse(input);
      ownDevice(subject, value.deviceId);
      scheduleCalendar(value.timeZone).day(new Date().toISOString());
      /** @type {RegisteredProfile[]} */
      const profiles = value.profiles.map((p) => ({ ...p, schedule: parseSchedule(p.schedule) }));
      if (new Set(profiles.map((p) => p.profileId)).size !== profiles.length)
        throw new PairingError(400, 'Duplicate profile schedule.');
      transaction(db, () => {
        const row = db
          .prepare('SELECT value FROM export_schedules WHERE subject=? AND device=?')
          .get(subject, value.deviceId);
        const previous = row ? JSON.parse(String(row.value)) : null;
        for (const p of profiles) {
          const old = previous?.profiles.find(
            (/** @type {RegisteredProfile} */ saved) =>
              saved.profileId === p.profileId && saved.enabledAt === p.enabledAt,
          );
          p.lastNotifiedCompleted = old?.lastNotifiedCompleted ?? null;
          p.lastNotifiedRefresh = old?.lastNotifiedRefresh ?? null;
        }
        db.prepare('INSERT OR REPLACE INTO export_schedules VALUES (?,?,?)').run(
          subject,
          value.deviceId,
          JSON.stringify({
            ...value,
            profiles,
            status: !profiles.length
              ? 'disabled'
              : value.token
                ? (previous?.status ?? 'registered')
                : 'permission-required',
            updatedAt: new Date().toISOString(),
          }),
        );
      });
      if (profiles.length && value.token) await arm();
      return {
        schedules: list(subject),
        requests: requests(subject).filter(
          (r) => r.deviceId === value.deviceId && r.state === 'awaiting-user',
        ),
      };
    },
    /** Registered Expo tokens of the account's phones, reused for account notices.
     * @param {string} subject */
    pushTokens(subject) {
      return db
        .prepare(
          "SELECT DISTINCT json_extract(value,'$.token') token FROM export_schedules WHERE subject=? AND json_extract(value,'$.token') IS NOT NULL",
        )
        .all(subject)
        .map((row) => String(row.token));
    },
    active() {
      return !!db
        .prepare(
          "SELECT 1 FROM export_schedules WHERE json_array_length(json_extract(value,'$.profiles'))>0 AND json_extract(value,'$.token') IS NOT NULL LIMIT 1",
        )
        .get();
    },
    /** @param {string} [subject] @param {string} [device] */
    remove(subject, device) {
      if (device)
        db.prepare('DELETE FROM export_schedules WHERE subject=? AND device=?').run(
          subject ?? '',
          device,
        );
      else db.prepare('DELETE FROM export_schedules WHERE subject=?').run(subject ?? '');
    },
    /** @param {string} [now] */
    async dispatch(now = new Date().toISOString()) {
      for (const row of db.prepare('SELECT subject,device,value FROM export_schedules').all()) {
        try {
          ownDevice(String(row.subject), String(row.device));
        } catch {
          db.prepare('DELETE FROM export_schedules WHERE subject=? AND device=?').run(
            String(row.subject),
            String(row.device),
          );
          continue;
        }
        const value = JSON.parse(String(row.value));
        if (!value.token) continue;
        for (const profile of /** @type {RegisteredProfile[]} */ (value.profiles)) {
          const due = dueOccurrences(
            profile.schedule,
            {
              enabled: true,
              enabledAt: profile.enabledAt,
              lastCompleted:
                [profile.lastCompleted ?? '', profile.lastNotifiedCompleted ?? ''].reduce(
                  (latest, timestamp) => (timestamp > latest ? timestamp : latest),
                  '',
                ) || null,
              lastRefresh:
                [profile.lastRefresh ?? '', profile.lastNotifiedRefresh ?? ''].reduce(
                  (latest, timestamp) => (timestamp > latest ? timestamp : latest),
                  '',
                ) || null,
            },
            now,
            scheduleCalendar(value.timeZone),
          );
          for (const occurrence of due) {
            try {
              // oxlint-disable-next-line eslint/no-await-in-loop -- Preserve each occurrence's delivery checkpoint before sending the next.
              const result = await sendExpoPush(send, {
                to: value.token,
                title: 'Time for your scheduled export',
                body: 'Tap to open myself.md and export your scheduled profile.',
                channelId: 'exports',
                data: {
                  exportSchedule: {
                    deviceId: row.device,
                    profileId: profile.profileId,
                    enabledAt: profile.enabledAt,
                    ...occurrence,
                  },
                },
              });
              if (!result.accepted) {
                if (result.unregistered) value.token = null;
                throw new Error('Push delivery was not accepted.');
              }
              profile[
                occurrence.kind === 'completed-day'
                  ? 'lastNotifiedCompleted'
                  : 'lastNotifiedRefresh'
              ] = occurrence.fireDate;
              value.status = 'accepted-by-expo';
              value.lastError = null;
            } catch {
              value.status = 'delivery-failed';
              value.lastError =
                'Push gateway did not accept the notification. Check connectivity and Expo/APNs/FCM credentials; reopen the phone to refresh its token.';
            }
            // Registration may change while delivery is in flight. Never resurrect an old snapshot.
            const updated = db
              .prepare(
                'UPDATE export_schedules SET value=? WHERE subject=? AND device=? AND value=?',
              )
              .run(
                JSON.stringify(value),
                String(row.subject),
                String(row.device),
                String(row.value),
              );
            if (!updated.changes) break;
            row.value = JSON.stringify(value);
          }
        }
      }
    },
    /** @param {import('@modelcontextprotocol/server').McpServer} mcp @param {string} subject */
    registerTools(mcp, subject) {
      mcp.registerTool(
        'set_phone_export_schedule_enabled',
        {
          title: 'Request automatic export schedule change',
          description:
            'Queue an owner-reviewed change to automatic exports for an existing profile on an owned phone. Open the phone within five minutes and confirm. Enabling may require OS notification permission. Poll get_phone_export_schedules for completed, failed, cancelled or expired; acceptance does not mean the setting changed. Reuse requestId for safe retries.',
          inputSchema: z.object({
            deviceId: id.describe('Owned phone ID.'),
            profileId: id.describe('Existing profile ID from get_phone_data_catalog.'),
            enabled: z
              .boolean()
              .describe('Whether to enable automatic exports after the phone owner confirms.'),
            requestId: id.describe('Unique retry key for this exact request.'),
          }),
          annotations: {
            title: 'Request automatic export schedule change',
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        async (input) => {
          ownDevice(subject, input.deviceId);
          const previous = requests(subject).find((r) => r.requestId === input.requestId);
          if (previous) {
            if (
              previous.deviceId !== input.deviceId ||
              previous.profileId !== input.profileId ||
              previous.enabled !== input.enabled
            )
              throw new PairingError(409, 'Retry key belongs to a different request.');
            return { content: [{ type: 'text', text: JSON.stringify(previous) }] };
          }
          db.prepare(
            'DELETE FROM export_schedule_requests WHERE subject=? AND id IN (SELECT id FROM export_schedule_requests WHERE subject=? ORDER BY rowid DESC LIMIT -1 OFFSET 99)',
          ).run(subject, subject);
          const request = { ...input, state: 'awaiting-user', expiresAt: Date.now() + 300000 };
          db.prepare('INSERT INTO export_schedule_requests VALUES (?,?,?,?)').run(
            subject,
            input.requestId,
            input.deviceId,
            JSON.stringify(request),
          );
          await arm();
          return { content: [{ type: 'text', text: JSON.stringify(request) }] };
        },
      );

      mcp.registerTool(
        'get_phone_export_schedules',
        {
          title: 'Read automatic export schedules',
          description:
            'Read cloud-registered scheduled export notification delivery for owned phones. accepted-by-expo means Expo accepted a notification, not that it reached the phone or exported. Phone Export History verifies completion. Enable scheduling and notification permission on the phone.',
          inputSchema: z.object({}),
          annotations: {
            title: 'Read automatic export schedules',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ schedules: list(subject), requests: requests(subject) }),
            },
          ],
        }),
      );
    },
  };
}
