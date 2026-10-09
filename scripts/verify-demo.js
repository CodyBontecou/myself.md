import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { demoApi, resetDemo } from '../dashboard/demo.js';
import { readExplorerRoute } from '../dashboard/explorer-route.js';
import { parseHistoryEvent } from '../core/history.js';

/** @returns {import('../dashboard/workspace.js').Workspace} */
const workspace = () =>
  /** @type {import('../dashboard/workspace.js').Workspace} */ (
    demoApi('/api/dashboard', 'GET', undefined)
  );
const original = workspace();
assert.equal(original.exports.length, 90);
assert.equal(original.profiles.length, 3);
/** @param {string} search */
const explore = (search) => {
  const data = demoApi('/api/dashboard/explore', 'POST', readExplorerRoute(search).query);
  return /** @type {{total:number,rows:import('../core/explorer.js').ExplorerRow[],visuals:ReturnType<typeof import('../core/explorer.js').visualizeRecords>}} */ (
    data
  );
};
assert.equal(explore('').total, 720);
for (const domain of ['health', 'time', 'location']) {
  const result = explore(`?domain=${domain}`);
  assert.equal(result.total, 240);
  assert.ok(result.rows.every((row) => row.domain === domain));
}
const steps = explore('?metric=HKQuantityTypeIdentifierStepCount');
assert.equal(steps.total, 120);
assert.ok(steps.visuals.compatible);
const page = explore('?offset=50&limit=50');
assert.equal(page.rows.length, 50);
assert.notEqual(page.rows[0]?.id, explore('').rows[0]?.id);
assert.equal(
  explore(
    '?domain=time&where=' +
      encodeURIComponent(
        JSON.stringify([{ field: 'application', operator: 'eq', value: 'Books' }]),
      ),
  ).total,
  60,
);
const first = original.exports[0];
assert.ok(first);
assert.equal(explore(`?export=${first.id}`).total, 8);
const detail = /** @type {{record:import('../core/data.js').DataRecord}} */ (
  demoApi(`/api/dashboard/record?export=${first.id}&index=0`, 'GET', undefined)
);
assert.equal(detail.record.domain, 'health');
const history = /** @type {{events:unknown[],hasMore:boolean}} */ (
  demoApi('/api/dashboard/history', 'GET', undefined)
);
assert.ok(history.hasMore);
for (const item of history.events) parseHistoryEvent(item);
const access = history.events.map(parseHistoryEvent).find((event) => event.kind === 'access');
assert.ok(access);
const entry = /** @type {{event:unknown,related:unknown[]}} */ (
  demoApi(`/api/dashboard/history/entry?id=${access.id}`, 'GET', undefined)
);
assert.equal(entry.related.length, 1);
const profile = original.profiles[0];
assert.ok(profile);
demoApi('/api/dashboard/permissions', 'PUT', {
  deviceId: profile.deviceId,
  profileId: profile.profileId,
  shared: false,
});
assert.ok(
  workspace()
    .exports.filter((item) => item.profileId === profile.profileId)
    .every((item) => !item.shared),
);
assert.equal(original.profiles[0]?.shared, true, 'Responses must not alias mutable demo state');
const agent = original.agents[0];
assert.ok(agent);
demoApi('/api/dashboard/agents', 'PUT', { client: agent.client, blocked: true });
assert.equal(workspace().agents[0]?.blocked, true);
demoApi(`/api/dashboard/exports/${first.id}`, 'DELETE', undefined);
assert.equal(workspace().exports.length, 89);
assert.equal(explore('').total, 712);
assert.throws(
  () => demoApi(`/api/dashboard/record?export=${first.id}&index=0`, 'GET', undefined),
  /not found/,
);
assert.equal(
  parseHistoryEvent(
    /** @type {{event:unknown}} */ (
      demoApi(`/api/dashboard/history/entry?id=demo-export-${first.id}`, 'GET', undefined)
    ).event,
  ).artifacts[0]?.cloudId,
  first.id,
);
resetDemo();
assert.equal(workspace().exports.length, 90);
assert.equal(workspace().agents[0]?.blocked, false);
assert.equal(workspace().profiles[0]?.shared, true);

// Exercise the actual session boundary: the public root must never fetch config or authenticated APIs.
const result = await build({
  entryPoints: ['dashboard/session.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
});
assert.ok(result.outputFiles[0]);
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, {
  module,
  location: { pathname: '/' },
  Date,
  Map,
  Set,
  URL,
  URLSearchParams,
  TextEncoder,
  structuredClone,
  fetch: () => {
    throw new Error('The demo must not make network requests.');
  },
});
const session =
  /** @type {{initializeSession:()=>Promise<boolean>,api:(path:string,method?:string,body?:unknown)=>Promise<unknown>}} */ (
    module.exports
  );
assert.equal(await session.initializeSession(), true);
assert.equal(
  /** @type {import('../dashboard/workspace.js').Workspace} */ (await session.api('/api/dashboard'))
    .exports.length,
  90,
);
await session.api('/api/dashboard/permissions', 'PUT', {
  deviceId: profile.deviceId,
  profileId: profile.profileId,
  shared: false,
});
assert.equal(workspace().profiles[0]?.shared, true, 'Independent demo sessions must be isolated');
await assert.rejects(session.api('/api/private'), /not available/);
console.log(
  'Demo: query filters, charts, pagination, records, history, sharing, blocking, deletion, reset, and network isolation passed.',
);
