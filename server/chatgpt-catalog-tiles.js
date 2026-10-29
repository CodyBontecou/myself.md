const projectY = (/** @type {number} */ latitude) =>
  (1 -
    Math.log(Math.tan((latitude * Math.PI) / 180) + 1 / Math.cos((latitude * Math.PI) / 180)) /
      Math.PI) /
  2;

/** On-demand public tiles for the catalog's fixed fictional San Juan extent.
 * @param {Request} request
 * @param {{match:(key:Request)=>Promise<Response|undefined>,put:(key:Request,value:Response)=>Promise<void>}|undefined} cache
 * @param {typeof fetch} [read] */
export async function catalogMapTileResponse(request, cache, read = fetch) {
  const url = new URL(request.url);
  const globalMap = url.pathname.startsWith('/apps/chatgpt/map-tiles/');
  if (!globalMap && !url.pathname.startsWith('/apps/chatgpt/tiles/')) return null;
  const match = url.pathname.match(
    /^\/apps\/chatgpt\/(?:map-tiles|tiles)\/(\d+)\/(\d+)\/(\d+)\.png$/,
  );
  const z = Number(match?.[1]),
    x = Number(match?.[2]),
    y = Number(match?.[3]),
    n = 2 ** z;
  if (
    !match ||
    url.search ||
    !['GET', 'HEAD'].includes(request.method) ||
    z < (globalMap ? 0 : 8) ||
    z > 17 ||
    x < 0 ||
    y < 0 ||
    x >= n ||
    y >= n ||
    (!globalMap &&
      ((x + 1) / n < (180 - 66.3) / 360 ||
        x / n > (180 - 65.9) / 360 ||
        (y + 1) / n < projectY(18.6) ||
        y / n > projectY(18.25)))
  )
    return new Response('Unknown catalog map tile.', { status: 404 });
  const key = new Request(url.origin + url.pathname);
  let response = await cache?.match(key);
  if (!response) {
    let upstream;
    try {
      upstream = await read(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
        headers: {
          'User-Agent': 'myself.md Maps/1.0 (+https://myself.md/contact)',
          Referer: 'https://myself.md/apps/chatgpt',
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return new Response('Map tiles temporarily unavailable.', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith('image/png'))
      return new Response('Map tiles temporarily unavailable.', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    response = new Response(upstream.body, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
    await cache?.put(key, response.clone());
  }
  return request.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response;
}
