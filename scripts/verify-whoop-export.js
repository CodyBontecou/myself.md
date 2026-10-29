import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
/** @typedef {import('../core/data.js').DataQuery} Query */
/** @typedef {import('../core/data.js').DataPage} Page */
/** @typedef {(owner:string,query:Query,token:string)=>Promise<Page>} Reader */
/** @type {Page} */
const empty = {
  records: [],
  nextCursor: null,
  complete: true,
  capture: 'whoop-v2-provider-records',
  warnings: ['provider warning'],
};
/** @type {import('../core/data.js').DataRecord} */
const row = {
  domain: 'health',
  type: 'whoop.recovery',
  source: 'whoop',
  start: null,
  end: null,
  native: { id: 'recovery', created_at: '2026-01-15T13:00:00Z' },
};
/** @type {Query} */
const query = {
  domain: 'health',
  source: 'native',
  type: 'whoop.recovery',
  start: '2026-01-01T00:00:00.000Z',
  end: '2026-01-02T00:00:00.000Z',
  cursor: '',
  limit: 50,
  format: 'json',
};
const range = { start: '1970-01-01T00:00:00.000Z', end: '2026-02-01T00:00:00.000Z' };
let now = 0,
  valid = true,
  identity = 'connection-1',
  denied = false;
/** @type {{owner:string,query:Query,token:string,at:number}[]} */
let calls = [];
/** @type {Reader} */
let provider = async () => empty;
/** @type {((ms:number)=>Promise<void>)|null} */
let waiting = null;
let blocked = false;
const context = createContext({ Error, Date });
const module = new SourceTextModule(
  await readFile(new URL('../client/whoop-export.js', import.meta.url), 'utf8'),
  { context },
);
await module.link(
  () =>
    new SyntheticModule(
      ['whoopPage', 'whoopReadIdentity'],
      function () {
        this.setExport(
          'whoopPage',
          async (
            /** @type {string} */ owner,
            /** @type {Query} */ requested,
            /** @type {string} */ token,
            beforeRequest = async () => {},
          ) => {
            await beforeRequest();
            calls.push({ owner, query: requested, token, at: now });
            return provider(owner, requested, token);
          },
        );
        this.setExport('whoopReadIdentity', async () => {
          if (denied) throw new Error('WHOOP disconnected');
          return identity;
        });
      },
      { context },
    ),
);
await module.evaluate();
const create =
  /** @type {(owner:string,range:{start:string,end:string},valid:()=>boolean,check:(force?:boolean)=>Promise<void>,clock:{now:()=>number,wait:(ms:number)=>Promise<void>})=>Reader} */ (
    Reflect.get(module.namespace, 'createWhoopExportReader')
  );
function fresh() {
  now = 0;
  valid = true;
  identity = 'connection-1';
  denied = false;
  calls = [];
  provider = async () => empty;
  waiting = null;
  blocked = false;
  return create(
    'owner',
    range,
    () => valid,
    async () => {
      if (blocked) {
        valid = false;
        throw new Error('Agent read approval revoked');
      }
    },
    {
      now: () => now,
      wait: async (ms) => {
        if (waiting) await waiting(ms);
        else now += ms;
      },
    },
  );
}
let read = fresh();
const pages = await Promise.all([
  read('owner', query, ''),
  read(
    'owner',
    { ...query, start: '2026-01-02T00:00:00.000Z', end: '2026-01-03T00:00:00.000Z' },
    '',
  ),
]);
assert.equal(calls.length, 1, 'Concurrent contained empty days share one proof');
assert.equal(calls[0]?.query.limit, 1);
assert.equal(calls[0]?.query.end, '2026-01-31T00:00:00.000Z');
assert.ok(pages.every((page) => page.records.length === 0 && page.nextCursor === null));
assert.match(pages[0]?.warnings.at(-1) ?? '', /maximum age 60 seconds/);
now = 60000;
await read('owner', query, '');
assert.equal(calls.length, 2, 'Expired proofs are re-read');
identity = 'connection-2';
await read('owner', query, '');
assert.equal(calls.length, 3, 'Changed connections invalidate proofs');
denied = true;
await assert.rejects(read('owner', query, ''), /disconnected/);
assert.equal(calls.length, 3);

read = fresh();
provider = async (_owner, q, token) =>
  q.limit === 1
    ? { ...empty, records: [row] }
    : { ...empty, records: [row, row], nextCursor: token ? null : 'provider-cursor' };
let page = await read('owner', query, '');
assert.equal(page.records.length, 2, 'Positive probes never replace exact daily membership');
assert.equal(page.nextCursor, 'provider-cursor');
page = await read('owner', { ...query, cursor: 'opaque-wrapper' }, 'provider-cursor');
assert.equal(page.nextCursor, null);
assert.equal(calls.at(-1)?.token, 'provider-cursor');
assert.equal(calls.length, 3);
for (const probe of [
  { ...empty, nextCursor: 'next' },
  { ...empty, complete: false },
]) {
  read = fresh();
  provider = async (_owner, q) => (q.limit === 1 ? probe : { ...empty, records: [row] });
  // oxlint-disable-next-line eslint/no-await-in-loop -- Exercise both invalid empty-proof cases independently.
  assert.equal((await read('owner', query, '')).records.length, 1);
  assert.equal(calls.length, 2);
}
read = fresh();
provider = async (_owner, q) => {
  if (q.limit === 1) throw new Error('Probe unavailable');
  return { ...empty, records: [row] };
};
assert.equal(
  (await read('owner', query, '')).records.length,
  1,
  'Probe errors cannot manufacture empty data',
);
read = fresh();
provider = async () => {
  identity = 'connection-2';
  return empty;
};
const refreshed = await read('owner', query, '');
assert.equal(
  calls.length,
  2,
  'A connection change during a probe forces a fresh daily provider request',
);
assert.deepEqual(refreshed.warnings, empty.warnings, 'The stale proof is not returned');
read = fresh();
provider = async () => {
  valid = false;
  return empty;
};
await assert.rejects(read('owner', query, ''), /cancelled/);
assert.equal(calls.length, 1);

read = fresh();
const discovery = { ...query, start: range.start, end: range.end };
for (let index = 0; index < 91; index++) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- Verify the rolling quota across source and cursor requests.
  await read('owner', discovery, String(index));
}
assert.equal(calls.length, 91);
assert.equal(calls[90]?.at, 60000);
read = fresh();
waiting = async () => {
  valid = false;
};
for (let index = 0; index < 90; index++) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- Fill the provider request window before cancellation.
  await read('owner', discovery, String(index));
}
await assert.rejects(read('owner', discovery, 'next'), /cancelled/);
assert.equal(calls.length, 90, 'Cancellation prevents the delayed request');
read = fresh();
provider = async () => {
  if (calls.length === 1) throw new Error('WHOOP rate limit reached. Retry later.');
  return empty;
};
await read('owner', discovery, '');
assert.equal(calls.length, 2);
assert.equal(calls[1]?.at, 60000);
read = fresh();
provider = async () => {
  throw new Error('WHOOP access expired or was revoked');
};
await assert.rejects(read('owner', discovery, ''), /revoked/);
assert.equal(calls.length, 1, 'Access denial is never retried as a rate response');
read = fresh();
waiting = async (ms) => {
  now += ms;
  blocked = true;
};
for (let index = 0; index < 90; index++) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- Fill the quota before revoking remote approval during its wait.
  await read('owner', discovery, String(index));
}
await assert.rejects(read('owner', discovery, 'next'), /approval revoked/);
assert.equal(
  calls.length,
  90,
  'Approval revoked during backoff prevents delayed provider dispatch',
);
read = fresh();
provider = async () => {
  blocked = true;
  return empty;
};
await assert.rejects(read('owner', discovery, ''), /approval revoked/);
assert.equal(calls.length, 1, 'A completed provider request is not consumed after remote denial');
console.log(
  'WHOOP All Time: bounded negative proofs, exact positive queries/cursors, TTL/connection invalidation, cancellation, pacing and quota retry pass.',
);

// Exercise the actual credential adapter around waits; the optimization fixture above mocks I/O.
const nativeOwner = 'native-owner';
let signedInOwner = nativeOwner,
  nativeCalls = 0,
  issued = 0,
  hooks = 0,
  unauthorizedOnce = false;
/** @type {Map<string,string>} */ const secure = new Map();
/** @type {(()=>void)|null} */ let exchangeStarted = null;
/** @type {Promise<void>|null} */ let exchangeGate = null;
/** @type {(()=>Promise<void>)|null} */ let afterDispatch = null;
const nativeContext = createContext({
  Error,
  URL,
  URLSearchParams,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: async () => {
    nativeCalls++;
    await afterDispatch?.();
    if (unauthorizedOnce) {
      unauthorizedOnce = false;
      return new Response(null, { status: 401 });
    }
    return Response.json({ records: [], next_token: null });
  },
});
const nativeModule = new SourceTextModule(
  await readFile(new URL('../client/whoop.js', import.meta.url), 'utf8'),
  { context: nativeContext },
);
const providerTypes = await import('../core/whoop.js');
const nativeMocks = {
  '../core/whoop.js': providerTypes,
  './qa-runtime.js': { qaEnabled: false },
  'expo-auth-session': {
    AuthRequest: class {
      state = 'abcdefgh';
    },
  },
  'expo-secure-store': {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'fixture',
    getItemAsync: async (/** @type {string} */ key) => secure.get(key) ?? null,
    setItemAsync: async (/** @type {string} */ key, /** @type {string} */ value) => {
      secure.set(key, value);
    },
    deleteItemAsync: async (/** @type {string} */ key) => {
      secure.delete(key);
    },
  },
  'expo-web-browser': {
    openAuthSessionAsync: async () => ({
      type: 'success',
      url: 'myselfmd://whoop?state=abcdefgh&code=fixture',
    }),
  },
  './session.js': {
    loadSession: async () => ({
      owner: signedInOwner,
      deviceId: 'native-phone',
      server: 'https://fixture.test',
    }),
    api: async (
      /** @type {unknown} */ _session,
      /** @type {string} */ _path,
      /** @type {{body:string}} */ options,
    ) => {
      const body = JSON.parse(options.body);
      if (body.action === 'authorize')
        return {
          authorization_url:
            'https://api.prod.whoop.com/oauth/oauth2/auth?state=abcdefgh&redirect_uri=myselfmd%3A%2F%2Fwhoop',
        };
      if (body.action === 'exchange') {
        exchangeStarted?.();
        await exchangeGate;
      }
      return {
        access_token: `fixture-access-${++issued}`,
        refresh_token: 'fixture-refresh',
        scope: providerTypes.whoopScopes.join(' '),
        expires_in: 3600,
        token_type: 'bearer',
      };
    },
  },
};
await nativeModule.link((specifier) => {
  const values = Reflect.get(nativeMocks, specifier);
  assert.ok(values, `Missing native WHOOP fixture dependency ${specifier}`);
  return new SyntheticModule(
    Object.keys(values),
    function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    },
    { context: nativeContext },
  );
});
await nativeModule.evaluate();
const native =
  /** @type {{connectWhoop:(owner:string)=>Promise<unknown>,forgetWhoop:(owner:string)=>Promise<void>,whoopPage:(owner:string,query:Query,cursor:string,before?:()=>Promise<void>)=>Promise<Page>,whoopReadIdentity:(owner:string,type:string)=>Promise<string>}} */ (
    nativeModule.namespace
  );
await native.connectWhoop(nativeOwner);
const nativeIdentity = await native.whoopReadIdentity(nativeOwner, query.type);
await assert.rejects(
  native.whoopPage(nativeOwner, query, '', async () => {
    await native.forgetWhoop(nativeOwner);
  }),
  /Connect WHOOP|connection changed/,
);
assert.equal(nativeCalls, 0, 'Disconnect during a quota wait prevents HTTP dispatch');
await native.connectWhoop(nativeOwner);
assert.notEqual(await native.whoopReadIdentity(nativeOwner, query.type), nativeIdentity);
const vaultKey = [...secure.keys()][0];
assert.ok(vaultKey);
await assert.rejects(
  native.whoopPage(nativeOwner, query, '', async () => {
    const value = JSON.parse(secure.get(vaultKey) ?? '{}');
    secure.set(vaultKey, JSON.stringify({ ...value, scope: 'read:cycles' }));
  }),
  /approve this data type/,
);
assert.equal(nativeCalls, 0, 'Scope replacement during a wait prevents HTTP dispatch');
await native.connectWhoop(nativeOwner);
await assert.rejects(
  native.whoopPage(nativeOwner, query, '', async () => {
    await native.connectWhoop(nativeOwner);
  }),
  /connection changed/,
);
assert.equal(nativeCalls, 0, 'Connection replacement during a wait prevents HTTP dispatch');
unauthorizedOnce = true;
await native.whoopPage(nativeOwner, query, '', async () => {
  hooks++;
});
assert.equal(
  hooks,
  2,
  'The pacing gate runs for both the original request and refreshed-token retry',
);
assert.equal(nativeCalls, 2);
await assert.rejects(
  native.whoopPage(nativeOwner, query, '', async () => {
    signedInOwner = 'other-owner';
  }),
  /same account/,
);
assert.equal(nativeCalls, 2, 'Account replacement during a wait prevents HTTP dispatch');
signedInOwner = nativeOwner;
let releaseExchange = () => {};
exchangeGate = new Promise((resolve) => {
  releaseExchange = resolve;
});
const exchanging = new Promise((resolve) => {
  exchangeStarted = () => resolve(undefined);
});
const connecting = native.connectWhoop(nativeOwner);
await exchanging;
const forgetting = native.forgetWhoop(nativeOwner);
releaseExchange();
await assert.rejects(connecting, /connection was cancelled/);
await forgetting;
assert.equal(secure.size, 0, 'A disconnect during exchange cannot restore credentials');
console.log(
  'Actual WHOOP adapter: delayed-dispatch account/scope/connection checks,401 pacing hooks and disconnect-during-exchange pass.',
);

await native.connectWhoop(nativeOwner);
afterDispatch = async () => {
  const saved = JSON.parse(secure.get(vaultKey) ?? '{}');
  secure.set(vaultKey, JSON.stringify({ ...saved, scope: 'read:cycles' }));
};
await assert.rejects(native.whoopPage(nativeOwner, query, ''), /connection changed/);
afterDispatch = null;
console.log('Actual WHOOP adapter: scope loss during provider I/O rejects consumption.');
