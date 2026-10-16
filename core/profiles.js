import { parseSchedule } from './schedules.js';
import { parseExportSettings } from './export-files.js';
import { domains } from './data.js';
/** @typedef {{schema:'myself.md.profile.v1'|'qr-connect.profile.v1',name:string,selection:Record<import('./data.js').Domain,string[]>,export?:import('./export-files.js').ExportSettings,schedule?:import('./schedules.js').ScheduleConfig}} ProfileDraft */
/** @typedef {ProfileDraft & {export:import('./export-files.js').ExportSettings,schedule:import('./schedules.js').ScheduleConfig}} ResolvedDraft */
/** @typedef {Record<import('./data.js').Domain|'logs',boolean>} AgentPermissions */
/** @typedef {ResolvedDraft & {id:string,agentAccess?:boolean,agentPermissions?:AgentPermissions|undefined}} ExportProfile */
/** @typedef {{profiles:ExportProfile[]}} ProfileState */
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
  const link = `myselfmd://profile?payload=${encodeURIComponent(JSON.stringify(parseProfile(profile)))}`;
  if (link.length > 64000) throw new Error('Profile is too large for a deep link.');
  return link;
}
/** HTTPS links are recognized by email clients; the fragment stays off the server.
 * @param {ProfileDraft} profile */
export function profileShareLink(profile) {
  const link = `https://myself.md/share/profile#payload=${encodeURIComponent(JSON.stringify(parseProfile(profile)))}`;
  if (link.length > 64000) throw new Error('Profile is too large for a share link.');
  return link;
}
/** @param {string} link */
export function profileFromLink(link) {
  if (link.length > 64000) throw new Error('Profile link is too large.');
  const match =
    /^(?:myselfmd:\/\/profile\?|https:\/\/myself\.md\/share\/profile\/?#)payload=([^&#]+)$/.exec(
      link,
    );
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
/** Live access requires individually approved permissions and the profile selection.
 * @param {ExportProfile|undefined} profile @param {Pick<import('./data.js').DataQuery,'domain'|'source'|'type'>} query */
export function agentProfileAllows(profile, query) {
  return (
    profile?.agentAccess === true &&
    parseAgentPermissions(profile.agentPermissions)[query.domain] &&
    profileAllows(profile, query)
  );
}
/** Legacy profiles retain their existing source eligibility; portable profiles never carry consent.
 * @param {unknown} value @returns {AgentPermissions} */
export function parseAgentPermissions(value) {
  if (value === undefined) return { health: true, time: true, location: true, logs: true };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid agent permissions.');
  const raw = /** @type {Record<string,unknown>} */ (value);
  const keys = [...domains, 'logs'];
  if (Object.keys(raw).length !== keys.length || keys.some((key) => typeof raw[key] !== 'boolean'))
    throw new Error('Set Health, Screen time, Location and Logs permissions explicitly.');
  return {
    health: raw.health === true,
    time: raw.time === true,
    location: raw.location === true,
    logs: raw.logs === true,
  };
}
/** @param {{agentAccess?:boolean,agentPermissions?:AgentPermissions|undefined}|undefined} profile */
export function agentLogsAllowed(profile) {
  return profile?.agentAccess === true && parseAgentPermissions(profile.agentPermissions).logs;
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

/** Build the validated private profile mutation used by setup and the editor.
 * @param {ProfileState} state @param {ProfileDraft} draft @param {string} id @param {boolean} [editing] */
export function saveProfileDraft(state, draft, id, editing = false) {
  const parsed = parseProfile(draft);
  const previous = state.profiles.find((profile) => profile.id === id);
  if (editing && !previous) throw new Error('This profile no longer exists. Go back to return.');
  if (!editing && previous) throw new Error('This profile already exists.');
  const others = state.profiles.filter((profile) => profile.id !== id);
  const profile = {
    ...parsed,
    id,
    name: uniqueProfileName(parsed.name, others),
    agentAccess: editing ? previous?.agentAccess === true : true,
    agentPermissions: editing
      ? previous?.agentPermissions
      : { health: false, time: false, location: false, logs: false },
  };
  return parseProfileState({
    profiles: editing
      ? state.profiles.map((entry) => (entry.id === id ? profile : entry))
      : [...state.profiles, profile],
  });
}

/** Same profile parser and minimum-count contract as the mobile save boundary.
 * @param {import('../core/profiles.js').ProfileState} state */
export function parseProfileState(state) {
  if (!Array.isArray(state.profiles) || !state.profiles.length || state.profiles.length > 50)
    throw new Error('Keep between 1 and 50 profiles.');
  const ids = new Set();
  return {
    profiles: state.profiles.map((profile) => {
      if (typeof profile.id !== 'string' || !profile.id || ids.has(profile.id))
        throw new Error('Use unique profile IDs.');
      ids.add(profile.id);
      // Legacy master denials become individual denials. agentAccess is now only a
      // compatibility summary for older catalog readers, never a separate setting.
      const savedPermissions = parseAgentPermissions(profile.agentPermissions);
      const permissions =
        profile.agentAccess !== true
          ? { health: false, time: false, location: false, logs: false }
          : savedPermissions;
      return {
        ...parseProfile(profile),
        id: profile.id,
        agentAccess: Object.values(permissions).some(Boolean),
        agentPermissions: permissions,
      };
    }),
  };
}
