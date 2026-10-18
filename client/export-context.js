import { phoneDatabase } from './phone-database.js';
/** @typedef {Pick<import('./session.js').Session,'owner'|'deviceId'>} ExportContext */
const db = phoneDatabase();
db.execSync('CREATE TABLE IF NOT EXISTS export_context (id INTEGER PRIMARY KEY, value TEXT)');
function deletingAccount() {
  return Boolean(
    db.getFirstSync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='account_cleanup'",
    ) && db.getFirstSync('SELECT 1 FROM account_cleanup WHERE id=1'),
  );
}
/** Persist only the local data partition, so locked-device work never needs OAuth tokens.
 * @param {ExportContext|null} context */
export function saveExportContext(context) {
  if (!context?.deviceId || deletingAccount()) db.runSync('DELETE FROM export_context');
  else
    db.runSync(
      'INSERT OR REPLACE INTO export_context VALUES (1,?)',
      JSON.stringify({ owner: context.owner, deviceId: context.deviceId }),
    );
}
/** @returns {ExportContext|null} */
export function loadExportContext() {
  if (deletingAccount()) return null;
  const row = /** @type {{value:string}|null} */ (
    db.getFirstSync('SELECT value FROM export_context WHERE id=1')
  );
  return row ? /** @type {ExportContext} */ (JSON.parse(row.value)) : null;
}
