import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
/** S3 HTTP fixture exercises the real SDK, encrypted bytes and private request signing. */
export async function r2Fixture() {
  /** @type {Map<string,Buffer>} */
  const files = new Map();
  const state = { failPut: false, failGet: false, failDelete: false };
  const server = createServer(async (req, res) => {
    assert.match(req.headers.authorization ?? '', /^AWS4-HMAC-SHA256 Credential=fixture\//);
    const key = new URL(req.url ?? '/', 'http://fixture').pathname;
    const failed =
      (req.method === 'PUT' && state.failPut) ||
      (req.method === 'GET' && state.failGet) ||
      (req.method === 'DELETE' && state.failDelete);
    if (failed) {
      res.writeHead(503, { 'Content-Type': 'application/xml' });
      res.end('<Error><Code>ServiceUnavailable</Code></Error>');
      return;
    }
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      files.set(key, Buffer.concat(chunks));
      res.setHeader('ETag', '"fixture"');
      res.end();
    } else if (req.method === 'GET') {
      const bytes = files.get(key);
      if (!bytes) {
        res.writeHead(404, { 'Content-Type': 'application/xml' });
        res.end('<Error><Code>NoSuchKey</Code></Error>');
      } else {
        res.setHeader('Content-Length', bytes.length);
        res.end(bytes);
      }
    } else if (req.method === 'DELETE') {
      files.delete(key);
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(405);
      res.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    files,
    state,
    server,
    env: {
      R2_ACCOUNT_ID: '0'.repeat(32),
      R2_BUCKET: 'fixture-bucket',
      R2_ACCESS_KEY_ID: 'fixture',
      R2_SECRET_ACCESS_KEY: 'fixture-secret',
      R2_TEST_ENDPOINT: `http://127.0.0.1:${address.port}`,
      ALLOW_HTTP_DEV: '1',
    },
  };
}
