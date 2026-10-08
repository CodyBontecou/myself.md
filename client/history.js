import * as SQLite from 'expo-sqlite';
import { exportEvent, addArtifact, parseHistoryEvent } from '../core/history.js';
import { relatedHistoryEvents } from '../core/history-display.js';
import { api } from './session.js';
/** @typedef {import('../core/history.js').HistoryEvent} HistoryEvent */
/** @typedef {import('./export-context.js').ExportContext} Context */
const db = SQLite.openDatabaseSync('phone-data.sqlite');
db.execSync(`CREATE TABLE IF NOT EXISTS activity_history (owner TEXT, device TEXT, origin TEXT, id TEXT, started TEXT, value TEXT, PRIMARY KEY(owner,device,origin,id));
CREATE INDEX IF NOT EXISTS activity_order ON activity_history(owner,device,started,id);`);
// Manual work cannot resume after the JS runtime restarts. Scheduled jobs retain checkpoints.
for (const row of /** @type {{owner:string,device:string,id:string,value:string}[]} */ (
  db.getAllSync("SELECT owner,device,id,value FROM activity_history WHERE origin='local'")
)) {
  const event = parseHistoryEvent(JSON.parse(row.value));
  if (event.actor === 'manual' && event.status === 'running')
    db.runSync(
      "UPDATE activity_history SET value=? WHERE owner=? AND device=? AND origin='local' AND id=?",
      JSON.stringify({
        ...event,
        status: 'interrupted',
        updatedAt: new Date().toISOString(),
        error: 'The app closed before this export finished.',
      }),
      row.owner,
      row.device,
      row.id,
    );
}
/** @param {Context} context @param {HistoryEvent} event @param {string} [origin] */
function save(context, event, origin = 'local') {
  db.runSync(
    'INSERT OR REPLACE INTO activity_history VALUES (?,?,?,?,?,?)',
    context.owner,
    context.deviceId,
    origin,
    event.id,
    event.startedAt,
    JSON.stringify(event),
  );
}
/** @param {Context} context @param {string} id @returns {HistoryEvent|null} */
function get(context, id) {
  const row = /** @type {{value:string}|null} */ (
    db.getFirstSync(
      'SELECT value FROM activity_history WHERE owner=? AND device=? AND origin=? AND id=?',
      context.owner,
      context.deviceId,
      'local',
      id,
    )
  );
  return row ? parseHistoryEvent(JSON.parse(row.value)) : null;
}
/** @param {Context} context @param {import('../core/profiles.js').ExportProfile} profile @param {'manual'|'schedule'} actor @param {HistoryEvent['interval']} interval @param {string} [id] */
export function beginExport(
  context,
  profile,
  actor,
  interval,
  id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
) {
  const previous = get(context, id);
  const event =
    previous ??
    exportEvent({
      id,
      profile,
      actor,
      interval,
      stamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  save(context, { ...event, status: 'running', error: null, updatedAt: new Date().toISOString() });
  return id;
}
/** @param {Context} context @param {string} id @param {import('../core/history.js').HistoryArtifact} artifact */
export function recordArtifact(context, id, artifact) {
  const event = get(context, id);
  if (event) save(context, addArtifact(event, artifact, new Date().toISOString()));
}
/** @param {Context} context @param {string} id @param {import('../core/history.js').HistoryStatus} status @param {string|null} [error] */
export function finishExport(context, id, status, error = null) {
  const event = get(context, id);
  if (event)
    save(context, {
      ...event,
      status: status === 'complete' && event.artifacts.some((a) => a.partial) ? 'partial' : status,
      error,
      updatedAt: new Date().toISOString(),
    });
}
/** @param {Context} context @param {HistoryEvent} event */
export function saveShareEvent(context, event) {
  save(context, event);
}
/** @param {Context} context @param {string} server @param {number} [limit] @param {number} [offset] @returns {HistoryEvent[]} */
export function historyPage(context, server, limit = 50, offset = 0) {
  const rows = /** @type {{value:string}[]} */ (
    db.getAllSync(
      'SELECT value FROM activity_history WHERE owner=? AND device=? AND (origin=? OR origin=?) ORDER BY started DESC,id DESC LIMIT ? OFFSET ?',
      context.owner,
      context.deviceId,
      'local',
      server,
      limit,
      offset,
    )
  );
  return rows.map((row) => parseHistoryEvent(JSON.parse(row.value)));
}
/** Sync metadata in bounded batches; local file paths never leave the phone.
 * @param {import('./session.js').Session} session @param {number} [offset] */
async function publishHistory(session, offset = 0) {
  const rows = /** @type {{value:string}[]} */ (
    db.getAllSync(
      "SELECT value FROM activity_history WHERE owner=? AND device=? AND origin='local' AND started>=? ORDER BY started DESC,id DESC LIMIT 50 OFFSET ?",
      session.owner,
      session.deviceId,
      new Date(Date.now() - 90 * 86400000).toISOString(),
      offset,
    )
  );
  if (!rows.length) return;
  const events = rows.map((row) => {
    const event = parseHistoryEvent(JSON.parse(row.value));
    for (const artifact of event.artifacts) artifact.uri = null;
    return event;
  });
  await api(session, '/api/history', {
    method: 'POST',
    body: JSON.stringify({ deviceId: session.deviceId, events }),
  });
  if (rows.length === 50) await publishHistory(session, offset + rows.length);
}
/** Publish phone export metadata and fetch server history; cached entries remain available offline.
 * @param {import('./session.js').Session} session @param {number} [offset] */
export async function syncHistory(session, offset = 0) {
  if (offset === 0) await publishHistory(session);
  const result = /** @type {{events:unknown[],hasMore:boolean}} */ (
    await api(
      session,
      `/api/history?deviceId=${encodeURIComponent(session.deviceId)}&offset=${offset}`,
    )
  );
  if (!Array.isArray(result.events)) throw new Error('Invalid history response.');
  const events = result.events.map(parseHistoryEvent);
  db.withTransactionSync(() => {
    for (const event of events) {
      if (!get(session, event.id)) save(session, event, session.server);
    }
  });
  return { count: events.length, hasMore: result.hasMore === true };
}
/** @param {Context} context @param {string} server @param {string} id @returns {HistoryEvent|null} */
export function historyEntry(context, server, id) {
  const row = /** @type {{value:string}|null} */ (
    db.getFirstSync(
      'SELECT value FROM activity_history WHERE owner=? AND device=? AND (origin=? OR origin=?) AND id=?',
      context.owner,
      context.deviceId,
      'local',
      server,
      id,
    )
  );
  return row ? parseHistoryEvent(JSON.parse(row.value)) : null;
}
/** @param {Context} context @param {string} server @param {HistoryEvent} event */
export function relatedHistory(context, server, event) {
  const cloudIds = event.relatedId
    ? [event.relatedId]
    : event.artifacts.map((a) => a.cloudId).filter((id) => id !== null);
  if (!cloudIds.length) return [];
  const rows = /** @type {{value:string}[]} */ (
    db.getAllSync(
      'SELECT value FROM activity_history WHERE owner=? AND device=? AND (origin=? OR origin=?) AND id<>? ORDER BY started DESC,id DESC',
      context.owner,
      context.deviceId,
      'local',
      server,
      event.id,
    )
  );
  return relatedHistoryEvents(
    rows.map((row) => parseHistoryEvent(JSON.parse(row.value))),
    event,
  );
}
