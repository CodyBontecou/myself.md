import { AccountError } from './account-error.js';
import { errorJSON } from '../packages/support-chat/errors.js';
import { useEffect, useState } from 'react';
import { accountDeletionNotice } from '../core/account-deletion.js';
import { api, initializeSession, hasSession, signIn } from './session.js';
import { Button } from './components/ui/button.js';
import { AccountPage, AccountSignIn } from './account-page.js';
export function AccountDeletion() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    /** @type {import('../core/account-deletion.js').DeletionStatus|null} */ (null),
  );
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (location.pathname === '/delete-account')
      sessionStorage.setItem('myself-delete-account', location.search);
    const receipt = new URLSearchParams(location.search).get('receipt');
    if (receipt && /^[A-Za-z0-9_-]{43}$/.test(receipt)) {
      void fetch(`/api/account-deletion/${receipt}`, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Deletion status receipt expired.');
          const result =
            /** @type {Pick<import('../core/account-deletion.js').DeletionStatus,'state'|'error'>} */ (
              await response.json()
            );
          setStatus({ ...result, subject: '', notice: accountDeletionNotice });
          return undefined;
        })
        .catch((reason) => setError(errorJSON(reason)))
        .finally(() => setReady(true));
      return;
    }
    void initializeSession()
      .then(async () => {
        if (hasSession()) {
          const current = /** @type {import('../core/account-deletion.js').DeletionStatus} */ (
            await api('/api/account')
          );
          const expected = new URLSearchParams(
            sessionStorage.getItem('myself-delete-account') ?? '',
          ).get('subject');
          if (expected && expected !== current.subject)
            throw new Error('Sign in with the same account as the agent requesting deletion.');
          setStatus(current);
        }
        return undefined;
      })
      .catch((reason) => setError(errorJSON(reason)))
      .finally(() => setReady(true));
  }, []);
  /** @param {()=>Promise<unknown>} action */
  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(errorJSON(reason));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!status || !confirmed) return;
    const result = /** @type {import('../core/account-deletion.js').DeletionStatus} */ (
      await api('/api/account', 'DELETE', { confirmation: 'DELETE', subject: status.subject })
    );
    setStatus(result);
    if (result.statusUrl) history.replaceState(null, '', result.statusUrl);
    if (result.state === 'completed') sessionStorage.removeItem('myself-delete-account');
  }
  const started = status && ['running', 'failed', 'completed'].includes(status.state);
  return (
    <AccountPage
      eyebrow="Account management"
      title={
        status?.state === 'completed' ? 'Your account has been deleted.' : 'Delete your account.'
      }
      description={
        status?.state === 'completed'
          ? 'Your account and cloud data were deleted.'
          : 'Review what will be removed, then sign in to confirm the account. This cannot be undone.'
      }
      wide
    >
      {error && (
        <AccountError
          error={error}
          actionHref="/delete-account"
          actionLabel="Open account deletion"
        />
      )}
      <div className="account-deletion-layout">
        <section className="account-deletion-notice" aria-labelledby="deletion-details">
          <h2 id="deletion-details">What account deletion means</h2>
          <ul className="account-consequences">
            <li>
              <strong>Your account and cloud data are removed</strong>
              <p>
                This includes cloud exports, sharing permissions, connected phones, history, support
                conversation and its Discord thread, and account-linked Lifetime access.
              </p>
            </li>
            <li>
              <strong>Your own files stay where they are</strong>
              <p>
                Source data in system apps, files in your own storage, and copies on other phones
                are outside this cloud account.
              </p>
            </li>
            <li>
              <strong>Manage subscriptions separately</strong>
              <p>
                Deletion does not cancel store subscriptions or issue refunds. Manage them with
                Apple or Google.
              </p>
            </li>
          </ul>
          <details className="account-disclosure">
            <summary>Full deletion and retention notice</summary>
            <p>{accountDeletionNotice}</p>
          </details>
        </section>
        <section className="account-actions" aria-label="Account verification and deletion">
          {started ? (
            <>
              <div className="account-notice" role="status">
                <strong>
                  {status.state === 'completed' ? 'Deletion complete' : 'Cleanup in progress'}
                </strong>
                <p>
                  {status.state === 'completed'
                    ? 'Your account and cloud data were deleted.'
                    : 'Account access is revoked. Cleanup retries automatically. An interrupted upload needs at least an hour; provider or storage failures may take longer.'}
                </p>
              </div>
              {status.state !== 'completed' && !status.subject && (
                <Button asChild className="account-action" variant="outline">
                  <a href={location.href}>Refresh deletion status</a>
                </Button>
              )}
              {status.error && (
                <AccountError
                  error={status.error}
                  actionHref="/delete-account"
                  actionLabel="Open account deletion"
                />
              )}
              {status.state !== 'completed' && status.subject && (
                <Button className="account-action" disabled={busy} onClick={() => void run(remove)}>
                  Retry deletion
                </Button>
              )}
            </>
          ) : status ? (
            <>
              <div className="account-notice">
                <strong>Signed in as</strong>
                <p className="account-identity">
                  {status.subject.slice(status.subject.indexOf('|') + 1)}
                </p>
              </div>
              {status.state === 'unavailable' ? (
                <AccountError
                  error={status.error}
                  actionHref="/delete-account"
                  actionLabel="Open account deletion"
                />
              ) : (
                <>
                  <label className="account-confirmation">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    <span>
                      I understand this permanently deletes my account and account-linked lifetime
                      access.
                    </span>
                  </label>
                  <Button
                    variant="destructive"
                    className="account-action"
                    disabled={busy || !confirmed}
                    onClick={() => void run(remove)}
                  >
                    {busy ? 'Deleting…' : 'Permanently delete account'}
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              <div>
                <h2>Verify your account</h2>
                <p className="account-fine-print">
                  Sign in to verify which account you want to delete.
                </p>
              </div>
              <AccountSignIn
                disabled={!ready || busy}
                onSignIn={(provider) => void run(() => signIn(provider))}
              />
              <p className="account-fine-print">
                Signing in does not delete anything. You’ll confirm deletion in a separate step.
              </p>
            </>
          )}
        </section>
      </div>
    </AccountPage>
  );
}
