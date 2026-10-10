import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { errorJSON, readJSONResponse } from '../packages/support-chat/errors.js';

const cause = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
const failure = Object.assign(new Error('Upload failed', { cause }), { status: 503 });
const parsed = JSON.parse(errorJSON(failure));
assert.equal(parsed.error.message, 'Upload failed');
assert.equal(parsed.error.status, 503);
assert.equal(parsed.error.cause.code, 'ECONNRESET');
assert.equal(errorJSON(errorJSON(failure)), errorJSON(failure));
const cyclic = new Error('Circular cause');
Object.assign(cyclic, { cause: cyclic });
assert.equal(JSON.parse(errorJSON(cyclic)).error.cause.truncated, true);
assert.equal(errorJSON(''), '');
assert.equal(JSON.parse(errorJSON('Validation failed')).error.message, 'Validation failed');
const huge = errorJSON(new Error('x'.repeat(100000)));
assert.ok(huge.length <= 16000);
assert.equal(JSON.parse(huge).error.truncated, true);
assert.equal(JSON.parse(errorJSON(huge)).error.truncated, true);
assert.equal(
  JSON.parse(
    errorJSON({
      get message() {
        throw new Error('Broken error getter');
      },
    }),
  ).error.cause.message,
  'Broken error getter',
);
await assert.rejects(
  readJSONResponse(
    Response.json(
      { error: 'storage_unavailable', detail: 'R2 retry', token: 'fixture-secret' },
      { status: 503 },
    ),
  ),
  (error) => {
    const details = JSON.parse(errorJSON(error)).error;
    assert.equal(details.status, 503);
    assert.equal(details.response.error, 'storage_unavailable');
    assert.equal(details.response.detail, 'R2 retry');
    assert.ok(!JSON.stringify(details).includes('fixture-secret'));
    return true;
  },
);
await assert.rejects(
  readJSONResponse(new Response('upstream unavailable', { status: 502 })),
  (error) => {
    const details = JSON.parse(errorJSON(error)).error;
    assert.equal(details.status, 502);
    assert.equal(details.response, 'upstream unavailable');
    return true;
  },
);
await assert.rejects(readJSONResponse(new Response('invalid JSON')), (error) => {
  const details = JSON.parse(errorJSON(error)).error;
  assert.equal(details.name, 'InvalidResponseError');
  assert.equal(details.status, 200);
  assert.equal(details.cause.name, 'SyntaxError');
  return true;
});
assert.deepEqual(await readJSONResponse(Response.json({ ok: true })), { ok: true });
assert.ok(
  !errorJSON(new Error('Bearer fixture-secret https://example.com?token=fixture-secret')).includes(
    'fixture-secret',
  ),
);

// Compile and execute the actual Foundation-only native formatter, without an app or network request.
const directory = await mkdtemp(join(tmpdir(), 'gripe-error-json-'));
try {
  const source = await readFile('modules/gripe/ios/vendor/Internal/GripeAPIClient.swift', 'utf8');
  const start = source.indexOf('enum GripeError:');
  const end = source.indexOf('final class GripeAPIClient');
  assert.ok(start >= 0 && end > start);
  const file = join(directory, 'main.swift');
  await writeFile(
    file,
    `import Foundation\n${source.slice(start, end)}\n
let underlying = NSError(domain: NSURLErrorDomain, code: -1005, userInfo: [NSLocalizedDescriptionKey: "Connection lost", NSUnderlyingErrorKey: NSError(domain: "Transport", code: 54)])
let envelope = try JSONSerialization.jsonObject(with: Data(GripeErrorDetails.json(GripeError.network(underlying)).utf8)) as! [String: Any]
let network = envelope["error"] as! [String: Any]
assert(network["code"] as? String == "network_error")
assert(network["retryable"] as? Bool == true)
let cause = network["cause"] as! [String: Any]
assert(cause["domain"] as? String == NSURLErrorDomain)
assert(cause["code"] as? Int == -1005)
assert((cause["cause"] as! [String: Any])["code"] as? Int == 54)
let serverEnvelope = try JSONSerialization.jsonObject(with: Data(GripeErrorDetails.json(GripeError.serverError(503, "{\\"error\\":\\"r2_failure\\"}")).utf8)) as! [String: Any]
let server = serverEnvelope["error"] as! [String: Any]
assert(server["status"] as? Int == 503)
assert((server["response"] as! [String: Any])["error"] as? String == "r2_failure")
assert(!GripeErrorDetails.json(GripeError.serverError(500, "fixture-secret"), redacting: "fixture-secret").contains("fixture-secret"))
let rejectedEnvelope = try JSONSerialization.jsonObject(with: Data(GripeErrorDetails.json(GripeError.unauthorized).utf8)) as! [String: Any]
let rejected = rejectedEnvelope["error"] as! [String: Any]
assert(rejected["retryable"] as? Bool == false)
let large = GripeErrorDetails.json(GripeError.serverError(503, String(repeating: "x", count: 100000)))
assert(large.utf8.count <= 16000)
let largeEnvelope = try JSONSerialization.jsonObject(with: Data(large.utf8)) as! [String: Any]
assert((largeEnvelope["error"] as! [String: Any])["truncated"] as? Bool == true)
print("Native error JSON passed")
`,
  );
  const result = await promisify(execFile)('xcrun', [
    'swift',
    '-module-cache-path',
    join(directory, 'cache'),
    file,
  ]);
  assert.ok(result.stdout.includes('Native error JSON passed'));
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(
  'Error JSON checks passed: actual causes and status, native iOS errors, valid bounded JSON, legacy messages, server payloads and credential projection. No live report or task started.',
);
