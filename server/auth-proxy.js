import { request } from 'node:http';
/** Proxy only the application's public OAuth realm and login assets.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url @param {string} publicUrl */
export function proxyAuth(req, res, url, publicUrl) {
  if (
    (!url.pathname.startsWith('/auth/realms/qr-connect/') &&
      !url.pathname.startsWith('/auth/resources/')) ||
    /[%\\;]/.test(url.pathname)
  ) {
    res.writeHead(404);
    res.end('Not found.');
    return;
  }
  const origin = new URL(publicUrl);
  const headers = /** @type {import('node:http').IncomingHttpHeaders} */ ({
    ...req.headers,
    host: origin.host,
    'x-forwarded-host': origin.host,
    'x-forwarded-proto': origin.protocol.slice(0, -1),
    'x-forwarded-port': origin.port || '443',
    'x-forwarded-for': req.socket.remoteAddress ?? '127.0.0.1',
  });
  delete headers.forwarded;
  delete headers['x-forwarded-prefix'];
  const upstream = request(
    {
      hostname: process.env.KEYCLOAK_INTERNAL_HOST ?? '127.0.0.1',
      port: 8080,
      method: req.method,
      path: url.pathname + url.search,
      headers,
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.on('error', () => res.destroy());
      response.pipe(res);
    },
  );
  upstream.setTimeout(30000, () => upstream.destroy(new Error('OAuth upstream timed out.')));
  upstream.on('error', () => {
    if (res.headersSent) res.destroy();
    else {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OAuth server is unavailable.' }));
    }
  });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}
