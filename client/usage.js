import { requireOptionalNativeModule } from 'expo';
import { record } from '../core/data.js';
/** @typedef {{status:()=>Promise<string>,authorize:()=>Promise<string>,read:(start:number,end:number,type:string,offset:number,limit:number)=>Promise<{records:unknown[],nextOffset:number|null,warnings:string[]}>}} UsageModule */
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
    throw new Error(
      'Screen Time data access is unavailable. Enable system access or import a time.md export.',
    );
  const offset = Number(token || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid usage cursor.');
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
