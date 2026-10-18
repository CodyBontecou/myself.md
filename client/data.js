import { whoopHealthTypes, whoopPage, whoopStatus } from './whoop.js';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { profileAllows, agentProfileAllows } from '../core/profiles.js';
import { domains } from '../core/data.js';
import { localPage } from './library.js';
import { healthTypes, healthPage } from './health.js';
import { usageStatus, usagePage } from './usage.js';
import { locationStatus } from './location-task.js';
/** @param {string} _owner @param {import('./library.js').Grants} grants @param {import('../core/profiles.js').ExportProfile} [profile] */
export async function catalog(_owner, grants, profile) {
  const health = [...(await healthTypes()), ...(await whoopHealthTypes(_owner))];
  const selectableHealth = [
    ...(Platform.OS === 'android' ? await healthTypes(true) : await healthTypes()),
    ...(await whoopHealthTypes(_owner, true)),
  ];
  const usage = await usageStatus();
  const location = await Location.getForegroundPermissionsAsync();
  const status = await locationStatus(_owner);
  return {
    locationTracking: status.tracking,
    whoop: await whoopStatus(_owner),
    domains: domains.map((domain) => ({
      domain,
      selectableTypes: (domain === 'health'
        ? selectableHealth
        : domain === 'time'
          ? Platform.OS === 'ios'
            ? ['applications', 'websites']
            : Platform.OS === 'android'
              ? ['applications', 'sessions']
              : []
          : ['points']
      ).map((type) => `native:${type}`),
      permission:
        domain === 'health'
          ? 'system-managed'
          : domain === 'time'
            ? usage
            : location.granted
              ? 'authorized'
              : 'required',
      permissionHandoff: 'myselfmd://profiles',
      enabled: grants[domain] && (!profile || profile.selection[domain].length > 0),
      types: (domain === 'health'
        ? health
        : domain === 'time'
          ? usage === 'authorized'
            ? Platform.OS === 'ios'
              ? ['applications', 'websites']
              : ['applications', 'sessions']
            : []
          : location.granted
            ? ['points']
            : []
      )
        .map((type) => `native:${type}`)
        .filter((key) => !profile || profile.selection[domain].includes(key)),
      notes:
        domain === 'health'
          ? [
              'WHOOP types need a separate Settings → WHOOP connection. Provider status and approved scopes are in catalog.whoop. Connecting never changes selections or Agent permissions. WHOOP body data is a current snapshot; recovery timestamps must be joined by cycle_id/sleep_id.',
              'HealthKit read authorization is private; empty samples never imply permission. Clinical records, attachments, medications, audiograms and vision prescriptions are not captured by this adapter.',
              'Characteristics are current snapshots captured at read time, not historical values for the selected day. Newly available types require profile selection; agents cannot add them or grant Health access.',
              'Exports preserve native records and explicit timeSeries without summaries. Workout selection includes genuinely associated heart-rate/form series and routes. Nested capture failures mark exports partial. Health Connect series remain intact; Android exercise membership is not inferred from overlapping times.',
            ]
          : domain === 'time'
            ? [
                `System authorization: ${usage}. iOS raw data requires iOS 26.4+, the approved Family Controls data entitlement, and EU eligibility. iOS applications/websites are hourly aggregates, not sessions. Android applications are daily aggregates; sessions are reconstructed activity intervals under the same Usage Access permission. Select sessions separately in the profile.`,
              ]
            : [
                `Location access: ${location.granted ? 'authorized' : 'required'}. Only locally recorded points are available. Background tracking is optional. No historical OS location archive is exposed.`,
                `Recording notification permission: ${status.notificationPermission ?? 'unknown'}. Android background recording requires a visible notification. Recording disclosure and OS approvals must be completed on the phone; agents cannot approve them.`,
              ],
    })),
  };
}
/** @param {import('../core/data.js').DataQuery} query @param {string} token */
function cursor(query, token) {
  return JSON.stringify({
    domain: query.domain,
    type: query.type,
    source: query.source,
    start: query.start,
    end: query.end,
    token,
  });
}
/** @param {string} owner @param {import('../core/data.js').DataQuery} query @param {import('../core/profiles.js').ExportProfile} profile @param {boolean} [forChat] @returns {Promise<import('../core/data.js').DataPage>} */
export async function readPage(owner, query, profile, forChat = true) {
  if (forChat && !agentProfileAllows(profile, query))
    throw new Error('Agent access is not approved for this profile and data type.');
  if (!profileAllows(profile, query))
    throw new Error('This data type is disabled in this profile.');
  let token = '';
  if (query.cursor) {
    const value = /** @type {{token:string}} */ (JSON.parse(query.cursor));
    if (cursor(query, value.token) !== query.cursor)
      throw new Error('Cursor belongs to a different query.');
    token = value.token;
  }
  let page =
    query.domain === 'location'
      ? localPage(owner, query, token)
      : query.domain === 'health'
        ? await readHealth(owner, query, token)
        : await usagePage(query, token);
  let limit = query.limit;
  if (forChat) {
    while (JSON.stringify(page).length > 250000) {
      limit = Math.floor(limit / 2);
      if (limit < 1)
        throw new Error('One record exceeds the chat response limit. Use the local file export.');
      const reduced = { ...query, limit };
      page =
        query.domain === 'location'
          ? localPage(owner, reduced, token)
          : query.domain === 'health'
            ? // Re-read the same cursor with a smaller page to avoid skipping any records.
              // oxlint-disable-next-line eslint/no-await-in-loop
              await readHealth(owner, reduced, token)
            : // oxlint-disable-next-line eslint/no-await-in-loop
              await usagePage(reduced, token);
    }
  }
  return { ...page, nextCursor: page.nextCursor === null ? null : cursor(query, page.nextCursor) };
}

/** @param {string} owner @param {import('../core/data.js').DataQuery} query @param {string} token */
function readHealth(owner, query, token) {
  return query.type.startsWith('whoop.')
    ? whoopPage(owner, query, token)
    : healthPage(query, token);
}
