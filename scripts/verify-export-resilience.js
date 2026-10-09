import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as data from '../core/data.js';
import * as exportFiles from '../core/export-files.js';
/** @type {Map<string,string>} */
const files = new Map();
class Directory {
  /** @param {(string|Directory)[]} parts */
  constructor(...parts) {
    /** @type {string} */
    this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  }
  create() {}
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
  move(target) {
    files.set(target.uri, files.get(this.uri) ?? '');
    files.delete(this.uri);
    this.uri = target.uri;
    this.name = target.name;
  }
  get size() {
    return (files.get(this.uri) ?? '').length;
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
let failWrite = false,
  failDelivery = false;
const mocks = {
  Directory,
  File,
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
    };
  },
  deliverExport: async () => {
    if (failDelivery) throw new Error('Upload failed');
  },
};
const exporter = new SourceTextModule(
  await readFile(new URL('../client/profile-export.js', import.meta.url), 'utf8'),
);
await exporter.link((specifier) => {
  const values =
    specifier === 'expo-file-system'
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
const json = JSON.parse(files.get('documents/Exports/phone/default/2026-10-07.json') ?? '');
assert.equal(json.status, 'partial');
assert.equal(json.failures.length, 3);
assert.deepEqual(
  json.records.map((r) => r.type),
  ['steps', 'paged', 'applications'],
);
assert.equal(json.failures.find((f) => f.type === 'paged')?.recordCount, 1);
const manifest = JSON.parse(
  files.get('documents/Exports/phone/default/2026-10-07.jsonl.manifest.json') ?? '',
);
assert.deepEqual(manifest.failures, json.failures);
const previous = files.get('documents/Exports/phone/default/2026-10-07.json');
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
assert.equal(files.get('documents/Exports/phone/default/2026-10-07.json') ?? '', previous);
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
