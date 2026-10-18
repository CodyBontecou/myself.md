import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, openSync, closeSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const directory = mkdtempSync(resolve('.local/worker-fetch-test-'));
const log = join(directory, 'runtime.log');
const output = openSync(log, 'a');
// Match the CommonJS require(...).default call used by Apple's SDK, through Wrangler's alias.
writeFileSync(join(directory, 'consumer.cjs'), 'module.exports = require("node-fetch");');
writeFileSync(
  join(directory, 'index.js'),
  `import adapter from './consumer.cjs';
export default {async fetch() {
  const original = globalThis.fetch;
  const checks = [];
  try {
    if (typeof adapter.default !== 'function') throw new Error('CommonJS default is not callable');
    globalThis.fetch = async (input, init) => {
      if (String(input) !== 'https://fixture.invalid/ocsp') throw new Error('Unexpected destination');
      if (init.method !== 'POST' || init.headers.get('Content-Type') !== 'application/ocsp-request')
        throw new Error('Request metadata changed');
      return new Response(new Uint8Array([0, 1, 255]), {status: 200});
    };
    const response = await adapter.default('https://fixture.invalid/ocsp', {
      method: 'POST', headers: new adapter.Headers({'Content-Type':'application/ocsp-request'}),
      body: new Uint8Array([1]), timeout: 30000,
    });
    const bytes = await response.buffer();
    if (bytes.toString('hex') !== '0001ff' || response.status !== 200)
      throw new Error('Binary response changed');
    checks.push('CommonJS default, headers, binary OCSP response');
    const ocspHeaders = new adapter.Headers({'Content-Type':'application/ocsp-request','Content-Length':'3','Accept':'application/ocsp-response'});
    globalThis.fetch = async (input, init) => {
      if (String(input) !== 'http://ocsp.apple.com/responder/%2B%2F8%3D' || init.method !== 'GET' || init.body !== null)
        throw new Error('Small Apple OCSP request was not encoded as GET');
      if (init.headers.has('Content-Type') || init.headers.has('Content-Length') || init.headers.get('Accept') !== 'application/ocsp-response')
        throw new Error('OCSP GET headers are incorrect');
      return new Response(new Uint8Array([0, 1, 255]), {status:200});
    };
    const ocsp = await adapter.default('http://ocsp.apple.com/responder', {
      method:'POST',headers:ocspHeaders,body:new Uint8Array([251,255]),
    });
    if ((await ocsp.buffer()).toString('hex') !== '0001ff' || !ocspHeaders.has('Content-Type'))
      throw new Error('OCSP response or caller headers changed');
    const large = new Uint8Array(300);
    globalThis.fetch = async (input, init) => {
      if (String(input) !== 'http://ocsp.apple.com/responder' || init.method !== 'POST' || init.body !== large)
        throw new Error('Oversized OCSP request changed');
      return new Response('kept POST');
    };
    await adapter.default('http://ocsp.apple.com/responder', {method:'POST',headers:ocspHeaders,body:large});
    checks.push('Bounded Apple OCSP GET, binary integrity, caller headers and oversized POST');
    globalThis.fetch = async () => new Response('not JSON', {status:503});
    const rejected = await adapter.default('https://fixture.invalid/failure');
    if (rejected.ok || rejected.status !== 503 || await rejected.text() !== 'not JSON')
      throw new Error('HTTP failure was hidden');
    checks.push('HTTP rejection retained');
    globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
      const abort = () => reject(init.signal.reason);
      if (init.signal.aborted) abort();
      else init.signal.addEventListener('abort', abort, {once:true});
    });
    try {
      await adapter.default('https://fixture.invalid/timeout', {timeout:1});
      throw new Error('Timeout did not abort');
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
    }
    const owner = new adapter.AbortController(); owner.abort();
    try {
      await adapter.default('https://fixture.invalid/cancel', {timeout:30000, signal:owner.signal});
      throw new Error('Caller cancellation was ignored');
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    }
    checks.push('SDK timeout and caller cancellation');
    return Response.json({checks});
  } catch(error) { return Response.json({error:error.message}, {status:500}); }
  finally { globalThis.fetch = original; }
}};`,
);
writeFileSync(
  join(directory, 'wrangler.json'),
  JSON.stringify({
    name: 'worker-fetch-fixture',
    main: 'index.js',
    compatibility_date: '2026-10-09',
    compatibility_flags: ['nodejs_compat'],
    alias: { 'node-fetch': resolve('worker/node-fetch.js') },
  }),
);
const child = spawn(
  resolve('node_modules/.bin/wrangler'),
  ['dev', '--config', join(directory, 'wrangler.json'), '--port', '8811'],
  { stdio: ['ignore', output, output] },
);
try {
  /** @type {Response|undefined} */
  let response;
  for (let attempt = 0; attempt < 100 && !response; attempt++) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop
      response = await fetch('http://localhost:8811');
    } catch {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await new Promise((ready) => setTimeout(ready, 100));
    }
  }
  assert.ok(response, readFileSync(log, 'utf8'));
  const result = /** @type {{checks:string[]}} */ (await response.json());
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.checks.length, 4);
  console.log('PASS Worker fetch: ' + result.checks.join('; ') + '.');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  closeSync(output);
  rmSync(directory, { recursive: true, force: true });
}
