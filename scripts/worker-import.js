import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { z } from 'zod';
const [path, origin] = process.argv.slice(2);
if (!path || !origin?.startsWith('https://'))
  throw new Error('Usage: worker-import.js SNAPSHOT_JSON HTTPS_WORKER_ORIGIN');
const secret = parseEnv(readFileSync('.dev.vars', 'utf8')).IMPORT_SECRET;
if (!secret) throw new Error('Set the private IMPORT_SECRET in .dev.vars.');
const sqlValue = z.union([z.string(), z.number(), z.null(), z.object({ blob: z.string() })]);
const tableSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(sqlValue)),
});
const snapshot = z.array(tableSchema).parse(JSON.parse(readFileSync(path, 'utf8')));
const snapshotHash = hash(readFileSync(path, 'utf8'));
/** @param {string} value */
function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}
/** @param {unknown} body */
async function send(body) {
  const response = await fetch(origin + '/__migration', {
    method: 'POST',
    headers: { Authorization: `Migration ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      `Worker import failed with status ${response.status}. Original snapshots remain intact.`,
    );
}
/** @param {z.infer<typeof tableSchema>} table @param {number} offset @param {string} subject @param {string} action @param {string} name @returns {Promise<void>} */
async function importTable(table, offset, subject, action, name) {
  if (offset >= table.rows.length) return;
  let length = Math.min(100, table.rows.length - offset);
  let rows = table.rows.slice(offset, offset + length);
  while (JSON.stringify(rows).length > 750000 && length > 1) {
    length = Math.floor(length / 2);
    rows = table.rows.slice(offset, offset + length);
  }
  await send({
    action,
    name,
    batch: {
      id: `${snapshotHash}:${table.name}:${offset}:${hash(JSON.stringify(rows))}`,
      subject,
      tables: [{ ...table, rows }],
    },
  });
  return importTable(table, offset + length, subject, action, name);
}
/** Import ownership and anonymous claim tickets before account grants. */
await snapshot
  .filter((table) => ['billing_purchases', 'billing_grants', 'billing_claims'].includes(table.name))
  .reduce(async (previous, table) => {
    await previous;
    await table.rows.reduce(async (previousRow, row) => {
      await previousRow;
      const get = (/** @type {string} */ column) => row[table.columns.indexOf(column)];
      const source = String(get(table.name === 'billing_purchases' ? 'store' : 'source'));
      const reference = String(get(table.name === 'billing_purchases' ? 'id' : 'reference'));
      const name = hash(`${source}|${reference}`);
      await importTable(
        { ...table, rows: [row] },
        0,
        String(get('subject') ?? 'unclaimed-purchase'),
        'purchase',
        name,
      );
      if (table.name === 'billing_claims')
        await send({
          action: 'ticket',
          name,
          ticket: {
            hash: String(get('ticket')),
            subject: null,
            purchase: name,
            expires: Number(get('expires')),
          },
        });
    }, Promise.resolve());
  }, Promise.resolve());
const subjects = new Set(
  snapshot.flatMap((table) => {
    const index = table.columns.indexOf('subject');
    return index < 0
      ? []
      : table.rows
          .map((row) => row[index])
          .filter((subject) => typeof subject === 'string' && subject.length);
  }),
);
await [...subjects].reduce(async (previous, subject) => {
  await previous;
  const owner = String(subject);
  await snapshot
    .filter((table) => table.name !== 'billing_claims')
    .reduce(async (previousTable, table) => {
      await previousTable;
      const index = table.columns.indexOf('subject');
      await importTable(
        { ...table, rows: table.rows.filter((row) => row[index] === owner) },
        0,
        owner,
        'account',
        owner,
      );
    }, Promise.resolve());
}, Promise.resolve());
await snapshot
  .filter((table) => ['pairings', 'upload_keys'].includes(table.name))
  .reduce(async (previous, table) => {
    await previous;
    await table.rows.reduce(async (previousRow, row) => {
      await previousRow;
      const get = (/** @type {string} */ column) => row[table.columns.indexOf(column)];
      await send({
        action: 'ticket',
        name: 'credential',
        ticket: {
          hash: String(get('hash')),
          subject: String(get('subject')),
          purchase: null,
          expires: Number(get('expires')),
        },
      });
    }, Promise.resolve());
  }, Promise.resolve());
console.log({ importedAccounts: subjects.size, sourceSha256: snapshotHash });
