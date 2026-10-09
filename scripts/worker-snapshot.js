import { DatabaseSync, backup } from 'node:sqlite';
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const directory = process.env.DATA_DIR ?? '.local';
const destination = process.argv[2];
if (!destination)
  throw new Error(
    'Specify a private snapshot directory. Freeze application writes before exporting.',
  );
mkdirSync(destination, { recursive: true, mode: 0o700 });
const tables = {
  'pairing.sqlite': ['pairings', 'devices'],
  'billing.sqlite': ['billing_uses', 'billing_purchases', 'billing_grants', 'billing_claims'],
  'cloud.sqlite': ['exports', 'cloud_access', 'agents', 'upload_keys'],
  'history.sqlite': ['activity'],
};
/** @type {Array<{name:string,columns:string[],rows:import('node:sqlite').SQLOutputValue[][]}>} */
const snapshot = [];
await Promise.all(
  Object.entries(tables).map(async ([file, names]) => {
    const db = new DatabaseSync(join(directory, file));
    try {
      await backup(db, join(destination, file));
      chmodSync(join(destination, file), 0o600);
      for (const name of names) {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
          continue;
        const columns = db
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map((column) => String(column.name));
        const rows = db
          .prepare(`SELECT * FROM ${name}`)
          .all()
          .map((row) => columns.map((column) => row[column] ?? null));
        if (name === 'exports' && rows.some((row) => row[columns.indexOf('content')] !== null))
          throw new Error('Finish R2 backfill before exporting Worker metadata.');
        snapshot.push({ name, columns, rows });
      }
    } finally {
      db.close();
    }
  }),
);
const data = JSON.stringify(snapshot, (_key, value) =>
  value instanceof Uint8Array ? { blob: Buffer.from(value).toString('base64') } : value,
);
writeFileSync(join(destination, 'snapshot.json'), data, { mode: 0o600 });
console.log({
  tables: snapshot.length,
  rows: snapshot.reduce((count, table) => count + table.rows.length, 0),
  sha256: createHash('sha256').update(data).digest('hex'),
});
