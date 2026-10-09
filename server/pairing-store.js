import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { database, transaction } from './database.js';
import { PairingError } from './errors.js';
/** @param {string} ticket */
const hash = (ticket) => createHash('sha256').update(ticket).digest('hex');
export class PairingStore {
  /** @param {string|import('./database.js').SqlDatabase} source */
  constructor(source) {
    this.db = database(source);
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS pairings (id TEXT PRIMARY KEY, hash TEXT UNIQUE, subject TEXT, expires INTEGER, device TEXT);
CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, subject TEXT, name TEXT, created INTEGER);`);
  }
  /** @typedef {{id:string,hash:string,subject:string,expires:number,device:string|null}} Pairing */
  /** @param {string} subject */
  createPairing(subject) {
    const ticket = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const expires = Date.now() + 300000;
    this.db.prepare('DELETE FROM pairings WHERE expires < ?').run(Date.now());
    this.db
      .prepare('INSERT INTO pairings VALUES (?, ?, ?, ?, NULL)')
      .run(id, hash(ticket), subject, expires);
    return { id, ticket, expires };
  }
  /** @param {string} ticket @returns {Pairing} */
  pending(ticket) {
    const row = /** @type {Pairing|undefined} */ (
      this.db.prepare('SELECT * FROM pairings WHERE hash = ?').get(hash(ticket))
    );
    if (!row || row.expires < Date.now())
      throw new PairingError(410, 'Pairing expired. Generate another QR code.');
    if (row.device) throw new PairingError(409, 'This QR code has already been used.');
    return row;
  }
  /** @param {string} ticket @param {string} subject @param {string} name */
  claim(ticket, subject, name) {
    const row = this.pending(ticket);
    if (row.subject !== subject)
      throw new PairingError(403, 'Sign in with the account that generated this QR code.');
    const id = randomUUID();
    return transaction(this.db, () => {
      this.db.prepare('INSERT INTO devices VALUES (?, ?, ?, ?)').run(id, subject, name, Date.now());
      this.db.prepare('UPDATE pairings SET device = ? WHERE id = ?').run(id, row.id);
      return { id, name };
    });
  }
  /** @param {string} subject */
  devices(subject) {
    return this.db.prepare('SELECT id, name, created FROM devices WHERE subject = ?').all(subject);
  }
  /** @param {string} id @param {string} subject */
  disconnect(id, subject) {
    this.db.prepare('DELETE FROM devices WHERE id = ? AND subject = ?').run(id, subject);
  }
  /** @param {string} id @param {string} subject */
  status(id, subject) {
    return (
      this.db
        .prepare('SELECT id, expires, device FROM pairings WHERE id = ? AND subject = ?')
        .get(id, subject) ?? null
    );
  }
}
