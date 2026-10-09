import {
  createBucketKey,
  normalizeRecord,
  matchesQuery,
  sortRecords,
  visualizeRecords,
} from '../core/explorer.js';

/** @typedef {import('./workspace.js').Workspace} Workspace */
/** @typedef {import('../core/data.js').DataRecord} DataRecord */
/** @typedef {import('../core/history.js').HistoryEvent} HistoryEvent */
const deviceId = '11111111-1111-4111-8111-111111111111';
const selection = {
  health: [
    'native:HKQuantityTypeIdentifierStepCount',
    'native:HKQuantityTypeIdentifierHeartRate',
    'native:HKCategoryTypeIdentifierSleepAnalysis',
  ],
  time: ['native:application'],
  location: ['native:location'],
};
/** @type {Workspace} */
let workspace;
/** @type {Map<string,DataRecord[]>} */
const records = new Map();
/** @type {HistoryEvent[]} */
let events = [];

export function resetDemo() {
  records.clear();
  events = [];
  workspace = {
    account: 'Alex · Demo workspace',
    devices: [{ id: deviceId, name: 'Alex’s iPhone' }],
    profiles: [
      {
        deviceId,
        profileId: 'wellbeing',
        name: 'Daily wellbeing',
        shared: true,
        selection: { health: selection.health, time: [], location: [] },
      },
      {
        deviceId,
        profileId: 'focus',
        name: 'Focus & screen time',
        shared: true,
        selection: { health: [], time: selection.time, location: [] },
      },
      {
        deviceId,
        profileId: 'places',
        name: 'Places & movement',
        shared: false,
        selection: { health: [], time: [], location: selection.location },
      },
    ],
    agents: [
      { client: 'Personal assistant (demo)', blocked: false, lastSeen: Date.now() - 180000 },
      { client: 'Wellbeing coach (demo)', blocked: false, lastSeen: Date.now() - 3600000 },
      { client: 'Old connection (demo)', blocked: true, lastSeen: Date.now() - 86400000 * 5 },
    ],
    exports: [],
  };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset < 30; offset++) {
    const day = new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);
    for (const [profileIndex, profile] of workspace.profiles.entries()) {
      const id = `22222222-2222-4222-8222-${String(offset * 3 + profileIndex).padStart(12, '0')}`;
      /** @type {DataRecord[]} */
      const samples = Array.from({ length: 8 }, (_, index) => {
        const start = `${day}T${String(index + 7).padStart(2, '0')}:00:00.000Z`;
        const end = new Date(Date.parse(start) + 1800000).toISOString();
        if (profileIndex === 1)
          return {
            domain: 'time',
            type: 'application',
            source: 'device-usage',
            start,
            end,
            native: {
              displayName: ['Safari', 'Messages', 'Books', 'Music'][index % 4],
              durationMs: (12 + index * 3 + (offset % 7)) * 60000,
            },
          };
        if (profileIndex === 2)
          return {
            domain: 'location',
            type: 'location',
            source: 'expo-location',
            start,
            end,
            native: {
              coords: {
                latitude: 38.7223 + index * 0.001,
                longitude: -9.1393 + index * 0.0008,
                accuracy: 5 + index,
              },
            },
          };
        if (index === 7)
          return {
            domain: 'health',
            type: 'HKCategoryTypeIdentifierSleepAnalysis',
            source: 'healthkit',
            start: `${day}T00:00:00.000Z`,
            end: `${day}T07:00:00.000Z`,
            native: { value: 3 },
          };
        return {
          domain: 'health',
          type:
            index % 2 ? 'HKQuantityTypeIdentifierHeartRate' : 'HKQuantityTypeIdentifierStepCount',
          source: 'healthkit',
          start,
          end,
          native: {
            quantity: index % 2 ? 62 + index + (offset % 9) : 850 + index * 180 + offset * 17,
            unit: index % 2 ? 'count/min' : 'count',
          },
        };
      });
      records.set(id, samples);
      const size = new TextEncoder().encode(JSON.stringify(samples)).length;
      workspace.exports.push({
        id,
        profileId: profile.profileId,
        profileName: profile.name,
        deviceId,
        day,
        format: 'json',
        bytes: size,
        created: Date.parse(`${day}T16:00:00.000Z`),
        shared: profile.shared,
      });
      /** @type {HistoryEvent} */
      const exportEvent = {
        id: `demo-export-${id}`,
        kind: 'export',
        actor: 'schedule',
        target: 'cloud',
        status: 'complete',
        startedAt: `${day}T16:00:00.000Z`,
        updatedAt: `${day}T16:01:00.000Z`,
        client: null,
        destination: 'myself.md Cloud',
        profile: { id: profile.profileId, name: profile.name, selection: profile.selection },
        interval: {
          start: `${day}T00:00:00.000Z`,
          end: new Date(Date.parse(`${day}T00:00:00.000Z`) + 86400000).toISOString(),
        },
        timezone: 'Europe/Lisbon',
        formats: ['json'],
        recordCount: samples.length,
        artifacts: [
          {
            day,
            name: `${profile.profileId}-${day}.json`,
            format: 'json',
            recordCount: samples.length,
            bytes: size,
            uri: null,
            cloudId: id,
            checksum: null,
            partial: false,
          },
        ],
        warnings: [],
        relatedId: null,
        error: null,
      };
      events.push(exportEvent);
      if (profileIndex === 0)
        events.push({
          ...exportEvent,
          id: `demo-access-${id}`,
          kind: 'access',
          actor: 'agent',
          startedAt: `${day}T17:00:00.000Z`,
          updatedAt: `${day}T17:00:01.000Z`,
          client: 'Wellbeing coach (demo)',
          artifacts: [],
          formats: [],
          relatedId: `demo-export-${id}`,
          request: {
            domain: 'health',
            source: 'healthkit',
            type: 'HKQuantityTypeIdentifierStepCount',
          },
          recordCount: 4,
        });
    }
  }
  events.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
resetDemo();

/** @param {import('../core/explorer.js').ExplorerQuery} query */
function exploreDemo(query) {
  const bucket = createBucketKey(query.timezone, query.bucket);
  const scoped = workspace.exports.filter(
    (item) =>
      (!query.exportIds.length || query.exportIds.includes(item.id)) &&
      (!query.profileIds.length || query.profileIds.includes(item.profileId)) &&
      (!query.deviceIds.length || query.deviceIds.includes(item.deviceId)),
  );
  const rows = scoped.flatMap((item) =>
    (records.get(item.id) ?? []).map((record, index) => {
      const row = normalizeRecord(
        record,
        {
          exportId: item.id,
          index,
          profileId: item.profileId,
          profileName: item.profileName,
          deviceId: item.deviceId,
          day: item.day,
        },
        `${item.id}:${index}`,
      );
      row.fields.bucket = bucket(row.start);
      return row;
    }),
  );
  const matched = sortRecords(
    rows.filter((row) => matchesQuery(row, query)),
    query,
  );
  const fields = new Map(
    rows.flatMap((row) =>
      Object.entries(row.fields).map(([field, value]) => [
        field,
        { field, type: value === null ? 'mixed' : typeof value },
      ]),
    ),
  );
  return {
    query,
    rows: matched.slice(query.offset, query.offset + query.limit),
    total: matched.length,
    scanned: rows.length,
    duplicates: 0,
    archives: 0,
    nextOffset: query.offset + query.limit < matched.length ? query.offset + query.limit : null,
    facets: {
      metrics: [
        ...new Map(
          rows.map((row) => [row.type, { type: row.type, label: row.metric, domain: row.domain }]),
        ).values(),
      ],
      sources: [...new Set(rows.map((row) => row.source))],
      fields: [...fields.values()],
    },
    visuals: visualizeRecords(matched, query),
    warnings: [
      'Illustrative sample data. Changes stay in this demo and reset when you reload the page.',
    ],
  };
}
/** Browser-local transport; never calls the server or stores personal data.
 * @param {string} path @param {string} method @param {unknown} body @returns {unknown} */
export function demoApi(path, method, body) {
  const url = new URL(path, 'https://demo.myself.md');
  if (url.pathname === '/api/dashboard' && method === 'GET') return structuredClone(workspace);
  if (url.pathname === '/api/dashboard/explore' && method === 'POST')
    return exploreDemo(/** @type {import('../core/explorer.js').ExplorerQuery} */ (body));
  if (url.pathname === '/api/dashboard/record' && method === 'GET') {
    const record = records.get(url.searchParams.get('export') ?? '')?.[
      Number(url.searchParams.get('index'))
    ];
    if (!record) throw new Error('Demo record not found.');
    return { record };
  }
  if (url.pathname === '/api/dashboard/history' && method === 'GET') {
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return { events: events.slice(offset, offset + 50), hasMore: offset + 50 < events.length };
  }
  if (url.pathname === '/api/dashboard/history/entry' && method === 'GET') {
    const event = events.find((item) => item.id === url.searchParams.get('id'));
    if (!event) throw new Error('Demo activity not found.');
    return {
      event,
      related: events.filter((item) => item.relatedId === event.id || item.id === event.relatedId),
    };
  }
  const exportId = url.pathname.match(/^\/api\/dashboard\/exports\/([^/]+)$/)?.[1];
  if (exportId && method === 'DELETE') {
    workspace.exports = workspace.exports.filter((item) => item.id !== exportId);
    records.delete(exportId);
    return { deleted: true };
  }
  if (url.pathname === '/api/dashboard/permissions' && method === 'PUT') {
    const input = /** @type {{deviceId:string,profileId:string,shared:boolean}} */ (body);
    const profile = workspace.profiles.find(
      (item) => item.deviceId === input.deviceId && item.profileId === input.profileId,
    );
    if (!profile) throw new Error('Demo profile not found.');
    profile.shared = input.shared;
    for (const item of workspace.exports)
      if (item.deviceId === input.deviceId && item.profileId === input.profileId)
        item.shared = input.shared;
    return { shared: input.shared };
  }
  if (url.pathname === '/api/dashboard/agents' && method === 'PUT') {
    const input = /** @type {{client:string,blocked:boolean}} */ (body);
    const agent = workspace.agents.find((item) => item.client === input.client);
    if (!agent) throw new Error('Demo agent not found.');
    agent.blocked = input.blocked;
    return { blocked: input.blocked };
  }
  throw new Error('This action is not available in the demo.');
}
