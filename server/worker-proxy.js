import { Buffer } from 'node:buffer';
import { PairingError } from './errors.js';
/** Preserve old mobile/MCP URLs after the cutover. The Worker applies the shared authorization rules.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} origin */
export async function proxyWorker(req, res, origin) {
  const target = new URL(req.url ?? '/', origin);
  if (target.origin !== origin || target.protocol !== 'https:')
    throw new PairingError(503, 'Worker origin is not configured.');
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (
      value !== undefined &&
      ![
        'host',
        'connection',
        'content-length',
        'transfer-encoding',
        'keep-alive',
        'upgrade',
        'proxy-authorization',
      ].includes(key)
    )
      headers.set(key, Array.isArray(value) ? value.join(',') : value);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) throw new PairingError(413, 'Request exceeds upload limit.');
    chunks.push(chunk);
  }
  const response = await fetch(target, {
    method: req.method ?? 'GET',
    headers,
    redirect: 'manual',
    ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
  });
  res.writeHead(
    response.status,
    Object.fromEntries(
      [...response.headers].filter(
        ([key]) =>
          !['transfer-encoding', 'connection', 'content-encoding', 'content-length'].includes(key),
      ),
    ),
  );
  if (response.body) for await (const chunk of response.body) res.write(chunk);
  res.end();
}
