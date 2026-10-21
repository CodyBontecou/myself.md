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
const entry = transformSync(await readFile('index.js', 'utf8'), { format: 'cjs' }).code;
for (const [dev, scriptURL, expected] of [
  [true, 'file:///app/main.jsbundle', 1],
  [true, 'http://localhost:8081/index.bundle', 0],
  [false, 'file:///app/main.jsbundle', 0],
]) {
  /** @type {RegExp[]} */
  const ignored = [];
  runInNewContext(entry, {
    __DEV__: dev,
    /** @param {string} name */
    require: (name) =>
      name === 'react-native'
        ? {
            NativeModules: { SourceCode: { getConstants: () => ({ scriptURL }) } },
            LogBox: {
              /** @param {RegExp[]} patterns */
              ignoreLogs: (patterns) => ignored.push(...patterns),
            },
          }
        : {},
  });
  assert.equal(ignored.length, expected);
  if (expected) {
    assert.ok(ignored[0]?.test('Open debugger to view warnings.'));
    assert.equal(ignored[0]?.test('A real application warning'), false);
  }
}
console.log('Embedded Debug startup/banner, Metro Debug connection and Release exclusion passed.');

// Expo's incremental prebuild must refresh this helper without duplicating it.
/** @type {{exports: unknown}} */
const scrawlModule = { exports: null };
let nativeSource = `
    let delegate = ReactNativeDelegate()
    window = UIWindow(frame: UIScreen.main.bounds)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    return super.application(app, open: url, options: options)
`;
runInNewContext(await readFile('plugins/with-scrawl.cjs', 'utf8'), {
  module: scrawlModule,
  require: () => ({
    /** @param {object} config */
    withInfoPlist: (config) => config,
    /** @param {object} config */
    withXcodeProject: (config) => config,
    /** @param {object} config
     * @param {(mod: {modResults: {language: string, contents: string}}) => {modResults: {contents: string}}} transform */
    withAppDelegate: (config, transform) => {
      nativeSource = transform({ modResults: { language: 'swift', contents: nativeSource } })
        .modResults.contents;
      return config;
    },
  }),
});
assert.ok(typeof scrawlModule.exports === 'function');
scrawlModule.exports({});
const generated = nativeSource;
scrawlModule.exports({});
assert.equal(nativeSource, generated, 'Repeating prebuild must not duplicate native helpers');
nativeSource = generated.replace('override func sendEvent', 'override func outdatedTouchHook');
scrawlModule.exports({});
assert.equal(nativeSource, generated, 'Incremental prebuild must replace the prior helper');
console.log('Scrawl clean/incremental Expo transforms and helper replacement passed.');
