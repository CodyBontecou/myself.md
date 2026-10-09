export const freeExports = 5;
export const lifetimeProductId = 'myself_md_lifetime';
/** @typedef {{used:number,reserved:number,unlocked:boolean,remaining:number}} ExportAllowance */
/** @param {number} used @param {number} reserved @param {boolean} unlocked @returns {ExportAllowance} */
export function exportAllowance(used, reserved, unlocked) {
  return { used, reserved, unlocked, remaining: Math.max(0, freeExports - used - reserved) };
}
