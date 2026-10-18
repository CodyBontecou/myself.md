import { showToast } from '../src/components/Toast.js';
import { Alert, AppState } from 'react-native';
import { api, loadSession } from './session.js';
import { connectWhoop, disconnectWhoop } from './whoop.js';
import { phoneDatabase } from './phone-database.js';
/** @typedef {{requestId:string,operation:'connect'|'disconnect',expiresAt:string}} WhoopRequest */
const db = phoneDatabase();
db.execSync(
  'CREATE TABLE IF NOT EXISTS whoop_receipts (owner TEXT, request TEXT, action TEXT, PRIMARY KEY(owner,request))',
);
let showing = false;
const reviewed = new Set();
/** @param {import('./session.js').Session} session @param {WhoopRequest|null|undefined} request @param {()=>boolean} active */
export async function reviewWhoopRequest(session, request, active) {
  if (showing) return;
  const current = async () => {
    if (!active()) return false;
    try {
      const saved = await loadSession();
      return (
        saved?.owner === session.owner &&
        saved.deviceId === session.deviceId &&
        saved.server === session.server
      );
    } catch {
      return false;
    }
  };
  /** @param {string} requestId @param {'start'|'complete'|'cancel'|'fail'} action */
  const report = (requestId, action) =>
    /** @type {Promise<{status:string}>} */ (
      api(session, `/api/phones/${session.deviceId}/whoop`, {
        method: 'POST',
        body: JSON.stringify({ requestId, action }),
      })
    );
  /** @param {string} requestId @param {string} action */
  const receipt = (requestId, action) =>
    db.runSync(
      'INSERT OR REPLACE INTO whoop_receipts VALUES (?,?,?)',
      session.owner,
      requestId,
      action,
    );
  const pending = /** @type {{request:string,action:'complete'|'cancel'|'fail'|'start'}[]} */ (
    db.getAllSync('SELECT request,action FROM whoop_receipts WHERE owner=?', session.owner)
  );
  for (const item of pending) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Check account between receipt acknowledgments.
    if (!(await current())) return;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Replay committed metadata without repeating provider effects.
      await report(item.request, item.action === 'start' ? 'fail' : item.action);
      db.runSync(
        'DELETE FROM whoop_receipts WHERE owner=? AND request=?',
        session.owner,
        item.request,
      );
    } catch {
      /* Retain until this phone can acknowledge. */
    }
  }
  if (
    !request ||
    reviewed.has(request.requestId) ||
    showing ||
    AppState.currentState !== 'active' ||
    !(await current()) ||
    Date.parse(request.expiresAt) <= Date.now()
  )
    return;
  reviewed.add(request.requestId);
  showing = true;
  const label = request.operation === 'connect' ? 'Connect WHOOP' : 'Disconnect WHOOP';
  Alert.alert(
    `${label}?`,
    request.operation === 'connect'
      ? 'Your agent requested a WHOOP connection. Sign in and approve WHOOP access in the browser. This does not select data or give agents permission to read it.'
      : 'Your agent requested WHOOP disconnection. This revokes WHOOP access on this phone. Saved exports remain available under their profile permissions.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => {
          receipt(request.requestId, 'cancel');
          showing = false;
        },
      },
      {
        text: label,
        onPress: () => {
          void (async () => {
            try {
              if (!(await current()) || Date.parse(request.expiresAt) <= Date.now()) return;
              const started = await report(request.requestId, 'start');
              if (started.status !== 'running' || !(await current())) return;
              receipt(request.requestId, 'start');
              const outcome =
                request.operation === 'connect'
                  ? await connectWhoop(session.owner)
                  : await disconnectWhoop(session.owner);
              receipt(request.requestId, outcome.status === 'cancelled' ? 'cancel' : 'complete');
            } catch {
              receipt(request.requestId, 'fail');
              if (await current())
                showToast({
                  message: 'WHOOP operation failed. Open Settings → WHOOP to retry.',
                  kind: 'error',
                });
            } finally {
              showing = false;
            }
          })();
        },
      },
    ],
    { cancelable: false },
  );
}
