export function DownloadBadges() {
  return (
    <div aria-label="Get myself.md" className="flex flex-wrap items-start gap-3">
      <div className="space-y-2">
        <button
          type="button"
          disabled
          aria-label="App Store — coming soon"
          className="download-badge download-badge-apple"
        >
          <img
            src="/dashboard/store-badges/app-store.svg"
            width="120"
            height="40"
            alt="Download on the App Store"
          />
        </button>
        <p className="text-xs text-muted-foreground">Coming soon</p>
      </div>
      <div className="space-y-2">
        <button
          type="button"
          disabled
          aria-label="Google Play — coming soon"
          className="download-badge download-badge-google"
        >
          <img
            src="/dashboard/store-badges/google-play.png"
            width="646"
            height="250"
            alt="Get it on Google Play"
          />
        </button>
        <p className="text-xs text-muted-foreground">Coming soon</p>
      </div>
      <div className="space-y-2">
        <button
          type="button"
          disabled
          aria-label="F-Droid — coming soon"
          className="download-badge download-badge-google"
        >
          <img
            src="/dashboard/store-badges/f-droid.svg"
            width="646"
            height="250"
            alt="Get it on F-Droid"
          />
        </button>
        <p className="text-xs text-muted-foreground">Coming soon</p>
      </div>
      <a
        href="https://github.com/CodyBontecou/agent-bridge"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View myself.md on GitHub"
        className="download-badge download-badge-source rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring hover:opacity-80"
      >
        <span>VIEW THE SOURCE</span>
        <img src="/dashboard/store-badges/github.svg" alt="GitHub" />
      </a>
    </div>
  );
}
