/** Offline display fallbacks for exports whose OS label is only a bundle/package ID.
 * Identifiers remain unchanged for joins, goals and provenance. */
const names = new Map(
  Object.entries({
    'com.myself.md': 'myself.md',
    'md.obsidian': 'Obsidian',
    'com.atebits.Tweetie2': 'X',
    'com.apple.mobilesafari': 'Safari',
    'com.apple.Bridge': 'Watch',
    'com.google.ios.youtube': 'YouTube',
    'net.whatsapp.WhatsApp': 'WhatsApp',
    'com.bontecou.isome': 'iso.me',
    'com.openai.chat': 'ChatGPT',
    'tv.twitch': 'Twitch',
    'com.apple.TestFlight': 'TestFlight',
    'bontecou.Sync-md': 'Sync.md',
    'com.capitalone.enterprisemobilebanking': 'Capital One',
    'com.google.Maps': 'Google Maps',
    'com.reddit.Reddit': 'Reddit',
    'bontecou.Voxboard': 'Voxboard',
    'com.apple.Preferences': 'Settings',
    'com.google.ios.youtubemusic': 'YouTube Music',
    'com.google.PlayConsole': 'Google Play Console',
    'com.duolingo.DuolingoMobile': 'Duolingo',
    'com.apple.ScreenshotServicesService': 'Screenshots (system)',
    'com.apple.mobileslideshow': 'Photos',
    'com.apple.InCallService': 'Phone calls (system)',
    'com.burbn.instagram': 'Instagram',
    'com.apple.MobileSMS': 'Messages',
    'com.apple.mobilemail': 'Mail',
    'com.codybontecou.obsidianhealth': 'Obsidian Health',
    'com.apple.camera': 'Camera',
    'com.capitalone.travel': 'Capital One Travel',
    'com.apple.LocalAuthenticationUIService': 'Authentication (system)',
    'com.apple.AuthKitUIService': 'Apple Account sign-in (system)',
    'com.apple.SafariViewService': 'In-app browser (system)',
    'com.google.android.youtube': 'YouTube',
    'com.android.chrome': 'Chrome',
    'com.whatsapp': 'WhatsApp',
    'com.instagram.android': 'Instagram',
    'com.twitter.android': 'X',
  }),
);

/** Prefer the actual OS-supplied label. Never guess a name from identifier segments.
 * @param {string} identifier @param {unknown} displayName @param {string} type */
export function screenTimeAppName(identifier, displayName, type) {
  const label = typeof displayName === 'string' ? displayName.trim() : '';
  if (label && label !== identifier) return label.slice(0, 200);
  return (type === 'websites' ? undefined : names.get(identifier)) ?? identifier;
}
