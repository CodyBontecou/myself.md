import { requireOptionalNativeModule } from 'expo';
import { record } from '../core/data.js';
import { usageSessions } from '../core/usage-sessions.js';
/** @typedef {{status:()=>Promise<string>,authorize:()=>Promise<string>,readEvents?:(start:number,end:number)=>Promise<{events:import('../core/usage-sessions.js').UsageEvent[],observedEndMs:number}>,read:(start:number,end:number,type:string,offset:number,limit:number)=>Promise<{records:unknown[],nextOffset:number|null,warnings:string[]}>}} UsageModule */
const usage = requireOptionalNativeModule(/** @type {string} */ ('PhoneUsage'));
/** @returns {UsageModule|null} */
function bridge() {
  return /** @type {UsageModule|null} */ (usage);
}
export async function usageStatus() {
  return (await bridge()?.status()) ?? 'unavailable';
}
export async function authorizeUsage() {
  return (await bridge()?.authorize()) ?? 'unavailable';
}
/** @param {import('../core/data.js').DataQuery} query @param {string} token @returns {Promise<import('../core/data.js').DataPage>} */
export async function usagePage(query, token) {
  const module = bridge();
  if (!module || (await module.status()) !== 'authorized')
    throw new Error('Screen Time data access is unavailable. Enable system Usage Access.');
  const offset = Number(token || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid usage cursor.');
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50)
    throw new Error('Invalid usage page size.');
  if (query.type === 'sessions') {
    if (!module.readEvents)
      throw new Error(
        'Session timelines require the updated Android app. iOS exposes aggregates only.',
      );
    const start = Date.parse(query.start),
      end = Date.parse(query.end);
    const result = await module.readEvents(start, end);
    const sessions = usageSessions(result.events, start, Math.min(end, result.observedEndMs));
    return {
      records: sessions
        .slice(offset, offset + query.limit)
        .map((session) => record('time', 'sessions', 'native-usage', session)),
      nextCursor: offset + query.limit < sessions.length ? String(offset + query.limit) : null,
      capture: 'native-usage-sessions',
      warnings: [
        'Sessions are reconstructed from retained Android activity events, not browser visits. Missing events are not proof of zero usage. A one-day lookback recovers known starts; sessions without a known start are omitted.',
        'Intervals are clipped to the query and observation time. endReason=query-boundary means no closing event was observed. Screen-off and shutdown close intervals; startup discards unresolved intervals with unknown endings. Activity classes are tracked separately, but same-class instances cannot be distinguished. Multi-window apps can overlap; do not add them into elapsed device time.',
        'Pagination re-reads OS events. Use completed historical intervals; event retention or live changes can shift pages.',
      ],
    };
  }
  const result = await module.read(
    Date.parse(query.start),
    Date.parse(query.end),
    query.type,
    offset,
    query.limit,
  );
  return {
    records: result.records.map((r) => record('time', query.type, 'native-usage', r)),
    nextCursor: result.nextOffset === null ? null : String(result.nextOffset),
    capture: 'native-usage-aggregates',
    warnings: result.warnings,
  };
}
