export const lifetimeCloudBytes = 100_000_000;
/** @typedef {{eligible:boolean,limitBytes:number,usedBytes:number,availableBytes:number,overLimit:boolean,retentionDays:number}} CloudAllowance */
/** @param {boolean} eligible @param {number} usedBytes @returns {CloudAllowance} */
export function cloudAllowance(eligible, usedBytes) {
  const limitBytes = eligible ? lifetimeCloudBytes : 0;
  return {
    eligible,
    limitBytes,
    usedBytes,
    availableBytes: Math.max(0, limitBytes - usedBytes),
    overLimit: usedBytes > limitBytes,
    retentionDays: 30,
  };
}
/** @param {CloudAllowance} value */
export function cloudUsageLabel(value) {
  return `${(value.usedBytes / 1_000_000).toFixed(1)} MB of ${(value.limitBytes / 1_000_000).toFixed(0)} MB used`;
}
/** Shared commit-capacity rule; entitlement and file validation remain required.
 * @param {CloudAllowance} value @param {number} bytes @param {number} [replacedBytes] */
export function cloudUploadFits(value, bytes, replacedBytes = 0) {
  return value.eligible && value.usedBytes - replacedBytes + bytes <= value.limitBytes;
}
