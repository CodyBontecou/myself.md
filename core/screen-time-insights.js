import { sorted } from './collections.js';
/** @typedef {ReturnType<import('./screen-time-review.js').screenTimeReview>['series'][number]} UsageSeries */
/** @typedef {{kind:'day'|'hour'|'app',date?:string,hour?:number,appIdentifier?:string}} ChartSelection */
/** Three editable, daily-cap suggestions grounded in observed app days, never auto-saved.
 * @param {UsageSeries} series @param {string} weekStart */
export function experimentCoaching(series, weekStart) {
  if ((Date.parse(series.current.end) - Date.parse(weekStart)) / 86400000 !== 6) return [];
  return series.topApps.slice(0, 3).flatMap((app) => {
    const days =
      series.appDrilldowns
        .find((item) => item.identifier === app.identifier)
        ?.daily.filter(
          (day) =>
            day.date >= weekStart && day.date <= series.current.end && day.durationMs !== null,
        ) ?? [];
    if (!days.length || app.currentMs <= 0) return [];
    const averageMinutes = app.currentMs / days.length / 60000;
    const targetMinutesPerDay = Math.max(0, Math.min(1440, Math.floor(averageMinutes * 0.85)));
    return [
      {
        appIdentifier: app.identifier,
        appName: app.name,
        observedDays: days.length,
        averageMinutes,
        targetMinutesPerDay,
        plan: `Choose one daily ${app.name} session to shorten, and use a stopping cue.`,
        reason: `Observed on ${days.length} days; this editable cap is about 15% below the average of those observed app days. Missing days are excluded, not zero.`,
        baselineWeekStart: weekStart,
      },
    ];
  });
}
/** Select an observation and compare the corresponding day/hour in the selected comparison week.
 * @param {UsageSeries} series @param {ChartSelection} selection */
export function chartContext(series, selection) {
  const offset = selection.date
    ? (Date.parse(selection.date) - Date.parse(series.current.start)) / 86400000
    : -1;
  const previousDate =
    offset >= 0 &&
    selection.date &&
    selection.date <= series.current.end &&
    offset <= (Date.parse(series.previous.end) - Date.parse(series.previous.start)) / 86400000 &&
    series.previous.start
      ? new Date(Date.parse(series.previous.start) + offset * 86400000).toISOString().slice(0, 10)
      : '';
  let selected = null,
    previous = null;
  if (selection.kind === 'hour') {
    selected =
      series.heatmap.cells.find(
        (cell) => cell.date === selection.date && cell.hour === selection.hour,
      ) ?? null;
    previous =
      series.heatmap.cells.find(
        (cell) => cell.date === previousDate && cell.hour === selection.hour,
      ) ?? null;
  } else if (selection.kind === 'day') {
    selected = series.dayBreakdowns.find((day) => day.date === selection.date) ?? null;
    previous = series.dayBreakdowns.find((day) => day.date === previousDate) ?? null;
  } else {
    const app = series.appDrilldowns.find((item) => item.identifier === selection.appIdentifier);
    return {
      selection,
      selected: app ?? null,
      previous: null,
      changeMs: null,
      note: 'Daily app observations are supplied for the loaded period. Missing values are unknown. This short history cannot establish whether usage is unusual.',
    };
  }
  return {
    selection,
    selected,
    previous,
    changeMs:
      selected?.durationMs !== null &&
      selected?.durationMs !== undefined &&
      previous?.durationMs !== null &&
      previous?.durationMs !== undefined
        ? selected.durationMs - previous.durationMs
        : null,
    note: 'Comparison aligns day positions within the selected weeks and local clock hours where both observations exist. Coverage can differ; missing values are unknown. This short history cannot establish unusual usage or causality.',
  };
}
/** Align baseline and experiment weekdays, preserving missing hours.
 * @param {UsageSeries|undefined} baseline @param {UsageSeries|undefined} current
 * @param {string} baselineStart @param {string} experimentStart @param {string} appIdentifier */
export function experimentHourComparison(
  baseline,
  current,
  baselineStart,
  experimentStart,
  appIdentifier,
) {
  const cells = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.parse(experimentStart) + index * 86400000)
      .toISOString()
      .slice(0, 10);
    const weekday = new Date(date).getUTCDay();
    const offset = (weekday - new Date(baselineStart).getUTCDay() + 7) % 7;
    const baselineDate = new Date(Date.parse(baselineStart) + offset * 86400000)
      .toISOString()
      .slice(0, 10);
    return Array.from({ length: 24 }, (_unused, hour) => {
      const before = baseline?.heatmap.cells.find(
        (cell) => cell.date === baselineDate && cell.hour === hour,
      );
      const after = current?.heatmap.cells.find((cell) => cell.date === date && cell.hour === hour);
      // A top-ten omission is unknown, never an implicit zero for the goal app.
      const baselineMs =
        before?.topApps.find((app) => app.identifier === appIdentifier)?.durationMs ?? null;
      const experimentMs =
        after?.topApps.find((app) => app.identifier === appIdentifier)?.durationMs ?? null;
      const baselineElapsedMs =
        baseline?.heatmap.clockChanges.find(
          (value) => value.date === baselineDate && value.hour === hour,
        )?.durationMs ?? 3600000;
      const experimentElapsedMs =
        current?.heatmap.clockChanges.find((value) => value.date === date && value.hour === hour)
          ?.durationMs ?? 3600000;
      return {
        date,
        baselineDate,
        hour,
        baselineElapsedMs,
        experimentElapsedMs,
        baselineMs,
        experimentMs,
        changeMs:
          baselineMs !== null && experimentMs !== null && baselineElapsedMs === experimentElapsedMs
            ? experimentMs - baselineMs
            : null,
      };
    });
  }).flat();
  return {
    cells,
    pairedHours: cells.filter((cell) => cell.changeMs !== null).length,
    note: 'Aligned by local weekday and clock hour. Only observed goal-app entries in both periods receive a difference. Missing or top-ten-omitted app entries remain unknown. Clock changes and collection gaps can change coverage. This does not establish causality.',
  };
}
/** Coverage information shared by the readiness tool and review card.
 * @param {UsageSeries} series @param {boolean} partial @param {{invalid:number,crossingDay:number,overlaps:number}} counts @param {string} [startDate] */
export function exportReadiness(series, partial, counts, startDate = '') {
  const daily = series.daily.filter((day) => day.date >= startDate);
  const missingDays = daily.filter((day) => day.durationMs === null).map((day) => day.date);
  const unallocatedRecords = series.heatmap.days
    .filter((day) => day.date >= startDate)
    .reduce((sum, day) => sum + day.unallocatedRecords, 0);
  return {
    status: missingDays.length
      ? 'missing_days'
      : partial || counts.invalid || counts.crossingDay || counts.overlaps
        ? 'limited'
        : 'observed',
    observedDays: daily.length - missingDays.length,
    expectedDays: daily.length,
    missingDays,
    partial,
    unallocatedRecords,
    hourlyCells: series.heatmap.cells.filter((cell) => cell.date >= startDate).length,
    steps: [
      ...(missingDays.length
        ? [
            'On the phone, open the chosen profile and export the missing date range to cloud storage, then share the new files with agents.',
          ]
        : []),
      ...(unallocatedRecords
        ? [
            'Hourly views need intervals wholly inside a local clock hour. Existing daily aggregates cannot be reconstructed into hours.',
          ]
        : []),
      'Refresh shared export discovery and explicitly select the relevant files. Artifact dates do not prove record coverage.',
      'Profile sharing and Screen time Agent permission require the owner in the app. Observed days do not prove complete collection.',
    ],
  };
}
/** Monthly narrative facts; no generated facts or causal interpretation.
 * @param {UsageSeries} series @param {string} month */
export function monthlyAttentionStory(series, month) {
  const weeks = Array.from({ length: Math.ceil(series.daily.length / 7) }, (_, index) => {
    const days = series.daily.slice(index * 7, index * 7 + 7);
    return {
      start: days[0]?.date ?? '',
      end: days.at(-1)?.date ?? '',
      observedDays: days.filter((day) => day.durationMs !== null).length,
      expectedDays: days.length,
      durationMs: days.some((day) => day.durationMs !== null)
        ? days.reduce((sum, day) => sum + (day.durationMs ?? 0), 0)
        : null,
    };
  });
  const hours = Array.from({ length: 24 }, (_unused, hour) => {
    const cells = series.heatmap.cells.filter((cell) => cell.hour === hour);
    return {
      hour,
      observedDays: cells.length,
      durationMs: cells.length ? cells.reduce((sum, cell) => sum + cell.durationMs, 0) : null,
    };
  });
  const shifts = series.appDrilldowns.map((app) => {
    const first = app.daily.slice(0, 7),
      last = app.daily.slice(-7);
    const firstDays = first.filter((day) => day.durationMs !== null).length,
      lastDays = last.filter((day) => day.durationMs !== null).length;
    const firstMs = firstDays ? first.reduce((sum, day) => sum + (day.durationMs ?? 0), 0) : null;
    const lastMs = lastDays ? last.reduce((sum, day) => sum + (day.durationMs ?? 0), 0) : null;
    return {
      appIdentifier: app.identifier,
      appName: app.name,
      firstDays,
      lastDays,
      firstMs,
      lastMs,
      changeMs: firstDays === 7 && lastDays === 7 ? Number(lastMs) - Number(firstMs) : null,
    };
  });
  return {
    month,
    observedDays: series.current.observedDays,
    expectedDays: series.daily.length,
    observedDurationMs: series.current.observedDurationMs,
    weeks,
    hours,
    leadingHours: sorted(
      hours.filter((hour) => hour.durationMs !== null),
      (a, b) => Number(b.durationMs) - Number(a.durationMs),
    ).slice(0, 3),
    topApps: series.topApps,
    shifts,
    narrative: `${series.current.observedDays} of ${series.daily.length} days contain app-usage observations. ${series.heatmap.cells.length} local-hour cells can be placed in time. Weekly blocks and leading hours describe this selected source only.`,
    note: 'Weekly blocks are consecutive seven-day slices of this calendar month; the final block may be shorter. App shifts compare the first and final seven days only when all app days have observations. Missing observations, unequal coverage and partial exports limit interpretation; no causal or completeness claim is supported.',
  };
}
