import { notifyLogs } from './log-updates.js';
import { Platform } from 'react-native';
import { phoneDatabase } from './phone-database.js';
import {
  debugEntries,
  parseDebugEntry,
  debugLimit,
  debugRetentionMs,
  parseDebugContent,
  debugEntryContent,
  debugUrl,
} from '../core/debug-log.js';
const db = phoneDatabase();
db.execSync(`CREATE TABLE IF NOT EXISTS debug_log (id INTEGER PRIMARY KEY, owner TEXT, device TEXT, time INTEGER, value TEXT);
CREATE INDEX IF NOT EXISTS debug_log_partition ON debug_log(owner,device,time);
CREATE TABLE IF NOT EXISTS debug_content (owner TEXT, device TEXT, value TEXT, PRIMARY KEY(owner,device));
CREATE TABLE IF NOT EXISTS debug_sharing (owner TEXT, device TEXT, shared INTEGER, revision INTEGER, PRIMARY KEY(owner,device));`);
/** @typedef {{owner:string,deviceId:string}} Context */
/** Diagnostics must never turn an otherwise successful application operation into a failure.
 * @param {Context} context @param {string} operation @param {string} outcome
 * @param {{durationMs?:number,httpStatus?:number,error?:unknown,url?:string,credentials?:Record<string,string>,records?:Omit<import('../core/debug-log.js').DebugRecords,'truncated'>}} [details] */
export function recordDebug(context, operation, outcome, details = {}) {
  try {
    const content = debugContent(context);
    const message =
      details.error === undefined
        ? undefined
        : details.error instanceof Error
          ? details.error.message
          : String(details.error);
    /** @type {import('../core/debug-log.js').DebugRecords|undefined} */
    let records;
    if (content.records && details.records) {
      records = { ...details.records, values: [], truncated: false };
      for (const value of details.records.values.slice(0, 50)) {
        if (JSON.stringify({ ...records, values: [...records.values, value] }).length > 8000) break;
        records.values.push(value);
      }
      records.truncated = records.values.length < details.records.values.length;
    }
    const entry = parseDebugEntry({
      ...(message === undefined
        ? {}
        : {
            error: message.slice(0, 16000),
            ...(message.length > 16000 ? { errorTruncated: true } : {}),
          }),
      ...(content.urls && details.url
        ? { url: debugUrl(details.url, content.credentials).slice(0, 4000) }
        : {}),
      ...(content.credentials &&
      details.credentials &&
      JSON.stringify(details.credentials).length <= 4000
        ? { credentials: details.credentials }
        : {}),
      ...(records ? { records } : {}),
      time: Date.now(),
      operation,
      outcome,
      durationMs:
        details.durationMs === undefined
          ? null
          : Math.min(86400000, Math.max(0, Math.round(details.durationMs))),
      httpStatus: details.httpStatus ?? null,
    });
    let written = false;
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
          entry.records === undefined &&
          previous.error === undefined &&
          previous.operation === operation &&
          previous.outcome === outcome &&
          previous.httpStatus === entry.httpStatus &&
          previous.url === entry.url &&
          JSON.stringify(previous.credentials) === JSON.stringify(entry.credentials) &&
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
      written = true;
      db.runSync(
        'DELETE FROM debug_log WHERE owner=? AND device=? AND id NOT IN (SELECT id FROM debug_log WHERE owner=? AND device=? ORDER BY id DESC LIMIT ?)',
        context.owner,
        context.deviceId,
        context.owner,
        context.deviceId,
        debugLimit,
      );
    });
    if (written) notifyLogs(context);
  } catch {
    // Storage failures must not break exports, sign-in, or request handling.
  }
}
/** @param {Context} context */
export function debugContent(context) {
  const row = /** @type {{value:string}|null} */ (
    db.getFirstSync(
      'SELECT value FROM debug_content WHERE owner=? AND device=?',
      context.owner,
      context.deviceId,
    )
  );
  try {
    return parseDebugContent(row ? JSON.parse(row.value) : undefined);
  } catch {
    return parseDebugContent(undefined);
  }
}
/** Trusted phone control. Disabling inclusion purges retained attachments and advances consent revision.
 * @param {Context} context @param {import('../core/debug-log.js').DebugContent} value */
export function setDebugContent(context, value) {
  const content = parseDebugContent(value);
  const shared = debugSharing(context).shared;
  db.withTransactionSync(() => {
    db.runSync(
      'INSERT OR REPLACE INTO debug_content VALUES(?,?,?)',
      context.owner,
      context.deviceId,
      JSON.stringify(content),
    );
    const rows = /** @type {{id:number,value:string}[]} */ (
      db.getAllSync(
        'SELECT id,value FROM debug_log WHERE owner=? AND device=?',
        context.owner,
        context.deviceId,
      )
    );
    for (const row of rows) {
      let entry;
      try {
        entry = debugEntryContent(parseDebugEntry(JSON.parse(row.value)), content);
      } catch {
        continue;
      }
      // URL credential components are also removed when credential capture is disabled.
      if (entry.url && !content.credentials) entry.url = debugUrl(entry.url, false);
      db.runSync('UPDATE debug_log SET value=? WHERE id=?', JSON.stringify(entry), row.id);
    }
    setDebugSharing(context, shared);
  });
  notifyLogs(context);
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
      entries.push(
        debugEntryContent(parseDebugEntry(JSON.parse(row.value)), debugContent(context)),
      );
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
    content: debugContent(context),
    entries: debugEntries(entries, now),
  };
}
