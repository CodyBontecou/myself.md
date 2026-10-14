import { Buffer } from 'node:buffer';
import { PairingError } from './errors.js';
/** Paginated encrypted metadata export for backup and a rollback after new Worker writes.
 * @param {import('../server/database.js').SqlDatabase} db @param {string[]} allowed @param {string} name @param {number} offset */
export function exportRows(db, allowed, name, offset) {
  if (!allowed.includes(name) || !Number.isSafeInteger(offset) || offset < 0)
    throw new PairingError(400, 'Unsupported snapshot request.');
  const columns = db
    .prepare(`PRAGMA table_info(${name})`)
    .all()
    .map((column) => String(column.name));
  const rows = db
    .prepare(`SELECT * FROM ${name} ORDER BY rowid LIMIT 100 OFFSET ?`)
    .all(offset)
    .map((row) =>
      columns.map((column) => {
        const value = row[column] ?? null;
        return value instanceof Uint8Array
          ? { blob: Buffer.from(value).toString('base64') }
          : typeof value === 'bigint'
            ? Number(value)
            : value;
      }),
    );
  return { name, columns, rows, nextOffset: rows.length === 100 ? offset + 100 : null };
}
