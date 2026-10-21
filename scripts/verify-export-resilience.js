import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as data from '../core/data.js';
import * as exportFiles from '../core/export-files.js';
import * as errors from '../packages/support-chat/errors.js';
/** @type {Map<string,string>} */
const files = new Map();
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
const mocks = {
  recordDebug: () => {},

  Directory,
  File,
  FileMode: { ReadOnly: 'r', Truncate: 'wt' },
  Paths: { document: 'documents', cache: 'cache' },
  catalog: async () => ({
    domains: [
      { domain: 'health', types: ['native:denied', 'native:steps', 'native:paged'] },
      { domain: 'time', types: ['native:applications'] },
    ],
  }),
  /** @param {string} _owner @param {import('../core/data.js').DataQuery} query */
  readPage: async (_owner, query) => {
    if (query.type === 'denied' || (query.type === 'paged' && query.cursor))
      throw new Error('Authorization not determined');
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
  /** @param {unknown} _context @param {unknown} _profile @param {unknown} _file @param {string} format */
  deliverExport: async (_context, _profile, _file, format) => {
    if (failDelivery) throw new Error('Upload failed');
    delivered.push(format);
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
  /** @type {{exportProfileDay:(session:{owner:string,deviceId:string},profile:import('../core/profiles.js').ExportProfile,interval:{day:string,start:string,end:string},valid:()=>boolean,progress:(message:string)=>void,onArtifact?:(artifact:import('../core/history.js').HistoryArtifact)=>void)=>Promise<{count:number,failedSources:number,files:string[]}>}} */ (
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
  'Export resilience: partial records, skipped sources, manifests, all-failed preservation, cancellation, disk and delivery failures verified.',
);
