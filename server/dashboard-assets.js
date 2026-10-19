/** @type {Map<string, [string, string]>} */
export const assets = new Map([
  ['/dashboard/blog.css', ['blog.css', 'text/css']],
  ['/share/profile', ['profile-share/share/profile/index.html', 'text/html']],
  ['/share/profile/', ['profile-share/share/profile/index.html', 'text/html']],
  ['/share/profile/app.js', ['profile-share/share/profile/app.js', 'text/javascript']],
  ['/dashboard/docs.css', ['docs.css', 'text/css']],
  ...['regular', 'medium', 'semibold'].map(
    (weight) =>
      /** @type {[string,[string,string]]} */ ([
        `/dashboard/geist-${weight}.ttf`,
        [`geist-${weight}.ttf`, 'font/ttf'],
      ]),
  ),
  ['/dashboard/geist-license.txt', ['geist-license.txt', 'text/plain']],
  ['/', ['index.html', 'text/html']],
  ['/datasets', ['index.html', 'text/html']],
  ['/datasets/', ['index.html', 'text/html']],
  ...['health', 'screen-time', 'location', 'all'].flatMap(
    (dataset) =>
      /** @type {[string, [string, string]][]} */ ([
        [`/datasets/${dataset}`, ['index.html', 'text/html']],
        [`/datasets/${dataset}/`, ['index.html', 'text/html']],
      ]),
  ),
  ['/delete-account', ['index.html', 'text/html']],
  ['/privacy', ['index.html', 'text/html']],
  ['/privacy/', ['index.html', 'text/html']],
  ['/claim', ['index.html', 'text/html']],
  ['/login', ['index.html', 'text/html']],
  ['/login/', ['index.html', 'text/html']],
  ['/operator/analytics', ['index.html', 'text/html']],
  ['/dashboard', ['index.html', 'text/html']],
  ['/dashboard/', ['index.html', 'text/html']],
  ['/dashboard/callback', ['index.html', 'text/html']],
  ['/dashboard/usage-analytics.js', ['usage-analytics.js', 'text/javascript']],
  ['/dashboard/analytics.css', ['analytics.css', 'text/css']],
  ['/dashboard/public-tools.js', ['public-tools.js', 'text/javascript']],
  ['/sdk/myself.mjs', ['myself-sdk.mjs', 'text/javascript']],
  ['/cli/myself.mjs', ['myself.mjs', 'text/javascript']],
  ['/cli/notices.txt', ['cli-notices.txt', 'text/plain']],
  ['/dashboard/app.js', ['app.js', 'text/javascript']],
  ['/dashboard/style.css', ['style.css', 'text/css']],
  ...['apple-health', 'google-maps', 'google-chrome'].map(
    (name) =>
      /** @type {[string, [string, string]]} */ ([
        `/dashboard/brand-icons/${name}.png`,
        [`brand-icons/${name}.png`, 'image/png'],
      ]),
  ),
  ...[
    'claude-code',
    'codex',
    'opencode',
    'openclaw',
    'grokbot',
    'chatgpt',
    'dots',
    'muse',
    'pi',
  ].map(
    (name) =>
      /** @type {[string,[string,string]]} */ ([
        `/dashboard/agent-logos/${name}.svg`,
        [`agent-logos/${name}.svg`, 'image/svg+xml'],
      ]),
  ),
  ...['selection', 'approval', 'overview'].flatMap(
    (name) =>
      /** @type {[string,[string,string]][]} */ ([
        [`/dashboard/showcase/${name}.mp4`, [`showcase/${name}.mp4`, 'video/mp4']],
        [`/dashboard/showcase/${name}.jpg`, [`showcase/${name}.jpg`, 'image/jpeg']],
      ]),
  ),
  ['/dashboard/favicon.png', ['favicon.png', 'image/png']],
  ['/dashboard/hero-portrait.png', ['hero-portrait.png', 'image/png']],
  ['/dashboard/store-badges/apple-icon.svg', ['store-badges/apple-icon.svg', 'image/svg+xml']],
  ['/dashboard/store-badges/github-icon.svg', ['store-badges/github-icon.svg', 'image/svg+xml']],
  ['/dashboard/store-badges/app-store.svg', ['store-badges/app-store.svg', 'image/svg+xml']],
  ['/dashboard/store-badges/google-play.png', ['store-badges/google-play.png', 'image/png']],
  ['/dashboard/store-badges/github.svg', ['store-badges/github.svg', 'image/svg+xml']],
]);
