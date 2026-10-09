import { parseSchedule } from './schedules.js';
import { parseExportSettings } from './export-files.js';
import { domains } from './data.js';
/** @typedef {{schema:'myself.md.profile.v1'|'qr-connect.profile.v1',name:string,selection:Record<import('./data.js').Domain,string[]>,export?:import('./export-files.js').ExportSettings,schedule?:import('./schedules.js').ScheduleConfig}} ProfileDraft */
/** @typedef {ProfileDraft & {export:import('./export-files.js').ExportSettings,schedule:import('./schedules.js').ScheduleConfig}} ResolvedDraft */
/** @typedef {ResolvedDraft & {id:string}} ExportProfile */
/** @typedef {{activeId:string,profiles:ExportProfile[]}} ProfileState */
/** Validate the same portable, explicit allowlist on the phone and MCP boundary.
 * Unknown types can be retained for another platform, but never imply authorization.
 * @param {unknown} value @param {boolean} [legacySnapshot] @returns {ResolvedDraft} */
export function parseProfile(value, legacySnapshot = false) {
  if (!value || typeof value !== 'object') throw new Error('Invalid export profile.');
  const p = /** @type {Record<string,unknown>} */ (value);
  if (
    (p.schema !== 'myself.md.profile.v1' && p.schema !== 'qr-connect.profile.v1') ||
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    p.name.trim().length > 80 ||
    !p.selection ||
    typeof p.selection !== 'object' ||
    Array.isArray(p.selection)
  )
    throw new Error(
      'Use a version 1 profile with a name and health, time and location selections.',
    );
  const raw = /** @type {Record<string,unknown>} */ (p.selection);
  if (Object.keys(raw).some((key) => !domains.some((d) => d === key)))
    throw new Error('Unknown profile domain.');
  const selection = /** @type {ProfileDraft['selection']} */ ({});
  for (const domain of domains) {
    const keys = raw[domain];
    if (
      !Array.isArray(keys) ||
      keys.length > 300 ||
      keys.some(
        (key) =>
          typeof key !== 'string' ||
          key.length > 160 ||
          !(legacySnapshot ? /^(native|imported):[^\s]+$/ : /^native:[^\s]+$/).test(key),
      )
    )
      throw new Error('Select explicit native: data types for every domain.');
    selection[domain] = [...new Set(/** @type {string[]} */ (keys))];
  }
  return {
    schema: 'myself.md.profile.v1',
    name: p.name.trim(),
    selection,
    export: parseExportSettings(p.export),
    schedule: parseSchedule(p.schedule),
  };
}
/** @param {ProfileDraft} profile */
export function profileLink(profile) {
  const link = `qrconnect://profile?payload=${encodeURIComponent(JSON.stringify(parseProfile(profile)))}`;
  if (link.length > 64000) throw new Error('Profile is too large for a deep link.');
  return link;
}
/** @param {string} link */
export function profileFromLink(link) {
  if (link.length > 64000) throw new Error('Profile link is too large.');
  const match = /^qrconnect:\/\/profile\?payload=([^&#]+)$/.exec(link);
  if (!match?.[1]) throw new Error('Invalid profile link.');
  return parseProfile(JSON.parse(decodeURIComponent(match[1])));
}
/** @param {ExportProfile} profile @param {Pick<import('./data.js').DataQuery,'domain'|'source'|'type'>} query */
export function profileAllows(profile, query) {
  return (
    query.source === 'native' &&
    profile.selection[query.domain].includes(`${query.source}:${query.type}`)
  );
}
/** @param {string} name @param {ExportProfile[]} profiles */
export function uniqueProfileName(name, profiles) {
  const base = name.trim() || 'Profile';
  let next = base,
    index = 2;
  while (profiles.some((p) => p.name.toLowerCase() === next.toLowerCase())) {
    const suffix = ` ${index++}`;
    next = `${base.slice(0, 80 - suffix.length)}${suffix}`;
  }
  return next;
}
