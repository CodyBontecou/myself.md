import { Platform } from 'react-native';
import { phoneDatabase } from './phone-database.js';
import { debugEntries, parseDebugEntry, debugLimit, debugRetentionMs } from '../core/debug-log.js';
const db = phoneDatabase();
db.execSync(`CREATE TABLE IF NOT EXISTS debug_log (id INTEGER PRIMARY KEY, owner TEXT, device TEXT, time INTEGER, value TEXT);
CREATE INDEX IF NOT EXISTS debug_log_partition ON debug_log(owner,device,time);
CREATE TABLE IF NOT EXISTS debug_sharing (owner TEXT, device TEXT, shared INTEGER, revision INTEGER, PRIMARY KEY(owner,device));`);
// Earlier versions could capture records, credentials and URLs. Strip retained attachments once.
if (db.getFirstSync("SELECT name FROM sqlite_master WHERE type='table' AND name='debug_content'"))
  db.withTransactionSync(() => {
    for (const row of /** @type {{id:number,value:string}[]} */ (
      db.getAllSync('SELECT id,value FROM debug_log')
    )) {
      try {
        db.runSync(
          'UPDATE debug_log SET value=? WHERE id=?',
          JSON.stringify(parseDebugEntry(JSON.parse(row.value))),
          row.id,
        );
      } catch {
        db.runSync('DELETE FROM debug_log WHERE id=?', row.id);
      }
    }
    db.execSync('DROP TABLE debug_content');
  });
/** @typedef {{owner:string,deviceId:string}} Context */
/** Diagnostics must never turn an otherwise successful application operation into a failure.
 * @param {Context} context @param {string} operation @param {string} outcome
 * @param {{durationMs?:number,httpStatus?:number,error?:unknown}} [details] */
export function recordDebug(context, operation, outcome, details = {}) {
  try {
    if (
      db.getFirstSync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='account_cleanup'",
      ) &&
      db.getFirstSync(
        'SELECT 1 FROM account_cleanup WHERE owner=? OR device=?',
        context.owner,
        context.deviceId,
      )
    )
      return;
    const message =
      details.error === undefined
        ? undefined
        : details.error instanceof Error
          ? details.error.message
          : String(details.error);
    const entry = parseDebugEntry({
      ...(message === undefined
        ? {}
        : {
            error: message.slice(0, 16000),
            ...(message.length > 16000 ? { errorTruncated: true } : {}),
          }),
      time: Date.now(),
      operation,
      outcome,
      durationMs:
        details.durationMs === undefined
          ? null
          : Math.min(86400000, Math.max(0, Math.round(details.durationMs))),
      httpStatus: details.httpStatus ?? null,
    });
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM debug_log WHERE time<?', Date.now() - debugRetentionMs);
      const last = /** @type {{value:string}|null} */ (
        db.getFirstSync(
          'SELECT value FROM debug_log WHERE owner=? AND device=? ORDER BY id DESC LIMIT 1',
          context.owner,
          context.deviceId,
        )
      );
      if (last) {
        const previous = parseDebugEntry(JSON.parse(last.value));
        if (
          entry.error === undefined &&
          previous.error === undefined &&
          previous.operation === operation &&
          previous.outcome === outcome &&
          previous.httpStatus === entry.httpStatus &&
          entry.time - previous.time < 60000
        )
          return;
      }
      db.runSync(
        'INSERT INTO debug_log(owner,device,time,value) VALUES(?,?,?,?)',
        context.owner,
        context.deviceId,
        entry.time,
        JSON.stringify(entry),
      );
      db.runSync(
        'DELETE FROM debug_log WHERE owner=? AND device=? AND id NOT IN (SELECT id FROM debug_log WHERE owner=? AND device=? ORDER BY id DESC LIMIT ?)',
        context.owner,
        context.deviceId,
        context.owner,
        context.deviceId,
        debugLimit,
      );
    });
  } catch {
    // Storage failures must not break exports, sign-in, or request handling.
  }
}
/** @param {Context} context */
export function debugSharing(context) {
  const row = /** @type {{shared:number,revision:number}|null} */ (
    db.getFirstSync(
      'SELECT shared,revision FROM debug_sharing WHERE owner=? AND device=?',
      context.owner,
      context.deviceId,
    )
  );
  return { shared: row?.shared === 1, revision: row?.revision ?? 0 };
}
/** Only trusted phone UI changes consent. Revision prevents older in-flight heartbeats restoring access.
 * @param {Context} context @param {boolean} shared */
export function setDebugSharing(context, shared) {
  if (typeof shared !== 'boolean') throw new Error('Invalid diagnostics consent.');
  const revision = Math.max(Date.now(), debugSharing(context).revision + 1);
  db.runSync(
    'INSERT OR REPLACE INTO debug_sharing VALUES(?,?,?,?)',
    context.owner,
    context.deviceId,
    shared ? 1 : 0,
    revision,
  );
}
/** @param {Context} context @param {boolean} [forAgent] @returns {import('../core/debug-log.js').DebugReport} */
export function debugReport(context, forAgent = false) {
  const consent = debugSharing(context);
  const now = Date.now();
  db.runSync('DELETE FROM debug_log WHERE time<?', now - debugRetentionMs);
  const rows =
    !forAgent || consent.shared
      ? /** @type {{value:string}[]} */ (
          db.getAllSync(
            'SELECT value FROM debug_log WHERE owner=? AND device=? ORDER BY id DESC LIMIT ?',
            context.owner,
            context.deviceId,
            debugLimit,
          )
        )
      : [];
  const entries = [];
  for (const row of rows) {
    try {
      entries.push(parseDebugEntry(JSON.parse(row.value)));
    } catch {
      /* Ignore malformed diagnostics, preserving application data. */
    }
  }
  return {
    schema: 'myself.md.debug.v1',
    generatedAt: now,
    revision: consent.revision,
    shared: consent.shared,
    platform: Platform.OS,
    entries: debugEntries(entries, now),
  };
}
