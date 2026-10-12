import { cloudAllowance, cloudUploadFits } from './cloud-allowance.js';

export const cloudDebugScenarios = ['free', 'lifetime', 'used', 'full', 'over-limit'];
/** @typedef {{eligible:boolean,files:number[]}} CloudDebugState */
/** @param {unknown} scenario @returns {CloudDebugState} */
export function cloudDebugFixture(scenario) {
  if (typeof scenario !== 'string' || !cloudDebugScenarios.includes(scenario))
    throw new Error('Unknown cloud QA scenario.');
  const used =
    scenario === 'used'
      ? 42_000_000
      : scenario === 'full'
        ? 100_000_000
        : scenario === 'over-limit'
          ? 101_000_000
          : 0;
  // Represent an existing archive as small synthetic files without allocating payloads.
  const files = Array.from({ length: Math.floor(used / 1_000_000) }, () => 1_000_000);
  return { eligible: scenario !== 'free', files };
}
/** @param {CloudDebugState} state */
export function cloudDebugUsage(state) {
  return cloudAllowance(
    state.eligible,
    state.files.reduce((sum, bytes) => sum + bytes, 0),
  );
}
/** Pure, validated simulated operation. Never reads credentials, files or account data.
 * @param {CloudDebugState} state @param {unknown} action @param {unknown} [bytes]
 * @returns {{state:CloudDebugState,outcome:'completed'|'rejected',message:string}} */
export function cloudDebugAction(state, action, bytes) {
  if (action === 'delete') {
    if (!state.files.length)
      return { state, outcome: 'rejected', message: 'No simulated files to delete.' };
    return {
      state: { ...state, files: state.files.slice(0, -1) },
      outcome: 'completed',
      message: 'Deleted the last simulated file.',
    };
  }
  if (action !== 'upload') throw new Error('Unknown cloud QA action.');
  if (
    typeof bytes !== 'number' ||
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > 16 * 1024 * 1024
  )
    throw new Error('Use a positive whole byte count up to 16 MiB.');
  const usage = cloudDebugUsage(state);
  if (!usage.eligible)
    return { state, outcome: 'rejected', message: 'Verified lifetime access is required.' };
  if (!cloudUploadFits(usage, bytes))
    return {
      state,
      outcome: 'rejected',
      message: 'Cloud quota reached. Delete older exports before uploading more.',
    };
  return {
    state: { ...state, files: [...state.files, bytes] },
    outcome: 'completed',
    message: `Uploaded ${(bytes / 1_000_000).toFixed(1)} MB simulated file.`,
  };
}
