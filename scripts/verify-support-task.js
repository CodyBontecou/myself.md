import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const fixture = {
  TASK_ID: `codex-${'a'.repeat(40)}`,
  ACCOUNT: `myself-${'b'.repeat(64)}`,
  CONVERSATION_ID: 'fixture-conversation',
  GENERATION: '1',
  INSTRUCTIONS: 'Sanitized reproduction steps',
  TITLE: 'Fixture bug',
  SUPPORT_ORIGIN: 'https://fixture.example',
  SUPPORT_TOKEN: 'fixture-token',
};
const preload = `globalThis.fetch = async (url, options) => {
  process.stdout.write(JSON.stringify({url, body: JSON.parse(options.body)}));
  return new Response(null, {status: 204});
};`;
/** @param {string} mode @param {Record<string,string>} config */
function run(mode, config) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(preload)}`,
      'scripts/support-task.js',
      mode,
    ],
    { env: { ...process.env, ...fixture, ...config }, encoding: 'utf8' },
  );
}
for (const repository of ['CodyBontecou/myself.md', 'ExampleOrg/another-app']) {
  const config = {
    GITHUB_REPOSITORY: repository,
    EXISTING_PR: `https://github.com/${repository}/pull/123`,
  };
  const completed = run('completed', config);
  assert.equal(completed.status, 0, completed.stderr);
  assert.deepEqual(JSON.parse(completed.stdout), {
    url: 'https://fixture.example/api/support-bridge/task',
    body: {
      account: fixture.ACCOUNT,
      conversationId: fixture.CONVERSATION_ID,
      generation: 1,
      id: fixture.TASK_ID,
      status: 'completed',
      url: config.EXISTING_PR,
    },
  });
  for (const url of [
    'https://github.com/CodyBontecou/support-chat/pull/123',
    `${config.EXISTING_PR}/extra`,
    `${config.EXISTING_PR}?redirect=1`,
  ]) {
    const rejected = run('completed', { ...config, EXISTING_PR: url });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Invalid PR target/);
    assert.equal(rejected.stdout, '');
  }
  const prompt = run('prompt', config);
  assert.equal(prompt.status, 0, prompt.stderr);
  assert.ok(prompt.stdout.includes(repository));
  assert.ok(prompt.stdout.includes('npm run format, then npm run check'));
}
const invalid = run('completed', { GITHUB_REPOSITORY: '../other' });
assert.notEqual(invalid.status, 0);
assert.match(invalid.stderr, /Invalid support task context/);
console.log('Support workflow repository and callback validation passed (no live requests).');
