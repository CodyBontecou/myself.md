import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as profiles from '../core/profiles.js';
import * as fixtures from '../client/qa-fixtures.js';

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
console.log(
  'QA release gating, validated resets, persistence, isolated storage, and synthetic fixtures pass.',
);
