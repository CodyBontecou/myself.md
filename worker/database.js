/** @param {DurableObjectStorage} storage @returns {import('../server/database.js').SqlDatabase} */
export function objectDatabase(storage) {
  const sql = storage.sql;
  /** @param {string} query @param {import('../server/database.js').SqlInput[]} values */
  const execute = (query, values) => sql.exec(query, ...values.map(binding));
  return {
    exec(query) {
      // The platform owns journaling and secure deletion. Retain table_info reads.
      sql.exec(query.replace(/PRAGMA (journal_mode|secure_delete|foreign_keys)=[^;]+;/g, ''));
    },
    prepare(query) {
      return {
        get: (...values) => execute(query, values).toArray().map(row)[0],
        all: (...values) => execute(query, values).toArray().map(row),
        run: (...values) => {
          execute(query, values).toArray();
          const result = sql.exec('SELECT changes() changes, last_insert_rowid() id').one();
          return { changes: Number(result.changes), lastInsertRowid: Number(result.id) };
        },
      };
    },
    close() {},
    transaction: (action) => storage.transactionSync(action),
  };
}
/** @param {import('../server/database.js').SqlInput} value @returns {SqlStorageValue} */
function binding(value) {
  if (typeof value === 'bigint') return Number(value);
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice().buffer;
  return value;
}
/** @param {Record<string,SqlStorageValue>} value @returns {import('../server/database.js').SqlRow} */
function row(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      item instanceof ArrayBuffer ? new Uint8Array(item) : item,
    ]),
  );
}
