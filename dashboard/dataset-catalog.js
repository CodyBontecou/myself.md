import { quantities, categories, androidTypes, special } from '../client/health-types.js';

export const datasets = {
  health: {
    title: 'Health',
    domain: /** @type {const} */ ('health'),
    introduction:
      'Export the health samples your phone can read into files. Select individual metrics and keep the original units, metadata, and source fields.',
    sources: 'HealthKit on iOS, Health Connect on Android, and imported health JSON archives.',
    groups: [
      { title: 'iOS · Quantity samples', keys: quantities.map((key) => `native:${key}`) },
      { title: 'iOS · Category samples', keys: categories.map((key) => `native:${key}`) },
      { title: 'iOS · Workouts and other samples', keys: special.map((key) => `native:${key}`) },
      { title: 'Android · Health Connect', keys: androidTypes.map((key) => `native:${key}`) },
      {
        title: 'Imported data · discovered from your file',
        keys: [
          'imported:HKQuantityTypeIdentifierStepCount',
          'imported:samples',
          'imported:records',
          'imported:workouts',
          'imported:archive',
        ],
      },
    ],
    defaults: [
      'native:HKQuantityTypeIdentifierStepCount',
      'native:HKQuantityTypeIdentifierHeartRate',
    ],
    limitations: [
      'The catalog below is the installed adapter’s complete type list. The phone shows types according to device support and permissions; selecting an identifier does not grant OS access.',
      'HealthKit does not reveal read denial. Empty results can mean no samples or no authorization.',
      'The native iOS adapter excludes clinical FHIR, attachments, audiograms, medications, and vision prescriptions. Import an original archive to preserve those fields.',
      'Health Connect can limit historical reads to 30 days without historical access. Exercise routes may require separate consent.',
    ],
    sampleType: 'HKQuantityTypeIdentifierStepCount',
    sampleSource: 'healthkit',
    sample: {
      startDate: '2026-10-08T08:00:00.000Z',
      endDate: '2026-10-08T08:30:00.000Z',
      quantity: 1250,
      unit: 'count',
    },
  },
  'screen-time': {
    title: 'Screen time',
    domain: /** @type {const} */ ('time'),
    introduction:
      'Export application and website usage aggregates. Each profile chooses the collections it includes, while the source payload preserves timing and duration fields.',
    sources: 'The PhoneUsage native adapter on iOS and Android, plus imported time JSON archives.',
    groups: [
      { title: 'iOS · Native usage', keys: ['native:applications', 'native:websites'] },
      { title: 'Android · Native usage', keys: ['native:applications'] },
      {
        title: 'Imported data · discovered from your file',
        keys: [
          'imported:rawScreenTime',
          'imported:applications',
          'imported:websites',
          'imported:dailyTrends',
          'imported:hourlyActivity',
          'imported:archive',
        ],
      },
    ],
    defaults: ['native:applications'],
    limitations: [
      'Native iOS reads require iOS 26.4+, the approved Family Controls data entitlement, EU eligibility, and authorization with data access.',
      'iOS exports hourly aggregates and can include other devices on the same Screen Time account. Identifiers may be redacted or omitted.',
      'Android exports system daily foreground-usage aggregates. Buckets may extend outside the requested interval; retention depends on the OS.',
      'Usage aggregates are not individual sessions or browser history. Pagination re-reads live data, so completed intervals are more stable.',
    ],
    sampleType: 'applications',
    sampleSource: 'native-usage',
    sample: {
      identifier: 'com.example.reader',
      displayName: 'Reader',
      category: 'Education',
      deviceName: 'Example iPhone',
      startMs: 1791446400000,
      endMs: 1791450000000,
      durationMs: 1200000,
      pickups: 2,
      notifications: 0,
      granularity: 'hourly-aggregate',
    },
  },
  location: {
    title: 'Location',
    domain: /** @type {const} */ ('location'),
    introduction:
      'Keep the location points you explicitly record, or import an existing location archive. Export coordinates and their original accuracy, altitude, and timing fields.',
    sources:
      'Points recorded by myself.md through Expo Location, plus imported location JSON archives.',
    groups: [
      { title: 'iOS and Android · Recorded data', keys: ['native:points'] },
      {
        title: 'Imported data · discovered from your file',
        keys: ['imported:points', 'imported:visits', 'imported:outings', 'imported:archive'],
      },
    ],
    defaults: ['native:points'],
    limitations: [
      'The OS does not expose a historical location archive to this adapter. Only points recorded by myself.md and imported history are available.',
      'Background recording requests highest accuracy, a 5 metre distance interval, and a 10 second time interval. These are requested settings, not a guaranteed sampling rate.',
      'If background access is denied, tracking does not start. On iOS, Allow Once or denied Always access can require a trip to system settings.',
      'Stopping tracking stops future recording; previously saved points remain. Local queries include records whose start is inside the UTC interval.',
    ],
    sampleType: 'points',
    sampleSource: 'expo-location',
    sample: {
      timestamp: 1791446400000,
      coords: {
        latitude: 38.7223,
        longitude: -9.1393,
        accuracy: 8,
        altitude: 24,
        altitudeAccuracy: 10,
        heading: null,
        speed: null,
      },
    },
  },
};
