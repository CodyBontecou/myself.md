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
window.fixture={show:(value)=>{update=showToast(value);return update},update:(value)=>update(value)};
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
                    : 'export default ()=>null;export const AnalyticsConsent=()=>null;export const Screen=({children})=>children;export const Group=()=>null;export const Row=()=>null;export const SectionHeader=()=>null;export const IconButton=()=>null;',
          loader: 'jsx',
          resolveDir: process.cwd(),
        }));
        // Motion is a native boundary here; device QA exercises the real worklets.
        builder.onResolve({ filter: /^react-native-reanimated$/ }, ({ path }) => ({
          path,
          namespace: 'motion-host',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'motion-host' }, () => ({
          contents: `import {useRef} from 'react';import {View} from 'react-native-web';
const transition={duration:()=>transition,reduceMotion:()=>transition};
export const LinearTransition=transition,FadeIn=transition,ReduceMotion={System:'system'};
export const Easing={bezier:()=>null};export const useReducedMotion=()=>false;
export const useSharedValue=(initial)=>useRef({value:initial,get(){return this.value},set(value){this.value=value}}).current;
export const withTiming=(value)=>value;export const useAnimatedStyle=()=>({});
export default {View};`,
          loader: 'js',
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
  await page.getByTestId('action-toast-message').waitFor({ state: 'hidden' });
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
  await page.evaluate(`
    window.stale=window.fixture.show({message:'Old export',kind:'loading'});
    window.fixture.show({message:'Newest export',kind:'loading',progress:120,detail:'Delivering day 7'});
    window.stale({message:'Stale completion',kind:'success'});
  `);
  assert.equal(await page.getByTestId('action-toast-message').textContent(), 'Newest export');
  assert.equal(await page.getByTestId('action-toast-percentage').textContent(), '100%');
  assert.equal(await page.getByTestId('action-toast-progress').getAttribute('role'), 'progressbar');
  await page.getByTestId('action-toast-dismiss').tap();
  // Start a new notification before the previous exit timer completes.
  await page.evaluate("window.fixture.show({message:'Survives old exit',kind:'loading'})");
  await page.waitForTimeout(250);
  assert.equal(await page.getByTestId('action-toast-message').textContent(), 'Survives old exit');
  await page.evaluate(`window.fixture.show({message:'Choose next step',kind:'warning',actions:[
    {label:'Retry',primary:true,onPress:()=>window.fixture.show({message:'Retry started',kind:'loading'})},
    {label:'Later',onPress:()=>window.later=true}
  ]})`);
  await page.getByTestId('action-toast-action-1').waitFor();
  await page.waitForTimeout(5100);
  assert.equal(await page.getByTestId('action-toast-message').textContent(), 'Choose next step');
  await page.getByTestId('action-toast-action-0').tap();
  assert.equal(await page.getByTestId('action-toast-message').textContent(), 'Retry started');
  await page.waitForTimeout(250);
  assert.equal(await page.getByTestId('action-toast-message').textContent(), 'Retry started');
  await page.evaluate("window.fixture.show({message:'Saved',kind:'success'})");
  await page.getByTestId('action-toast').waitFor({ state: 'detached', timeout: 6000 });
  await page.getByTestId('action-toast-message').waitFor({ state: 'hidden' });
  assert.deepEqual(errors, [], 'Toast transitions must not produce React errors');
  console.log(
    'PASS toast dismissal, underlying controls, stale updates, exit/replacement races, progress, two actions, follow-up feedback, persistence and expiry. Motion is a native boundary; window hit testing requires device QA.',
  );
} finally {
  await browser.close();
}
