import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { parseProfile } from '../core/profiles.js';

const source = await readFile(
  new URL('../client/phone-export-request.js', import.meta.url),
  'utf8',
);
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Performance fixture',
    selection: { health: ['native:Steps'], time: [], location: [] },
  }),
  id: 'fixture',
};
const session = { owner: 'fixture-owner', deviceId: 'fixture-phone' };
/** Exercise the real phone request handler with deterministic native/network latency.
 * @param {boolean} cache @param {'complete'|'cancel'|'blocked'|'foreground'|'account'|'stale'} [scenario] */
async function measure(cache, scenario = 'complete') {
  let now = Date.now(),
    checks = 0,
    reads = 0,
    uploads = 0,
    foreground = true,
    owned = true,
    cancelled = false;
  const initial = now;
  const rows = new Map();
  let resolveDone = /** @type {(value:Record<string,unknown>)=>void} */ (
    () => {
      throw new Error(`Uninitialized completion for ${scenario}`);
    }
  );
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const context = createContext({
    Error,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
  });
  const mocks = {
    '../packages/support-chat/errors.js': { errorMessage: String },
    'react-native': {
      AppState: {
        get currentState() {
          return foreground ? 'active' : 'background';
        },
      },
    },
    './session.js': {
      /** @param {unknown} _session @param {string} _path @param {{body:string}} options */
      api: async (_session, _path, options) => {
        const value = JSON.parse(options.body);
        now += 1000;
        if (value.action === 'check') {
          checks++;
          if (cancelled && scenario === 'blocked') throw new Error('Agent blocked');
          return { status: cancelled ? 'cancelled' : 'running' };
        }
        if (value.action === 'complete' || value.action === 'fail') resolveDone(value);
        return { status: 'running' };
      },
    },
    './export-context.js': { loadExportContext: () => (owned ? session : null) },
    './profiles.js': { loadProfiles: () => ({ profiles: [profile] }) },
    '../core/profiles.js': { parseProfile },
    './phone-database.js': {
      phoneDatabase: () => ({
        execSync() {},
        getAllSync: () => [],
        getFirstSync: () => null,
        /** @param {string} _sql @param {string} _owner @param {string} _device @param {string} id @param {string} value */
        runSync: (_sql, _owner, _device, id, value) => rows.set(id, value),
      }),
    },
    './qa-runtime.js': { qaEnabled: false },
    '../src/components/Toast.js': { showToast: () => () => {} },
    './export-task.js': {
      /** @param {unknown} _session @param {unknown} _profile @param {unknown} _progress @param {{check:(force?:boolean)=>Promise<void>}} options */
      exportNow: async (_session, _profile, _progress, options) => {
        for (let day = 0; day < 7; day++) {
          // Match exportNow's daily boundary and profile-export's page/delivery boundaries.
          // oxlint-disable-next-line eslint/no-await-in-loop -- Model sequential daily authorization boundaries.
          await options.check();
          for (let type = 0; type < 210; type++) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- Native page reads are cursor-dependent.
            await options.check(false);
            reads++;
            now += 10;
            if (reads === 1) {
              if (scenario === 'cancel' || scenario === 'blocked') cancelled = true;
              if (scenario === 'foreground') foreground = false;
              if (scenario === 'account') owned = false;
              if (scenario === 'stale') now += 2000;
            }
            if (scenario !== 'complete' && scenario !== 'stale') break;
          }
          // oxlint-disable-next-line eslint/no-await-in-loop -- Model sequential daily authorization boundaries.
          await options.check();
          uploads++;
        }
        await options.check();
        return { days: 7, recordCount: reads, failedSources: 0, historyId: 'fixture' };
      },
    },
  };
  const module = new SourceTextModule(
    cache ? source : source.replace('if (!force && Date.now() - checkedAt < 2000) return;', ''),
    { context },
  );
  await module.link((specifier) => {
    const values = /** @type {Record<string,Record<string,unknown>>} */ (mocks)[specifier];
    assert.ok(values, specifier);
    return new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context },
    );
  });
  await module.evaluate();
  const handler = /** @type {{reviewPhoneExport:(...args:unknown[])=>Promise<void>}} */ (
    module.namespace
  );
  await handler.reviewPhoneExport(
    session,
    {
      requestId: 'fixture-request',
      profileId: profile.id,
      configuration: JSON.stringify(parseProfile(profile)),
      expiresAt: new Date(now + 86400000).toISOString(),
      domains: ['health'],
      range: { start: '2026-10-14T04:00:00.000Z', end: '2026-10-21T04:00:00.000Z' },
    },
    () => true,
  );
  const outcome = await done;
  // Let the detached handler release its active-request guard.
  await new Promise((resolve) => setImmediate(resolve));
  return { checks, reads, uploads, elapsed: now - initial, outcome };
}
const before = await measure(false),
  after = await measure(true);
assert.equal(before.outcome.action, 'complete');
assert.equal(after.outcome.action, 'complete');
assert.equal(after.reads, 1470);
assert.equal(after.uploads, 7);
assert.ok(after.checks <= 30, `Expected <=30 remote checks, received ${after.checks}`);
assert.ok(after.elapsed < before.elapsed / 10);
for (const scenario of ['cancel', 'blocked', 'foreground', 'account']) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- The handler owns a single active export guard.
  const result = await measure(
    true,
    /** @type {'cancel'|'blocked'|'foreground'|'account'} */ (scenario),
  );
  assert.equal(result.outcome.action, 'fail', scenario);
  assert.equal(
    result.uploads,
    0,
    `${scenario} must prevent publication despite a cached read check`,
  );
}
const stale = await measure(true, 'stale');
assert.ok(stale.checks > after.checks, 'Read checks refresh after two seconds');
console.log(
  `Phone export: 1,470 source reads, ${before.checks} → ${after.checks} remote checks; modeled elapsed ${before.elapsed} → ${after.elapsed} ms (1 s network / 10 ms native). Cancellation, blocked agent, foreground/account changes and cache expiry passed. This is an isolated model, not phone timing.`,
);

await import('./verify-whoop-export.js');
