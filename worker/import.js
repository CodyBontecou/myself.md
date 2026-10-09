import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { PairingError } from '../server/errors.js';
import { digest } from './tickets.js';
const valueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.null(),
  z.object({ blob: z.string().max(2000000) }).strict(),
]);
export const batchSchema = z
  .object({
    id: z.string().min(1).max(200),
    subject: z.string().min(1).max(1000),
    tables: z
      .array(
        z
          .object({
            name: z.string(),
            columns: z.array(z.string()).max(20),
            rows: z.array(z.array(valueSchema).max(20)).max(5000),
          })
          .strict(),
      )
      .max(15),
  })
  .strict();
/** @typedef {z.infer<typeof batchSchema>} ImportBatch */
/** @param {import('../server/database.js').SqlDatabase} db @param {ImportBatch} batch @param {string[]} allowed */
export function importRows(db, batch, allowed) {
  db.exec('CREATE TABLE IF NOT EXISTS import_batches(id TEXT PRIMARY KEY)');
  if (db.prepare('SELECT id FROM import_batches WHERE id=?').get(batch.id)) return;
  const action = () => {
    for (const table of batch.tables) {
      if (!allowed.includes(table.name))
        throw new PairingError(400, 'Unsupported migration table.');
      const columns = db
        .prepare(`PRAGMA table_info(${table.name})`)
        .all()
        .map((column) => String(column.name));
      if (
        columns.length !== table.columns.length ||
        columns.some((column, index) => column !== table.columns[index])
      )
        throw new PairingError(400, 'Migration schema mismatch.');
      const subjectIndex = columns.indexOf('subject');
      const statement = db.prepare(
        `INSERT OR REPLACE INTO ${table.name} VALUES(${columns.map(() => '?').join(',')})`,
      );
      for (const values of table.rows) {
        if (
          values.length !== columns.length ||
          (subjectIndex >= 0 &&
            values[subjectIndex] !== null &&
            values[subjectIndex] !== batch.subject)
        )
          throw new PairingError(400, 'Migration account mismatch.');
        statement.run(
          ...values.map((value) =>
            typeof value === 'object' && value !== null ? Buffer.from(value.blob, 'base64') : value,
          ),
        );
      }
    }
    db.prepare('INSERT INTO import_batches VALUES(?)').run(batch.id);
  };
  if (!db.transaction) throw new Error('Atomic migration storage required.');
  db.transaction(action);
}
/** @param {Request} request @param {Env} env @param {unknown} body */
export async function migrationRequest(request, env, body) {
  const supplied = Buffer.from(
    request.headers.get('authorization')?.replace(/^Migration /, '') ?? '',
  );
  const expected = Buffer.from(env.IMPORT_SECRET);
  if (
    env.MIGRATION_ENABLED !== '1' ||
    !expected.length ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw new PairingError(404, 'Not found.');
  const input = z
    .object({
      action: z.enum([
        'account',
        'purchase',
        'ticket',
        'read_account',
        'read_purchase',
        'list_accounts',
        'verify_account',
        'grant_time',
      ]),
      name: z.string().min(1).max(1000),
      batch: batchSchema.optional(),
      table: z.string().optional(),
      payment: z
        .string()
        .regex(/^(pi_|ch_)[A-Za-z0-9]+$/)
        .optional(),
      offset: z.number().int().min(0).default(0),
      ticket: z
        .object({
          hash: z.string().regex(/^[a-f0-9]{64}$/),
          subject: z.string().nullable(),
          purchase: z.string().nullable(),
          expires: z.number(),
        })
        .optional(),
    })
    .strict()
    .parse(body);
  if (input.action === 'grant_time') {
    if (!input.payment || !input.name.startsWith(`${env.ACCOUNT_NAMESPACE}|`))
      throw new PairingError(400, 'Verified payment and account subject required.');
    const purchase = env.PURCHASES.getByName(digest(`time.md:stripe|${input.payment}`));
    const ticket = await purchase.createClaim({
      source: 'time.md:stripe',
      reference: input.payment,
    });
    const result = await purchase.claim(input.name, ticket);
    if (!result.ok) throw new PairingError(result.status, result.error);
    const account = env.ACCOUNTS.getByName(digest(input.name));
    await account.ensureAccount(input.name);
    await account.grantLifetime(input.name, result.source, result.reference);
    return { ok: true };
  }
  if (input.action === 'verify_account')
    return env.ACCOUNTS.getByName(digest(input.name)).verifyStorage(input.name);
  if (input.action === 'list_accounts')
    return {
      accounts: (
        await env.DIRECTORY.withSession('first-primary')
          .prepare('SELECT subject FROM accounts ORDER BY subject LIMIT 100 OFFSET ?')
          .bind(input.offset)
          .all()
      ).results.map((row) => String(row.subject)),
    };
  if (input.action === 'read_account' || input.action === 'read_purchase') {
    if (!input.table) throw new PairingError(400, 'Table required.');
    return input.action === 'read_account'
      ? env.ACCOUNTS.getByName(digest(input.name)).exportBatch(input.table, input.offset)
      : env.PURCHASES.getByName(input.name).exportBatch(input.table, input.offset);
  }
  if (input.action === 'ticket') {
    if (!input.ticket) throw new PairingError(400, 'Ticket required.');
    const ticket = input.ticket;
    await env.DIRECTORY.prepare('INSERT OR REPLACE INTO tickets VALUES(?,?,?,?)')
      .bind(ticket.hash, ticket.subject, ticket.purchase, ticket.expires)
      .run();
  } else {
    if (!input.batch) throw new PairingError(400, 'Import batch required.');
    if (input.action === 'account') {
      if (input.name !== input.batch.subject)
        throw new PairingError(400, 'Migration account mismatch.');
      await env.ACCOUNTS.getByName(digest(input.name)).importBatch(input.batch);
      await env.DIRECTORY.prepare('INSERT OR REPLACE INTO accounts VALUES(?,?)')
        .bind(input.name, Date.now())
        .run();
    } else await env.PURCHASES.getByName(input.name).importBatch(input.batch);
  }
  return { ok: true };
}
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
