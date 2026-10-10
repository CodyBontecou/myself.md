import { errorJSON } from '../packages/support-chat/errors.js';
import { useEffect, useState } from 'react';
import { accountDeletionNotice } from '../core/account-deletion.js';
import { api, initializeSession, hasSession, signIn } from './session.js';
import { Button } from './components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card.js';
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
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            {status?.state === 'completed' ? 'Account deleted' : 'Delete your myself.md account'}
          </CardTitle>
          <CardDescription>{accountDeletionNotice}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <pre
              role="alert"
              className="whitespace-pre-wrap break-words font-mono text-sm text-destructive"
            >
              {errorJSON(error)}
            </pre>
          )}
          {started ? (
            <>
              <p role="status">
                {status.state === 'completed'
                  ? 'Your account and cloud data were deleted.'
                  : 'Account access is revoked. Cleanup retries automatically. An interrupted upload needs at least an hour; provider or storage failures may take longer.'}
              </p>
              {status.state !== 'completed' && !status.subject && (
                <Button asChild variant="outline">
                  <a href={location.href}>Refresh deletion status</a>
                </Button>
              )}
              {status.error && (
                <pre role="alert" className="whitespace-pre-wrap break-words font-mono text-xs">
                  {errorJSON(status.error)}
                </pre>
              )}
              {status.state !== 'completed' && status.subject && (
                <Button disabled={busy} onClick={() => void run(remove)}>
                  Retry deletion
                </Button>
              )}
            </>
          ) : status ? (
            <>
              <p className="text-sm">
                Signed in as {status.subject.slice(status.subject.indexOf('|') + 1)}.
              </p>
              {status.state === 'unavailable' ? (
                <pre role="alert" className="whitespace-pre-wrap break-words font-mono text-xs">
                  {errorJSON(status.error)}
                </pre>
              ) : (
                <>
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    I understand this permanently deletes my account and account-linked lifetime
                    access.
                  </label>
                  <Button
                    variant="destructive"
                    className="w-full"
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
              <p className="text-sm">Sign in to verify which account you want to delete.</p>
              <Button
                className="w-full"
                disabled={!ready || busy}
                onClick={() => void run(() => signIn('apple'))}
              >
                Sign in with Apple
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={!ready || busy}
                onClick={() => void run(() => signIn('github'))}
              >
                Continue with GitHub
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={!ready || busy}
                onClick={() => void run(() => signIn('google'))}
              >
                Continue with Google
              </Button>
            </>
          )}
          <a className="block text-center underline" href="/">
            Return to myself.md
          </a>
        </CardContent>
      </Card>
    </main>
  );
}
