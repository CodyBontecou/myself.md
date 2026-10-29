import { whoopPage, whoopReadIdentity } from './whoop.js';

/** @typedef {(owner:string,query:import('../core/data.js').DataQuery,token:string)=>Promise<import('../core/data.js').DataPage>} WhoopReader */
/** Reuse only successful empty provider windows; positive daily membership stays provider-owned.
 * Proofs are operation-local, last at most a minute, and never retain record payloads.
 * @param {string} owner @param {{start:string,end:string}} range @param {()=>boolean} valid
 * @param {(force?:boolean)=>Promise<void>} [check]
 * @param {{now?:()=>number,wait?:(ms:number)=>Promise<void>}} [clock] @returns {WhoopReader} */
export function createWhoopExportReader(owner, range, valid, check = async () => {}, clock = {}) {
  const now = clock.now ?? Date.now;
  const wait = clock.wait ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  /** @type {number[]} */ let requests = [];
  /** @type {Map<string,{identity:string,at:number,start:string,end:string,page:Promise<import('../core/data.js').DataPage|null>}>} */
  const proofs = new Map();
  function active() {
    if (!valid()) throw new Error('Export cancelled: profile or schedule changed.');
  }
  /** Remain cancellable while respecting the local share of WHOOP's default 100/minute quota.
   * @param {number} until */
  async function pause(until) {
    while (now() < until) {
      active();
      // oxlint-disable-next-line eslint/no-await-in-loop -- Check cancellation throughout provider backoff.
      await wait(Math.min(250, until - now()));
    }
    active();
  }
  async function beforeRequest() {
    while (true) {
      active();
      requests = requests.filter((at) => now() - at < 60000);
      if (requests.length < 90) {
        requests.push(now());
        break;
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- Reserve a slot for every HTTP attempt, including refreshed-token retries.
      await pause((requests[0] ?? now()) + 60000);
    }
    // A quota wait can outlive the caller's read approval; gate delayed dispatch again.
    await check(false);
    active();
  }
  /** @type {WhoopReader} */
  const read = async (readOwner, query, token) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Retry a provider quota response once after backoff.
        const page = await whoopPage(readOwner, query, token, beforeRequest);
        // oxlint-disable-next-line eslint/no-await-in-loop -- Revalidate consumption after provider I/O.
        await check(false);
        active();
        return page;
      } catch (error) {
        if (
          attempt ||
          !(error instanceof Error) ||
          !error.message.includes('WHOOP rate limit reached')
        )
          throw error;
        // Other devices may share the app quota. A bounded retry never turns denial into empty data.
        // oxlint-disable-next-line eslint/no-await-in-loop -- Respect the provider minute window before one retry.
        await pause(now() + 60000);
      }
    }
    throw new Error('WHOOP could not complete the request.');
  };
  return async (readOwner, query, token) => {
    active();
    const start = Date.parse(query.start),
      end = Date.parse(query.end);
    if (
      readOwner !== owner ||
      token ||
      query.type === 'whoop.body' ||
      start < Date.parse(range.start) ||
      end > Date.parse(range.end) ||
      end - start > 2 * 86400000
    )
      return read(readOwner, query, token);
    const identity = await whoopReadIdentity(owner, query.type);
    active();
    let proof = proofs.get(query.type);
    if (
      !proof ||
      proof.identity !== identity ||
      now() - proof.at >= 60000 ||
      start < Date.parse(proof.start) ||
      end > Date.parse(proof.end)
    ) {
      const windowEnd = new Date(
        Math.min(start + 30 * 86400000, Date.parse(range.end)),
      ).toISOString();
      const pending = read(
        owner,
        { ...query, start: query.start, end: windowEnd, cursor: '', limit: 1 },
        '',
      )
        .then((page) =>
          page.records.length === 0 && page.nextCursor === null && page.complete !== false
            ? page
            : null,
        )
        // A failed optimization probe proves nothing; the requested daily read keeps its own result.
        .catch(() => null);
      proof = { identity, at: now(), start: query.start, end: windowEnd, page: pending };
      proofs.set(query.type, proof);
    }
    const page = await proof.page;
    active();
    await check(false);
    active();
    if ((await whoopReadIdentity(owner, query.type)) !== identity) {
      // Rotation or replacement invalidates the proof. A fresh daily query uses current consent.
      if (proofs.get(query.type) === proof) proofs.delete(query.type);
      active();
      return read(readOwner, query, token);
    }
    active();
    if (!page || now() - proof.at >= 60000) return read(readOwner, query, token);
    return {
      ...page,
      warnings: [
        ...page.warnings,
        `Empty WHOOP window ${proof.start} to ${proof.end} confirmed during this export; probe started at ${new Date(proof.at).toISOString()}; reused for this contained daily interval (maximum age 60 seconds).`,
      ],
    };
  };
}
