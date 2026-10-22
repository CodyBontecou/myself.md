import { Buffer } from 'node:buffer';
import { z } from 'zod';
export const experimentSeriesSchema = z
  .object({
    source: z.string().min(1).max(200).describe('Exact source from the review series.'),
    type: z
      .enum(['application', 'applications', 'websites', 'sessions'])
      .describe('Exact native usage record type from the review series.'),
    granularity: z
      .string()
      .max(100)
      .describe('Exact granularity from the review series, including unspecified.'),
    device: z
      .string()
      .max(200)
      .describe('Exact native device label from the review series; empty string is allowed.'),
  })
  .strict();
const measurementSchema = z.object({
  daily: z.array(
    z.object({ date: z.string(), durationMs: z.number().nullable(), records: z.number() }),
  ),
  observedDays: z.number(),
  observedDurationMs: z.number().nullable(),
  missingDays: z.array(z.string()),
  usable: z.boolean(),
  warnings: z.array(z.string()),
  exportIds: z.array(z.string()),
});
export const experimentSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  state: z.enum(['active', 'cancelled']),
  deviceId: z.string(),
  profileId: z.string(),
  series: experimentSeriesSchema,
  appIdentifier: z.string().min(1).max(512),
  appName: z.string().max(200),
  targetMinutesPerDay: z.number().int().min(0).max(1440),
  plan: z.string().max(300),
  baselineWeekStart: z.string(),
  weekStart: z.string(),
  weekEnd: z.string(),
  reviewAfter: z.string(),
  timezone: z.string(),
  retrospective: z.boolean(),
  fictional: z.boolean(),
  baseline: measurementSchema,
  latestReview: z
    .object({
      reviewedAt: z.string(),
      outcome: z.string(),
      daysAboveGoal: z.array(z.string()),
      changeMs: z.number().nullable(),
      observed: measurementSchema,
      caveat: z.string(),
    })
    .nullable(),
});
const storedSchema = experimentSchema.extend({ requestKey: z.string() });
/** @typedef {z.infer<typeof experimentSchema>} ScreenTimeExperiment */
export class ScreenTimeExperimentStore {
  /** @param {import('./cloud-store.js').CloudStore} cloud */
  constructor(cloud) {
    this.cloud = cloud;
    cloud.db.exec(
      'CREATE TABLE IF NOT EXISTS screen_time_experiments(subject TEXT,id TEXT,created TEXT,value BLOB,PRIMARY KEY(subject,id))',
    );
  }
  /** @param {string} subject @param {string} id */
  get(subject, id) {
    const row = this.cloud.db
      .prepare('SELECT value FROM screen_time_experiments WHERE subject=? AND id=?')
      .get(subject, id);
    return row
      ? storedSchema.parse(
          JSON.parse(
            this.cloud
              .open(/** @type {Uint8Array} */ (row.value), `experiment|${subject}|${id}`)
              .toString(),
          ),
        )
      : null;
  }
  /** @param {string} subject @param {z.infer<typeof storedSchema>} experiment */
  save(subject, experiment) {
    const value = storedSchema.parse(experiment);
    this.cloud.db
      .prepare('INSERT OR REPLACE INTO screen_time_experiments VALUES(?,?,?,?)')
      .run(
        subject,
        value.id,
        value.createdAt,
        this.cloud.seal(Buffer.from(JSON.stringify(value)), `experiment|${subject}|${value.id}`),
      );
  }
  /** @param {string} subject */
  list(subject) {
    return this.cloud.db
      .prepare(
        'SELECT id FROM screen_time_experiments WHERE subject=? ORDER BY created DESC,id DESC LIMIT 100',
      )
      .all(subject)
      .map((row) => this.get(subject, String(row.id)))
      .filter((value) => value !== null);
  }
  /** Saved observations remain subject to the profile's current source/type grant.
   * @param {string} subject @param {ScreenTimeExperiment} experiment */
  allowed(subject, experiment) {
    const permission = this.cloud.permission(subject, experiment.deviceId, experiment.profileId);
    return (
      permission.agentPermissions.time &&
      permission.selection.time.includes(`native:${experiment.series.type}`)
    );
  }
}
