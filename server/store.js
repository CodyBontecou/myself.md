import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const directory = process.env.DATA_DIR ?? '.local';
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(join(directory, 'pairing.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS pairings (id TEXT PRIMARY KEY, hash TEXT UNIQUE, subject TEXT, expires INTEGER, device TEXT);
CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, subject TEXT, name TEXT, created INTEGER);`);
export class PairingError extends Error {
  /** @param {number} statusCode @param {string} message */
  constructor(statusCode, message) {
    super(message);
    this.status = statusCode;
  }
}
/** @param {string} ticket */
const hash = (ticket) => createHash('sha256').update(ticket).digest('hex');
/** @typedef {{id:string,hash:string,subject:string,expires:number,device:string|null}} Pairing */
/** @param {string} subject */
export function createPairing(subject) {
  const ticket = randomBytes(32).toString('base64url');
  const id = randomUUID();
  const expires = Date.now() + 300000;
  db.prepare('DELETE FROM pairings WHERE expires < ?').run(Date.now());
  db.prepare('INSERT INTO pairings VALUES (?, ?, ?, ?, NULL)').run(
    id,
    hash(ticket),
    subject,
    expires,
  );
  return { id, ticket, expires };
}
/** @param {string} ticket @returns {Pairing} */
export function pending(ticket) {
  const row = /** @type {Pairing|undefined} */ (
    db.prepare('SELECT * FROM pairings WHERE hash = ?').get(hash(ticket))
  );
  if (!row || row.expires < Date.now())
    throw new PairingError(410, 'Pairing expired. Generate another QR code.');
  if (row.device) throw new PairingError(409, 'This QR code has already been used.');
  return row;
}
/** @param {string} ticket @param {string} subject @param {string} name */
export function claim(ticket, subject, name) {
  const row = pending(ticket);
  if (row.subject !== subject)
    throw new PairingError(403, 'Sign in with the account that generated this QR code.');
  const id = randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO devices VALUES (?, ?, ?, ?)').run(id, subject, name, Date.now());
    db.prepare('UPDATE pairings SET device = ? WHERE id = ?').run(id, row.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { id, name };
}
/** @param {string} subject */
export function devices(subject) {
  return db.prepare('SELECT id, name, created FROM devices WHERE subject = ?').all(subject);
}
/** @param {string} id @param {string} subject */
export function disconnect(id, subject) {
  db.prepare('DELETE FROM devices WHERE id = ? AND subject = ?').run(id, subject);
}
/** @param {string} id @param {string} subject */
export function status(id, subject) {
  return (
    db
      .prepare('SELECT id, expires, device FROM pairings WHERE id = ? AND subject = ?')
      .get(id, subject) ?? null
  );
}
