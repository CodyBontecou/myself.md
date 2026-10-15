/** Shared public disclosures for the phone, website and MCP. */
export const privacyPolicy = {
  title: 'myself.md Privacy Policy',
  updated: '2026-10-15',
  url: 'https://myself.md/privacy',
  supportUrl: 'https://myself.md/contact',
  supportEmail: 'cody@isolated.tech',
  issuesUrl: 'https://github.com/CodyBontecou/myself.md/issues',
  discordUrl: 'https://discord.gg/RaQYS4t6gn',
  sections: [
    {
      title: 'What we collect and why',
      body: 'myself.md reads the health, screen time and location data you choose to export or share. Health data comes from HealthKit on iOS and Health Connect on Android, including readings, timestamps, units and the original source details. The app only reads your health store.\n\nYour phone’s permissions and your profile selection control what the app can read and export. HealthKit does not tell apps when read access is denied, so an empty result does not confirm permission. Screen-time data can include app or website identifiers and usage totals, depending on your phone and its permissions.',
    },
    {
      title: 'Location is optional',
      body: 'Capture current location saves a point on your phone with your permission. Background recording needs both foreground and background permission. It can save precise coordinates, timestamps and other location details while the app is closed.\n\nStop recording in Data sources or revoke location permission in your phone’s settings. This keeps existing points. The app cannot recover location history from before you started recording.',
    },
    {
      title: 'Where data goes',
      body: 'Each profile chooses the data types, date range and destination for an export. You can save files on your phone, send them to your own HTTPS endpoint, or use the paired cloud service. Remote exports send the selected records and their details to that destination. Local exports do not need agent access.\n\nUploading to the cloud and sharing with agents are separate permissions. Live phone reads need your approval on the phone and an approved profile. Reading stored cloud data needs cloud sharing approval.\n\nSigning in also uses your account identity, sessions and connected-phone details. Purchases use store verification and purchase-access records. For cloud storage subscriptions, we keep the store, product, renewal and expiry status and the store transaction or purchase-token identifiers. The app sends Apple or Google an opaque identifier derived from your account with the purchase, so one subscription stays with one account. Apple and Google process payment details; we do not receive card numbers.',
    },
    {
      title: 'App updates and launch recovery',
      body: 'The phone app checks Expo’s update service for compatible app updates. These automatic checks send a random installation identifier and app, platform and runtime version information. After a failed launch, a later update check can also send a short error message so the update service can help recover from the failure. These checks do not depend on signing in and there is no in-app switch to turn them off.\n\nExpo processes this information to deliver updates and recover from launch failures. Error text may contain details about the failure. This is separate from the optional debug reports and agent log access described below.',
    },
    {
      title: 'Cloud storage and retention',
      body: 'We use Cloudflare to host the service. A private R2 bucket stores encrypted exports. Account storage holds identity, sharing permissions, phones, billing, subscription and activity details.\n\nExport files and their manifests are encrypted in storage. The service decrypts them for approved reads, so this is not end-to-end encryption.\n\nCompleted cloud exports stay until you delete or replace them, or delete your account, with two exceptions. If a paid cloud storage subscription ends while you keep Lifetime access and use more than the included 100 MB, we keep your files for 30 days, then delete the oldest exports until usage is 100 MB or less unless you resubscribe or delete files first. If Apple or Google refunds or revokes your Lifetime purchase, we delete all your cloud exports immediately. Moving to a smaller plan does not delete files. Unfinished uploads expire after one hour. We remove unfinished uploads during cloud operations and background cleanup, and retry failed deletions. Activity older than 90 days is cleaned up when you view history. Account, sharing, subscription and billing records stay until you delete your account.\n\nWe send cloud storage notices, such as reminders before deletion and confirmations after it, as push notifications through Expo’s notification service to phones signed in to your account, and by email to your account’s sign-in email address. Emails come from support@myself.md and are delivered through Cloudflare Email Service, which processes your address and the message. These notices are part of the service and are not marketing.\n\nFiles and recorded points on your phone do not expire automatically. Your own server or export destination may have different storage and backup rules.',
    },
    {
      title: 'After sharing with an AI provider',
      body: 'Connecting an agent can send your approved records to an AI service such as ChatGPT, Claude or Grok. That service may keep results in conversations, logs or other storage. Its terms, privacy policy and your account settings control how it uses them.\n\nWe cannot guarantee that another service will avoid training on your data, keep it for a set time, or delete an existing copy. Check its settings before sharing health or location data. Revoking access stops future reads but does not remove copies already sent. Delete those conversations or ask the provider to remove its copies.\n\nWe use your records for the exports and sharing you request. We do not use them for advertising or sell health data.',
    },
    {
      title: 'Revocation and deletion',
      body: 'To stop future collection or sharing, revoke permissions in your phone’s settings, turn off profile agent access or cloud sharing, and stop automatic exports. Disconnecting a phone stops its connection but keeps cloud exports and copies sent elsewhere.\n\nYou can delete cloud exports in the dashboard. Stop their export schedules too, or the app may upload them again.\n\nTo delete your account, use Settings → Your account → Delete account or the website’s Delete account page. After you confirm, we remove cloud exports, sharing permissions, phones, activity history, identity and account access. Failed storage or identity cleanup stays pending or failed until it succeeds.\n\nStarting deletion on the phone also stops recording and clears that phone’s account-owned app data, files and credentials. Deleting from the website or through an agent cannot erase another phone’s local files, your own stored copies, or data another service has received. Health and screen-time data stay in their system apps.',
    },
    {
      title: 'Limited records after account deletion',
      body: 'We keep a deletion-status receipt for seven days and a small record that rejects old credentials. We also keep purchase identifiers to prevent duplicate claims, without the account link or receipt proof.\n\nDeleting your account does not cancel store subscriptions or issue refunds. Cancel cloud storage subscriptions in your Apple account subscriptions or Google Play subscriptions before or after deleting your account, and request refunds from the store. Delete copies in other services, AI providers or your own backups separately.',
    },
    {
      title: 'ChatGPT plugin connection',
      body: 'The dedicated /mcp/chatgpt connection exposes approved data discovery and reads through a separate OAuth resource. It does not expose diagnostic reports, captured request credentials, raw phone error messages, support-message delivery, deletion or purchase/upgrade flows. Phone catalogs on this connection omit diagnostic/feedback reports and HTTP export destinations. The broader app and other MCP endpoint retain their separately consented capabilities. Health and recorded-location results still require your existing profiles and data grants. Do not submit protected health information, government identifiers or authentication secrets through this connection.',
    },
    {
      title: 'Debug logs',
      body: 'Logs → Share & agent access shows up to 300 recent app events, kept on your phone for seven days. These include times, actions, results, request durations and HTTP status codes. We always record raw error messages, which may contain sensitive information.\n\nSeparate switches let you include record excerpts, request credentials and URLs. These are off by default. Turning one on includes that field in future events. Turning it off removes saved structured fields but leaves raw error text. Credentials can give someone access to your account. Record excerpts are limited and do not contain a full export.\n\nYou can review a JSON report and share it through your phone’s share sheet. Agent log access is off by default and needs approval on the phone. When enabled, the app sends the configured report to the paired service while open. Reports stay in memory for up to five minutes. An agent can read them only if the phone has sent a heartbeat within the last 15 seconds.\n\nTurn off agent log access to stop future reads. Copies already shared follow the recipient’s retention policy. These logs do not capture native crashes.',
    },
    {
      title: 'Support conversations',
      body: 'Support chat stores messages with your account when you are signed in. On the phone, you can also chat as a guest. A random support-only credential is saved securely on this phone; guest history is separate from your account and cannot be recovered without that credential. Signing in does not automatically transfer guest history. Delete guest conversations from their conversation options; deleting an account does not delete separate guest conversations. Our bot sends them to a private Discord support channel, where designated staff can reply. Their text replies appear in your conversation.\n\nMessages are encrypted in myself.md storage and kept until account deletion. Discord holds a separate copy under its own terms and privacy policy. Support chat is not end-to-end encrypted.\n\nDeleting your account removes the app conversation and its Discord thread. We retry failed cleanup before marking deletion complete. Discord backups and copies staff made elsewhere may remain under their own retention rules.\n\nAgents can read and send support messages only after you enable support access. Blocking an agent or revoking that access stops future access. Keep health records, precise location, credentials and receipts out of support chat. You can also contact us by email or public GitHub issue.',
    },
    {
      title: 'Website analytics and search',
      body: 'The hosted website uses Cloudflare Web Analytics to measure page views and performance without analytics cookies or local-storage identifiers. Cloudflare processes website visit and performance information; this is separate from your health, screen-time and location exports. Analytics injection is disabled for visitors in the European Union.\n\nWe use Google Search Console to understand how the public website appears in Google Search. Search Console domain verification uses a DNS record, not a Google Analytics tracking script.',
    },
    {
      title: 'Support and policy changes',
      body: 'Use the support links below for app help, privacy questions or deletion questions. Check a bug report’s text and screenshots before sending it; GitHub issues may be public.\n\nThe date above shows when this policy was updated. Review it before enabling new data sharing.',
    },
  ],
};
