/** Shared public disclosures for the phone, website and MCP. */
export const privacyPolicy = {
  title: 'myself.md Privacy Policy',
  updated: '2026-10-10',
  url: 'https://myself.md/privacy',
  supportUrl: 'https://myself.md/support',
  supportEmail: 'cody@isolated.tech',
  issuesUrl: 'https://github.com/CodyBontecou/myself.md/issues',
  sections: [
    {
      title: 'What we collect and why',
      body: 'myself.md lets you export and share your health, screen time and recorded location data. HealthKit on iOS and Health Connect on Android supply readable samples, timestamps, units and native metadata. The app requests read permission; it does not write to your health store. OS permission and your profile selection control what can be read and exported. HealthKit hides read denial, so an empty result does not prove permission. Screen time can include application or website identifiers and usage totals, subject to system availability and permission.',
    },
    {
      title: 'Location is optional',
      body: 'Capture current location records a point on your phone with your permission. Optional background recording requires foreground and background permission and can record precise coordinates, timestamps and other native location fields while the app is not open. Stop recording in Data sources or revoke permission in system settings. Stopping does not delete existing points. The app cannot retrieve location history from before you started recording.',
    },
    {
      title: 'Where data goes',
      body: 'Profiles choose data types, date ranges and a destination: app files on your phone, your HTTPS endpoint, or the paired cloud service. Local exports do not require agent access. Remote exports send the selected records and metadata to that destination. Cloud upload authorization and access by agents are separate controls. Live agent reads require phone grants and an approved profile; stored cloud reads require cloud sharing approval. Signing in also processes your account identity, sessions and connected-device information. Purchases process store verification and entitlement information.',
    },
    {
      title: 'Cloud storage and retention',
      body: 'The hosted myself.md service uses Cloudflare infrastructure, including a private R2 bucket for encrypted exports and account storage for identity, grants, devices, billing and activity metadata. Export content and manifests are encrypted at rest; the service decrypts content for authorized reads, so this is not end-to-end encryption. Completed cloud exports expire after 30 days; unfinished uploads expire after one hour. Expiry cleanup runs during cloud operations and background cleanup; failed physical deletion is retried. Activity history has a separate 90-day cleanup window when history is listed. Account, grant and billing records remain until account deletion. Local recorded points and files have no automatic cloud-style expiry. Self-hosted services and your own destinations are controlled by their operators and may have different storage and backup practices.',
    },
    {
      title: 'After sharing with an AI provider',
      body: 'An agent connection can deliver approved records to the AI service you connect, such as ChatGPT, Claude or Grok. That provider may keep tool results in conversations, logs or other storage, and may use them according to its own terms, privacy policy and your account settings. myself.md cannot promise that a provider will avoid training, retain data for a particular period, or erase an existing copy. Review that provider’s settings before sharing sensitive health or location data. Revoking access stops future authorized reads; it does not recall past results. Delete conversations or request deletion directly from the provider to address its copies. myself.md uses these records for your requested exports and sharing, not advertising or selling health data.',
    },
    {
      title: 'Revocation and deletion',
      body: 'Revoke OS permissions in system settings, turn off profile agent access or cloud sharing, and stop automatic exports to prevent future collection or delivery. Disconnecting a phone revokes its connection but does not erase previously stored cloud exports or copies sent elsewhere. Delete cloud exports from the dashboard; scheduled exports may recreate them unless you stop the schedule. Settings → Your account → Delete account and the website’s Delete account page remove cloud exports, sharing permissions, phones, activity history, identity and account-linked access after confirmation. Storage or identity failures remain pending or failed until cleanup succeeds. Deletion started on the phone also stops recording and clears that phone’s account-owned app data, files and credentials. Website or agent deletion cannot erase another phone’s local copies, files in your storage, or data already received by another service. System health and screen-time data remain in their system apps.',
    },
    {
      title: 'Limited records after account deletion',
      body: 'A deletion-status receipt is retained for seven days. A minimal deletion tombstone rejects old credentials. Purchase identifiers remain without the account association or receipt proof to prevent duplicate claims. Deletion does not cancel store subscriptions or issue refunds. Copies in external destinations, AI providers or your own backups require separate deletion through those services.',
    },
    {
      title: 'Debug logs',
      body: 'Logs → Share & agent access shows up to 300 recent app events retained locally for seven days: event times, operations, outcomes, request durations and HTTP status. Raw error messages are always recorded and may themselves include sensitive information. Records, request credentials and URLs have separate phone-owner inclusion switches, off by default. Enabled fields are captured for future logged events; disabling removes retained structured fields but does not redact error text. Credentials can grant access to accounts. Records are bounded excerpts, not full exports. You can review and manually share a JSON report using the phone’s share sheet. Agent log access is off by default and requires approval on the phone. Enabling it sends the configured report to the paired service while the app is open; reports are held in memory for up to five minutes and agent reads require a heartbeat within 15 seconds. Turn it off to stop future access. Copies already sent to a recipient or AI service remain under that recipient’s retention policy. Native crashes are not captured.',
    },
    {
      title: 'Support conversations',
      body: 'If you use support chat in the app or web dashboard, your message text is stored with your account and relayed through our bot to a private Discord support channel. Designated support staff can reply there; their text replies appear in your conversation. Support messages are encrypted in the myself.md account store and retained until account deletion. Discord processes a separate copy under its terms and privacy policy; this is not end-to-end encrypted. Account deletion removes the app conversation and its Discord thread, with failed cleanup retried before completion. Discord backups and any copies staff made outside that thread may remain under their own retention rules. Connected agents can read and send support messages only after you enable support access; blocking an agent or revoking support access stops future access. Do not include health records, precise location, credentials or receipts. Email and public GitHub issues remain alternative support channels.',
    },
    {
      title: 'Support and policy changes',
      body: 'Use the support link below for app help and privacy or deletion questions. If you submit a bug report, review its text and screenshot before sending; a GitHub issue may be public. This policy’s update date identifies the current disclosures. Review it again before enabling new data sharing.',
    },
  ],
};
