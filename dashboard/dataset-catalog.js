import {
  quantities,
  categories,
  androidTypes,
  special,
  characteristics,
} from '../client/health-types.js';

/** @type {{ios:string[],android:string[],shared:string[]}} */
const healthLimitations = {
  ios: [
    'HealthKit does not reveal read denial. Empty results can mean no samples or no authorization.',
    'Characteristics are current snapshots captured at read time, not historical values for the selected day.',
    'The native iOS adapter excludes clinical FHIR, attachments, audiograms, medications, and vision prescriptions.',
  ],
  android: [
    'Health Connect can limit historical reads to 30 days without historical access. Exercise routes may require separate consent.',
  ],
  shared: [],
};

/** @type {{ios:string[],android:string[],shared:string[]}} */
const usageLimitations = {
  ios: [
    'Native iOS reads require iOS 26.4+, the approved Family Controls data entitlement, EU eligibility, and authorization with data access.',
    'iOS exports hourly aggregates and can include other devices on the same Screen Time account. Identifiers may be redacted or omitted.',
  ],
  android: [
    'Android applications are daily aggregates. Sessions are activity-event intervals clipped to the query, with one-day start context. Missing events and query-boundary endings limit completeness; multi-window apps can overlap.',
  ],
  shared: [
    'Usage aggregates are not individual sessions or browser history. Pagination re-reads live data, so completed intervals are more stable.',
  ],
};

/** @type {{ios:string[],android:string[],shared:string[]}} */
const locationLimitations = {
  ios: ['On iOS, Allow Once or denied Always access can require a trip to system settings.'],
  android: [],
  shared: [
    'The OS does not expose a historical location archive to this adapter. Only points recorded by myself.md are available.',
    'Background recording requests highest accuracy, a 5 metre distance interval, and a 10 second time interval. These are requested settings, not a guaranteed sampling rate.',
    'If background access is denied, tracking does not start.',
    'Stopping tracking stops future recording; previously saved points remain. Local queries include records whose start is inside the UTC interval.',
  ],
};

export const datasets = {
  health: {
    title: 'Health',
    domain: /** @type {const} */ ('health'),
    introduction:
      'Export the health samples your phone can read into files. Select individual metrics and keep the original units, metadata, and source fields.',
    sources: 'HealthKit on iOS and Health Connect on Android.',
    groups: [
      { title: 'iOS · Quantity samples', keys: quantities.map((key) => `native:${key}`) },
      { title: 'iOS · Category samples', keys: categories.map((key) => `native:${key}`) },
      {
        title: 'iOS · Current characteristics',
        keys: characteristics.map((key) => `native:${key}`),
      },
      { title: 'iOS · Workouts and other samples', keys: special.map((key) => `native:${key}`) },
      { title: 'Android · Health Connect', keys: androidTypes.map((key) => `native:${key}`) },
    ],
    defaults: [
      'native:HKQuantityTypeIdentifierStepCount',
      'native:HKQuantityTypeIdentifierHeartRate',
    ],
    limitations: Object.values(healthLimitations).flat(),
    limitationsByPlatform: healthLimitations,
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
      'Export application and website usage aggregates, or Android foreground sessions with start/end boundaries. Each profile chooses its collections.',
    sources: 'The PhoneUsage native adapter on iOS and Android.',
    groups: [
      { title: 'iOS · Native usage', keys: ['native:applications', 'native:websites'] },
      { title: 'Android · Native usage', keys: ['native:applications', 'native:sessions'] },
    ],
    defaults: ['native:applications'],
    limitations: Object.values(usageLimitations).flat(),
    limitationsByPlatform: usageLimitations,
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
      'Keep the location points you explicitly record. Export coordinates and their original accuracy, altitude, and timing fields.',
    sources: 'Points recorded by myself.md through Expo Location.',
    groups: [{ title: 'iOS and Android · Recorded data', keys: ['native:points'] }],
    defaults: ['native:points'],
    limitations: Object.values(locationLimitations).flat(),
    limitationsByPlatform: locationLimitations,
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
