import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const source = await readFile(
  'node_modules/expo/src/async-require/messageSocket.native.ts',
  'utf8',
);
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' });
for (const [dev, loaded, expected] of [
  [true, false, 0],
  [true, true, 1],
  [false, false, 0],
]) {
  /** @type {string[]} */
  const sockets = [];
  runInNewContext(code, {
    __DEV__: dev,
    URL,
    require: () => ({
      __esModule: true,
      default: () => ({ bundleLoadedFromServer: loaded, url: 'http://localhost:8081/' }),
    }),
    WebSocket: class {
      /** @param {string} url */
      constructor(url) {
        sockets.push(url);
      }
    },
  });
  assert.equal(sockets.length, expected);
  if (expected) assert.equal(sockets[0], 'ws://localhost:8081/message');
}
console.log('Embedded Debug startup, Metro Debug connection and Release socket exclusion passed.');
