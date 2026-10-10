import { requireOptionalNativeModule } from 'expo';
/** @typedef {{quantitySeries:(identifier:string,id:string,unit:string)=>Promise<string>,sampleDetails:(identifier:string,id:string)=>Promise<string>,characteristic:(identifier:string)=>Promise<string>,workoutRoutes:(id:string)=>Promise<string>}} SeriesModule */
const bridge = /** @type {SeriesModule|null} */ (requireOptionalNativeModule('HealthSeries'));
/** @param {string} operation @param {string} identifier @param {unknown} error */
export function captureFailure(operation, identifier, error) {
  const detail =
    error && typeof error === 'object' ? /** @type {Record<string,unknown>} */ (error) : {};
  return {
    operation,
    identifier,
    status: 'failed',
    code: typeof detail.code === 'string' || typeof detail.code === 'number' ? detail.code : null,
    message:
      error instanceof Error
        ? error.message
        : typeof detail.message === 'string'
          ? detail.message
          : 'Native health read failed.',
  };
}
function reader() {
  if (!bridge) throw new Error('Install a rebuilt app to capture full HealthKit details.');
  return bridge;
}
/** Snapshots are current values, never historical observations.
 * @param {string} identifier @returns {Promise<Record<string,unknown>>} */
export async function readHealthCharacteristic(identifier) {
  return JSON.parse(await reader().characteristic(identifier));
}
/** @param {string} id @returns {Promise<{records:Record<string,unknown>[],captureFailures:unknown[]}>} */
export async function readWorkoutRoutes(id) {
  return JSON.parse(await reader().workoutRoutes(id));
}
/** Enrich every native sample, retaining parents and successful children on failure.
 * @param {Record<string,unknown>[]} samples @returns {Promise<Record<string,unknown>[]>} */
export async function captureHealthSamples(samples) {
  /** @type {Record<string,unknown>[]} */ const captured = [];
  for (let offset = 0; offset < samples.length; offset += 5) {
    // Bound native reads for long workout series, preserving source order.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const batch = await Promise.all(
      samples.slice(offset, offset + 5).map(async (sample) => {
        const value = Object.assign({}, sample);
        /** @type {unknown[]} */ const failures = Array.isArray(sample.captureFailures)
          ? [...sample.captureFailures]
          : [];
        const identifier =
          typeof sample.quantityType === 'string'
            ? sample.quantityType
            : typeof sample.categoryType === 'string'
              ? sample.categoryType
              : typeof sample.sampleType === 'object' && sample.sampleType
                ? String(/** @type {{identifier?:unknown}} */ (sample.sampleType).identifier ?? '')
                : '';
        if (typeof sample.uuid === 'string' && identifier) {
          try {
            const details = /** @type {Record<string,unknown>} */ (
              JSON.parse(await reader().sampleDetails(identifier, sample.uuid))
            );
            Object.assign(value, details);
            if (Array.isArray(details.captureFailures)) failures.push(...details.captureFailures);
          } catch (error) {
            failures.push(captureFailure('sampleDetails', identifier, error));
          }
        }
        if (Array.isArray(sample.objects)) {
          const objects = await captureHealthSamples(sample.objects);
          value.objects = objects;
          if (
            objects.some(
              (object) => Array.isArray(object.captureFailures) && object.captureFailures.length,
            )
          )
            failures.push(
              captureFailure(
                'correlationMembers',
                identifier,
                new Error('Inspect member captureFailures.'),
              ),
            );
        }
        if (typeof sample.quantityType === 'string') {
          try {
            if (typeof sample.uuid !== 'string' || typeof sample.unit !== 'string')
              throw new Error('The quantity sample has no native identity or unit.');
            const details = /** @type {Record<string,unknown>} */ (
              JSON.parse(
                await reader().quantitySeries(sample.quantityType, sample.uuid, sample.unit),
              )
            );
            Object.assign(value, details);
            if (Array.isArray(details.captureFailures)) failures.push(...details.captureFailures);
          } catch (error) {
            failures.push(captureFailure('quantitySeries', sample.quantityType, error));
          }
        }
        if (failures.length) value.captureFailures = failures;
        return value;
      }),
    );
    captured.push(...batch);
  }
  return captured;
}
