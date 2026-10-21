import { record } from '../core/data.js';
import { watchProfile } from '../core/watch.js';

export const watchNativeFixtures = [
  {
    uuid: '00000000-0000-4000-8000-000000000001',
    quantityType: 'HKQuantityTypeIdentifierStepCount',
    objectTypeIdentifier: 'HKQuantityTypeIdentifierStepCount',
    quantity: 0,
    unit: 'count',
    sampleCount: 1,
    startDate: '2026-10-12T08:00:00.123456789Z',
    endDate: '2026-10-12T08:01:00.123456789Z',
    sourceRevision: {
      source: { name: 'Fixture watch', bundleIdentifier: 'example.watch' },
      version: '1',
      productType: 'WatchFixture',
      operatingSystemVersion: '11.0.0',
    },
    typedMetadata: { fixture: { type: 'boolean', value: true } },
    cumulativeQuantity: { sum: 0, unit: 'count' },
  },
  {
    uuid: '00000000-0000-4000-8000-000000000002',
    quantityType: 'HKQuantityTypeIdentifierStepCount',
    quantity: 25,
    unit: 'count',
    sampleCount: 2,
    startDate: '2026-10-12T09:00:00.000Z',
    endDate: '2026-10-12T09:02:00.000Z',
    quantitySeries: [
      {
        timestamp: '2026-10-12T09:00:00.000Z',
        endDate: '2026-10-12T09:01:00.000Z',
        value: 10,
        unit: 'count',
        sampleId: '00000000-0000-4000-8000-000000000002',
      },
      {
        timestamp: '2026-10-12T09:01:00.000Z',
        endDate: '2026-10-12T09:02:00.000Z',
        value: 15,
        unit: 'count',
        sampleId: '00000000-0000-4000-8000-000000000002',
      },
    ],
  },
];
export const watchRecordFixtures = watchNativeFixtures.map((native) =>
  record('health', 'HKQuantityTypeIdentifierStepCount', 'healthkit', native),
);
export const watchProfileFixture = watchProfile(
  'Watch steps',
  'https://example.test/private/upload',
);
