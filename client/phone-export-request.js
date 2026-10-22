import { errorMessage } from '../packages/support-chat/errors.js';
import { AppState } from 'react-native';
import { api } from './session.js';
import { loadExportContext } from './export-context.js';
import { loadProfiles } from './profiles.js';
import { parseProfile } from '../core/profiles.js';
import { exportNow } from './export-task.js';
import { phoneDatabase } from './phone-database.js';
import { qaEnabled } from './qa-runtime.js';
import { showToast } from '../src/components/Toast.js';

/** @typedef {{requestId:string,profileId:string,configuration:string,expiresAt:string,domains:import('../core/data.js').Domain[],range:{start:string|null,end:string}}} PhoneExportRequest */
/** @typedef {{status:string}} Outcome */
const db = phoneDatabase();
db.execSync(
  'CREATE TABLE IF NOT EXISTS phone_export_receipts (owner TEXT, device TEXT, request TEXT, value TEXT, PRIMARY KEY(owner,device,request))',
);
const activeRequests = new Set();
/** @param {import('./session.js').Session} session @param {string} requestId @param {Record<string,unknown>} value */
function save(session, requestId, value) {
  const context = loadExportContext();
  if (context?.owner !== session.owner || context.deviceId !== session.deviceId) return;
  db.runSync(
    'INSERT OR REPLACE INTO phone_export_receipts VALUES (?,?,?,?)',
    session.owner,
    session.deviceId,
    requestId,
    JSON.stringify(value),
  );
}
/** Request retries replay delivery receipts; a runtime restart never repeats an started export.
 * @param {import('./session.js').Session} session @param {PhoneExportRequest|null|undefined} request @param {()=>boolean} active */
export async function reviewPhoneExport(session, request, active) {
  if (qaEnabled) return;
  const current = () => {
    const context = loadExportContext();
    return (
      active() &&
      AppState.currentState === 'active' &&
      context?.owner === session.owner &&
      context.deviceId === session.deviceId
    );
  };
  /** @param {string} requestId @param {Record<string,unknown>} value */
  const report = (requestId, value) =>
    /** @type {Promise<Outcome>} */ (
      api(session, `/api/phones/${session.deviceId}/export`, {
        method: 'POST',
        body: JSON.stringify({ requestId, ...value }),
      })
    );
  // Recover unacknowledged outcomes after network loss without repeating file delivery.
  for (const row of /** @type {{request:string,value:string}[]} */ (
    db.getAllSync(
      'SELECT request,value FROM phone_export_receipts WHERE owner=? AND device=?',
      session.owner,
      session.deviceId,
    )
  )) {
    if (!current()) return;
    if (activeRequests.has(row.request)) continue;
    const value = JSON.parse(row.value);
    if (value.acknowledged) continue;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Acknowledge each stored receipt once.
      const outcome = await report(
        row.request,
        value.action === 'running' ? { action: 'fail', error: 'interrupted' } : value,
      );
      if (['completed', 'failed', 'cancelled', 'expired'].includes(outcome.status))
        save(session, row.request, { acknowledged: true });
    } catch {
      /* Retry the receipt while the account remains open. */
    }
  }
  if (
    !request ||
    !current() ||
    activeRequests.has(request.requestId) ||
    Date.parse(request.expiresAt) <= Date.now()
  )
    return;
  if (
    db.getFirstSync(
      'SELECT request FROM phone_export_receipts WHERE owner=? AND device=? AND request=?',
      session.owner,
      session.deviceId,
      request.requestId,
    )
  )
    return;
  const profile = loadProfiles(session.deviceId)?.profiles.find((p) => p.id === request.profileId);
  if (!profile || JSON.stringify(parseProfile(profile)) !== request.configuration) {
    await report(request.requestId, { action: 'fail', error: 'profile_changed' });
    return;
  }
  activeRequests.add(request.requestId);
  save(session, request.requestId, { action: 'running' });
  const toast = showToast({
    message: 'Exporting phone data',
    kind: 'loading',
    progress: 0,
  });
  void (async () => {
    try {
      if (!current() || Date.parse(request.expiresAt) <= Date.now())
        throw new Error('Export request expired.');
      const latest = loadProfiles(session.deviceId)?.profiles.find(
        (p) => p.id === request.profileId,
      );
      if (!latest || JSON.stringify(parseProfile(latest)) !== request.configuration)
        throw new Error('Profile changed.');
      const started = await report(request.requestId, { action: 'start' });
      if (started.status !== 'running') throw new Error('Export request is no longer running.');
      const receipt = await exportNow(
        session,
        latest,
        (detail, progress) => toast({ detail, progress }),
        {
          domains: request.domains,
          range: request.range,
          requestId: `export-${request.requestId}`,
          check: async () => {
            if (!current()) throw new Error('Phone account, connection or foreground changed.');
            const outcome = await report(request.requestId, { action: 'check' });
            if (!current() || outcome.status !== 'running')
              throw new Error('Export request stopped.');
          },
        },
      );
      save(session, request.requestId, { action: 'complete', receipt });
      toast({
        message: receipt.failedSources ? 'Data partially exported' : 'Data exported',
        detail: `${receipt.days} days · ${receipt.recordCount} records`,
        kind: receipt.failedSources ? 'warning' : 'success',
        progress: 100,
      });
      await report(request.requestId, { action: 'complete', receipt }).catch(() => {});
    } catch (error) {
      const code =
        error instanceof Error && /past-data access/.test(error.message)
          ? 'history_permission_required'
          : 'export_failed';
      save(session, request.requestId, { action: 'fail', error: code });
      toast({
        message:
          errorMessage(error) ||
          'Export stopped. Check export history for saved files and details.',
        kind: 'error',
        progress: undefined,
      });
      await report(request.requestId, { action: 'fail', error: code }).catch(() => {});
    } finally {
      activeRequests.delete(request.requestId);
    }
  })();
}
