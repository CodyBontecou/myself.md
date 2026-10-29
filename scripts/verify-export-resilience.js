import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as data from '../core/data.js';
import * as exportFiles from '../core/export-files.js';
import * as errors from '../packages/support-chat/errors.js';
/** @type {Map<string,string>} */
const files = new Map();
/** @type {{uri:string,value:string}[]} */
const writes = [];
/** @type {import('../core/data.js').DataRecord[]} */
const bulkRecords = Array.from({ length: 103 }, (_, index) => ({
  domain: 'health',
  type: 'bulk',
  source: 'native',
  start: null,
  end: null,
  native: { index, label: `Record ${index} · café`, detail: { values: [index, index + 1] } },
}));
class Directory {
  /** @param {(string|Directory)[]} parts */
  constructor(...parts) {
    /** @type {string} */
    this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  }
  create() {}
  get exists() {
    return true;
  }
  list() {
    return [...files.keys()]
      .filter((uri) => uri.slice(0, uri.lastIndexOf('/')) === this.uri)
      .map((uri) => new File(this, uri.slice(uri.lastIndexOf('/') + 1)));
  }
  /** @param {string} name */
  createFile(name) {
    const file = new File(this, name);
    file.create();
    return file;
  }
}
class File {
  /** @param {Directory} folder @param {string} name */
  constructor(folder, name) {
    this.parentDirectory = folder;
    this.name = name;
    this.uri = `${folder.uri}/${name}`;
  }
  create() {
    files.set(this.uri, '');
  }
  /** @param {string} value @param {{append?:boolean}} [options] */
  write(value, options) {
    if (failWrite) throw new Error('Disk full');
    writes.push({ uri: this.uri, value });
    files.set(this.uri, (options?.append ? (files.get(this.uri) ?? '') : '') + value);
  }
  /** @param {File} target */
  async move(target) {
    await Promise.resolve();
    if (failMove) throw new Error('Move failed');
    files.set(target.uri, files.get(this.uri) ?? '');
    files.delete(this.uri);
    this.uri = target.uri;
    this.name = target.name;
  }
  async text() {
    return files.get(this.uri) ?? '';
  }
  /** @param {File} target */
  async copy(target) {
    if (failWrite) throw new Error('Disk full');
    // Expo 57 SAF overwrite removes the already-created destination document;
    // its tree URI can then no longer resolve that same document for writing.
    if (target.uri.startsWith('content://')) {
      files.delete(target.uri);
      throw new Error(
        'FileSystemFile.copy: Failed to determine if document is child: FileNotFoundException',
      );
    }
    files.set(target.uri, files.get(this.uri) ?? '');
  }
  /** @param {string} mode */
  open(mode) {
    assert.ok(['r', 'wt'].includes(mode));
    if (failProviderOpen && mode === 'wt') throw new Error('Provider denied write');
    if (mode === 'wt') files.set(this.uri, '');
    let offset = 0;
    let closed = false;
    const uri = this.uri;
    openHandles++;
    return {
      /** @param {number} length */
      readBytes(length) {
        assert.equal(closed, false);
        assert.equal(mode, 'r');
        assert.ok(length <= 256 * 1024, 'SAF copies use bounded chunks');
        const bytes = new TextEncoder().encode(files.get(uri) ?? '').slice(offset, offset + length);
        offset += bytes.length;
        return bytes;
      },
      /** @param {Uint8Array} bytes */
      writeBytes(bytes) {
        assert.equal(closed, false);
        assert.equal(mode, 'wt');
        files.set(uri, (files.get(uri) ?? '') + new TextDecoder().decode(bytes));
      },
      close() {
        assert.equal(closed, false);
        closed = true;
        openHandles--;
      },
    };
  }
  get size() {
    return files.has(this.uri) ? files.get(this.uri)?.length : null;
  }
  get md5() {
    return 'synthetic-checksum';
  }
  get exists() {
    return files.has(this.uri);
  }
  delete() {
    files.delete(this.uri);
  }
}
let openHandles = 0;
let failProviderOpen = false;
let failMove = false,
  failWrite = false,
  failDelivery = false;
let failDetail = false;
/** @type {string[]} */
const delivered = [];
/** @type {Map<string,string>} */
const deliveredPayloads = new Map();
const whoopTypes = ['whoop.cycle', 'whoop.sleep', 'whoop.workout', 'whoop.recovery'];
/** @type {((query:import('../core/data.js').DataQuery)=>Promise<import('../core/data.js').DataPage|null>)|null} */
let sourceRead = null;
const mocks = {
  recordDebug: () => {},

  Directory,
  File,
  FileMode: { ReadOnly: 'r', Truncate: 'wt' },
  Paths: { document: 'documents', cache: 'cache' },
  catalog: async () => ({
    domains: [
      {
        domain: 'health',
        types: [
          'native:denied',
          'native:steps',
          'native:paged',
          'native:bulk',
          ...whoopTypes.map((type) => `native:${type}`),
        ],
      },
      { domain: 'time', types: ['native:applications'] },
    ],
  }),
  /** @param {string} _owner @param {import('../core/data.js').DataQuery} query */
  readPage: async (_owner, query) => {
    const controlled = await sourceRead?.(query);
    if (controlled) return controlled;
    if (query.type === 'denied' || (query.type === 'paged' && query.cursor))
      throw new Error('Authorization not determined');
    if (query.type === 'bulk') {
      assert.equal(query.limit, 50);
      const offset = Number(query.cursor || 0);
      const records = bulkRecords.slice(offset, offset + query.limit);
      return {
        records,
        nextCursor:
          offset + records.length < bulkRecords.length ? String(offset + records.length) : null,
        capture: 'native',
        warnings: [],
        complete: true,
      };
    }
    return {
      records: [
        {
          domain: query.domain,
          type: query.type,
          source: 'native',
          start: null,
          end: null,
          native: {},
        },
      ],
      nextCursor: query.type === 'paged' ? 'next' : null,
      capture: 'native',
      warnings: [],
      complete: !failDetail,
    };
  },
  /** @param {unknown} _context @param {unknown} _profile @param {File} file @param {string} format */
  deliverExport: async (_context, _profile, file, format) => {
    if (failDelivery) throw new Error('Upload failed');
    delivered.push(format);
    deliveredPayloads.set(format, await file.text());
  },
};
const folderModule = new SourceTextModule(
  await readFile(new URL('../client/export-folder.js', import.meta.url), 'utf8'),
);
await folderModule.link((specifier) => {
  const values =
    specifier === '../core/export-files.js'
      ? exportFiles
      : specifier === 'expo-file-system'
        ? mocks
        : specifier === './phone-database.js'
          ? {
              phoneDatabase: () => ({
                execSync: () => {},
                getFirstSync: () => ({
                  id: 'fixture',
                  name: 'Chosen folder',
                  uri: 'content://chosen',
                  bookmark: null,
                }),
              }),
            }
          : specifier === './qa-runtime.js'
            ? { qaEnabled: false }
            : specifier === 'expo'
              ? { requireOptionalNativeModule: () => null }
              : { Platform: { OS: 'android' } };
  return new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  });
});
await folderModule.evaluate();
const exporter = new SourceTextModule(
  await readFile(new URL('../client/profile-export.js', import.meta.url), 'utf8'),
);
await exporter.link((specifier) => {
  if (specifier === './export-folder.js') return folderModule;
  const values =
    specifier === '../packages/support-chat/errors.js'
      ? errors
      : specifier === 'expo-file-system'
        ? mocks
        : specifier === '../core/data.js'
          ? data
          : specifier === '../core/export-files.js'
            ? exportFiles
            : mocks;
  return new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  });
});
await exporter.evaluate();
const { exportProfileDay } =
  /** @type {{exportProfileDay:(session:{owner:string,deviceId:string},profile:import('../core/profiles.js').ExportProfile,interval:{day:string,start:string,end:string},valid:()=>boolean,progress:(message:string)=>void,onArtifact?:(artifact:import('../core/history.js').HistoryArtifact)=>void,billing?:string,check?:(force?:boolean)=>Promise<void>,cloudAuthorization?:{server?:string,url?:string,token:string}|null,prefetchHealth?:boolean)=>Promise<{count:number,failedSources:number,files:string[]}>}} */ (
    exporter.namespace
  );
const { parseExportSettings } = exportFiles;
const session = { owner: 'owner', deviceId: 'phone', server: 'https://example.test' };
const interval = { day: '2026-10-07', start: '2026-10-07T00:00:00Z', end: '2026-10-08T00:00:00Z' };
/** @type {import('../core/profiles.js').ExportProfile} */
const profile = {
  schema: 'myself.md.profile.v1',
  id: 'default',
  name: 'Default',
  schedule: {
    frequency: 'daily',
    hour: 8,
    minute: 0,
    weekday: 1,
    unit: 'day',
    interval: 1,
    anchorDate: '2026-10-07',
    todayRefresh: false,
    refreshHours: 6,
  },
  selection: {
    health: ['native:denied', 'native:steps', 'native:paged', 'native:missing'],
    time: ['native:applications'],
    location: [],
  },
  export: parseExportSettings({ formats: ['json', 'jsonl'] }),
};
/** @type {import('../core/history.js').HistoryArtifact[]} */
const artifacts = [];
const result = await exportProfileDay(
  session,
  profile,
  interval,
  () => true,
  () => {},
  (artifact) => artifacts.push(artifact),
);
assert.equal(artifacts.length, 2);
assert.ok(
  artifacts.every(
    (a) => a.partial && a.recordCount === 3 && a.checksum === 'synthetic-checksum' && a.bytes > 0,
  ),
);
assert.equal(artifacts[0]?.warnings?.length, 3);
assert.ok(!JSON.stringify(artifacts).includes('Authorization not determined'));
assert.equal(result.count, 3);
assert.equal(result.failedSources, 3);
/** @type {{status:string,failures:{type:string,recordCount:number}[],records:import('../core/data.js').DataRecord[]}} */
const json = JSON.parse(files.get('documents/Exports/phone/default/2026-10-07.v1.json') ?? '');
assert.equal(json.status, 'partial');
assert.equal(json.failures.length, 3);
assert.deepEqual(
  json.records.map((r) => r.type),
  ['steps', 'paged', 'applications'],
);
assert.equal(json.failures.find((f) => f.type === 'paged')?.recordCount, 1);
const manifest = JSON.parse(
  files.get('documents/Exports/phone/default/2026-10-07.v1.jsonl.manifest.json') ?? '',
);
assert.deepEqual(manifest.failures, json.failures);
const previous = files.get('documents/Exports/phone/default/2026-10-07.v1.json');
await assert.rejects(
  exportProfileDay(
    session,
    { ...profile, selection: { health: ['native:denied'], time: [], location: [] } },
    interval,
    () => true,
    () => {},
  ),
  /No selected sources could be read/,
);
assert.equal(files.get('documents/Exports/phone/default/2026-10-07.v1.json') ?? '', previous);
await assert.rejects(
  exportProfileDay(
    session,
    profile,
    interval,
    () => false,
    () => {},
  ),
  /cancelled/,
);
failWrite = true;
await assert.rejects(
  exportProfileDay(
    session,
    profile,
    interval,
    () => true,
    () => {},
  ),
  /Disk full/,
);
failWrite = false;
failMove = true;
artifacts.length = 0;
await assert.rejects(
  exportProfileDay(
    session,
    profile,
    interval,
    () => true,
    () => {},
    (artifact) => artifacts.push(artifact),
  ),
  /Move failed/,
);
assert.equal(artifacts.length, 0);
failMove = false;
failDelivery = false;
failDetail = true;
const partialDetail = await exportProfileDay(
  session,
  { ...profile, selection: { health: ['native:steps'], time: [], location: [] } },
  interval,
  () => true,
  () => {},
);
assert.equal(partialDetail.count, 1);
assert.equal(partialDetail.failedSources, 1);
const retainedDetail = JSON.parse(
  files.get('documents/Exports/phone/default/2026-10-07.v1.json') ?? '{}',
);
assert.equal(retainedDetail.status, 'partial');
assert.equal(retainedDetail.records.length, 1);
// Re-export through the real local commit path for each conflict policy.
const exportAgain = (/** @type {import('../core/export-files.js').ExportWriteMode} */ writeMode) =>
  exportProfileDay(
    session,
    { ...profile, export: { ...profile.export, writeMode } },
    interval,
    () => true,
    () => {},
  );
const jsonPath = 'documents/Exports/phone/default/2026-10-07.v1.json';
const jsonlPath = 'documents/Exports/phone/default/2026-10-07.v1.jsonl';
failDetail = false;
await exportAgain('replace');
const beforeAppend = files.get(jsonPath);
await exportAgain('append');
assert.equal(JSON.parse(files.get(jsonPath) ?? '{}').records.length, 6);
assert.equal(JSON.parse(files.get(jsonPath) ?? '{}').recordCount, 6);
assert.equal((files.get(jsonlPath) ?? '').trim().split('\n').length, 6);
assert.equal(JSON.parse(files.get(`${jsonlPath}.manifest.json`) ?? '{}').recordCount, 6);
const beforeSkip = new Map(files);
const skipped = await exportAgain('skip');
assert.deepEqual(files, beforeSkip, 'Skip preserves every existing destination byte');
assert.deepEqual(skipped.files, []);
await exportAgain('new_file');
await exportAgain('new_file');
assert.deepEqual(
  JSON.parse(files.get('documents/Exports/phone/default/2026-10-07.v1 (1).json') ?? '{}').records,
  JSON.parse(beforeAppend ?? '{}').records,
);
assert.deepEqual(
  JSON.parse(files.get('documents/Exports/phone/default/2026-10-07.v1 (2).json') ?? '{}').records,
  JSON.parse(beforeAppend ?? '{}').records,
);
assert.ok(files.has('documents/Exports/phone/default/2026-10-07.v1 (1).jsonl.manifest.json'));
files.set(jsonPath, 'invalid JSON');
await assert.rejects(exportAgain('append'));
assert.equal(files.get(jsonPath), 'invalid JSON', 'Malformed append input never replaces the file');
await exportAgain('replace');
failDetail = false;
failMove = false;
// The same policies apply at an owner-selected provider root.
const exportToFolder = (
  /** @type {import('../core/export-files.js').ExportWriteMode} */ writeMode,
) =>
  exportProfileDay(
    session,
    { ...profile, export: { ...profile.export, localFolderId: 'fixture', writeMode } },
    interval,
    () => true,
    () => {},
  );
await exportToFolder('replace');
await exportToFolder('append');
assert.equal(
  JSON.parse(files.get('content://chosen/2026-10-07.v1.json') ?? '{}').records.length,
  6,
);
assert.equal(
  JSON.parse(files.get('content://chosen/2026-10-07.v1.jsonl.manifest.json') ?? '{}').recordCount,
  6,
);
const selectedBeforeSkip = new Map(files);
await exportToFolder('skip');
assert.deepEqual(files, selectedBeforeSkip);
await exportToFolder('new_file');
assert.ok(files.has('content://chosen/2026-10-07.v1 (1).json'));
assert.ok(files.has('content://chosen/2026-10-07.v1 (1).jsonl.manifest.json'));
// An orphaned sidecar must not add nonexistent old records to a newly created data file.
files.delete('content://chosen/2026-10-07.v1.jsonl');
await exportToFolder('append');
assert.equal(
  JSON.parse(files.get('content://chosen/2026-10-07.v1.jsonl.manifest.json') ?? '{}').recordCount,
  3,
);
const preservedJsonl = files.get('content://chosen/2026-10-07.v1.jsonl');
files.set(
  'content://chosen/2026-10-07.v1.jsonl.manifest.json',
  '{"schema":"myself.md.export.v1","recordCount":"invalid"}',
);
await assert.rejects(exportToFolder('append'));
assert.equal(
  files.get('content://chosen/2026-10-07.v1.jsonl'),
  preservedJsonl,
  'Invalid sidecar fails before appending data',
);

// Exercise more than one provider write chunk without loading the whole source.
const { saveInExportFolder } =
  /** @type {{saveInExportFolder:(context:typeof session,profile:import('../core/profiles.js').ExportProfile,file:File,format:string,options?:{filename:string})=>Promise<File>}} */ (
    folderModule.namespace
  );
const largeSource = new File(new Directory('cache'), 'large.jsonl');
const largeBytes = `${'x'.repeat(600 * 1024)}\n`;
files.set(largeSource.uri, largeBytes);
await saveInExportFolder(
  session,
  { ...profile, export: { ...profile.export, localFolderId: 'fixture' } },
  largeSource,
  'jsonl',
  { filename: 'large.jsonl' },
);
assert.equal(files.get('content://chosen/large.jsonl'), largeBytes);

// A provider write-open failure closes the source and leaves existing bytes alone.
const beforeProviderFailure = new Map(files);
failProviderOpen = true;
await assert.rejects(exportToFolder('replace'), /Provider denied write/);
failProviderOpen = false;
assert.deepEqual(
  [...files].filter(([uri]) => uri.startsWith('content://')),
  [...beforeProviderFailure].filter(([uri]) => uri.startsWith('content://')),
);
assert.equal(openHandles, 0, 'All provider handles close after successful or failed writes');

// Three provider pages plus another source preserve exact bytes and global JSON commas.
/** @type {import('../core/data.js').DataRecord[]} */
const expectedRecords = [
  ...bulkRecords,
  { domain: 'time', type: 'applications', source: 'native', start: null, end: null, native: {} },
];
for (const destination of /** @type {const} */ (['local', 'http', 'cloud'])) {
  writes.length = 0;
  deliveredPayloads.clear();
  const bulkProfile = {
    ...profile,
    selection: { health: ['native:bulk'], time: ['native:applications'], location: [] },
    export: { ...profile.export, destination, httpUrl: 'https://example.test/hook' },
  };
  // oxlint-disable-next-line eslint/no-await-in-loop -- Verify each complete destination separately.
  const bulkResult = await exportProfileDay(
    session,
    bulkProfile,
    interval,
    () => true,
    () => {},
  );
  assert.equal(bulkResult.count, 104);
  assert.equal(bulkResult.failedSources, 0);
  for (const format of exportFiles.deliveredFormats(bulkProfile.export)) {
    const payload =
      destination === 'local'
        ? files.get(`documents/Exports/phone/default/2026-10-07.v1.${format}`)
        : deliveredPayloads.get(format);
    assert.ok(payload);
    const chunks = expectedRecords
      .map((row, index) => exportFiles.recordChunk(format, row, index, profile.export.schema))
      .join('');
    if (format === 'json') {
      const { records: exportedRecords, ...metadata } = JSON.parse(payload);
      assert.deepEqual(exportedRecords, expectedRecords);
      assert.equal(
        payload,
        exportFiles.fileHeader(format, profile.export.schema) +
          chunks +
          exportFiles.fileFooter(format, metadata),
        `${destination}: page batching preserves the legacy record-by-record JSON bytes`,
      );
    } else {
      assert.equal(payload, chunks, `${destination}: JSONL bytes and record order are unchanged`);
    }
    const stageWrites = writes.filter(
      ({ uri }) => uri === `cache/Exports/phone/default/2026-10-07.v1.${format}.partial`,
    );
    assert.equal(stageWrites.length, 6, '104 records use four page writes plus header/footer');
    assert.deepEqual(
      stageWrites.slice(1, -1).map(({ value }) => value),
      [
        expectedRecords.slice(0, 50),
        expectedRecords.slice(50, 100),
        expectedRecords.slice(100, 103),
        expectedRecords.slice(103),
      ].map((rows, page) =>
        rows
          .map((row, index) =>
            exportFiles.recordChunk(
              format,
              row,
              (page === 3 ? 103 : page * 50) + index,
              profile.export.schema,
            ),
          )
          .join(''),
      ),
      'Each native write contains exactly one provider page',
    );
  }
}

// Source UI updates are bounded without throttling reads, validity checks or file output.
const actualNow = Date.now;
let clock = 0;
let progressReads = 0;
let stagingChecks = 0;
/** @type {{message:string,time:number}[]} */
const sourceProgress = [];
try {
  Date.now = () => clock;
  sourceRead = async (query) => {
    progressReads++;
    clock += 20;
    if (query.type !== 'bulk') return null;
    const index = Number(query.cursor || 0);
    return {
      records: [
        {
          domain: 'health',
          type: 'bulk',
          source: 'native',
          start: null,
          end: null,
          native: { index },
        },
      ],
      nextCursor: index < 24 ? String(index + 1) : null,
      capture: 'native',
      warnings: [],
      complete: true,
    };
  };
  deliveredPayloads.clear();
  const throttled = await exportProfileDay(
    session,
    {
      ...profile,
      selection: { health: ['native:bulk'], time: ['native:applications'], location: [] },
      export: { ...profile.export, destination: 'http', httpUrl: 'https://example.test/hook' },
    },
    interval,
    () => true,
    (message) => sourceProgress.push({ message, time: clock }),
    () => {},
    '',
    async (force = true) => {
      if (!force) stagingChecks++;
    },
  );
  assert.equal(throttled.count, 26);
  assert.equal(progressReads, 26);
  assert.equal(stagingChecks, 26, 'Every provider page retains its validity check');
  assert.deepEqual(
    sourceProgress,
    [0, 5, 10, 15, 20, 25].map((count) => ({
      time: count * 20,
      message: `${interval.day}: ${count === 25 ? 'applications' : 'bulk'} · ${count} records`,
    })),
  );
  const progressJSON = JSON.parse(deliveredPayloads.get('json') ?? '');
  assert.equal(progressJSON.records.length, 26);
  assert.deepEqual(
    progressJSON.records
      .slice(0, 25)
      .map(
        (/** @type {import('../core/data.js').DataRecord} */ row) =>
          /** @type {{index:number}} */ (row.native).index,
      ),
    Array.from({ length: 25 }, (_, index) => index),
  );
  assert.equal((deliveredPayloads.get('jsonl') ?? '').trim().split('\n').length, 26);
} finally {
  Date.now = actualNow;
  sourceRead = null;
}

// Provider lookahead overlaps independent network reads without reordering output or cursor pages.
const providerProfile = {
  ...profile,
  selection: {
    health: ['native:steps', ...whoopTypes.map((type) => `native:${type}`)],
    time: [],
    location: [],
  },
  export: {
    ...profile.export,
    destination: /** @type {const} */ ('http'),
    httpUrl: 'https://example.test/hook',
  },
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const unreleased = () => assert.fail('Controlled promise has not been initialized');
/** @param {string} type @param {string|null} [nextCursor] @returns {import('../core/data.js').DataPage} */
const providerPage = (type, nextCursor = null) => ({
  records: [
    {
      domain: 'health',
      type,
      source: 'native',
      start: null,
      end: null,
      native: { cursorPage: Boolean(nextCursor) },
    },
  ],
  nextCursor,
  capture: type,
  warnings: [],
  complete: true,
});
for (const failProvider of [false, true]) {
  /** @type {Map<string,{resolve:(page:import('../core/data.js').DataPage)=>void,reject:(error:Error)=>void}>} */
  const pending = new Map();
  let active = 0,
    maxActive = 0;
  /** @type {string[]} */
  const started = [];
  /** @type {()=>void} */
  let releaseNative = unreleased;
  const nativeGate = new Promise((resolve) => {
    releaseNative = () => resolve(null);
  });
  sourceRead = async (query) => {
    if (!query.type.startsWith('whoop.')) {
      await nativeGate;
      return null;
    }
    const key = `${query.type}:${query.cursor}`;
    started.push(key);
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      return await new Promise((resolve, reject) => pending.set(key, { resolve, reject }));
    } finally {
      active--;
    }
  };
  deliveredPayloads.clear();
  const run = exportProfileDay(
    session,
    providerProfile,
    interval,
    () => true,
    () => {},
  );
  // oxlint-disable-next-line eslint/no-await-in-loop -- Advance the controlled provider promises.
  await tick();
  assert.deepEqual(
    started,
    whoopTypes.slice(0, 3).map((type) => `${type}:`),
  );
  assert.equal(active, 3, 'Provider requests overlap while native reads are pending');
  if (failProvider)
    pending.get('whoop.workout:')?.reject(new Error('Workout provider temporarily unavailable'));
  else pending.get('whoop.workout:')?.resolve(providerPage('whoop.workout'));
  if (failProvider)
    pending.get('whoop.sleep:')?.reject(new Error('Provider temporarily unavailable'));
  else pending.get('whoop.sleep:')?.resolve(providerPage('whoop.sleep'));
  // oxlint-disable-next-line eslint/no-await-in-loop
  await tick();
  assert.equal(
    started.length,
    3,
    'Completed lookahead slots are retained until source consumption',
  );
  releaseNative();
  pending.get('whoop.cycle:')?.resolve(providerPage('whoop.cycle', 'next'));
  // oxlint-disable-next-line eslint/no-await-in-loop
  await tick();
  assert.deepEqual(started, ['whoop.cycle:', 'whoop.sleep:', 'whoop.workout:', 'whoop.cycle:next']);
  pending.get('whoop.cycle:next')?.resolve(providerPage('whoop.cycle'));
  // oxlint-disable-next-line eslint/no-await-in-loop
  await tick();
  assert.equal(started.at(-1), 'whoop.recovery:');
  pending.get('whoop.recovery:')?.resolve(providerPage('whoop.recovery'));
  // oxlint-disable-next-line eslint/no-await-in-loop
  const providerResult = await run;
  assert.ok(maxActive <= 3);
  assert.equal(providerResult.failedSources, Number(failProvider) * 2);
  /** @type {{records:import('../core/data.js').DataRecord[],failures:{type:string}[]}} */
  const providerJSON = JSON.parse(deliveredPayloads.get('json') ?? '');
  const expectedTypes = [
    'steps',
    'whoop.cycle',
    'whoop.cycle',
    ...(!failProvider ? ['whoop.sleep', 'whoop.workout'] : []),
    'whoop.recovery',
  ];
  assert.deepEqual(
    providerJSON.records.map((row) => row.type),
    expectedTypes,
  );
  assert.deepEqual(
    providerJSON.failures.map((failure) => failure.type),
    failProvider ? ['whoop.sleep', 'whoop.workout'] : [],
  );
  assert.equal(
    deliveredPayloads.get('jsonl'),
    providerJSON.records
      .map((row, index) => exportFiles.recordChunk('jsonl', row, index, profile.export.schema))
      .join(''),
  );
  sourceRead = null;
}

// All Time lookahead shares three slots across native Health and provider first pages.
const allTimeProfile = {
  ...providerProfile,
  selection: {
    health: ['native:steps', 'native:whoop.cycle', 'native:paged', 'native:missing', 'native:bulk'],
    time: ['native:applications'],
    location: [],
  },
};
for (const failNative of [false, true]) {
  /** @type {Map<string,{resolve:(page:import('../core/data.js').DataPage)=>void,reject:(error:Error)=>void}>} */
  const pending = new Map();
  /** @type {string[]} */
  const started = [];
  let active = 0,
    maximum = 0;
  sourceRead = async (query) => {
    const key = `${query.type}:${query.cursor}`;
    started.push(key);
    if (query.domain !== 'health') return providerPage(query.type);
    active++;
    maximum = Math.max(maximum, active);
    try {
      return await new Promise((resolve, reject) => pending.set(key, { resolve, reject }));
    } finally {
      active--;
    }
  };
  delivered.length = 0;
  deliveredPayloads.clear();
  const run = exportProfileDay(
    session,
    allTimeProfile,
    interval,
    () => true,
    () => {},
    () => {},
    '',
    async () => {},
    null,
    true,
  );
  // oxlint-disable-next-line eslint/no-await-in-loop -- Control independent first-page completion.
  await tick();
  assert.deepEqual(started, ['steps:', 'whoop.cycle:', 'paged:']);
  assert.equal(active, 3, 'Native and provider sources share one three-page budget');
  pending.get('whoop.cycle:')?.resolve(providerPage('whoop.cycle'));
  if (failNative) pending.get('paged:')?.reject(new Error('Native source read failed'));
  else pending.get('paged:')?.resolve(providerPage('paged'));
  // oxlint-disable-next-line eslint/no-await-in-loop
  await tick();
  assert.equal(started.length, 3, 'Resolved lookahead pages retain their slots until consumption');
  assert.deepEqual(delivered, [], 'Out-of-order page completion cannot publish a file');
  pending.get('steps:')?.resolve(providerPage('steps', 'next'));
  // oxlint-disable-next-line eslint/no-await-in-loop
  await tick();
  assert.deepEqual(started, ['steps:', 'whoop.cycle:', 'paged:', 'steps:next']);
  assert.equal(pending.has('bulk:'), false, 'Current native cursor chain retains its slot');
  pending.get('steps:next')?.resolve(providerPage('steps'));
  // oxlint-disable-next-line eslint/no-await-in-loop
  await tick();
  assert.equal(started.at(-1), 'bulk:');
  assert.equal(started.includes('applications:'), false, 'Usage reads wait for Health consumption');
  assert.equal(
    started.includes('missing:'),
    false,
    'Unavailable selected types are never prefetched',
  );
  pending.get('bulk:')?.resolve(providerPage('bulk'));
  // oxlint-disable-next-line eslint/no-await-in-loop
  const allTimeResult = await run;
  assert.ok(maximum <= 3, 'Cursor continuations and first pages share the concurrency bound');
  assert.equal(started.at(-1), 'applications:');
  const expectedTypes = [
    'steps',
    'steps',
    'whoop.cycle',
    ...(!failNative ? ['paged'] : []),
    'bulk',
    'applications',
  ];
  assert.equal(allTimeResult.count, expectedTypes.length);
  assert.equal(allTimeResult.failedSources, 1 + Number(failNative));
  /** @type {{records:import('../core/data.js').DataRecord[],failures:{type:string}[],captures:{type:string,capture:string}[]}} */
  const payload = JSON.parse(deliveredPayloads.get('json') ?? '');
  assert.deepEqual(
    payload.records.map((row) => row.type),
    expectedTypes,
  );
  assert.deepEqual(
    payload.captures.map((capture) => capture.type),
    expectedTypes,
  );
  assert.deepEqual(
    payload.captures.map((capture) => capture.capture),
    expectedTypes,
  );
  assert.deepEqual(
    payload.failures.map((failure) => failure.type),
    [...(failNative ? ['paged'] : []), 'missing'],
    'Prefetched native failures stay in the original source position',
  );
  assert.deepEqual(
    payload.records.slice(0, 2).map((row) => row.native),
    [{ cursorPage: true }, { cursorPage: false }],
  );
  assert.equal(
    deliveredPayloads.get('jsonl'),
    payload.records
      .map((row, index) => exportFiles.recordChunk('jsonl', row, index, profile.export.schema))
      .join(''),
    'Native lookahead preserves exact JSONL bytes and global record order',
  );
  sourceRead = null;
}

// Captured rejections cannot become unhandled or publish after cancellation/remote revocation.
/** @type {unknown[]} */
const unhandled = [];
const rejected = (/** @type {unknown} */ error) => {
  unhandled.push(error);
};
process.on('unhandledRejection', rejected);
try {
  for (const scenario of ['before-dispatch', 'prefetched', 'remote-check', 'late-remote-check']) {
    let valid = scenario !== 'before-dispatch';
    let reads = 0;
    /** @type {()=>void} */
    let release = unreleased;
    const gate = new Promise((resolve) => {
      release = () => resolve(null);
    });
    /** @type {(error:Error)=>void} */
    let rejectRemote = unreleased;
    const remoteGate = new Promise((_resolve, reject) => {
      rejectRemote = reject;
    });
    let checks = 0;
    sourceRead = async () => {
      reads++;
      await gate;
      throw new Error('Discarded provider failure');
    };
    delivered.length = 0;
    const run = exportProfileDay(
      session,
      providerProfile,
      interval,
      () => valid,
      () => {},
      () => {},
      '',
      async () => {
        if (scenario === 'late-remote-check' && ++checks === 1) await remoteGate;
        if (scenario === 'remote-check') throw new Error('Remote request revoked');
      },
    );
    // Attach the rejection handler before releasing any asynchronous failure.
    const failure = assert.rejects(
      run,
      scenario.includes('remote-check') ? /Remote request revoked/ : /cancelled/,
    );
    // oxlint-disable-next-line eslint/no-await-in-loop
    await tick();
    if (scenario === 'prefetched') {
      assert.ok(reads >= 3);
      valid = false;
    } else if (scenario === 'late-remote-check') {
      assert.ok(reads >= 2, 'Other source reads can progress while one validity check waits');
      rejectRemote(new Error('Remote request revoked'));
    } else assert.equal(reads, 0);
    release();
    // oxlint-disable-next-line eslint/no-await-in-loop
    await failure;
    // oxlint-disable-next-line eslint/no-await-in-loop
    await tick();
    assert.deepEqual(delivered, []);
    sourceRead = null;
  }
  for (const scenario of [
    'before-dispatch',
    'prefetched-success',
    'remote-check',
    'late-remote-check',
  ]) {
    let valid = scenario !== 'before-dispatch';
    let reads = 0,
      checks = 0;
    /** @type {()=>void} */
    let release = unreleased;
    const gate = new Promise((resolve) => {
      release = () => resolve(null);
    });
    /** @type {(error:Error)=>void} */
    let rejectRemote = unreleased;
    const remoteGate = new Promise((_resolve, reject) => {
      rejectRemote = reject;
    });
    sourceRead = async (query) => {
      reads++;
      if (query.type !== 'steps' && scenario === 'prefetched-success')
        return providerPage(query.type);
      await gate;
      if (scenario === 'prefetched-success') return providerPage(query.type);
      throw new Error('Discarded native Health failure');
    };
    delivered.length = 0;
    const run = exportProfileDay(
      session,
      allTimeProfile,
      interval,
      () => valid,
      () => {},
      () => {},
      '',
      async () => {
        if (scenario === 'late-remote-check' && ++checks === 1) await remoteGate;
        if (scenario === 'remote-check') throw new Error('Remote All Time request revoked');
      },
      null,
      true,
    );
    const failure = assert.rejects(
      run,
      scenario.includes('remote-check') ? /Remote All Time request revoked/ : /cancelled/,
    );
    // oxlint-disable-next-line eslint/no-await-in-loop -- Allow all three independent checks to dispatch.
    await tick();
    if (scenario === 'prefetched-success') {
      assert.equal(reads, 3);
      valid = false;
    } else if (scenario === 'late-remote-check') {
      assert.equal(reads, 2, 'A delayed remote rejection cannot authorize other pending pages');
      rejectRemote(new Error('Remote All Time request revoked'));
    } else assert.equal(reads, 0);
    release();
    // oxlint-disable-next-line eslint/no-await-in-loop
    await failure;
    // oxlint-disable-next-line eslint/no-await-in-loop
    await tick();
    assert.deepEqual(
      delivered,
      [],
      `${scenario}: native lookahead cannot publish after revocation`,
    );
    assert.ok(![...files.keys()].some((path) => path.endsWith('.partial')));
    sourceRead = null;
  }
  assert.deepEqual(unhandled, []);
} finally {
  process.off('unhandledRejection', rejected);
  sourceRead = null;
}

// Cloud keeps one JSONL file per day; HTTP receives every selected format.
for (const [destination, expected] of /** @type {const} */ ([
  ['cloud', ['jsonl']],
  ['http', ['json', 'jsonl']],
])) {
  delivered.length = 0;
  // oxlint-disable-next-line eslint/no-await-in-loop
  await exportProfileDay(
    session,
    {
      ...profile,
      export: { ...profile.export, destination, httpUrl: 'https://example.test/hook' },
    },
    interval,
    () => true,
    () => {},
  );
  assert.deepEqual(delivered, expected);
}
failDelivery = true;
artifacts.length = 0;
await assert.rejects(
  exportProfileDay(
    session,
    { ...profile, export: { ...profile.export, destination: 'cloud' } },
    interval,
    () => true,
    () => {},
    (artifact) => artifacts.push(artifact),
  ),
  /Upload failed/,
);
assert.equal(artifacts.length, 0);
console.log(
  'Export resilience: partial records, skipped sources, manifests, all-failed preservation, cancellation, disk and delivery failures verified. Multi-page payload equivalence passed; 104 records use four native page writes per format. Bounded WHOOP and opt-in All Time native Health lookahead preserve three shared slots, source/cursor/payload order, partial failures and cancellation/remote revocation without publication or unhandled rejections.',
);
