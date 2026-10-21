import assert from 'node:assert/strict';
import { errorJSON, errorMessage, readJSONResponse } from '../packages/support-chat/errors.js';

const cause = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
const failure = Object.assign(new Error('Upload failed', { cause }), { status: 503 });
const parsed = JSON.parse(errorJSON(failure));
assert.equal(parsed.error.message, 'Upload failed');
assert.equal(parsed.error.status, 503);
assert.equal(parsed.error.cause.code, 'ECONNRESET');
assert.equal(errorJSON(errorJSON(failure)), errorJSON(failure));
assert.equal(errorMessage(failure), 'Upload failed');
assert.equal(errorMessage(errorJSON(failure)), 'Upload failed');
const lostConnection = new Error(
  'fetch failed: UnexpectedException: The network connection was lost. (at ExpoModulesCore/Promise.swift:56)',
);
for (const value of [lostConnection, lostConnection.message, errorJSON(lostConnection)]) {
  assert.equal(
    errorMessage(value),
    'We couldn’t connect. Check your internet connection and try again.',
    'Native connection failures must give actionable feedback instead of Swift implementation details.',
  );
}
assert.equal(JSON.parse(errorJSON(lostConnection)).error.message, lostConnection.message);
for (const message of [
  'Failed to fetch',
  'fetch failed',
  'Network request failed',
  'Load failed',
  'TypeError: Network request failed',
  'The Internet connection appears to be offline.',
]) {
  assert.equal(
    errorMessage(new Error(message)),
    'We couldn’t connect. Check your internet connection and try again.',
  );
}
assert.equal(errorMessage(new Error('Network permission denied')), 'Network permission denied');
assert.equal(
  errorMessage(new Error('Purchase verification failed')),
  'Purchase verification failed',
);
assert.equal(errorMessage('Validation failed'), 'Validation failed');
assert.equal(errorMessage(''), '');
for (const message of ['', '   ']) {
  const native = Object.assign(new Error(message), { code: 'E_UNKNOWN' });
  assert.equal(
    errorMessage(errorJSON(native)),
    'Something went wrong. Please try again. (E_UNKNOWN)',
  );
  assert.equal(errorMessage(native), errorMessage(errorJSON(native)));
}
assert.equal(errorMessage(new Error('')), 'Something went wrong. Please try again.');
assert.equal(errorMessage('{"error":"Server unavailable"}'), 'Server unavailable');
assert.ok(!errorMessage(new Error('Bearer fixture-secret')).includes('fixture-secret'));
assert.equal(
  errorMessage({
    get message() {
      throw new Error('Broken getter');
    },
  }),
  'Something went wrong. Please try again.',
);
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
await assert.rejects(readJSONResponse(Response.json({ error: '' }, { status: 400 })), (error) => {
  assert.equal(errorMessage(errorJSON(error)), 'HTTP 400');
  return true;
});
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

console.log(
  'Error JSON checks passed: actual causes and status, valid bounded JSON, legacy messages, server payloads and credential projection. No live report or task started.',
);
