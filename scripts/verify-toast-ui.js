import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Exercise the real toast store, rendering and gestures with native web hosts.
const output = await build({
  stdin: {
    contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Pressable,Text,View} from 'react-native';
import {ToastProvider,showToast} from './src/components/Toast.js';
import SettingsScreen from './src/screens/SettingsScreen.js';
window.invokeHeader=()=>React.isValidElement(window.header());
let update;
window.fixture={show:(value)=>{update=showToast(value)},update:(value)=>update(value)};
createRoot(document.getElementById('root')).render(<ToastProvider><SettingsScreen /><View style={{flex:1}}><Pressable testID="underlying" onPress={()=>window.taps=(window.taps||0)+1}><Text>Underlying action</Text></Pressable></View></ToastProvider>);
`,
    resolveDir: process.cwd(),
    loader: 'jsx',
  },
  alias: { 'react-native': 'react-native-web' },
  plugins: [
    {
      name: 'native-hosts',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
          if (!importer.endsWith('/src/screens/SettingsScreen.js') || path.startsWith('react'))
            return;
          return { path, namespace: 'settings-host' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'settings-host' }, ({ path }) => ({
          contents:
            path === 'expo-router'
              ? 'export const router={};export const Stack={Screen:({options})=>{window.header=options.headerRight;return null}};'
              : path.includes('PhoneProvider')
                ? 'import {createContext,useContext} from "react";const Context=createContext({session:null});export const usePhone=()=>useContext(Context);'
                : path.includes('BillingPaywalls')
                  ? 'export const useBilling=()=>({unlocked:false,remaining:5});'
                  : path.includes('qa-runtime')
                    ? 'export const qaEnabled=false;'
                    : 'export default ()=>null;export const AnalyticsConsent=()=>null;export const Screen=({children})=>children;export const Group=()=>null;export const Row=()=>null;export const SectionHeader=()=>null;',
          loader: 'jsx',
          resolveDir: process.cwd(),
        }));
        builder.onResolve(
          { filter: /^(react-native-safe-area-context|react-native-screens)$|^\.\/ui\.js$/ },
          ({ path }) => ({ path, namespace: 'host' }),
        );
        builder.onLoad({ filter: /.*/, namespace: 'host' }, ({ path }) => ({
          contents:
            path === 'react-native-safe-area-context'
              ? 'export const useSafeAreaInsets=()=>({top:0,bottom:34,left:0,right:0});'
              : path === 'react-native-screens'
                ? 'export const FullWindowOverlay=({children})=>children;'
                : 'export {Text as Copy} from "react-native-web"; export const Icon=()=>null;',
          loader: 'jsx',
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"development"', __DEV__: 'false' },
});
assert.ok(output.outputFiles[0]);
const code = output.outputFiles[0].text;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, hasTouch: true });
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://toast.test/**', (route) =>
    route.fulfill({
      contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html',
      body: route.request().url().endsWith('/bundle.js')
        ? code
        : '<style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div><script src="/bundle.js"></script>',
    }),
  );
  await page.goto('http://toast.test/');
  await page.getByTestId('underlying').waitFor();
  assert.equal(
    await page.evaluate('window.invokeHeader()'),
    true,
    'Header callbacks must return elements without calling hooks',
  );
  const show = () =>
    page.evaluate("window.fixture.show({message:'Session expired. Sign in again.',kind:'error'})");
  await show();
  await page.getByTestId('action-toast-content').tap();
  await page.getByTestId('action-toast').waitFor({ state: 'detached', timeout: 1000 });
  await show();
  await page.getByTestId('action-toast-dismiss').tap();
  await page.getByTestId('action-toast').waitFor({ state: 'detached', timeout: 1000 });
  await page.evaluate("window.fixture.show({message:'Exporting',kind:'loading',progress:20})");
  await page.getByTestId('underlying').tap();
  assert.equal(await page.evaluate('window.taps'), 1, 'Toast must not block other app controls');
  await page.getByTestId('action-toast-dismiss').tap();
  await page.evaluate("window.fixture.update({message:'Finished',kind:'success'})");
  assert.equal(
    await page.getByTestId('action-toast').count(),
    0,
    'Dismissed progress cannot reopen',
  );
  await page.evaluate(
    "window.fixture.show({message:'Open action',kind:'success',onPress:()=>window.actions=(window.actions||0)+1})",
  );
  await page.getByTestId('action-toast-content').tap();
  assert.equal(await page.evaluate('window.actions'), 1);
  assert.deepEqual(errors, [], 'Toast transitions must not produce React errors');
  console.log(
    'PASS toast body and close taps, underlying controls, progress dismissal and action dispatch. Native window hit testing needs separate device verification.',
  );
} finally {
  await browser.close();
}
