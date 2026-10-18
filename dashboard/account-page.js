import { providerLogos } from '../server/provider-logos.js';
import { Button } from './components/ui/button.js';

/** @param {{eyebrow:string,title:string,description:string,children:import('react').ReactNode,wide?:boolean}} props */
export function AccountPage({ eyebrow, title, description, children, wide = false }) {
  return (
    <div className="account-page">
      <header className="account-brand">
        <a href="/" aria-label="myself.md home">
          myself<span>.md</span>
        </a>
      </header>
      <main className={`account-card${wide ? ' account-card-wide' : ''}`}>
        <p className="account-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="account-intro">{description}</p>
        {children}
        <nav className="account-footer" aria-label="Return and privacy">
          <a href="/">Back to myself.md</a>
          <a href="/privacy">Privacy</a>
        </nav>
      </main>
    </div>
  );
}

/** @param {{disabled:boolean,onSignIn:(provider:'apple'|'github'|'google')=>void}} props */
export function AccountSignIn({ disabled, onSignIn }) {
  return (
    <div className="account-providers">
      {
        /** @type {const} */ (['apple', 'github', 'google']).map((provider) => (
          <Button
            key={provider}
            className="account-provider"
            variant="outline"
            disabled={disabled}
            onClick={() => onSignIn(provider)}
          >
            <span
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: providerLogos[provider] }}
            />
            <span>
              Continue with{' '}
              {provider === 'apple' ? 'Apple' : provider === 'github' ? 'GitHub' : 'Google'}
            </span>
          </Button>
        ))
      }
    </div>
  );
}
