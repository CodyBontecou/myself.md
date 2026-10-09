import { privacyPolicy } from '../core/privacy.js';

/** @param {{support?:boolean}} props */
export function PrivacyPage({ support = false }) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 sm:p-10">
      <nav className="flex flex-wrap gap-4 text-sm underline" aria-label="Privacy and support">
        <a href="/">myself.md</a>
        <a href="/privacy">Privacy policy</a>
        <a href="/support">Support</a>
        <a href="/delete-account">Delete account</a>
      </nav>
      <h1 className="text-3xl font-semibold">
        {support ? 'Contact support' : privacyPolicy.title}
      </h1>
      {support ? (
        <p>For app help or privacy and deletion questions, use our support contact below.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Updated {privacyPolicy.updated}</p>
          {privacyPolicy.sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="leading-relaxed">{section.body}</p>
            </section>
          ))}
        </>
      )}
      <p className="text-sm text-muted-foreground">
        Do not send health records, precise location, credentials or receipts in an initial request.
      </p>
      <div className="flex flex-wrap gap-4">
        <a className="underline" href={`mailto:${privacyPolicy.supportEmail}`}>
          {privacyPolicy.supportEmail}
        </a>
        <a className="underline" href={privacyPolicy.issuesUrl}>
          GitHub issues (public)
        </a>
      </div>
    </main>
  );
}
