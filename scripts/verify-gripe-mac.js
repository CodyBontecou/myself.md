import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deliverReport, inboxClient } from './gripe-mac.js';

const stateDir = await mkdtemp(join(tmpdir(), 'gripe-bridge-check-'));
try {
  const codex = join(stateDir, 'fake-codex');
  await writeFile(
    codex,
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
writeFileSync(${JSON.stringify(join(stateDir, 'invocation.json'))}, JSON.stringify({args:process.argv.slice(2),prompt,hasToken:!!process.env.GRIPE_MAC_TOKEN,hasThread:!!process.env.CODEX_THREAD_ID}));
console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-session'}));
console.log(JSON.stringify({type:'turn.started'}));
console.log(JSON.stringify({type:'turn.completed'}));
`,
    { mode: 0o700 },
  );
  const id = 'a'.repeat(64);
  const repository = 'CodyBontecou/myself.md';
  let claims = 0;
  let receipts = 0;
  /** @param {string} path @param {object|undefined} [body] */
  const request = async (path, body) => {
    if (path.endsWith('/claim')) {
      claims++;
      return Response.json({
        id,
        repository,
        claimedNow: true,
        comment: 'Fix the screenshot layout',
        metadata: { appVersion: '1' },
      });
    }
    if (path.endsWith('/image'))
      return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
        headers: { 'content-type': 'image/png' },
      });
    assert.ok(path.endsWith('/delivered'));
    assert.deepEqual(body, {
      runner: 'fixture-mac',
      threadId: 'fixture-session',
      turnId: 'initial',
    });
    receipts++;
    if (receipts === 1) throw new Error('Lost acknowledgment');
    return Response.json({ status: 'delivered' });
  };
  const config = {
    stateDir,
    codex,
    repository,
    cwd: process.cwd(),
    runner: 'fixture-mac',
    request,
  };
  await assert.rejects(deliverReport(config, id), /Lost acknowledgment/);
  assert.equal(JSON.parse(await readFile(join(stateDir, `${id}.json`), 'utf8')).phase, 'finished');
  await deliverReport(config, id);
  assert.equal(claims, 1);
  assert.equal(receipts, 2);
  const invocation = JSON.parse(await readFile(join(stateDir, 'invocation.json'), 'utf8'));
  assert.ok(invocation.args.includes('--worktree'));
  assert.ok(invocation.args.includes('--approve-for-me'));
  assert.ok(
    !invocation.args.includes('--sandbox'),
    'approve-for-me sets its own sandbox; combining the flags is rejected by Codex',
  );
  assert.ok(invocation.prompt.includes('Fix the screenshot layout'));
  assert.equal(invocation.hasToken, false);
  assert.equal(invocation.hasThread, false);
  const uncertain = 'b'.repeat(64);
  await writeFile(join(stateDir, `${uncertain}.json`), JSON.stringify({ phase: 'dispatching' }));
  await assert.rejects(deliverReport(config, uncertain), /uncertain dispatch/);
  assert.equal(claims, 1);
  const mismatch = { ...config, repository: 'other/repository' };
  await assert.rejects(deliverReport(mismatch, 'c'.repeat(64)), /destination or payload mismatch/);
  assert.throws(() => inboxClient('https://example.com/path', 'secret'), /HTTPS origin/);
  assert.throws(() => inboxClient('http://example.com', 'secret'), /HTTPS origin/);
  console.log(
    'Gripe Mac checks passed: isolated session, image and prompt delivery, credential isolation, acknowledged retry and uncertain-dispatch recovery. No live Codex task started.',
  );
} finally {
  await rm(stateDir, { recursive: true, force: true });
}
