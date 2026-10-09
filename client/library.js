import * as SQLite from 'expo-sqlite';
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
/** @param {string} owner @param {import('../core/data.js').DataQuery} query @param {string} token @returns {import('../core/data.js').DataPage} */
export function localPage(owner, query, token) {
  const after = Number(token || 0);
  if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid local cursor.');
  const rows = db.getAllSync(
    /** @type {string} */ (
      `SELECT * FROM records WHERE owner=? AND domain=? AND type=? AND id>? AND source='expo-location' AND start>=? AND start<? ORDER BY id LIMIT ?`
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
    capture: 'recorded-location-points',
    warnings: [
      'Only records whose start timestamp is in the UTC interval are returned.',
      'Location history contains only points explicitly recorded by myself.md; it cannot recover earlier phone history.',
    ],
  };
}
