import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { randomUUID } from 'node:crypto';

/** @type {{status:string,operationId:string,outcome:string,issueUrl:string}} */
let native = { status: 'ready', operationId: '', outcome: 'idle', issueUrl: '' };
let captures = 0;
let alertMessage = '';
/** @type {Array<{text:string,onPress?:()=>void}>} */
let buttons = [];
const appState = { currentState: 'active' };
const bridge = {
  status: async () => native,
  open: async (/** @type {string} */ id) => {
    captures++;
    native = { ...native, operationId: id, outcome: 'running', issueUrl: '' };
    return native;
  },
};
/** @param {boolean} dev */
async function load(dev) {
  const context = createContext({ __DEV__: dev, Date });
  const source = new SourceTextModule(
    await readFile(new URL('../client/gripe.js', import.meta.url), 'utf8'),
    { context },
  );
  await source.link((specifier) => {
    const values =
      specifier === 'expo'
        ? { requireOptionalNativeModule: () => bridge }
        : {
            Platform: { OS: 'ios' },
            AppState: appState,
            Alert: {
              /** @param {string} _title @param {string} _message @param {Array<{text:string,onPress?:()=>void}>} [actions] */
              alert: (_title, _message, actions) => {
                alertMessage = _message;
                buttons = actions ?? [];
              },
            },
          };
    return new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context },
    );
  });
  await source.evaluate();
  return /** @type {{openFeedback:()=>Promise<void>,requestFeedback:(request:{id:string,expiresAt:number}|null,authorize:()=>Promise<unknown>)=>Promise<void>,feedbackState:()=>Promise<{availability:string,operation:null|{status:string,issueUrl?:string}}>}} */ (
    source.namespace
  );
}
const client = await load(true);
const request = { id: randomUUID(), expiresAt: Date.now() + 10000 };
await client.requestFeedback(request, async () => {
  throw new Error('Revoked');
});
assert.equal(captures, 0);
assert.equal((await client.feedbackState()).operation?.status, 'awaiting_user');
const approve = buttons.find((button) => button.text === 'Open feedback')?.onPress;
assert.ok(approve);
approve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(captures, 0);
assert.equal((await client.feedbackState()).operation?.status, 'failed');
const second = { id: randomUUID(), expiresAt: Date.now() + 10000 };
await client.requestFeedback(second, async () => ({ authorized: true }));
buttons.find((button) => button.text === 'Open feedback')?.onPress?.();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(captures, 1);
await client.requestFeedback(second, async () => {
  throw new Error('Must not reauthorize');
});
assert.equal(captures, 1);
assert.equal((await client.feedbackState()).operation?.status, 'running');
native = {
  ...native,
  outcome: 'completed',
  issueUrl: 'https://github.com/CodyBontecou/agent-bridge/issues/123',
};
assert.equal((await client.feedbackState()).operation?.status, 'completed');
native = { ...native, outcome: 'dry_run', issueUrl: '' };
assert.equal((await client.feedbackState()).operation?.status, 'failed');
const release = await load(false);
assert.equal((await release.feedbackState()).availability, 'unavailable');
await release.openFeedback();
assert.equal(
  alertMessage,
  'Screenshot feedback is disabled in this build. It currently requires an iOS Debug build.',
);
assert.equal(captures, 1);
native = { ...native, status: 'missing_key' };
await client.openFeedback();
assert.equal(alertMessage, 'Configure GRIPE_API_KEY and rebuild the iOS Debug app.');
console.log(
  'Feedback client: approval before capture, revocation denial, duplicate dispatch, native completion, dry-run isolation and Release gating pass.',
);
