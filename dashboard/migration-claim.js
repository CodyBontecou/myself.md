import { errorJSON } from '../packages/support-chat/errors.js';
import { useEffect, useState } from 'react';
import { api, initializeSession, hasSession, signIn, signOut } from './session.js';
import { Button } from './components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card.js';
export function MigrationClaim() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const ticket = location.hash.slice(1);
    if (/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
      sessionStorage.setItem('myself-migration-ticket', ticket);
      history.replaceState(null, '', '/claim');
    }
    void initializeSession()
      .then(async () => {
        if (hasSession()) {
          const identity = /** @type {{account:string}} */ (await api('/api/dashboard'));
          setAccount(identity.account);
          setSignedIn(true);
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
  async function claim() {
    const ticket = sessionStorage.getItem('myself-migration-ticket');
    if (!ticket) throw new Error('Open “Claim myself.md access” in health.md or iso.me to start.');
    await api('/api/migration/claim', 'POST', { ticket });
    sessionStorage.removeItem('myself-migration-ticket');
    setClaimed(true);
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {claimed ? 'Your lifetime access is ready' : 'Claim free myself.md access'}
          </CardTitle>
          <CardDescription>
            {claimed
              ? `Lifetime access is linked to ${account}. Sign in with the same account in myself.md on iOS or Android.`
              : 'Your qualifying health.md or iso.me purchase includes complimentary lifetime access. Sign in to choose the account that will receive it.'}
          </CardDescription>
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
          {claimed ? (
            <>
              <a className="block text-center underline" href="qrconnect://account">
                Open myself.md
              </a>
              <a className="block text-center underline" href="/">
                Download myself.md
              </a>
            </>
          ) : signedIn ? (
            <>
              <p className="text-sm">
                Claim for <strong>{account}</strong>. Each original purchase can be linked to one
                account.
              </p>
              <Button className="w-full" disabled={busy} onClick={() => void run(claim)}>
                {busy ? 'Claiming…' : 'Claim lifetime access'}
              </Button>
              <Button className="w-full" variant="outline" disabled={busy} onClick={signOut}>
                Use another account
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
