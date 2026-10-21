import { parseProfileState } from './profiles.js';
/** @param {unknown} a @param {unknown} b */
export const sameProfileValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Merge independent edits; leave overlapping changes for an explicit owner decision.
 * @param {import('./profiles.js').ProfileState|null} base
 * @param {import('./profiles.js').ProfileState} local
 * @param {import('./profiles.js').ProfileState} remote */
export function mergeProfileStates(base, local, remote) {
  local = parseProfileState(local);
  remote = parseProfileState(remote);
  /** @type {string[]} */ const conflicts = [];
  if (!base)
    return { state: remote, conflicts: sameProfileValue(local, remote) ? [] : ['profiles'] };
  base = parseProfileState(base);
  /** @param {unknown} previous @param {unknown} phone @param {unknown} web @param {string} path @returns {unknown} */
  function merge(previous, phone, web, path) {
    if (sameProfileValue(phone, previous)) return web;
    if (sameProfileValue(web, previous) || sameProfileValue(phone, web)) return phone;
    if (
      previous &&
      phone &&
      web &&
      typeof previous === 'object' &&
      typeof phone === 'object' &&
      typeof web === 'object' &&
      !Array.isArray(previous) &&
      !Array.isArray(phone) &&
      !Array.isArray(web)
    ) {
      const a = /** @type {Record<string,unknown>} */ (previous),
        b = /** @type {Record<string,unknown>} */ (phone),
        c = /** @type {Record<string,unknown>} */ (web);
      return Object.fromEntries(
        [...new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)])].map((key) => [
          key,
          merge(a[key], b[key], c[key], `${path}.${key}`),
        ]),
      );
    }
    conflicts.push(path);
    return web;
  }
  const ids = [
    ...new Set([...local.profiles, ...remote.profiles, ...base.profiles].map((p) => p.id)),
  ];
  const profiles = ids
    .map((id) =>
      merge(
        base.profiles.find((p) => p.id === id),
        local.profiles.find((p) => p.id === id),
        remote.profiles.find((p) => p.id === id),
        id,
      ),
    )
    .filter(Boolean)
    .map((profile) => Object.assign({}, profile, { agentAccess: true }));
  if (conflicts.length || !profiles.length || profiles.length > 50)
    return { state: remote, conflicts: conflicts.length ? conflicts : ['profiles'] };
  return {
    state: parseProfileState(/** @type {import('./profiles.js').ProfileState} */ ({ profiles })),
    conflicts,
  };
}
