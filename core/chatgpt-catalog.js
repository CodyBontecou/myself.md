import { catalogExtras } from './chatgpt-catalog-extras.js';
import { screenTimeReview } from './screen-time-review.js';
import { healthReview } from './health-review.js';
import { locationReview } from './location-review.js';
import { heartRateContext } from './heart-rate-context.js';

export const visualizationIds = /** @type {const} */ ([
  'comparison',
  'heatmap',
  'activity-sleep',
  'locations',
  'heart-locations',
  'heart-screen-time',
  'whoop-sleep',
  'sleep-screen-time',
  'before-sleep',
  'sleep-performance',
  'monthly-attention',
  'experiment-hours',
  'experiments',
  'coaching',
  'readiness',
  'chart-context',
  'reflections',
]);
/** @param {import('./health-review.js').HealthDay} d @param {number} hour */
function at(d, hour) {
  return new Date(Date.parse(d.start) + hour * 3600000).toISOString();
}
/** Deterministic public examples only; never reads an account or the current clock. */
export function visualizationCatalog() {
  const days = Array.from({ length: 14 }, (_, i) => {
    const start = Date.parse('2026-10-05T00:00:00.000Z') + i * 86400000;
    return {
      date: new Date(start).toISOString().slice(0, 10),
      start: new Date(start).toISOString(),
      end: new Date(start + 86400000).toISOString(),
    };
  });
  const reviewDays = days.slice(7);
  const slots = days.flatMap((d) =>
    Array.from({ length: 24 }, (_, hour) => ({
      date: d.date,
      hour,
      start: Date.parse(d.start) + hour * 3600000,
      end: Date.parse(d.start) + (hour + 1) * 3600000,
    })),
  );
  /** @type {import('./screen-time-review.js').ReviewRecord[]} */
  const time = [];
  /** @type {import('./screen-time-review.js').ReviewRecord[]} */
  const health = [];
  /** @type {import('./screen-time-review.js').ReviewRecord[]} */
  const locations = [];

  for (const [index, d] of days.entries()) {
    for (const hour of [9, 12, 18, 21])
      for (const [app, name] of ['Reader', 'Messages', 'Video'].entries()) {
        const minutes = Math.max(
          0,
          ((index < 7 ? [18, 12, 9] : [13, 8, 5])[app] ?? 0) +
            (index % 3) * 2 -
            (hour === 9 ? 3 : 0),
        );
        time.push({
          exportId: `fictional-${d.date}`,
          record: {
            domain: 'time',
            type: 'applications',
            source: 'Fictional phone',
            start: at(d, hour),
            end: at(d, hour + 1),
            native: {
              identifier: `fictional.${name.toLowerCase()}`,
              displayName: name,
              durationMs: minutes * 60000,
              granularity: 'hourly-aggregate',
              deviceName: 'Fictional phone',
              fictional: true,
            },
          },
        });
      }
  }
  for (const [index, d] of reviewDays.entries()) {
    if (index !== 3)
      for (const hour of [8, 12, 16, 20])
        health.push({
          exportId: `fictional-${d.date}`,
          record: {
            domain: 'health',
            type: 'HKQuantityTypeIdentifierStepCount',
            source: 'Fictional Watch',
            start: at(d, hour),
            end: at(d, hour + 0.5),
            native: { quantity: 1200 + index * 180 + hour * 25, unit: 'count', fictional: true },
          },
        });
    if (index !== 4)
      for (const [stage, hour, length] of [
        [4, 0, 1.5],
        [3, 1.5, 3],
        [5, 4.5, 1.5],
        [1, 6, 1.25],
      ])
        health.push({
          exportId: `fictional-${d.date}`,
          record: {
            domain: 'health',
            type: 'HKCategoryTypeIdentifierSleepAnalysis',
            source: 'Fictional Watch',
            start: at(d, hour ?? 0),
            end: at(d, (hour ?? 0) + (length ?? 0)),
            native: { value: stage, fictional: true },
          },
        });
    for (const hour of [9, 12, 18])
      for (const minute of [0, 10, 30])
        health.push({
          exportId: `fictional-${d.date}`,
          record: {
            domain: 'health',
            type: 'HKQuantityTypeIdentifierHeartRate',
            source: 'Fictional Watch',
            start: at(d, hour + minute / 60),
            end: at(d, hour + minute / 60),
            native: {
              quantity: Math.round(
                70 + index * 2 + Math.sin(hour + minute) * 12 + (hour === 18 ? 18 : 0),
              ),
              unit: 'count/min',
              fictional: true,
            },
          },
        });
    for (const [point, hour] of [9, 12, 18, 21].entries())
      locations.push({
        exportId: `fictional-${d.date}`,
        record: {
          domain: 'location',
          type: 'points',
          source: 'Fictional GPS',
          start: at(d, hour + 2 / 60),
          end: at(d, hour + 2 / 60),
          native: {
            coords: {
              latitude: 18.41 + Math.sin(point * 1.4 + index * 0.3) * 0.025,
              longitude: -66.08 + Math.cos(point + index * 0.4) * 0.035,
              accuracy: point === 3 ? null : 8 + index * 2,
            },
            fictional: true,
          },
        },
      });
  }
  const exports = days.map((d) => ({
    id: `fictional-${d.date}`,
    day: d.date,
    created: '2026-10-19T12:00:00.000Z',
    partial: false,
  }));
  const scope = { deviceId: 'fictional-catalog-phone', profileId: 'fictional-catalog-profile' };
  const comparison = { ...screenTimeReview(days, time, exports, 'UTC', undefined, slots), scope };
  const activity = {
    ...healthReview(
      reviewDays,
      health.filter((r) => r.record.type !== 'HKQuantityTypeIdentifierHeartRate'),
      'UTC',
    ),
    exports: exports.slice(7),
    scope,
  };
  const location = {
    ...locationReview(reviewDays, locations, 'UTC'),
    exports: exports.slice(7),
    scope,
  };
  const heart = health.filter((r) => r.record.type === 'HKQuantityTypeIdentifierHeartRate');
  const overlayScope = {
    deviceId: scope.deviceId,
    healthProfileId: scope.profileId,
    contextProfileId: scope.profileId,
  };
  const heartLocation = {
    ...heartRateContext(reviewDays, heart, locations, 'location', 'UTC', 300, slots),
    exports: exports.slice(7),
    scope: overlayScope,
  };
  const heartTime = {
    ...heartRateContext(
      reviewDays,
      heart,
      time.filter((r) => r.record.start && r.record.start >= (reviewDays[0]?.start ?? '')),
      'time',
      'UTC',
      300,
      slots,
    ),
    exports: exports.slice(7),
    scope: overlayScope,
  };
  return {
    version: 'myself.md.visualization-catalog.v1',
    fictional: true,
    timezone: 'UTC',
    period: 'October 5–18, 2026',
    examples: [
      {
        id: 'comparison',
        category: 'time',
        title: 'Compare two weeks',
        description: 'Daily bars and app rankings share a common scale across both periods.',
        hint: 'Choose a day or an app to inspect its contribution. The overview stays with you.',
        renderer: 'screen',
        tool: 'review_weekly_screen_time',
        prompt: 'Compare my screen time over the last two completed weeks.',
        data: comparison,
      },
      {
        id: 'heatmap',
        category: 'time',
        title: 'Compare daily rhythms',
        description:
          'Paired heatmaps show when app usage was observed, using the same color scale.',
        hint: 'Choose an hour to see its apps. Blank hours are unknown; they are not zero.',
        renderer: 'heatmap',
        tool: 'review_weekly_screen_time',
        prompt: 'Show side-by-side hourly heatmaps for my last two weeks of screen time.',
        data: comparison,
      },
      {
        id: 'activity-sleep',
        category: 'health',
        title: 'Activity & sleep',
        description:
          'Daily steps and sleep timing keep activity, sleep stages and recording gaps distinct.',
        hint: 'Select a day to inspect the sleep-stage durations and recorded intervals.',
        renderer: 'health',
        tool: 'review_activity_sleep',
        prompt: 'Show my activity and sleep for the last completed week.',
        data: activity,
      },
      {
        id: 'locations',
        category: 'location',
        title: 'Recorded locations',
        description:
          'Explore fictional recorded points on an OpenStreetMap basemap, alongside daily counts and accuracy.',
        hint: 'Choose a day, then a point. Sparse observations do not establish a route or visit.',
        renderer: 'location',
        tool: 'review_recorded_locations',
        prompt: 'Show my recorded location points last week, including accuracy and gaps.',
        data: location,
      },
      {
        id: 'heart-locations',
        category: 'combined',
        title: 'Heart rate & locations',
        description:
          'Color fictional map markers by the nearest observed heart-rate sample within five minutes.',
        hint: 'Point details show GPS accuracy, the signed time offset and the matching sample.',
        renderer: 'heart',
        tool: 'review_heart_rate_context',
        prompt:
          'Overlay my heart rate on recorded locations last week with a five-minute matching window.',
        data: heartLocation,
      },
      {
        id: 'heart-screen-time',
        category: 'combined',
        title: 'Heart rate & screen time',
        description:
          'Usage-hour bars show observed app minutes, colored by the hour’s heart-rate mean.',
        hint: 'Select an hour to inspect sample counts and ranges. The association is by hour, not exact app-use timing.',
        renderer: 'heart',
        tool: 'review_heart_rate_context',
        prompt:
          'Overlay heart-rate observations on my screen-time hours for the last completed week.',
        data: heartTime,
      },
      ...catalogExtras(days, time, exports, comparison),
    ],
  };
}
/** @param {ReturnType<typeof visualizationCatalog>} catalog */
export function visualizationMarkdown(catalog) {
  return `# ChatGPT visualization catalog\n\nInteractive fictional previews: https://myself.md/apps/chatgpt\n\nAll examples are deterministic mock data. Viewing a preview does not connect an account, capture records or consume export allowance.\n\n${catalog.examples.map((e) => `## ${e.title}\n\n${e.description}\n\n${e.hint}\n\nTool: ${e.tool}\n\nStarter prompt: ${e.prompt}\n\n[Open preview](https://myself.md/apps/chatgpt?example=${e.id}) · [Fictional structured data](https://myself.md/apps/chatgpt/catalog.json?example=${e.id})`).join('\n\n')}\n\nThe same examples are available through get_public_visualization_catalog. Real data depends on available records and existing authorization.\n`;
}
