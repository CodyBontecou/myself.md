import { AccountError } from './account-error.js';
import { errorJSON } from '../packages/support-chat/errors.js';
import { useEffect, useState } from 'react';
import { api, initializeSession, hasSession, signIn, signOut } from './session.js';
import { Button } from './components/ui/button.js';
import { AccountPage, AccountSignIn } from './account-page.js';
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
    if (!ticket)
      throw new Error('Open “Claim myself.md access” in health.md, iso.me, or time.md to start.');
    await api('/api/migration/claim', 'POST', { ticket });
    sessionStorage.removeItem('myself-migration-ticket');
    setClaimed(true);
  }
  return (
    <AccountPage
      eyebrow="Existing customers"
      title={
        claimed ? 'Your Lifetime access is ready.' : 'A purchase you already made. Access for life.'
      }
      description={
        claimed
          ? `Lifetime access is linked to ${account}. Sign in with the same account in myself.md on iOS or Android.`
          : 'Your qualifying health.md, iso.me, or time.md purchase includes complimentary Lifetime access to myself.md.'
      }
    >
      {error && <AccountError error={error} actionHref="/claim" actionLabel="Open claim access" />}
      {claimed ? (
        <div className="account-actions">
          <div className="account-notice">
            <strong>All set</strong>
            <p>Your purchase has been verified and access is linked to this account.</p>
          </div>
          <Button asChild className="account-action">
            <a href="myselfmd://account">Open myself.md</a>
          </Button>
          <a className="account-text-link" href="/">
            Get myself.md
          </a>
        </div>
      ) : signedIn ? (
        <div className="account-actions">
          <div className="account-notice">
            <strong>Claim for this account</strong>
            <p className="account-identity">{account}</p>
            <p>
              Each original purchase can be linked to one account. Check this is the account you
              want to keep.
            </p>
          </div>
          <Button className="account-action" disabled={busy} onClick={() => void run(claim)}>
            {busy ? 'Claiming…' : 'Claim Lifetime access'}
          </Button>
          <Button className="account-action" variant="outline" disabled={busy} onClick={signOut}>
            Use another account
          </Button>
        </div>
      ) : (
        <div className="account-actions">
          <p className="account-section-label">Sign in to choose the account receiving access</p>
          <AccountSignIn
            disabled={!ready || busy}
            onSignIn={(provider) => void run(() => signIn(provider))}
          />
          <div className="account-notice">
            <strong>Start with purchase verification</strong>
            <p>
              Verify your eligible purchase through health.md, iso.me, or time.md first. Follow its
              claim link back here to sign in and confirm your account.
            </p>
          </div>
          <p className="account-fine-print">
            Signing in alone does not claim access. You’ll review the account before confirming.
          </p>
        </div>
      )}
    </AccountPage>
  );
}
