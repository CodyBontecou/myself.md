import { Buffer } from 'node:buffer';
import { z } from 'zod';
const reflectionSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().min(1),
  profileId: z.string().min(1),
  weekStart: z.iso.date(),
  timezone: z.string().min(1).max(100),
  experimentId: z.string().uuid().nullable(),
  text: z.string().trim().min(1).max(1000),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
/** @typedef {z.infer<typeof reflectionSchema>} ScreenTimeReflection */
export class ScreenTimeReflectionStore {
  /** @param {import('./cloud-store.js').CloudStore} cloud */
  constructor(cloud) {
    this.cloud = cloud;
    cloud.db.exec(
      'CREATE TABLE IF NOT EXISTS screen_time_reflections(subject TEXT,id TEXT,created TEXT,value BLOB,PRIMARY KEY(subject,id))',
    );
  }
  /** @param {string} subject @param {string} id */
  get(subject, id) {
    const row = this.cloud.db
      .prepare('SELECT value FROM screen_time_reflections WHERE subject=? AND id=?')
      .get(subject, id);
    return row
      ? reflectionSchema.parse(
          JSON.parse(
            this.cloud
              .open(/** @type {Uint8Array} */ (row.value), `reflection|${subject}|${id}`)
              .toString(),
          ),
        )
      : null;
  }
  /** @param {string} subject @param {ScreenTimeReflection} reflection */
  save(subject, reflection) {
    const value = reflectionSchema.parse(reflection);
    this.cloud.db
      .prepare('INSERT OR REPLACE INTO screen_time_reflections VALUES(?,?,?,?)')
      .run(
        subject,
        value.id,
        value.createdAt,
        this.cloud.seal(Buffer.from(JSON.stringify(value)), `reflection|${subject}|${value.id}`),
      );
    return value;
  }
  /** @param {string} subject */
  list(subject) {
    return this.cloud.db
      .prepare(
        'SELECT id FROM screen_time_reflections WHERE subject=? ORDER BY created DESC,id DESC LIMIT 200',
      )
      .all(subject)
      .map((row) => this.get(subject, String(row.id)))
      .filter((value) => value !== null);
  }
  /** @param {string} subject @param {{deviceId:string,profileId:string}} value */
  allowed(subject, value) {
    const permission = this.cloud.permission(subject, value.deviceId, value.profileId);
    return (
      permission.agentPermissions.time &&
      permission.selection.time.some((type) =>
        [
          'native:application',
          'native:applications',
          'native:websites',
          'native:sessions',
        ].includes(type),
      )
    );
  }
}
