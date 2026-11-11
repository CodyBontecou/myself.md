import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { parseStrandsExperiment } from '../core/strands.js';
import { PairingError } from './errors.js';

export const strandsExperimentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  rule: z.object({
    kind: z.literal('phone_down'),
    cutoffHour: z.number().int(),
    allowanceMinutes: z.number().int(),
  }),
  startDate: z.string(),
  nights: z.number().int(),
  timezone: z.string(),
  createdAt: z.string(),
  cancelledAt: z.string().nullable(),
  sourcePattern: z.string().nullable(),
});
const storedSchema = strandsExperimentSchema.extend({ requestKey: z.string() });
const requestIdSchema = z.string().uuid();
/** @typedef {import('../core/strands.js').StrandsExperiment} StrandsExperiment */

/** @param {{requestKey?:string}&StrandsExperiment} value @returns {StrandsExperiment} */
function publicValue(value) {
  return strandsExperimentSchema.parse(value);
}

/** Encrypted, account-owned phone-down experiments. The phone API and MCP both call
 * create/list/cancel so validation, idempotency and limits are identical. */
export class StrandsExperimentStore {
  /** @param {import('./cloud-store.js').CloudStore} cloud */
  constructor(cloud) {
    this.cloud = cloud;
    cloud.db.exec(
      'CREATE TABLE IF NOT EXISTS strands_experiments(subject TEXT,id TEXT,created TEXT,value BLOB,PRIMARY KEY(subject,id))',
    );
  }
  /** @param {string} subject @param {string} id */
  stored(subject, id) {
    const row = this.cloud.db
      .prepare('SELECT value FROM strands_experiments WHERE subject=? AND id=?')
      .get(subject, id);
    return row
      ? storedSchema.parse(
          JSON.parse(
            this.cloud
              .open(/** @type {Uint8Array} */ (row.value), `strands-experiment|${subject}|${id}`)
              .toString(),
          ),
        )
      : null;
  }
  /** @param {string} subject @param {string} id @returns {StrandsExperiment|null} */
  get(subject, id) {
    const value = this.stored(subject, id);
    return value ? publicValue(value) : null;
  }
  /** Newest first; at most 100 per account, including cancelled experiments.
   * @param {string} subject @returns {StrandsExperiment[]} */
  list(subject) {
    return this.cloud.db
      .prepare(
        'SELECT id FROM strands_experiments WHERE subject=? ORDER BY created DESC,id DESC LIMIT 100',
      )
      .all(subject)
      .map((row) => this.get(subject, String(row.id)))
      .filter((value) => value !== null);
  }
  /** @param {string} subject @param {z.infer<typeof storedSchema>} value */
  write(subject, value) {
    const parsed = storedSchema.parse(value);
    this.cloud.db
      .prepare('INSERT OR REPLACE INTO strands_experiments VALUES(?,?,?,?)')
      .run(
        subject,
        parsed.id,
        parsed.createdAt,
        this.cloud.seal(
          Buffer.from(JSON.stringify(parsed)),
          `strands-experiment|${subject}|${parsed.id}`,
        ),
      );
  }
  /** Validate a user-chosen experiment and save it under requestId. Repeating the identical
   * request returns the saved experiment; reusing requestId for different input fails.
   * @param {string} subject @param {unknown} input
   * @returns {{experiment:StrandsExperiment,created:boolean}} */
  create(subject, input) {
    const body =
      input && typeof input === 'object' ? /** @type {Record<string,unknown>} */ (input) : {};
    const requestId = requestIdSchema.safeParse(body.requestId);
    if (!requestId.success) throw new PairingError(400, 'requestId must be a new UUID.');
    let parsed;
    try {
      parsed = parseStrandsExperiment(body);
    } catch (error) {
      throw new PairingError(400, error instanceof Error ? error.message : 'Invalid experiment.');
    }
    try {
      Intl.DateTimeFormat('en-US', { timeZone: parsed.timezone }).format(0);
    } catch {
      throw new PairingError(400, 'timezone must be an IANA timezone.');
    }
    if (new Date(Date.parse(parsed.startDate)).toISOString().slice(0, 10) !== parsed.startDate)
      throw new PairingError(400, 'startDate must be a real calendar date.');
    const requestKey = JSON.stringify([
      parsed.title,
      parsed.rule.kind,
      parsed.rule.cutoffHour,
      parsed.rule.allowanceMinutes,
      parsed.startDate,
      parsed.nights,
      parsed.timezone,
      parsed.sourcePattern,
    ]);
    const existing = this.stored(subject, requestId.data);
    if (existing) {
      if (existing.requestKey !== requestKey)
        throw new PairingError(
          409,
          'This requestId already identifies a different experiment. Use a new UUID.',
        );
      return { experiment: publicValue(existing), created: false };
    }
    const count = Number(
      this.cloud.db
        .prepare('SELECT COUNT(*) total FROM strands_experiments WHERE subject=?')
        .get(subject)?.total ?? 0,
    );
    if (count >= 100) throw new PairingError(409, 'This account already has 100 experiments.');
    const value = {
      id: requestId.data,
      ...parsed,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
      requestKey,
    };
    this.write(subject, value);
    return { experiment: publicValue(value), created: true };
  }
  /** Cancel an owned experiment, keeping its record. Repeating is safe.
   * @param {string} subject @param {string} id @returns {StrandsExperiment} */
  cancel(subject, id) {
    const parsedId = requestIdSchema.safeParse(id);
    const value = parsedId.success ? this.stored(subject, parsedId.data) : null;
    if (!value) throw new PairingError(404, 'Experiment not found.');
    if (value.cancelledAt) return publicValue(value);
    const cancelled = { ...value, cancelledAt: new Date().toISOString() };
    this.write(subject, cancelled);
    return publicValue(cancelled);
  }
}
