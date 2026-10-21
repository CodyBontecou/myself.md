import { Alert, AppState } from 'react-native';
import { api } from './session.js';
import { loadExportContext } from './export-context.js';
import {
  captureLocation,
  pendingLocationCaptureReceipts,
  acknowledgeLocationCapture,
  declineLocationCapture,
} from './location-task.js';

/** @typedef {{requestId:string,expiresAt:string}} CaptureRequest */
/** @typedef {{status:string,capturedAt?:string}} CaptureResponse */
const reviewed = new Set();
let showing = false;
/** @param {CaptureResponse} response */
const terminal = (response) =>
  ['completed', 'failed', 'cancelled', 'expired'].includes(response.status);
/** @param {import('./session.js').Session} session @param {CaptureRequest|null|undefined} request @param {()=>Promise<void>} refreshed @param {()=>boolean} active */
export async function reviewLocationCapture(session, request, refreshed, active) {
  const current = () => {
    const context = loadExportContext();
    return (
      active() &&
      AppState.currentState === 'active' &&
      context?.owner === session.owner &&
      context.deviceId === session.deviceId
    );
  };
  /** @param {string} requestId @param {'start'|'check'|'complete'|'fail'|'cancel'} action @param {{capturedAt?:string,error?:'permission_denied'|'capture_failed'|'session_changed'|'interrupted'}} [extra] */
  const report = (requestId, action, extra = {}) =>
    /** @type {Promise<CaptureResponse>} */ (
      api(session, `/api/phones/${session.deviceId}/location-capture`, {
        method: 'POST',
        body: JSON.stringify({ requestId, action, ...extra }),
      })
    );
  // A completed local receipt is replayed after network loss/restart without recapturing a point.
  for (const receipt of pendingLocationCaptureReceipts(session)) {
    if (!current()) return;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Acknowledge each committed local receipt before the next.
      const outcome = await report(
        receipt.request,
        receipt.state === 'cancelled'
          ? 'cancel'
          : receipt.state === 'completed' && receipt.captured
            ? 'complete'
            : 'fail',
        receipt.state === 'completed' && receipt.captured
          ? { capturedAt: receipt.captured }
          : receipt.state === 'cancelled'
            ? {}
            : { error: 'interrupted' },
      );
      if (terminal(outcome)) acknowledgeLocationCapture(session, receipt.request);
    } catch {
      /* Retain the receipt and retry while the same account is open. */
    }
  }
  if (
    !request ||
    !current() ||
    showing ||
    reviewed.has(request.requestId) ||
    Date.parse(request.expiresAt) <= Date.now()
  )
    return;
  reviewed.add(request.requestId);
  showing = true;
  Alert.alert(
    'Save one Location point?',
    'Your agent requested one foreground Location point. It stays on this phone. This does not start background recording or give the agent permission to read it. Any system Location permission is a separate choice.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => {
          showing = false;
          declineLocationCapture(session, request.requestId);
          void report(request.requestId, 'cancel')
            .then((outcome) => {
              if (terminal(outcome)) acknowledgeLocationCapture(session, request.requestId);
              return outcome;
            })
            .catch(() => {});
        },
      },
      {
        text: 'Save one point',
        onPress: () => {
          void (async () => {
            let saved = false;
            try {
              if (!current() || Date.parse(request.expiresAt) <= Date.now()) return;
              const started = await report(request.requestId, 'start');
              if (started.status !== 'running') return;
              const receipt = await captureLocation(session.owner, {
                requestId: request.requestId,
                deviceId: session.deviceId,
                valid: async () => {
                  if (!current() || Date.parse(request.expiresAt) <= Date.now()) return false;
                  const checked = await report(request.requestId, 'check');
                  return (
                    current() &&
                    Date.parse(request.expiresAt) > Date.now() &&
                    checked.status === 'running'
                  );
                },
              });
              saved = true;
              if (current()) {
                await refreshed();
                const outcome = await report(request.requestId, 'complete', {
                  capturedAt: receipt.capturedAt,
                });
                if (terminal(outcome)) acknowledgeLocationCapture(session, request.requestId);
              }
            } catch (error) {
              if (saved) return; // A missing completion acknowledgment must never turn a saved point into a retrying native capture.
              const message = error instanceof Error ? error.message : '';
              const code = /permission was not granted/i.test(message)
                ? 'permission_denied'
                : /account, request or connection changed/i.test(message)
                  ? 'session_changed'
                  : 'capture_failed';
              try {
                await report(request.requestId, 'fail', { error: code });
              } catch {
                /* The journal preserves any saved effect for later acknowledgment. */
              }
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
