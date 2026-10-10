import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as updates from '../client/log-updates.js';
import * as core from '../core/history.js';
import * as display from '../core/history-display.js';
import { parseProfile } from '../core/profiles.js';
const db = new DatabaseSync(':memory:');
const sqlite = {
  openDatabaseSync: () => ({
    execSync: (/** @type {string} */ sql) => db.exec(sql),
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    runSync: (sql, ...args) => db.prepare(sql).run(...args),
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    getFirstSync: (sql, ...args) => db.prepare(sql).get(...args) ?? null,
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    getAllSync: (sql, ...args) => db.prepare(sql).all(...args),
    withTransactionSync: (/** @type {()=>void} */ callback) => callback(),
  }),
};
/** @type {import('../core/history.js').HistoryEvent[]} */ let remote = [];
/** @type {unknown[]} */ const published = [];
const session = {
  api: async (
    /** @type {unknown} */ _session,
    /** @type {string} */ _path,
    /** @type {RequestInit|undefined} */ options,
  ) => {
    if (options?.method === 'POST') {
      published.push(JSON.parse(String(options.body)));
      return { ok: true };
    }
    return { events: remote, hasMore: false };
  },
};
async function load() {
  const module = new SourceTextModule(
    await readFile(new URL('../client/history.js', import.meta.url), 'utf8'),
  );
  await module.link((specifier) => {
    const values =
      specifier === './log-updates.js'
        ? updates
        : specifier === './debug-log.js'
          ? { recordDebug: () => {} }
          : specifier === './phone-database.js'
            ? { phoneDatabase: sqlite.openDatabaseSync }
            : specifier === './session.js'
              ? session
              : specifier === '../core/history-display.js'
                ? display
                : core;
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return /** @type {{beginExport:(context:{owner:string,deviceId:string},profile:import('../core/profiles.js').ExportProfile,actor:'manual'|'schedule',interval:{start:string,end:string},id?:string)=>string,recordArtifact:(context:{owner:string,deviceId:string},id:string,artifact:import('../core/history.js').HistoryArtifact)=>void,finishExport:(context:{owner:string,deviceId:string},id:string,status:import('../core/history.js').HistoryStatus)=>void,historyEntry:(context:{owner:string,deviceId:string},server:string,id:string)=>import('../core/history.js').HistoryEvent|null,historyPage:(context:{owner:string,deviceId:string},server:string)=>import('../core/history.js').HistoryEvent[],syncHistory:(session:{owner:string,deviceId:string,server:string},offset?:number,publish?:boolean)=>Promise<unknown>}} */ (
    module.namespace
  );
}
let journal = await load();
const context = { owner: 'alice', deviceId: 'phone' },
  other = { owner: 'bob', deviceId: 'phone' };
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Synthetic sleep',
    selection: { health: ['native:sleep'], time: [], location: [] },
  }),
  id: 'sleep',
};
const stamp = new Date().toISOString(),
  interval = { start: stamp, end: stamp };
try {
  let observed = '';
  const unsubscribe = updates.subscribeLogs(context, () => {
    observed = journal.historyPage(context, '')[0]?.status ?? '';
  });
  const id = journal.beginExport(context, profile, 'manual', interval);
  await Promise.resolve();
  assert.equal(observed, 'running', 'Persisted export starts notify live viewers');
  journal.recordArtifact(context, id, {
    day: '2026-10-08',
    name: 'sleep.json',
    format: 'json',
    recordCount: 3,
    bytes: 120,
    uri: 'file:///synthetic.json',
    cloudId: null,
    checksum: 'checksum',
    partial: true,
  });
  const beforeInvalid = journal.historyEntry(context, '', id);
  const invalidArtifact = JSON.parse(JSON.stringify(beforeInvalid?.artifacts[0]));
  invalidArtifact.bytes = null;
  assert.throws(
    () => journal.recordArtifact(context, id, invalidArtifact),
    /Invalid history count/,
  );
  assert.deepEqual(journal.historyEntry(context, '', id), beforeInvalid);
  journal.finishExport(context, id, 'complete');
  assert.equal(journal.historyEntry(context, '', id)?.status, 'partial');
  await Promise.resolve();
  assert.equal(observed, 'partial', 'Existing export outcomes update live viewers');
  unsubscribe();
  assert.equal(journal.historyPage(other, '').length, 0);
  assert.equal(journal.historyPage({ ...context, deviceId: 'other' }, '').length, 0);
  const pending = journal.beginExport(context, profile, 'manual', interval);
  const scheduled = journal.beginExport(context, profile, 'schedule', interval);
  const malformed = {
    ...core.exportEvent({
      id: 'malformed',
      profile,
      actor: 'manual',
      interval,
      stamp,
      timezone: 'UTC',
    }),
    recordCount: -1,
  };
  db.prepare('INSERT INTO activity_history VALUES (?,?,?,?,?,?)').run(
    context.owner,
    context.deviceId,
    'local',
    malformed.id,
    stamp,
    JSON.stringify(malformed),
  );
  journal = await load();
  assert.equal(journal.historyEntry(context, '', pending)?.status, 'interrupted');
  assert.equal(journal.historyEntry(context, '', scheduled)?.status, 'running');
  assert.equal(
    db.prepare('SELECT value FROM activity_history WHERE id=?').get('malformed'),
    undefined,
  );
  assert.equal(journal.historyEntry(context, '', 'malformed'), null);
  journal.beginExport(context, profile, 'schedule', interval, scheduled);
  assert.equal(
    journal.historyPage(context, '').filter((event) => event.id === scheduled).length,
    1,
  );
  remote = [
    {
      ...core.exportEvent({
        id: 'remote',
        profile,
        actor: 'manual',
        interval,
        stamp,
        timezone: 'UTC',
      }),
      kind: 'access',
      actor: 'agent',
      target: 'cloud',
      status: 'complete',
      relatedId: 'cloud-file',
    },
  ];
  const paired = {
    ...context,
    server: 'https://one.test',
    issuer: 'https://identity.test',
    resource: '',
    accessToken: '',
    refreshToken: '',
    expires: 0,
    account: 'alice',
  };
  const localEvent = journal.historyEntry(context, '', id);
  assert.ok(localEvent);
  remote.push({
    ...localEvent,
    artifacts: localEvent.artifacts.map((a) => Object.assign({}, a, { uri: null })),
  });
  await journal.syncHistory(paired, 0, false);
  assert.equal(
    published.length,
    0,
    'Live polling reads history without republishing local exports',
  );
  assert.ok(journal.historyEntry(context, paired.server, 'remote'));
  await journal.syncHistory(paired);
  assert.ok(published.length > 0);
  assert.ok(!JSON.stringify(published).includes('file:///'));
  assert.equal(
    journal.historyPage(context, paired.server).filter((event) => event.id === id).length,
    1,
  );
  assert.ok(journal.historyEntry(context, paired.server, 'remote'));
  assert.equal(journal.historyEntry(context, 'https://other.test', 'remote'), null);
  assert.equal(journal.historyEntry(other, paired.server, 'remote'), null);
  console.log(
    'Local History: partial completion, owner/device/server partitioning, interruption recovery and retry deduplication passed.',
  );
} finally {
  db.close();
}
