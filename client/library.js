import * as SQLite from 'expo-sqlite';
import { importRecords, record } from '../core/data.js';
const db = SQLite.openDatabaseSync('phone-data.sqlite');
db.execSync(`CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY, owner TEXT, domain TEXT, type TEXT, start TEXT, end TEXT, source TEXT, payload TEXT);
CREATE INDEX IF NOT EXISTS record_query ON records(owner,domain,type,id);
CREATE TABLE IF NOT EXISTS settings (owner TEXT PRIMARY KEY, value TEXT);`);
/** @typedef {Record<import('../core/data.js').Domain,boolean>} Grants */
/** @param {string} owner @returns {Grants} */
export function loadGrants(owner) {
  const row = db.getFirstSync(
    /** @type {string} */ ('SELECT value FROM settings WHERE owner=?'),
    owner,
  );
  return row
    ? JSON.parse(/** @type {{value:string}} */ (row).value)
    : { health: false, time: false, location: false };
}
/** @param {string} owner @param {Grants} grants */
export function saveGrants(owner, grants) {
  db.runSync('INSERT OR REPLACE INTO settings VALUES (?,?)', owner, JSON.stringify(grants));
}
/** @param {string} owner @param {import('../core/data.js').DataRecord} row */
export function saveRecord(owner, row) {
  db.runSync(
    'INSERT INTO records(owner,domain,type,start,end,source,payload) VALUES (?,?,?,?,?,?,?)',
    owner,
    row.domain,
    row.type,
    row.start,
    row.end,
    row.source,
    JSON.stringify(row.native),
  );
}
/** @param {string} owner @param {import('../core/data.js').Domain} domain @param {string} name @param {string} text */
export function importArchive(owner, domain, name, text) {
  const rows = importRecords(domain, JSON.parse(text)).slice(1);
  const archiveId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db.withTransactionSync(() => {
    const total = Math.ceil(text.length / 4096);
    for (let index = 0; index < total; index++)
      saveRecord(
        owner,
        record(domain, 'archive', 'imported-original', {
          archiveId,
          name,
          index,
          total,
          text: text.slice(index * 4096, (index + 1) * 4096),
        }),
      );
    for (const row of rows) saveRecord(owner, row);
  });
  return rows.length;
}
/** @param {string} owner @param {import('../core/data.js').Domain} domain */
export function importedTypes(owner, domain) {
  return db
    .getAllSync(
      /** @type {string} */ (
        "SELECT DISTINCT type FROM records WHERE owner=? AND domain=? AND source LIKE 'imported%'"
      ),
      owner,
      domain,
    )
    .map((row) => /** @type {{type:string}} */ (row).type);
}
/** @param {string} owner @param {import('../core/data.js').DataQuery} query @param {string} token @returns {import('../core/data.js').DataPage} */
export function localPage(owner, query, token) {
  const after = Number(token || 0);
  if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid local cursor.');
  const rows = db.getAllSync(
    /** @type {string} */ (
      `SELECT * FROM records WHERE owner=? AND domain=? AND type=? AND id>? AND ${query.source === 'imported' ? "source LIKE 'imported%'" : "source='expo-location'"} AND (type='archive' OR (start>=? AND start<?)) ORDER BY id LIMIT ?`
    ),
    owner,
    query.domain,
    query.type,
    after,
    query.start,
    query.end,
    query.limit + 1,
  );
  const selected = rows
    .slice(0, query.limit)
    .map(
      (row) =>
        /** @type {{id:number,domain:import('../core/data.js').Domain,type:string,source:string,start:string|null,end:string|null,payload:string}} */ (
          row
        ),
    );
  return {
    records: selected.map((row) => ({
      domain: row.domain,
      type: row.type,
      source: row.source,
      start: row.start,
      end: row.end,
      native: JSON.parse(row.payload),
    })),
    nextCursor: rows.length > query.limit ? String(selected.at(-1)?.id) : null,
    capture: query.type === 'archive' ? 'lossless-import-chunks' : 'recorded-or-imported',
    warnings: [
      query.type === 'archive'
        ? 'Join each archiveId’s text chunks by index to reconstruct the original file; archives have no event date filter.'
        : 'Only records whose start timestamp is in the UTC interval are returned. Undated imported aggregates remain in their original archive.',
      query.source === 'imported'
        ? 'Imported history is not a live native capture. Aggregates are not sessions. Read the original archive for its capture status and query manifest; indexed rows alone cannot establish completeness.'
        : 'Location history contains only points explicitly recorded by QR Connect; it cannot recover earlier phone history.',
    ],
  };
}
/** @param {string} owner */
export function deleteLocalData(owner) {
  db.runSync('DELETE FROM records WHERE owner=?', owner);
}
