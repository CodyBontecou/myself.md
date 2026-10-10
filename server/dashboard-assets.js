/** @type {Map<string, [string, string]>} */
export const assets = new Map([
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
  ['/demo', ['index.html', 'text/html']],
  ['/demo/', ['index.html', 'text/html']],
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
  ['/support', ['index.html', 'text/html']],
  ['/support/', ['index.html', 'text/html']],
  ['/claim', ['index.html', 'text/html']],
  ['/login', ['index.html', 'text/html']],
  ['/login/', ['index.html', 'text/html']],
  ['/dashboard', ['index.html', 'text/html']],
  ['/dashboard/', ['index.html', 'text/html']],
  ['/dashboard/callback', ['index.html', 'text/html']],
  ['/dashboard/public-tools.js', ['public-tools.js', 'text/javascript']],
  ['/sdk/myself.mjs', ['myself-sdk.mjs', 'text/javascript']],
  ['/cli/myself.mjs', ['myself.mjs', 'text/javascript']],
  ['/cli/notices.txt', ['cli-notices.txt', 'text/plain']],
  ['/dashboard/app.js', ['app.js', 'text/javascript']],
  ['/dashboard/style.css', ['style.css', 'text/css']],
  ['/dashboard/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/dashboard/store-badges/apple-icon.svg', ['store-badges/apple-icon.svg', 'image/svg+xml']],
  ['/dashboard/store-badges/github-icon.svg', ['store-badges/github-icon.svg', 'image/svg+xml']],
  ['/dashboard/store-badges/app-store.svg', ['store-badges/app-store.svg', 'image/svg+xml']],
  ['/dashboard/store-badges/google-play.png', ['store-badges/google-play.png', 'image/png']],
  ['/dashboard/store-badges/github.svg', ['store-badges/github.svg', 'image/svg+xml']],
]);
