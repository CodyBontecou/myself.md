import { LogBox, NativeModules } from 'react-native';

// Headless OS launches do not mount the router or its providers.
// oxlint-disable-next-line import/no-unassigned-import
import './client/export-task.js';
// oxlint-disable-next-line import/no-unassigned-import
import './client/export-notification-task.js';
// Expo Router registers the app and discovers the route files.
// oxlint-disable-next-line import/no-unassigned-import
import 'expo-router/entry';

// Standalone Debug has no desktop debugger; keep genuine warnings/errors visible.
if (__DEV__ && NativeModules.SourceCode?.getConstants?.().scriptURL?.startsWith('file:')) {
  LogBox.ignoreLogs([/^Open debugger to view warnings\.$/]);
}
