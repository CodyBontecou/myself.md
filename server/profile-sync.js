import { domains as dataDomains } from '../core/data.js';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { parseProfileState } from '../core/profiles.js';
import { mergeProfileStates, sameProfileValue } from '../core/profile-sync.js';
import { transaction } from './database.js';
import { PairingError } from './errors.js';
/** @typedef {{domain:import('../core/data.js').Domain,selectableTypes?:string[]|undefined,availableTypes:string[],permission?:string|undefined}} ProfileDomain */
/** @typedef {{id:string,profileId:string,profile:import('../core/profiles.js').ExportProfile,revision:number,status:'awaiting_user'|'accepted'|'completed'|'cancelled'|'expired',expires:number}} ProfileRequest */
/** @typedef {{state:import('../core/profiles.js').ProfileState,revision:number,confirmedRevision:number,lastSeen:number,supported:boolean,domains:ProfileDomain[],requests:ProfileRequest[]}} SyncedProfiles */
export class ProfileSyncStore {
  /** @param {import('./cloud-store.js').CloudStore} cloud */
  constructor(cloud) {
    this.cloud = cloud;
    cloud.db.exec(
      'CREATE TABLE IF NOT EXISTS profile_sync(subject TEXT,device TEXT,value BLOB,PRIMARY KEY(subject,device))',
    );
  }
  /** @param {string} subject @param {string} device @returns {SyncedProfiles|null} */
  get(subject, device) {
    const row = this.cloud.db
      .prepare('SELECT value FROM profile_sync WHERE subject=? AND device=?')
      .get(subject, device);
    if (!row) return null;
    const value = /** @type {SyncedProfiles} */ (
      JSON.parse(
        this.cloud
          .open(/** @type {Uint8Array} */ (row.value), `profiles|${subject}|${device}`)
          .toString(),
      )
    );
    value.requests = value.requests.map((r) =>
      r.status === 'awaiting_user' && r.expires < Date.now() ? { ...r, status: 'expired' } : r,
    );
    return value;
  }
  /** @param {string} subject @param {string} device @param {SyncedProfiles} value */
  save(subject, device, value) {
    this.cloud.db
      .prepare('INSERT OR REPLACE INTO profile_sync VALUES (?,?,?)')
      .run(
        subject,
        device,
        this.cloud.seal(Buffer.from(JSON.stringify(value)), `profiles|${subject}|${device}`),
      );
  }
  /** @param {string} subject @param {string} device @param {import('../core/profiles.js').ProfileState} state @param {ProfileDomain[]} domains @param {{base:import('../core/profiles.js').ProfileState|null}|undefined} sync */
  poll(subject, device, state, domains, sync) {
    state = parseProfileState(state);
    let value = this.get(subject, device);
    if (!value)
      value = {
        state,
        revision: 1,
        confirmedRevision: 1,
        lastSeen: Date.now(),
        supported: Boolean(sync),
        domains,
        requests: [],
      };
    const merged = sync
      ? mergeProfileStates(sync.base, state, value.state)
      : { state: value.supported ? value.state : state, conflicts: [] };
    if (!merged.conflicts.length && !sameProfileValue(merged.state, value.state)) {
      value.state = merged.state;
      value.revision++;
    }
    value.lastSeen = Date.now();
    value.domains = domains;
    value.supported ||= Boolean(sync);
    if (sameProfileValue(state, value.state)) {
      value.confirmedRevision = value.revision;
      value.requests = value.requests.map((r) =>
        r.status === 'accepted' && r.revision <= value.revision
          ? {
              ...r,
              status: sameProfileValue(
                r.profile,
                state.profiles.find((p) => p.id === r.profileId),
              )
                ? 'completed'
                : 'cancelled',
            }
          : r,
      );
    }
    this.save(subject, device, value);
    return { state: value.state, revision: value.revision, conflicts: merged.conflicts };
  }
  /** @param {string} subject @param {string} device @param {string} profileId @param {number} revision @param {unknown} input @param {string|undefined} requestId */
  update(subject, device, profileId, revision, input, requestId) {
    return transaction(this.cloud.db, () => {
      const value = this.get(subject, device);
      if (!value?.supported)
        throw new PairingError(409, 'Update and open the phone app before editing profiles here.');
      if (value.revision !== revision)
        throw new PairingError(
          409,
          'This profile changed in another client. Reload before saving; your edit has not been applied.',
        );
      const previous = value.state.profiles.find((p) => p.id === profileId);
      if (!previous) throw new PairingError(404, 'Profile not found.');
      const parsed = parseProfileState({
        profiles: [
          { .../** @type {import('../core/profiles.js').ExportProfile} */ (input), id: profileId },
        ],
      }).profiles[0];
      if (!parsed) throw new PairingError(400, 'Invalid profile.');
      // Folder permissions and secure destination credentials are selected on this phone.
      if (parsed.export.localFolderId !== previous.export.localFolderId)
        throw new PairingError(400, 'Choose local folders on the phone.');
      for (const domain of value.domains) {
        const available = domain.selectableTypes ?? domain.availableTypes;
        if (
          parsed.selection[domain.domain].some(
            (key) => !available.includes(key) && !previous.selection[domain.domain].includes(key),
          )
        )
          throw new PairingError(400, 'Choose data types from this phone’s catalog.');
      }
      if (
        requestId &&
        !value.requests.some(
          (r) => r.id === requestId && r.profileId === profileId && r.status === 'awaiting_user',
        )
      )
        throw new PairingError(409, 'The profile suggestion is no longer pending.');
      value.state = parseProfileState({
        profiles: value.state.profiles.map((p) => (p.id === profileId ? parsed : p)),
      });
      value.revision++;
      value.requests = value.requests.map((r) =>
        r.id === requestId
          ? { ...r, profile: parsed, status: 'accepted', revision: value.revision }
          : r.profileId === profileId && r.status === 'accepted'
            ? { ...r, status: 'cancelled' }
            : r,
      );
      this.save(subject, device, value);
      // Apply denials immediately, but do not grant a source until the phone acknowledges it.
      for (const p of value.state.profiles) {
        const confirmedAccess = this.cloud.permission(subject, device, p.id);
        const confirmed = confirmedAccess.agentPermissions;
        const permissions = p.agentPermissions;
        this.cloud.db
          .prepare(
            'UPDATE cloud_access SET agent_permissions=?,selection=? WHERE subject=? AND device=? AND profile=?',
          )
          .run(
            JSON.stringify({
              health: confirmed.health && permissions?.health === true,
              time: confirmed.time && permissions?.time === true,
              location: confirmed.location && permissions?.location === true,
              logs: confirmed.logs && permissions?.logs === true,
            }),
            JSON.stringify(
              Object.fromEntries(
                dataDomains.map((domain) => [
                  domain,
                  confirmedAccess.selection[domain].filter((type) =>
                    p.selection[domain].includes(type),
                  ),
                ]),
              ),
            ),
            subject,
            device,
            p.id,
          );
      }
      return { revision: value.revision, status: 'accepted', requiresPhoneSync: true };
    });
  }

  /** @param {string} subject @param {string} device @param {string} profileId @param {unknown} input */
  propose(subject, device, profileId, input) {
    const value = this.get(subject, device);
    if (!value?.supported || !value.state.profiles.some((p) => p.id === profileId))
      throw new PairingError(404, 'Synchronized phone profile not found.');
    const profile = parseProfileState({
      profiles: [
        { .../** @type {import('../core/profiles.js').ExportProfile} */ (input), id: profileId },
      ],
    }).profiles[0];
    if (!profile) throw new PairingError(400, 'Invalid profile.');
    const request = {
      id: randomUUID(),
      profileId,
      profile,
      revision: value.revision,
      status: /** @type {const} */ ('awaiting_user'),
      expires: Date.now() + 86400000,
    };
    value.requests = [
      ...value.requests
        .filter((r) => r.status === 'awaiting_user' || r.status === 'accepted')
        .slice(-19),
      request,
    ];
    this.save(subject, device, value);
    return request;
  }
}
