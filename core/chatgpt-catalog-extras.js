import { screenTimeReview } from './screen-time-review.js';
import { healthReview } from './health-review.js';
import { sleepScreenTime } from './sleep-screen-time.js';
import {
  chartContext,
  experimentCoaching,
  experimentHourComparison,
  exportReadiness,
  monthlyAttentionStory,
} from './screen-time-insights.js';

/** @param {import('./screen-time-review.js').ReviewDay[]} dates */
const slotsFor = (dates) =>
  dates.flatMap((d) =>
    Array.from({ length: 24 }, (_, hour) => ({
      date: d.date,
      hour,
      start: Date.parse(d.start) + hour * 3600000,
      end: Date.parse(d.start) + (hour + 1) * 3600000,
    })),
  );

/** Additional deterministic examples use the same calculations as connected reviews.
 * @param {import('./screen-time-review.js').ReviewDay[]} days
 * @param {import('./screen-time-review.js').ReviewRecord[]} time
 * @param {import('./screen-time-review.js').ReviewExport[]} exports
 * @param {ReturnType<typeof screenTimeReview>} comparison */
export function catalogExtras(days, time, exports, comparison) {
  const reviewDays = days.slice(7);
  const scope = { deviceId: 'fictional-catalog-phone', profileId: 'fictional-catalog-profile' };
  const sleepRows = reviewDays.flatMap((day, index) => {
    // One absent night stays unknown. Include a scored nap as a separate session.
    if (index === 4) return [];
    return [false, ...(index === 2 ? [true] : [])].map((nap) => {
      const start = Date.parse(day.start) + (nap ? 14 : -2) * 3600000;
      const light = (nap ? 0.5 : 3.5 + (index % 3) * 0.25) * 3600000;
      const deep = (nap ? 0 : 1) * 3600000;
      const rem = (nap ? 0 : 1.5) * 3600000;
      const awake = (nap ? 0 : 0.5) * 3600000;
      return {
        exportId: `fictional-${day.date}`,
        record: {
          domain: /** @type {const} */ ('health'),
          source: 'whoop',
          type: 'whoop.sleep',
          start: new Date(start).toISOString(),
          end: new Date(start + light + deep + rem + awake).toISOString(),
          native: {
            id: `fictional-whoop-${day.date}-${nap ? 'nap' : 'night'}`,
            fictional: true,
            nap,
            score_state: index === 5 ? 'PENDING_SCORE' : 'SCORED',
            score: {
              sleep_performance_percentage: nap ? 12 : [91, 75, 84, 68, 0, 0, 88][index],
              stage_summary: {
                total_light_sleep_time_milli: light,
                total_slow_wave_sleep_time_milli: deep,
                total_rem_sleep_time_milli: rem,
                total_awake_time_milli: awake,
                total_no_data_time_milli: 0,
                total_in_bed_time_milli: light + deep + rem + awake,
              },
            },
          },
        },
      };
    });
  });
  const health = {
    ...healthReview(reviewDays, sleepRows, 'UTC'),
    exports: exports.slice(7),
    scope,
  };
  const sleep = { ...sleepScreenTime(reviewDays, days, sleepRows, time, 'UTC'), exports, scope };
  const series = comparison.series[0];
  if (!series) throw new Error('Catalog usage fixture needs a series.');
  const readiness = exportReadiness(series, false, comparison.counts, '2026-10-12');
  const baselineSeries = screenTimeReview(
    days.slice(0, 7),
    time,
    exports,
    'UTC',
    undefined,
    slotsFor(days.slice(0, 7)),
    0,
  ).series[0];
  const monthDays = Array.from({ length: 31 }, (_, index) => {
    const start = Date.parse('2026-10-01') + index * 86400000;
    return {
      date: new Date(start).toISOString().slice(0, 10),
      start: new Date(start).toISOString(),
      end: new Date(start + 86400000).toISOString(),
    };
  });
  const month = screenTimeReview(
    monthDays,
    time,
    exports,
    'UTC',
    undefined,
    slotsFor(monthDays),
    0,
  );
  const reflection = {
    ...scope,
    id: '00000000-0000-4000-8000-000000000001',
    experimentId: null,
    weekStart: '2026-10-12',
    timezone: 'UTC',
    text: 'Fictional reflection: keeping my reader nearby made it easier to end the evening video session.',
    createdAt: '2026-10-19T12:00:00.000Z',
    updatedAt: '2026-10-19T12:00:00.000Z',
  };
  const app = series.appDrilldowns[0];
  if (!app) throw new Error('Catalog needs an app.');
  /** @param {string} start @param {string} end */
  const measurement = (start, end) => {
    const daily = app.daily.filter((d) => d.date >= start && d.date <= end);
    return {
      daily,
      observedDays: daily.filter((d) => d.durationMs !== null).length,
      observedDurationMs: daily.reduce((sum, d) => sum + (d.durationMs ?? 0), 0),
      missingDays: daily.filter((d) => d.durationMs === null).map((d) => d.date),
      usable: true,
      warnings: ['Observed app durations do not prove complete collection.'],
      exportIds: exports.map((e) => e.id),
    };
  };
  const baseline = measurement('2026-10-05', '2026-10-11');
  const observed = measurement('2026-10-12', '2026-10-18');
  const targetMinutesPerDay = 70;
  const daysAboveGoal = observed.daily
    .filter((d) => d.durationMs !== null && d.durationMs > targetMinutesPerDay * 60000)
    .map((d) => d.date);
  const experiment = {
    ...scope,
    id: '00000000-0000-4000-8000-000000000002',
    createdAt: '2026-10-11T12:00:00.000Z',
    state: 'active',
    phase: 'ready_for_review',
    fictional: true,
    retrospective: false,
    series: {
      source: series.source,
      type: series.type,
      device: series.device,
      granularity: series.granularity,
    },
    appIdentifier: app.identifier,
    appName: app.name,
    targetMinutesPerDay,
    plan: 'Use a stopping cue after the evening session.',
    baselineWeekStart: '2026-10-05',
    weekStart: '2026-10-12',
    weekEnd: '2026-10-18',
    reviewAfter: '2026-10-19',
    timezone: 'UTC',
    baseline,
    latestReview: {
      reviewedAt: '2026-10-19T12:00:00.000Z',
      outcome: daysAboveGoal.length ? 'above_goal' : 'within_goal',
      daysAboveGoal,
      observed,
      changeMs: observed.observedDurationMs - baseline.observedDurationMs,
      caveat: 'Fictional observations illustrate a review; they do not establish causality.',
    },
  };
  const insightsVersion = 'myself.md.screen-time-insights.v1';
  const insight = (/** @type {string} */ kind, /** @type {object} */ data) => ({
    version: insightsVersion,
    kind,
    fictional: true,
    data: { fictional: true, ...data },
  });
  const examples = [
    {
      id: 'whoop-sleep',
      category: 'health',
      title: 'WHOOP sleep',
      description:
        'Native session totals, stages and naps, with unscored and missing nights kept explicit.',
      hint: 'Select a day to inspect sessions and reported stages.',
      renderer: 'health',
      tool: 'review_activity_sleep',
      prompt: 'Review my WHOOP sleep sessions and naps last week.',
      data: health,
    },
    .../** @type {const} */ ([
      ['sleep-screen-time', 'daily', 'Sleep & daily screen time'],
      ['before-sleep', 'before_sleep', 'Two hours before sleep'],
      ['sleep-performance', 'sleep_performance', 'Screen time & sleep performance'],
    ]).map(([id, view, title]) => ({
      id,
      category: 'combined',
      title,
      description:
        view === 'daily'
          ? 'WHOOP sleep and screen-time totals aligned by date.'
          : view === 'before_sleep'
            ? 'Observed usage bounds in the two elapsed hours before each session.'
            : 'Pre-sleep usage bounds beside WHOOP’s reported sleep performance score.',
      hint: 'Choose a session or date. Sources and comparison modes remain interactive; gaps stay unknown.',
      renderer: 'sleep',
      tool: 'compare_sleep_screen_time',
      prompt: `Compare my WHOOP sleep and screen time using the ${view} view.`,
      data: { ...sleep, view },
    })),
    {
      id: 'monthly-attention',
      category: 'time',
      title: 'A month in attention',
      description:
        'Weekly blocks and app patterns across a full calendar month, including recording gaps.',
      hint: 'Expand Apps & patterns for leading hours and observed app changes.',
      renderer: 'screen',
      tool: 'review_monthly_attention',
      prompt: 'Review my monthly attention for October 2026.',
      data: insight('month', {
        month: '2026-10',
        timezone: 'UTC',
        series: month.series.map((s) => ({
          series: s,
          story: monthlyAttentionStory(s, '2026-10'),
        })),
        reflections: [reflection],
        experiments: [experiment],
      }),
    },
    {
      id: 'experiment-hours',
      category: 'time',
      title: 'Experiment hour patterns',
      description: 'Compare one app’s baseline and experiment hours on a shared color scale.',
      hint: 'Select an hour in either week to compare observed durations.',
      renderer: 'screen',
      tool: 'compare_screen_time_experiment_hours',
      prompt: 'Compare hourly usage for my screen-time experiment with its baseline.',
      data: insight('experiment_hours', {
        experiment,
        comparison: experimentHourComparison(
          series,
          series,
          '2026-10-05',
          '2026-10-12',
          app.identifier,
        ),
        baselineCoverage: baselineSeries
          ? exportReadiness(baselineSeries, false, comparison.counts)
          : null,
        experimentCoverage: exportReadiness(series, false, comparison.counts, '2026-10-12'),
      }),
    },
    {
      id: 'experiments',
      category: 'time',
      title: 'Experiment review',
      description: 'An example daily app cap and its observed outcome against the baseline.',
      hint: 'Read the goal, daily observations and coverage caveats. This example is never saved.',
      renderer: 'screen',
      tool: 'list_screen_time_experiments',
      prompt: 'Show my saved screen-time experiments and their latest reviews.',
      data: {
        version: 'myself.md.screen-time-experiments.v1',
        fictional: true,
        experiments: [experiment],
        message: 'Fictional experiment review.',
        cancelledId: null,
      },
    },
    {
      id: 'coaching',
      category: 'time',
      title: 'Small-change suggestions',
      description: 'Optional app-cap ideas grounded in observed app days.',
      hint: 'Suggestions are illustrative. Viewing them creates no goal.',
      renderer: 'screen',
      tool: 'suggest_screen_time_experiments',
      prompt: 'Suggest small screen-time experiments based on my last completed week.',
      data: insight('coach', { suggestions: experimentCoaching(series, '2026-10-12') }),
    },
    {
      id: 'readiness',
      category: 'time',
      title: 'Recording coverage',
      description: 'Observed dates and hourly coverage, with missing records kept visible.',
      hint: 'Inspect coverage before interpreting a comparison.',
      renderer: 'screen',
      tool: 'check_screen_time_readiness',
      prompt: 'Check whether my shared exports support a screen-time comparison.',
      data: insight('readiness', { series: [{ series, readiness }] }),
    },
    {
      id: 'chart-context',
      category: 'time',
      title: 'A selected hour',
      description: 'An hour’s app contributions alongside the corresponding comparison hour.',
      hint: 'This is the same selected context available to the agent in chat.',
      renderer: 'screen',
      tool: 'inspect_screen_time_chart',
      prompt: 'Explain my selected screen-time hour and compare it with the previous week.',
      data: insight('chart', {
        context: chartContext(series, { kind: 'hour', date: '2026-10-12', hour: 21 }),
      }),
    },
    {
      id: 'reflections',
      category: 'time',
      title: 'Personal reflections',
      description: 'A fictional note shown alongside the review period.',
      hint: 'Notes add personal context. Editing and saving require a connected account.',
      renderer: 'screen',
      tool: 'list_screen_time_reflections',
      prompt: 'Show my reflections for the last completed week.',
      data: insight('reflections', { reflections: [reflection] }),
    },
  ];
  return examples;
}
