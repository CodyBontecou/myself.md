import { IconBrandAppleFilled, IconBrandGithubFilled } from '@tabler/icons-react';
import { Button } from './components/ui/button.js';

function GooglePlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7">
      <path fill="#4285F4" d="M3 2v20l10-10Z" />
      <path fill="#34A853" d="m3 2 12 7-5 3Z" />
      <path fill="#EA4335" d="m3 22 12-7-5-3Z" />
      <path fill="#FBBC04" d="m15 9 6 3-6 3-5-3Z" />
    </svg>
  );
}

export function DownloadBadges() {
  return (
    <div aria-label="Get myself.md" className="-ml-1.5 flex flex-wrap items-center gap-3">
      {[
        { label: 'App Store', icon: IconBrandAppleFilled, color: 'text-foreground' },
        { label: 'Google Play', icon: GooglePlayIcon, color: '' },
      ].map(({ label, icon: Icon, color }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="icon"
          className={`size-10 disabled:opacity-100 ${color}`}
          disabled
          aria-label={`${label} — coming soon`}
          title={`${label} — coming soon`}
        >
          <Icon aria-hidden="true" className="size-7" />
        </Button>
      ))}
      <Button asChild variant="ghost" size="icon" className="size-10">
        <a
          href="https://github.com/CodyBontecou/agent-bridge"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View myself.md on GitHub"
          title="View source on GitHub"
        >
          <IconBrandGithubFilled aria-hidden="true" className="size-7" />
        </a>
      </Button>
    </div>
  );
}
