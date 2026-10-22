/** @typedef {{source:string,type:string,granularity:string,device:string}} ExperimentSeries */
/** @typedef {{daily:{date:string,durationMs:number|null,records:number}[],observedDays:number,observedDurationMs:number|null,missingDays:string[],usable:boolean,exportIds:string[],warnings:string[]}} ExperimentMeasurement */

/** Derive app observations after the weekly review's deduplication and exclusions.
 * @param {ReturnType<typeof import('./screen-time-review.js').screenTimeReview>} review
 * @param {ExperimentSeries} selection @param {string} identifier
 * @returns {ExperimentMeasurement} */
export function experimentMeasurement(review, selection, identifier) {
  const series = review.series.find(
    (item) =>
      item.source === selection.source &&
      item.type === selection.type &&
      item.granularity === selection.granularity &&
      item.device === selection.device,
  );
  const app = series?.appDrilldowns.find((item) => item.identifier === identifier);
  const daily = Array.from({ length: 7 }, (_, index) => ({
    date: new Date(Date.parse(review.weekStart) + index * 86400000).toISOString().slice(0, 10),
    durationMs: app?.daily[index + 7]?.durationMs ?? null,
    records: app?.daily[index + 7]?.records ?? 0,
  }));
  const observedDays = daily.filter((day) => day.durationMs !== null).length;
  return {
    daily,
    observedDays,
    observedDurationMs: observedDays
      ? daily.reduce((sum, day) => sum + (day.durationMs ?? 0), 0)
      : null,
    missingDays: daily.filter((day) => day.durationMs === null).map((day) => day.date),
    usable:
      observedDays === 7 &&
      !review.counts.invalid &&
      !review.counts.crossingDay &&
      !review.counts.overlaps &&
      !review.exports.some((file) => file.partial),
    exportIds: review.exports.map((file) => file.id),
    warnings: [
      ...(!series ? ['The saved usage source/type/granularity/device was not found.'] : []),
      ...(observedDays < 7
        ? [`${7 - observedDays} app days have no observations; missing usage is unknown.`]
        : []),
      ...(review.counts.invalid ? [`${review.counts.invalid} invalid records were excluded.`] : []),
      ...(review.counts.crossingDay
        ? [`${review.counts.crossingDay} records crossing local midnight were excluded.`]
        : []),
      ...(review.counts.overlaps
        ? [`${review.counts.overlaps} conflicting overlapping records were excluded.`]
        : []),
      ...(review.exports.some((file) => file.partial)
        ? ['At least one selected export is partial.']
        : []),
    ],
  };
}

/** Evaluate a daily cap against observed usage, without inferring missing observations.
 * @param {ExperimentMeasurement} baseline @param {ExperimentMeasurement} observed
 * @param {number} targetMinutesPerDay */
export function experimentOutcome(baseline, observed, targetMinutesPerDay) {
  const daysAboveGoal = observed.daily
    .filter((day) => day.durationMs !== null && day.durationMs > targetMinutesPerDay * 60000)
    .map((day) => day.date);
  return {
    outcome: !observed.usable
      ? 'inconclusive'
      : daysAboveGoal.length
        ? 'above_goal'
        : 'within_goal',
    daysAboveGoal,
    changeMs:
      baseline.usable && observed.usable
        ? Number(observed.observedDurationMs) - Number(baseline.observedDurationMs)
        : null,
    observed,
    caveat:
      'Results describe observed app usage only. Even seven observed days do not prove complete collection. Missing app observations are unknown, not zero; this comparison cannot establish that the experiment caused a change.',
  };
}
