import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as profilePolicy from '../core/profiles.js';
import * as exportPolicy from '../core/export-files.js';
import * as schedules from '../core/schedules.js';

/** @typedef {{type:unknown,props:Record<string,unknown>}} Element */
/** @type {unknown[]} */ let slots = [];
let cursor = 0;
/** @type {Record<string,unknown>} */ let data = {};
const noop = () => {};
const react = {
  createContext: () => ({}),
  useContext: () => data,
  /** @param {unknown} initial */
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    const state = slots;
    return [
      slots[index],
      (/** @type {unknown} */ value) => {
        state[index] = typeof value === 'function' ? value(state[index]) : value;
      },
    ];
  },
  /** @param {unknown} initial */
  useRef(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  },
  useEffect: noop,
  /** @param {unknown} value */
  useCallback: (value) => value,
};
/** @param {unknown} type @param {Record<string,unknown>|null} props @param {...unknown} children @returns {Element} */
function h(type, props, ...children) {
  return { type, props: { ...props, children } };
}
let started = 0,
  cancelled = 0;
/** @type {((result:{days:number,failedSources:number})=>void)|undefined} */ let finish;
const progress = { enabled: false };
const builder = { duration: () => builder, easing: () => builder, reduceMotion: () => builder };
const ui = new Proxy({}, { get: (_target, name) => String(name) });
const theme = { useTheme: () => ({ colors: { text: '#000', secondary: '#666' } }) };
/** @type {Record<string,unknown>} */
const imports = {
  react,
  'react-native': {
    ...Object.fromEntries(['View', 'Text', 'Pressable', 'TextInput'].map((name) => [name, name])),
    StyleSheet: { create: (/** @type {object} */ value) => value },
    Alert: { alert: noop },
  },
  'expo-router': {
    router: {
      push: (/** @type {unknown} */ path) => {
        destination = path;
      },
    },
    useNavigation: () => ({}),
    useFocusEffect: noop,
  },
  'expo-router/react-navigation': { usePreventRemove: noop },
  'react-native-reanimated': {
    __esModule: true,
    default: { View: 'Animated.View' },
    LinearTransition: builder,
    FadeIn: builder,
    FadeOut: builder,
    Easing: { bezier: noop },
    cubicBezier: noop,
    ReduceMotion: { System: 'system' },
    useReducedMotion: () => false,
  },
  '../src/components/ui': ui,
  '../src/components/ui.js': ui,
  './ui.js': ui,
  '../src/lib/theme': theme,
  '../src/lib/theme.js': theme,
  '../src/components/Toast.js': { useToast: () => () => noop, showToast: noop },
  './ProfileEditorState.js': { useProfileEditor: () => ({ start: noop }) },
  './qa-runtime.js': { qaEnabled: false },
  '../core/profiles.js': profilePolicy,
  '../core/export-files.js': exportPolicy,
  '../core/schedules.js': { ...schedules, nextOccurrence: () => null },
  '../core/data.js': { domains: ['health', 'time', 'location'] },
  './export-folder.js': { exportFolderStatus: () => ({ name: 'Exports' }) },
  './export-task.js': {
    scheduleState: () => ({ progress, files: [] }),
    exportNow: () => {
      started++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    cancelExports: () => {
      cancelled++;
      finish?.({ days: 1, failedSources: 0 });
    },
  },
};
/** @param {string} path @returns {Record<string,unknown>} */
function load(path) {
  const { code } = transformSync(readFileSync(path, 'utf8'), {
    loader: 'jsx',
    format: 'cjs',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  });
  const module = { exports: {} };
  runInNewContext(code, {
    module,
    exports: module.exports,
    h,
    Fragment: 'Fragment',
    console,
    require: (/** @type {string} */ name) =>
      imports[name] ??
      new Proxy(
        { __esModule: true, default: 'Boundary' },
        { get: (target, key) => Reflect.get(target, key) ?? String(key) },
      ),
  });
  return module.exports;
}
const motion = load('src/components/AccordionMotion.js');
imports['../src/components/AccordionMotion.js'] = motion;
imports['./ProfileQuickAction.js'] = load('client/ProfileQuickAction.js');
const exportsModule = load('client/ProfileExports.js');
imports['./ProfileExports.js'] = exportsModule;
const feedModule = load('client/ProfileFeed.js');
imports['./ProfileFeed.js'] = feedModule;
const panelModule = load('client/ProfilePanel.js');
imports['./ProfilePanel.js'] = panelModule;
const dataModule = load('client/DataPanel.js');
/** @param {unknown} component @param {Record<string,unknown>} props @returns {unknown} */
function call(component, props) {
  assert.equal(typeof component, 'function');
  return /** @type {(props:Record<string,unknown>)=>unknown} */ (component)(props);
}
/** @param {unknown} node @param {(element:Element)=>boolean} predicate @returns {Element|null} */
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  }
  const element = /** @type {Element} */ (node);
  if (predicate(element)) return element;
  if (typeof element.type === 'function') return find(call(element.type, element.props), predicate);
  return find(element.props.children, predicate);
}
/** @param {unknown} tree @param {string} id */
function control(tree, id) {
  const node = find(tree, (item) => item.props.testID === id);
  assert.ok(node, `Missing ${id}`);
  return node;
}
const profile = {
  ...profilePolicy.parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Fixture',
    selection: { health: [], time: [], location: [] },
    export: { destination: 'local' },
  }),
  id: 'fixture',
};
/** @type {unknown[]} */ const panelState = [];
/** @type {unknown[]} */ const exportState = [];
function renderPanel() {
  slots = panelState;
  cursor = 0;
  return call(panelModule.default, {
    inline: true,
    profileId: profile.id,
    state: { profiles: [profile] },
    session: { deviceId: 'fixture' },
    types: { health: [], time: [], location: [] },
    permissions: {},
    busy: false,
    draft: null,
    onDismiss: noop,
  });
}
/** @param {Element} node */
function renderExports(node) {
  slots = exportState;
  cursor = 0;
  const wrapper = /** @type {Element} */ (call(node.type, node.props));
  return wrapper ? call(wrapper.type, wrapper.props) : null;
}
/** @param {unknown} tree */
function controller(tree) {
  const node = find(tree, (item) => item.type === exportsModule.default);
  assert.ok(node, 'The export controller must remain mounted across collapse.');
  return node;
}
let tree = renderPanel();
const initialExports = renderExports(controller(tree));
const initialAction = control(initialExports, 'profile-export-fixture');
const initialButton = call(initialAction.type, initialAction.props);
call(control(initialButton, 'profile-export-fixture').props.onPress, { stopPropagation: noop });
assert.equal(controller(renderPanel()).props.visible, false, 'Export leaves the row closed.');

call(
  control(
    controller(tree).props.visible ? tree : renderExports(controller(tree)),
    'profile-row-fixture',
  ).props.onPress,
  {},
);
tree = renderPanel();
let exportTree = renderExports(controller(tree));
call(control(exportTree, 'export-now').props.onDisabledPress, {});
exportTree = renderExports(controller(tree));
control(exportTree, 'export-cancel');
call(
  control(
    controller(tree).props.visible ? tree : renderExports(controller(tree)),
    'profile-row-fixture',
  ).props.onPress,
  {},
);
tree = renderPanel();
exportTree = renderExports(controller(tree));
const collapsedExport = control(exportTree, 'profile-export-fixture');
assert.equal(collapsedExport.props.busy, true);
const collapsedButton = call(collapsedExport.type, collapsedExport.props);
let stopped = false;
call(control(collapsedButton, 'profile-export-fixture').props.onPress, {
  stopPropagation: () => {
    stopped = true;
  },
});
assert.equal(stopped, true, 'Export does not toggle the profile row.');
assert.equal(started, 1, 'A collapsed busy export cannot start a second operation.');
call(
  control(
    controller(tree).props.visible ? tree : renderExports(controller(tree)),
    'profile-row-fixture',
  ).props.onPress,
  {},
);
tree = renderPanel();
exportTree = renderExports(controller(tree));
call(control(exportTree, 'export-cancel').props.onPress, {});
await Promise.resolve();
assert.equal(started, 1);
assert.equal(cancelled, 1);
console.log(
  'PASS real profile collapse/reopen preserves the pending export controller and working Cancel action.',
);

/** @type {unknown} */ let destination;
data = {
  session: {},
  profiles: null,
  types: {},
  sourcePermissions: {},
  busy: true,
  sourceNotes: {},
};
slots = [];
cursor = 0;
const loading = call(dataModule.default, { management: true });
control(loading, 'profiles-loading');
assert.equal(control(loading, 'profile-new-profile').props.disabled, true);
call(control(loading, 'settings-open').props.onPress, {});
assert.equal(destination, '/settings');
console.log(
  'PASS Settings navigation remains actionable while profiles are unavailable and creation is disabled.',
);
