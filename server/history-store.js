import { Buffer } from 'node:buffer';
import { database } from './database.js';
import { relatedHistoryEvents } from '../core/history-display.js';
import { parseHistoryEvent } from '../core/history.js';
/** @typedef {import('../core/history.js').HistoryEvent} HistoryEvent */
/** Encrypted audit metadata has an independent lifetime from export files and ephemeral responses. */
export class HistoryStore {
  /** @param {string|import("./database.js").SqlDatabase} path @param {{seal:(plain:Uint8Array,aad:string)=>Uint8Array,open:(value:Uint8Array,aad:string)=>Uint8Array}} codec */
  constructor(path, codec) {
    this.db = database(path);
    this.codec = codec;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS activity (subject TEXT, device TEXT, id TEXT, started TEXT, value BLOB, PRIMARY KEY(subject,id));
      CREATE INDEX IF NOT EXISTS activity_owner ON activity(subject,device,started,id);`);
    // Live response memory is gone after restart; preserve the audit outcome honestly.
    for (const row of this.db.prepare('SELECT subject,id FROM activity').all()) {
      const subject = String(row.subject),
        id = String(row.id);
      const event = this.get(subject, id)?.event;
      if (event?.kind === 'access' && (event.status === 'running' || event.status === 'ready'))
        this.update(subject, id, {
          status: 'interrupted',
          error: 'The service restarted before this access finished.',
        });
    }
  }
  /** @param {string} subject @param {string} device @param {HistoryEvent} value */
  record(subject, device, value) {
    const event = parseHistoryEvent(value);
    this.db
      .prepare('INSERT OR REPLACE INTO activity VALUES (?,?,?,?,?)')
      .run(
        subject,
        device,
        event.id,
        event.startedAt,
        this.codec.seal(Buffer.from(JSON.stringify(event)), `${subject}|${event.id}|history`),
      );
  }
  /** @param {string} subject @param {string} id @returns {{event:HistoryEvent,device:string}|null} */
  get(subject, id) {
    const row = /** @type {{device:string,value:Uint8Array}|undefined} */ (
      this.db.prepare('SELECT device,value FROM activity WHERE subject=? AND id=?').get(subject, id)
    );
    return row
      ? {
          device: row.device,
          event: parseHistoryEvent(
            JSON.parse(
              Buffer.from(this.codec.open(row.value, `${subject}|${id}|history`)).toString(),
            ),
          ),
        }
      : null;
  }
  /** @param {string} subject @param {string} id @param {Partial<Pick<HistoryEvent,'status'|'recordCount'|'warnings'|'error'>>} patch */
  update(subject, id, patch) {
    const stored = this.get(subject, id);
    if (stored)
      this.record(subject, stored.device, {
        ...stored.event,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
  }
  /** @param {string} subject @param {HistoryEvent} event */
  related(subject, event) {
    if (!event.relatedId && !event.artifacts.some((a) => a.cloudId)) return [];
    const rows = this.db
      .prepare(
        'SELECT id FROM activity WHERE subject=? AND started>=? ORDER BY started DESC,id DESC',
      )
      .all(subject, new Date(Date.now() - 90 * 86400000).toISOString());
    return relatedHistoryEvents(
      rows
        .map((row) => this.get(subject, String(row.id))?.event)
        .filter((item) => item !== undefined),
      event,
    );
  }
  /** @param {string} subject @param {string|null} device @param {number} [offset] */
  list(subject, device, offset = 0) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid history offset.');
    this.db
      .prepare('DELETE FROM activity WHERE started<?')
      .run(new Date(Date.now() - 90 * 86400000).toISOString());
    const rows = this.db
      .prepare(
        'SELECT id FROM activity WHERE subject=? AND (? IS NULL OR device=?) ORDER BY started DESC,id DESC LIMIT 51 OFFSET ?',
      )
      .all(subject, device, device, offset);
    return {
      events: rows
        .slice(0, 50)
        .map((row) => this.get(subject, String(row.id))?.event)
        .filter((event) => event !== undefined),
      hasMore: rows.length > 50,
    };
  }
}
