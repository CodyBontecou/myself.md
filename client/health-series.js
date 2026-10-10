import { requireOptionalNativeModule } from 'expo';
/** @typedef {{quantitySeries:(identifier:string,id:string,unit:string)=>Promise<string>}} SeriesModule */
const bridge = /** @type {SeriesModule|null} */ (requireOptionalNativeModule('HealthSeries'));
/** Enrich without discarding the original record if a child read fails.
 * @param {Record<string,unknown>[]} samples @returns {Promise<Record<string,unknown>[]>} */
export async function captureQuantitySeries(samples) {
  /** @type {Record<string,unknown>[]} */ const captured = [];
  for (let offset = 0; offset < samples.length; offset += 5) {
    // Bound native reads for long workout series, preserving source order.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const batch = await Promise.all(
      samples.slice(offset, offset + 5).map(async (sample) => {
        if (Array.isArray(sample.objects)) {
          const objects = await captureQuantitySeries(sample.objects);
          return Object.assign(
            {},
            sample,
            { objects },
            objects.some((object) => object.captureFailures)
              ? { captureFailures: ['A correlated quantity-series detail could not be read.'] }
              : {},
          );
        }
        if (sample.quantityType === undefined) return sample;
        try {
          if (!bridge)
            throw new Error('Rebuild the app to capture HealthKit quantity-series points.');
          if (
            typeof sample.quantityType !== 'string' ||
            typeof sample.uuid !== 'string' ||
            typeof sample.unit !== 'string'
          )
            throw new Error('The quantity sample has no native identity or unit.');
          const details = /** @type {Record<string,unknown>} */ (
            JSON.parse(await bridge.quantitySeries(sample.quantityType, sample.uuid, sample.unit))
          );
          return Object.assign({}, sample, details);
        } catch {
          return Object.assign({}, sample, {
            captureFailures: [
              bridge
                ? 'Quantity-series detail could not be read; the parent sample is retained.'
                : 'This app build lacks the quantity-series reader. Install a rebuilt app; the parent sample is retained.',
            ],
          });
        }
      }),
    );
    captured.push(...batch);
  }
  return captured;
}
