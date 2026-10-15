import { Buffer } from 'node:buffer';
import { parseProfile } from '../core/profiles.js';
import { exportEvent } from '../core/history.js';
import { reviewerUserId } from './reviewer.js';

/** Operator-only fixture provisioning; it cannot target a personal account or accept real records.
 * @param {{cloud:import('./cloud-store.js').CloudStore,billing:import('./billing-store.js').BillingStore,pairing:import('./pairing-store.js').PairingStore,history:import('./history-store.js').HistoryStore}} stores
 * @param {string} subject @param {string} anchorDay */
export async function seedReviewerFixtures(
  { cloud, billing, pairing, history },
  subject,
  anchorDay,
) {
  if (
    subject.split('|').length !== 2 ||
    !subject.endsWith(`|${reviewerUserId}`) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(anchorDay) ||
    !Number.isFinite(Date.parse(anchorDay))
  )
    throw new Error(
      'Only the reserved reviewer account and an explicit fixture date are supported.',
    );
  const existing = cloud.list(subject);
  if (existing.some((file) => !String(file.profileId).startsWith('reviewer-fixture-')))
    throw new Error('Reviewer account contains non-fixture exports; provisioning refused.');
  const name = 'Fictional reviewer source (offline; not a real phone)';
  const devices = pairing.devices(subject);
  if (devices.some((device) => device.name !== name))
    throw new Error('Reviewer account contains a real device; provisioning refused.');
  billing.grant(subject, 'reviewer:fictional-fixtures', reviewerUserId);
  const device = devices[0] ?? pairing.claim(pairing.createPairing(subject).ticket, subject, name);
  const deviceId = String(device.id);
  const warning = 'Fictional directory-review fixture. Not captured from a person or a phone.';
  const specs = [
    {
      id: 'health',
      domain: /** @type {const} */ ('health'),
      types: ['HKQuantityTypeIdentifierStepCount', 'HKQuantityTypeIdentifierHeartRate'],
      count: 72,
      shared: true,
    },
    {
      id: 'screen-time',
      domain: /** @type {const} */ ('time'),
      types: ['application'],
      count: 72,
      shared: true,
    },
    {
      id: 'location',
      domain: /** @type {const} */ ('location'),
      types: ['location'],
      count: 6,
      shared: false,
    },
  ];
  for (const spec of specs) {
    const profile = {
      ...parseProfile({
        schema: 'myself.md.profile.v1',
        name: `Fictional reviewer · ${spec.id}`,
        selection: {
          health: [],
          time: [],
          location: [],
          [spec.domain]: spec.types.map((type) => `native:${type}`),
        },
        export: { destination: 'cloud', formats: ['jsonl'] },
      }),
      id: `reviewer-fixture-${spec.id}`,
    };
    if (!cloud.profiles(subject).some((value) => value.profileId === profile.id))
      cloud.access(subject, deviceId, profile, spec.shared);
    for (let dayOffset = 1; dayOffset <= 2; dayOffset++) {
      const day = new Date(Date.parse(anchorDay) - dayOffset * 86400000).toISOString().slice(0, 10);
      const records = Array.from({ length: spec.count }, (_, index) => {
        const start = new Date(Date.parse(day) + index * 600000).toISOString();
        return {
          domain: spec.domain,
          type: spec.types[index % spec.types.length] ?? spec.types[0] ?? '',
          source: 'reviewer-fixture',
          start,
          end: new Date(Date.parse(start) + 600000).toISOString(),
          native: {
            fictional: true,
            ...(spec.domain === 'health'
              ? {
                  quantity: index % 2 ? 65 + (index % 12) : 100 + index * 5,
                  unit: index % 2 ? 'count/min' : 'count',
                }
              : spec.domain === 'time'
                ? {
                    displayName: ['Fictional Browser', 'Fictional Reader', 'Fictional Music'][
                      index % 3
                    ],
                    durationMs: 300000,
                  }
                : { coords: { latitude: index * 0.001, longitude: index * 0.001, accuracy: 10 } }),
          },
        };
      });
      const eventId = `${profile.id}-${day}`;
      const interval = {
        start: `${day}T00:00:00.000Z`,
        end: new Date(Date.parse(day) + 86400000).toISOString(),
      };
      const stamp = new Date().toISOString();
      const event = exportEvent({
        id: eventId,
        profile,
        actor: 'manual',
        interval,
        stamp,
        timezone: 'UTC',
      });
      // Cloud keeps one JSONL file per day; remove JSON copies seeded before that rule.
      const files = cloud
        .list(subject)
        .filter((file) => file.profileId === profile.id && file.day === day);
      for (const file of files)
        // oxlint-disable-next-line eslint/no-await-in-loop
        if (file.format === 'json') await cloud.delete(subject, file.id);
      const previous = files.find((file) => file.format === 'jsonl');
      const bytes = Buffer.from(records.map((record) => JSON.stringify(record)).join('\n') + '\n');
      const { id } =
        previous ??
        cloud.begin(subject, deviceId, profile.id, {
          day,
          format: 'jsonl',
          profile,
          manifest: {
            schema: profile.export.schema,
            profileId: profile.id,
            recordCount: records.length,
            interval,
            fictional: true,
            warnings: [warning],
          },
        });
      // Each commit validates profile selections, payload shape, encryption and storage quota.
      // oxlint-disable-next-line eslint/no-await-in-loop
      if (!previous) await cloud.commit(subject, deviceId, profile.id, id, bytes);
      event.artifacts.push({
        schema: profile.export.schema,
        day,
        name: `fictional-${spec.id}-${day}.jsonl`,
        format: 'jsonl',
        recordCount: records.length,
        bytes: bytes.length,
        uri: null,
        cloudId: id,
        checksum: cloud.digest(bytes),
        partial: false,
        warnings: [warning],
      });
      history.record(subject, deviceId, {
        ...event,
        status: 'complete',
        recordCount: records.length,
        warnings: [warning],
      });
    }
  }
  return {
    fictional: true,
    deviceId,
    phoneOnline: false,
    exports: cloud.list(subject).length,
    sharedExports: cloud.list(subject, true).length,
    profiles: cloud.profiles(subject),
    storage: cloud.storageStatus(subject),
  };
}
