/** @type {Map<string, [string, string]>} */
export const assets = new Map([
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
  ['/claim', ['index.html', 'text/html']],
  ['/login', ['index.html', 'text/html']],
  ['/login/', ['index.html', 'text/html']],
  ['/dashboard', ['index.html', 'text/html']],
  ['/dashboard/', ['index.html', 'text/html']],
  ['/dashboard/callback', ['index.html', 'text/html']],
  ['/dashboard/app.js', ['app.js', 'text/javascript']],
  ['/dashboard/style.css', ['style.css', 'text/css']],
  ['/dashboard/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/dashboard/store-badges/app-store.svg', ['store-badges/app-store.svg', 'image/svg+xml']],
  ['/dashboard/store-badges/google-play.png', ['store-badges/google-play.png', 'image/png']],
  ['/dashboard/store-badges/f-droid.svg', ['store-badges/f-droid.svg', 'image/svg+xml']],
  ['/dashboard/store-badges/github.svg', ['store-badges/github.svg', 'image/svg+xml']],
]);
