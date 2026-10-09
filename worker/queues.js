import { Buffer } from 'node:buffer';
/** Encrypted request metadata survives eviction; native response records do not.
 * @template {{subject:string}} T @augments {Map<string,T>} */
export class DurableMap extends Map {
  /** @param {import('../server/database.js').SqlDatabase} db @param {import('../server/cloud-store.js').CloudStore} codec @param {string} kind @param {(value:T)=>T} recover @param {(value:T)=>T} save */
  constructor(db, codec, kind, recover, save) {
    super();
    this.db = db;
    this.codec = codec;
    this.kind = kind;
    this.save = save;
    db.exec(
      'CREATE TABLE IF NOT EXISTS phone_queue(kind TEXT,id TEXT,subject TEXT,value BLOB,PRIMARY KEY(kind,id))',
    );
    for (const row of db
      .prepare('SELECT id,subject,value FROM phone_queue WHERE kind=?')
      .all(kind)) {
      const value = /** @type {T} */ (
        JSON.parse(
          codec
            .open(/** @type {Uint8Array} */ (row.value), `${row.subject}|${row.id}|queue`)
            .toString(),
        )
      );
      this.set(String(row.id), recover(value));
    }
  }
  /** @param {string} id @param {T} value */
  set(id, value) {
    this.db
      .prepare('INSERT OR REPLACE INTO phone_queue VALUES(?,?,?,?)')
      .run(
        this.kind,
        id,
        value.subject,
        this.codec.seal(
          Buffer.from(JSON.stringify(this.save(value))),
          `${value.subject}|${id}|queue`,
        ),
      );
    return super.set(id, value);
  }
  /** @param {string} id */
  delete(id) {
    this.db.prepare('DELETE FROM phone_queue WHERE kind=? AND id=?').run(this.kind, id);
    return super.delete(id);
  }
}
