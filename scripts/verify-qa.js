import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import * as profiles from '../core/profiles.js';
import * as fixtures from '../client/qa-fixtures.js';
import * as history from '../core/history.js';
import * as display from '../core/history-display.js';

/** @param {boolean} dev @param {string} flag */
async function runtime(dev, flag) {
  const context = createContext({ __DEV__: dev, process: { env: { EXPO_PUBLIC_QA: flag } } });
  const storage = new Map();
  /** @type {string[]} */
  const writes = [];
  const boundary = {
    getItemSync: (/** @type {string} */ key) => storage.get(key) ?? null,
    setItemSync: (/** @type {string} */ key, /** @type {string} */ value) => {
      writes.push(key);
      storage.set(key, value);
    },
  };
  async function load() {
    const module = new SourceTextModule(
      await readFile(new URL('../client/qa-runtime.js', import.meta.url), 'utf8'),
      { context },
    );
    await module.link((specifier) => {
      const values =
        specifier === 'expo-sqlite/kv-store'
          ? { default: boundary }
          : specifier === './qa-fixtures.js'
            ? fixtures
            : profiles;
      return new SyntheticModule(
        Object.keys(values),
        function () {
          for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        },
        { context },
      );
    });
    await module.evaluate();
    return /** @type {{qaEnabled:boolean,qaSnapshot:()=>fixtures.QaState,resetQa:(scenario?:unknown,onboarding?:boolean)=>unknown,updateQa:(state:Partial<fixtures.QaState>)=>unknown}} */ (
      module.namespace
    );
  }
  return { load, context, writes, storage };
}

await Promise.all(
  /** @type {[boolean,string][]} */ ([
    [false, '1'],
    [true, '0'],
  ]).map(async ([dev, flag]) => {
    const app = await runtime(dev, flag);
    const qa = await app.load();
    assert.equal(qa.qaEnabled, false);
    assert.equal(app.context['__myselfQa'], undefined);
    assert.throws(() => qa.resetQa(), /opt-in development/);
    assert.equal(app.writes.length, 0);
  }),
);
const app = await runtime(true, '1');
const qa = await app.load();
assert.equal(qa.qaEnabled, true);
assert.throws(() => qa.resetQa('unknown'), /Unknown QA/);
assert.throws(
  () => qa.resetQa('populated', /** @type {boolean} */ (/** @type {unknown} */ ('yes'))),
  /boolean/,
);
assert.equal(app.writes.length, 0);
for (const scenario of fixtures.qaScenarios) {
  qa.resetQa(scenario, false);
  const state = qa.qaSnapshot();
  assert.equal(state.scenario, scenario);
  assert.equal(state.onboarding, false);
  assert.equal(state.profiles.profiles.length, 1);
  assert.equal(state.events.length, scenario === 'empty' ? 0 : 3);
  assert.ok(state.events.every((event) => event.artifacts.length === 0));
  assert.ok(state.profiles.profiles.every((profile) => profile.agentAccess === false));
  assert.deepEqual(Object.values(state.permissions), ['denied', 'denied', 'denied']);
}
const profile = qa.qaSnapshot().profiles.profiles[0];
assert.ok(profile);
qa.updateQa({
  profiles: profiles.parseProfileState({ profiles: [{ ...profile, name: 'Saved QA name' }] }),
});
const reloaded = await app.load();
assert.equal(reloaded.qaSnapshot().profiles.profiles[0]?.name, 'Saved QA name');
qa.resetQa();
assert.equal(qa.qaSnapshot().profiles.profiles[0]?.name, 'QA profile');
assert.ok(app.writes.every((key) => key === 'argent-qa-state-v1'));
assert.throws(() => profiles.parseProfileState({ profiles: [] }), /between 1 and 50/);
assert.throws(
  () => profiles.parseProfileState({ profiles: [profile, profile] }),
  /unique profile IDs/,
);

// Exercise the real database boundary and startup recovery against two distinct databases.
// A fixture import must not recover, delete, or read another partition's history.
/** @param {boolean} enabled */
async function verifyDatabase(enabled) {
  /** @type {string[]} */
  const names = [];
  const databases = new Map(/** @type {[string,DatabaseSync][]} */ ([]));
  /** @param {string} name */
  function open(name) {
    names.push(name);
    let database = databases.get(name);
    if (!database) {
      database = new DatabaseSync(':memory:');
      databases.set(name, database);
    }
    const db = database;
    return {
      execSync: (/** @type {string} */ sql) => db.exec(sql),
      getAllSync: (/** @type {string} */ sql) => db.prepare(sql).all(),
      runSync: (
        /** @type {string} */ sql,
        /** @type {import('node:sqlite').SQLInputValue[]} */ ...args
      ) => db.prepare(sql).run(...args),
    };
  }
  const normal = open('phone-data.sqlite');
  normal.execSync(
    'CREATE TABLE activity_history (owner TEXT, device TEXT, origin TEXT, id TEXT, started TEXT, value TEXT, PRIMARY KEY(owner,device,origin,id))',
  );
  const running = JSON.stringify({
    ...fixtures.qaFixture('populated').events[0],
    status: 'running',
  });
  normal.runSync(
    'INSERT INTO activity_history VALUES (?,?,?,?,?,?)',
    'normal-owner',
    'normal-device',
    'local',
    'running',
    '2026-10-01',
    running,
  );
  normal.runSync(
    'INSERT INTO activity_history VALUES (?,?,?,?,?,?)',
    'normal-owner',
    'normal-device',
    'local',
    'corrupt',
    '2026-10-01',
    '{}',
  );
  names.length = 0;
  const context = createContext({ console: { warn: () => {} } });
  const boundary = new SourceTextModule(
    await readFile(new URL('../client/phone-database.js', import.meta.url), 'utf8'),
    { context },
  );
  await boundary.link((specifier) => {
    const values =
      specifier === 'expo-sqlite' ? { openDatabaseSync: open } : { qaEnabled: enabled };
    return new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context },
    );
  });
  await boundary.evaluate();
  const journal = new SourceTextModule(
    await readFile(new URL('../client/history.js', import.meta.url), 'utf8'),
    { context },
  );
  await journal.link((specifier) => {
    if (specifier === './phone-database.js') return boundary;
    const values =
      specifier === './log-updates.js'
        ? { notifyLogs: () => {} }
        : specifier === './debug-log.js'
          ? { recordDebug: () => {} }
          : specifier === '../core/history.js'
            ? history
            : specifier === '../core/history-display.js'
              ? display
              : {
                  api: () => {
                    throw new Error('No network in QA startup.');
                  },
                };
    return new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context },
    );
  });
  await journal.evaluate();
  assert.deepEqual(names, [enabled ? 'argent-qa-data.sqlite' : 'phone-data.sqlite']);
  const rows = normal.getAllSync('SELECT id,value FROM activity_history ORDER BY id');
  if (enabled) {
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.id === 'running')?.value, running);
  } else {
    assert.equal(rows.length, 1);
    assert.equal(JSON.parse(String(rows[0]?.value)).status, 'interrupted');
  }
  for (const db of databases.values()) db.close();
}
await Promise.all([false, true].map(verifyDatabase));
console.log(
  'QA release gating, validated resets, persistence, isolated storage/startup recovery, and synthetic fixtures pass.',
);
