import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { profileAllows } from '../core/profiles.js';
import { domains } from '../core/data.js';
import { importedTypes, localPage } from './library.js';
import { healthTypes, healthPage } from './health.js';
import { usageStatus, usagePage } from './usage.js';
/** @param {string} owner @param {import('./library.js').Grants} grants @param {import('../core/profiles.js').ExportProfile} [profile] */
export async function catalog(owner, grants, profile) {
  const health = await healthTypes();
  const usage = await usageStatus();
  const location = await Location.getForegroundPermissionsAsync();
  return {
    domains: domains.map((domain) => ({
      domain,
      enabled: grants[domain] && (!profile || profile.selection[domain].length > 0),
      types: [
        ...importedTypes(owner, domain).map((type) => `imported:${type}`),
        ...(domain === 'health'
          ? health
          : domain === 'time'
            ? usage === 'authorized'
              ? Platform.OS === 'ios'
                ? ['applications', 'websites']
                : ['applications']
              : []
            : location.granted
              ? ['points']
              : []
        ).map((type) => `native:${type}`),
      ].filter((key) => !profile || profile.selection[domain].includes(key)),
      notes:
        domain === 'health'
          ? [
              'HealthKit read authorization is private; empty samples never imply permission. Clinical records, attachments, medications, audiograms and vision prescriptions require an original archive.',
            ]
          : domain === 'time'
            ? [
                `System authorization: ${usage}. iOS raw data requires iOS 26.4+, the approved Family Controls data entitlement, and EU eligibility. Android uses Usage Access. Aggregates are not sessions.`,
              ]
            : [
                'Only locally recorded points and imported history are available. Background tracking is optional. No historical OS location archive is exposed.',
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
  if (!profileAllows(profile, query))
    throw new Error('This data type is disabled in the active profile.');
  let token = '';
  if (query.cursor) {
    const value = /** @type {{token:string}} */ (JSON.parse(query.cursor));
    if (cursor(query, value.token) !== query.cursor)
      throw new Error('Cursor belongs to a different query.');
    token = value.token;
  }
  let page =
    query.source === 'imported' || query.domain === 'location'
      ? localPage(owner, query, token)
      : query.domain === 'health'
        ? await healthPage(query, token)
        : await usagePage(query, token);
  let limit = query.limit;
  if (forChat) {
    while (JSON.stringify(page).length > 250000) {
      limit = Math.floor(limit / 2);
      if (limit < 1)
        throw new Error(
          'One record exceeds the chat response limit. Use the local file export or query imported archive chunks.',
        );
      const reduced = { ...query, limit };
      page =
        query.source === 'imported' || query.domain === 'location'
          ? localPage(owner, reduced, token)
          : query.domain === 'health'
            ? // Re-read the same cursor with a smaller page to avoid skipping any records.
              // oxlint-disable-next-line eslint/no-await-in-loop
              await healthPage(reduced, token)
            : // oxlint-disable-next-line eslint/no-await-in-loop
              await usagePage(reduced, token);
    }
  }
  return { ...page, nextCursor: page.nextCursor === null ? null : cursor(query, page.nextCursor) };
}
